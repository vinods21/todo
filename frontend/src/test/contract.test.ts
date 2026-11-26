// SCRUM-12-AC-06, AC-07, AC-13 (design §6.4, ADR 0017): the MSW default handlers and the fixture builders agree with
// the committed contract api/openapi.yaml. Per-test `server.use(...)` overrides that simulate proxy/network failures
// (502 HTML, network errors) are intentionally not validated: they model the infrastructure, not the backend.
import { TASK_STATUSES } from '../api/types'
import { contractViolations, fetchViolations, findOperation, schemaViolations, spec } from './contract'
import { API, errorBody, makeCurrentUser, makePage, makeTask } from './fixtures'
import { handlers, seedTasks } from './handlers'

const ORIGIN = new URL(API).origin

function jsonHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({ 'Content-Type': 'application/json', ...extra })
}

const VALID_TASK = JSON.stringify(makeTask())

describe('SCRUM-12 MSW handlers and fixtures vs api/openapi.yaml', () => {
  test('SCRUM-12-AC-07: every default MSW handler maps to a documented operation', () => {
    expect(handlers.length).toBeGreaterThan(0)
    for (const handler of handlers) {
      const { method, path } = handler.info
      expect(typeof method, String(method)).toBe('string')
      expect(typeof path, String(path)).toBe('string')
      const template = String(path).replace(ORIGIN, '').replace(/:(\w+)/g, '{$1}')
      expect(findOperation(String(method), template), `${String(method)} ${template}`).toBeDefined()
      expect(findOperation(String(method), template)?.template, `${String(method)} ${template}`).toBe(template)
    }
  })

  const scenarios: { name: string; method: string; path: string; body?: unknown; status: number }[] = [
    { name: 'listTasks 200 (seeded)', method: 'GET', path: '/tasks?page=0&size=20', status: 200 },
    { name: 'listTasks 200 ?status=DONE', method: 'GET', path: '/tasks?page=0&status=DONE', status: 200 },
    { name: 'listTasks 400 ?status=done', method: 'GET', path: '/tasks?page=0&status=done', status: 400 },
    { name: 'getTask 200', method: 'GET', path: '/tasks/1', status: 200 },
    { name: 'getTask 404', method: 'GET', path: '/tasks/999', status: 404 },
    {
      name: 'createTask 201',
      method: 'POST',
      path: '/tasks',
      body: { title: 'New', description: null, status: 'TODO', dueDate: '2026-12-01' },
      status: 201,
    },
    {
      name: 'createTask 400 blank title',
      method: 'POST',
      path: '/tasks',
      body: { title: '  ', description: null, status: 'TODO', dueDate: null },
      status: 400,
    },
    {
      name: 'updateTask 200',
      method: 'PUT',
      path: '/tasks/1',
      body: { title: 'Changed', description: 'd', status: 'DONE', dueDate: null },
      status: 200,
    },
    {
      name: 'updateTask 404',
      method: 'PUT',
      path: '/tasks/999',
      body: { title: 'Changed', description: null, status: 'DONE', dueDate: null },
      status: 404,
    },
    {
      name: 'updateTask 400 blank title',
      method: 'PUT',
      path: '/tasks/1',
      body: { title: ' ', description: null, status: 'DONE', dueDate: null },
      status: 400,
    },
    { name: 'updateTaskStatus 200', method: 'PATCH', path: '/tasks/1/status', body: { status: 'IN_PROGRESS' }, status: 200 },
    { name: 'updateTaskStatus 404', method: 'PATCH', path: '/tasks/999/status', body: { status: 'DONE' }, status: 404 },
    { name: 'updateTaskStatus 400 invalid', method: 'PATCH', path: '/tasks/1/status', body: { status: 'done' }, status: 400 },
    // SCRUM-13-AC-24: the authenticated user, and 401 without a token (backend fidelity of the default handlers)
    { name: 'getCurrentUser 200', method: 'GET', path: '/me', status: 200 },
  ]

  test.each(scenarios)('SCRUM-12-AC-07: default handler response conforms — $name', async ({ method, path, body, status }) => {
    seedTasks([
      { title: 'Seeded', description: 'with description', status: 'DONE', dueDate: '2026-12-24' },
      { title: 'Second' },
    ])
    const result = await fetchViolations(method, `${API}${path}`, body)
    expect(result.status).toBe(status)
    expect(result.violations).toEqual([])
  })

  const anonymous: { name: string; method: string; path: string; body?: unknown }[] = [
    { name: 'getCurrentUser', method: 'GET', path: '/me' },
    { name: 'listTasks', method: 'GET', path: '/tasks?page=0&size=20' },
    { name: 'getTask', method: 'GET', path: '/tasks/1' },
    { name: 'createTask', method: 'POST', path: '/tasks', body: { title: 'x', description: null, status: 'TODO', dueDate: null } },
    { name: 'updateTask', method: 'PUT', path: '/tasks/1', body: { title: 'x', description: null, status: 'DONE', dueDate: null } },
    { name: 'updateTaskStatus', method: 'PATCH', path: '/tasks/1/status', body: { status: 'DONE' } },
  ]

  test.each(anonymous)('SCRUM-13-AC-24: default handler 401 without a token conforms — $name', async ({ method, path, body }) => {
    seedTasks([{ title: 'Seeded' }])
    const result = await fetchViolations(method, `${API}${path}`, body, null)
    expect(result.status).toBe(401)
    expect(result.violations).toEqual([])
  })

  test('SCRUM-13-AC-24: 403 and 401 bodies need the WWW-Authenticate header; MeResponse fixtures conform', () => {
    const forbidden = JSON.stringify(errorBody(403, 'Access denied'))
    expect(
      contractViolations('GET', `${API}/tasks`, 403, jsonHeaders({ 'WWW-Authenticate': 'Bearer error="insufficient_scope"' }), forbidden),
    ).toEqual([])
    expect(contractViolations('GET', `${API}/tasks`, 403, jsonHeaders(), forbidden).join('\n')).toContain(
      'missing required header WWW-Authenticate',
    )
    expect(contractViolations('GET', `${API}/me`, 403, jsonHeaders(), forbidden).join('\n')).toContain(
      'undocumented status 403',
    )
    expect(schemaViolations('MeResponse', makeCurrentUser())).toEqual([])
    expect(schemaViolations('MeResponse', makeCurrentUser({ email: null, name: null, roles: [] }))).toEqual([])
    expect(schemaViolations('ApiError', errorBody(401, 'Authentication required'))).toEqual([])
  })

  test('SCRUM-12-AC-07: fixture builders conform', () => {
    expect(schemaViolations('TaskResponse', makeTask())).toEqual([])
    expect(schemaViolations('TaskResponse', makeTask({ description: 'd', dueDate: '2026-12-01', status: 'DONE' }))).toEqual(
      [],
    )
    expect(schemaViolations('PageResponseTaskResponse', makePage([makeTask()]))).toEqual([])
    expect(schemaViolations('PageResponseTaskResponse', makePage([]))).toEqual([])
    for (const status of [400, 404, 500]) {
      expect(schemaViolations('ApiError', errorBody(status)), String(status)).toEqual([])
    }
    expect(
      schemaViolations('ApiError', errorBody(400, 'Validation failed', [{ field: 'title', message: 'must not be blank' }])),
    ).toEqual([])
  })

  test('SCRUM-12-AC-06: TASK_STATUSES equals the documented TaskStatus enum (order included)', () => {
    const taskStatus = spec.components.schemas.TaskStatus as { enum?: unknown[] }
    expect([...TASK_STATUSES]).toEqual(taskStatus.enum)
  })

  const rejected: { name: string; method: string; url: string; status: number; headers: Headers; body: string; expected: string }[] = [
    {
      name: 'an undocumented property',
      method: 'GET',
      url: `${API}/tasks/1`,
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify({ ...makeTask(), extra: 1 }),
      expected: 'must NOT have additional properties',
    },
    {
      name: 'a missing required property',
      method: 'GET',
      url: `${API}/tasks/1`,
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify({ ...makeTask(), dueDate: undefined }),
      expected: "must have required property 'dueDate'",
    },
    {
      name: 'an undocumented enum value',
      method: 'GET',
      url: `${API}/tasks/1`,
      status: 200,
      headers: jsonHeaders(),
      body: JSON.stringify({ ...makeTask(), status: 'done' }),
      expected: '/status',
    },
    {
      name: 'an undocumented status (418)',
      method: 'GET',
      url: `${API}/tasks/1`,
      status: 418,
      headers: jsonHeaders(),
      body: VALID_TASK,
      expected: 'GET /api/tasks/{id} (getTask) 418: undocumented status 418 (documented: 200, 400, 401, 403, 404, 500)',
    },
    {
      name: 'an unknown operation',
      method: 'GET',
      url: `${API}/nope`,
      status: 200,
      headers: jsonHeaders(),
      body: '{}',
      expected: 'undocumented operation GET /api/nope',
    },
    {
      name: 'a text/plain body',
      method: 'GET',
      url: `${API}/tasks/1`,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/plain' }),
      body: VALID_TASK,
      expected: 'undocumented Content-Type text/plain',
    },
    {
      name: '201 without Location',
      method: 'POST',
      url: `${API}/tasks`,
      status: 201,
      headers: jsonHeaders(),
      body: VALID_TASK,
      expected: 'missing required header Location',
    },
  ]

  test.each(rejected)('SCRUM-12-AC-13: the validator rejects $name', ({ method, url, status, headers, body, expected }) => {
    const violations = contractViolations(method, url, status, headers, body)
    expect(violations.length, violations.join('\n')).toBeGreaterThan(0)
    expect(violations.join('\n')).toContain(expected)
  })

  test('SCRUM-12-AC-13: the validator accepts a conforming 201 with Location', () => {
    expect(contractViolations('POST', `${API}/tasks`, 201, jsonHeaders({ Location: `${API}/tasks/1` }), VALID_TASK)).toEqual([])
  })
})
