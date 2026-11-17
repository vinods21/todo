import { request } from './client'
import type { Page, Task, TaskCreateRequest, TaskUpdateRequest } from './types'

/** SCRUM-1-AC-02 / A-03: fixed page size. */
export const PAGE_SIZE = 20

/** SCRUM-1-AC-01, AC-02: `page` is 0-based as in the API. */
export function listTasks(page: number, signal?: AbortSignal): Promise<Page<Task>> {
  return request<Page<Task>>('GET', '/api/tasks', { query: { page, size: PAGE_SIZE }, signal })
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
