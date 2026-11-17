import type { ApiErrorBody, FieldErrorItem, Page, Task } from '../api/types'

// Typed builders for SCRUM-2 contract payloads (ADR 0007).

export const API = 'http://localhost:8080/api'

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
