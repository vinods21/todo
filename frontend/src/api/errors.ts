import type { ApiErrorBody, FieldErrorItem } from './types'

// SCRUM-1-AC-08, AC-10, AC-11: every failure leaving the API layer is an ApiError with a user-safe message.

export type ApiErrorKind = 'network' | 'validation' | 'not-found' | 'server' | 'http'

export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'
export const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.'
export const NOT_FOUND_MESSAGE = 'Task not found'

export class ApiError extends Error {
  override readonly name = 'ApiError'
  readonly kind: ApiErrorKind
  /** HTTP status, or 0 for network errors. */
  readonly status: number
  readonly fieldErrors: FieldErrorItem[]

  constructor(kind: ApiErrorKind, status: number, message: string, fieldErrors: FieldErrorItem[] = []) {
    super(message)
    this.kind = kind
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFieldErrorItem(value: unknown): value is FieldErrorItem {
  return isRecord(value) && typeof value.field === 'string' && typeof value.message === 'string'
}

/** Error bodies are not trusted (proxies/gateways may return HTML), so they are validated. */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    isRecord(value) &&
    typeof value.status === 'number' &&
    typeof value.message === 'string' &&
    Array.isArray(value.fieldErrors) &&
    value.fieldErrors.every(isFieldErrorItem)
  )
}

async function readErrorBody(response: Response): Promise<ApiErrorBody | undefined> {
  try {
    const parsed: unknown = JSON.parse(await response.text())
    return isApiErrorBody(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  const { status } = response
  if (status >= 500) {
    // SCRUM-1-AC-10: the server's body is never shown to the user.
    return new ApiError('server', status, GENERIC_ERROR_MESSAGE)
  }
  if (status === 404) {
    return new ApiError('not-found', status, NOT_FOUND_MESSAGE)
  }
  const body = await readErrorBody(response)
  if (status === 400) {
    return body
      ? new ApiError('validation', status, body.message, body.fieldErrors)
      : new ApiError('validation', status, GENERIC_ERROR_MESSAGE)
  }
  return new ApiError('http', status, body?.message ?? GENERIC_ERROR_MESSAGE)
}
