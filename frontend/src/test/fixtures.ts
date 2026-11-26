import type { ApiErrorBody, CurrentUser, FieldErrorItem, Page, Task } from '../api/types'

// Typed builders for SCRUM-2 contract payloads (ADR 0007).

export const API = 'http://localhost:8080/api'

/** SCRUM-13 (ADR 0007 amended): the access token of the fake token source; the default MSW handlers require it. */
export const TEST_ACCESS_TOKEN = 'test-access-token'

/** SCRUM-13-AC-21: GET /api/me body; default alice with the application role. */
export function makeCurrentUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    subject: '6f1c2a3b-0000-4000-8000-00000000a11c',
    username: 'alice',
    email: 'alice@corp.example',
    name: 'Alice User',
    roles: ['todo-user'],
    ...overrides,
  }
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Write docs',
    description: null,
    status: 'TODO',
    createdAt: '2026-11-17T10:15:30.123456Z',
    dueDate: null,
    ...overrides,
  }
}

export function makePage<T>(items: T[], overrides: Partial<Page<T>> = {}): Page<T> {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: items.length > 0 ? 1 : 0, ...overrides }
}

const REASONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
}

export function errorBody(
  status: number,
  message = status === 400 ? 'Validation failed' : 'An unexpected error occurred',
  fieldErrors: FieldErrorItem[] = [],
  path = '/api/tasks',
): ApiErrorBody {
  return {
    timestamp: '2026-11-17T10:15:30.123Z',
    status,
    error: REASONS[status] ?? 'Error',
    message,
    path,
    fieldErrors,
  }
}

/** A promise whose resolution the test controls (loading / in-flight states without timers). */
export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
