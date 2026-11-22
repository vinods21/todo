// SCRUM-1-NFR-05, SCRUM-6-NFR-04, SCRUM-12-AC-06: contract types come from api/openapi.yaml via the generated
// schema.d.ts (`npm run api:types`, ADR 0017) — no hand-maintained copy of response shapes (SCRUM-12-NFR-05). No `any`.
import type { components } from './schema'

type Schemas = components['schemas']

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const satisfies readonly Schemas['TaskStatus'][]
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Exact, case-sensitive enum name (SCRUM-6-AC-13, ADR 0009). */
export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value)
}

// Responses: exactly the contract. `createdAt` is an ISO-8601 instant, `dueDate` a calendar date `yyyy-MM-dd` or null.
export type Task = Schemas['TaskResponse']
export type FieldErrorItem = Schemas['FieldErrorItem']
export type ApiErrorBody = Schemas['ApiError']

export interface Page<T> {
  items: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

// Requests: what the UI sends — narrower than the contract, asserted assignable to it below.
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

// SCRUM-12-AC-06: compile-time contract checks. A "Type 'false' does not satisfy the constraint 'true'" error here
// means api/openapi.yaml changed incompatibly with the UI: fix the UI types (and code), not this list.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T
export type ContractChecks = [
  Assert<Same<TaskStatus, Schemas['TaskStatus']>>, // TASK_STATUSES complete and exact
  Assert<Same<Page<Task>, Schemas['PageResponseTaskResponse']>>,
  Assert<TaskCreateRequest extends Schemas['TaskCreateRequest'] ? true : false>, // what we send is accepted
  Assert<TaskUpdateRequest extends Schemas['TaskUpdateRequest'] ? true : false>,
  Assert<TaskStatusUpdateRequest extends Schemas['TaskStatusUpdateRequest'] ? true : false>,
]
