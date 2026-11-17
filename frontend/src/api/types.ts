// SCRUM-1-NFR-05, SCRUM-6-NFR-04: typed mirror of the REST contract (SCRUM-2 design §5–6, SCRUM-6 design §3). No `any`.

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Exact, case-sensitive enum name (SCRUM-6-AC-13, ADR 0009). */
export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value)
}

export interface Task {
  id: number
  title: string
  description: string | null
  status: TaskStatus
  /** ISO-8601 instant, server-assigned. */
  createdAt: string
  /** Calendar date `yyyy-MM-dd`, or null. */
  dueDate: string | null
}

export interface TaskCreateRequest {
  title: string
  description: string | null
  status: TaskStatus
  dueDate: string | null
}

/** SCRUM-1-AC-06: full replacement — all four mutable fields are always sent. */
export type TaskUpdateRequest = TaskCreateRequest

/** SCRUM-6-AC-09: body of `PATCH /api/tasks/{id}/status` — only the status is sent. */
export interface TaskStatusUpdateRequest {
  status: TaskStatus
}

/** SCRUM-1-AC-01/02, SCRUM-6-AC-12: list query; `status` omitted = all tasks. */
export interface ListTasksParams {
  /** 0-based, as in the API. */
  page: number
  status?: TaskStatus
}

export interface Page<T> {
  items: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export interface FieldErrorItem {
  field: string
  message: string
}

export interface ApiErrorBody {
  timestamp: string
  status: number
  error: string
  message: string
  path: string
  fieldErrors: FieldErrorItem[]
}
