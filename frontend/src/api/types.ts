// SCRUM-1-NFR-05: typed mirror of the SCRUM-2 REST contract (docs/architecture/SCRUM-2-design.md §5–6). No `any`.

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

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
