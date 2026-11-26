// SCRUM-12-AC-07 (design §6.4, ADR 0017): validates MSW handler responses and fixture payloads against the committed
// contract api/openapi.yaml — same rules and messages as the backend checker (support/OpenApiContract.java). Object
// schemas are closed (additionalProperties: false) on an in-memory copy, so a test double cannot invent properties
// the backend never sends.
import specText from '../../../api/openapi.yaml?raw'
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { parse } from 'yaml'
import { TEST_ACCESS_TOKEN } from './fixtures'

interface HeaderObject {
  required?: boolean
}

interface MediaTypeObject {
  schema?: { $ref?: string }
}

interface ResponseObject {
  $ref?: string
  headers?: Record<string, HeaderObject>
  content?: Record<string, MediaTypeObject>
}

interface OperationObject {
  operationId?: string
  responses?: Record<string, ResponseObject>
}

export interface OpenApiDocument {
  openapi: string
  paths: Record<string, Record<string, OperationObject>>
  components: { schemas: Record<string, unknown> }
}

interface Operation {
  method: string
  template: string
  pattern: RegExp
  literalSegments: number
  operationId: string
  responses: Record<string, ResponseObject>
}

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']
const SCHEMA_REF_PREFIX = '#/components/schemas/'

export const spec = parse(specText) as OpenApiDocument

function operationsOf(document: OpenApiDocument): Operation[] {
  const result: Operation[] = []
  for (const [template, item] of Object.entries(document.paths)) {
    for (const [key, operation] of Object.entries(item)) {
      if (!METHODS.includes(key)) continue
      const segments = template.split('/').filter((s) => s !== '')
      const pattern = new RegExp(
        `^/${segments.map((s) => (/^\{.+\}$/.test(s) ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/')}$`,
      )
      result.push({
        method: key.toUpperCase(),
        template,
        pattern,
        literalSegments: segments.filter((s) => !s.startsWith('{')).length,
        operationId: operation.operationId ?? '',
        responses: operation.responses ?? {},
      })
    }
  }
  // literal segments win (same rule as the backend checker)
  return result.sort((a, b) => b.literalSegments - a.literalSegments)
}

export const operations = operationsOf(spec)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** additionalProperties: false on every object schema with properties that does not decide it itself. */
function close(schema: unknown): void {
  if (!isObject(schema)) return
  if ('properties' in schema && !('additionalProperties' in schema) && !('unevaluatedProperties' in schema)) {
    schema.additionalProperties = false
  }
  if (isObject(schema.properties)) Object.values(schema.properties).forEach(close)
  close(schema.items)
  close(schema.not)
  for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    const branches = schema[keyword]
    if (Array.isArray(branches)) branches.forEach(close)
  }
}

// Closed copy of components.schemas; "#/components/schemas/X" → "openapi#/$defs/X".
const defs = JSON.parse(
  JSON.stringify(spec.components.schemas).replaceAll(`"${SCHEMA_REF_PREFIX}`, '"openapi#/$defs/'),
) as Record<string, unknown>
Object.values(defs).forEach(close)

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true, // OpenAPI 3.1 nullability: type: [string, "null"]
  formats: { int32: true, int64: true }, // OpenAPI formats without a JSON Schema meaning
})
addFormats(ajv)
ajv.addVocabulary(['example', 'xml', 'externalDocs']) // OpenAPI annotations Ajv does not know
ajv.addSchema({ $id: 'openapi', $defs: defs })

const validators = new Map<string, ValidateFunction>()

function validator(schemaName: string): ValidateFunction {
  let validate = validators.get(schemaName)
  if (!validate) {
    validate = ajv.compile({ $ref: `openapi#/$defs/${schemaName}` })
    validators.set(schemaName, validate)
  }
  return validate
}

function formatError(error: ErrorObject): string {
  const params = Object.keys(error.params).length > 0 ? ` ${JSON.stringify(error.params)}` : ''
  return `${error.instancePath || '/'} ${error.message ?? 'invalid'}${params}`
}

/** Violations of `value` against `#/components/schemas/<schemaName>` (closed); empty when it conforms. */
export function schemaViolations(schemaName: string, value: unknown): string[] {
  if (!(schemaName in defs)) return [`unknown schema ${schemaName}`]
  const validate = validator(schemaName)
  return validate(value) ? [] : (validate.errors ?? []).map((e) => `schema ${schemaName}: ${formatError(e)}`)
}

/** The documented operation for `method` + the path of `url` (absolute URLs and query strings allowed). */
export function findOperation(method: string, url: string): Operation | undefined {
  const path = new URL(url, 'http://contract.invalid').pathname
  return operations.find((o) => o.method === method.toUpperCase() && o.pattern.test(path))
}

/** All violations of a response against the contract; empty when it conforms (SCRUM-12-NFR-04 message format). */
export function contractViolations(method: string, url: string, status: number, headers: Headers, body: string): string[] {
  const operation = findOperation(method, url)
  const upper = method.toUpperCase()
  if (!operation) return [`undocumented operation ${upper} ${new URL(url, 'http://contract.invalid').pathname}`]
  const prefix = `${upper} ${operation.template} (${operation.operationId}) ${status}: `
  const response = operation.responses[String(status)]
  if (!response) {
    return [`${prefix}undocumented status ${status} (documented: ${Object.keys(operation.responses).sort().join(', ')})`]
  }
  const violations: string[] = []
  for (const [name, header] of Object.entries(response.headers ?? {})) {
    if (header.required === true && headers.get(name) === null) violations.push(`${prefix}missing required header ${name}`)
  }
  const content = response.content ?? {}
  const documented = Object.keys(content)
  if (documented.length === 0) {
    if (body !== '') violations.push(`${prefix}undocumented response body (no content documented)`)
    return violations
  }
  if (body === '') return [...violations, `${prefix}missing response body (documented: ${documented.join(', ')})`]
  const mediaType = (headers.get('content-type') ?? '<none>').split(';')[0]?.trim() ?? '<none>'
  const ref = content[mediaType]?.schema?.$ref
  if (!content[mediaType]) {
    return [...violations, `${prefix}undocumented Content-Type ${mediaType} (documented: ${documented.join(', ')})`]
  }
  if (!ref?.startsWith(SCHEMA_REF_PREFIX)) return [...violations, `${prefix}no $ref schema documented for ${mediaType}`]
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return [...violations, `${prefix}body is not valid JSON`]
  }
  return [...violations, ...schemaViolations(ref.slice(SCHEMA_REF_PREFIX.length), value).map((v) => prefix + v)]
}

/** Sends the request (intercepted by MSW) and returns the response's contract violations. */
export async function fetchViolations(
  method: string,
  url: string,
  body?: unknown,
  token: string | null = TEST_ACCESS_TOKEN, // null = anonymous
): Promise<{ status: number; violations: string[] }> {
  // SCRUM-13: authenticated like the app (the default handlers answer 401 without the test token).
  const headers: Record<string, string> = token === null ? {} : { Authorization: `Bearer ${token}` }
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    headers['Content-Type'] = 'application/json'
  }
  const response = await fetch(url, init)
  const text = await response.text()
  return { status: response.status, violations: contractViolations(method, url, response.status, response.headers, text) }
}
