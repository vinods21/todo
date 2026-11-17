import { request } from './client'
import type { ListTasksParams, Page, Task, TaskCreateRequest, TaskStatus, TaskStatusUpdateRequest, TaskUpdateRequest } from './types'

/** SCRUM-1-AC-02 / A-03: fixed page size. */
export const PAGE_SIZE = 20

/**
 * SCRUM-1-AC-01, AC-02, SCRUM-6-AC-12: `page` is 0-based as in the API; `status` is omitted when undefined, so
 * unfiltered URLs stay `?page=N&size=20`.
 */
export function listTasks({ page, status }: ListTasksParams, signal?: AbortSignal): Promise<Page<Task>> {
  return request<Page<Task>>('GET', '/api/tasks', { query: { page, size: PAGE_SIZE, status }, signal })
}

/** SCRUM-1-AC-05 */
export function getTask(id: number, signal?: AbortSignal): Promise<Task> {
  return request<Task>('GET', `/api/tasks/${id}`, { signal })
}

/** SCRUM-1-AC-04 */
export function createTask(body: TaskCreateRequest): Promise<Task> {
  return request<Task>('POST', '/api/tasks', { body })
}

/** SCRUM-1-AC-06 */
export function updateTask(id: number, body: TaskUpdateRequest): Promise<Task> {
  return request<Task>('PUT', `/api/tasks/${id}`, { body })
}

/** SCRUM-6-AC-09: only `{ status }` is sent; resolves to the full updated task. Not abortable (a mutation). */
export function updateTaskStatus(id: number, status: TaskStatus): Promise<Task> {
  const body: TaskStatusUpdateRequest = { status }
  return request<Task>('PATCH', `/api/tasks/${id}/status`, { body })
}
