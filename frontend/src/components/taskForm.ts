import type { ApiError } from '../api/errors'
import { isTaskStatus, type Task, type TaskCreateRequest, type TaskStatus, type TaskUpdateRequest } from '../api/types'

// Pure form model: values ↔ requests, client validation mirroring SCRUM-2 Bean Validation, server error mapping.

export type FormField = 'title' | 'description' | 'status' | 'dueDate'
export const FORM_FIELDS: readonly FormField[] = ['title', 'description', 'status', 'dueDate']

/** Form values; '' means empty. */
export interface TaskFormValues {
  title: string
  description: string
  status: TaskStatus
  dueDate: string
}

export type FieldErrors = Partial<Record<FormField, string>>

export interface FormErrors {
  fields: FieldErrors
  form?: string
}

export const EMPTY_FORM: TaskFormValues = { title: '', description: '', status: 'TODO', dueDate: '' }
export const TITLE_MAX = 200
export const DESCRIPTION_MAX = 2000

export const TITLE_REQUIRED_MESSAGE = 'Title is required.'
export const TITLE_TOO_LONG_MESSAGE = `Title must be at most ${TITLE_MAX} characters.`
export const DESCRIPTION_TOO_LONG_MESSAGE = `Description must be at most ${DESCRIPTION_MAX} characters.`

export function isFormField(value: string): value is FormField {
  return (FORM_FIELDS as readonly string[]).includes(value)
}

/** Re-exported for existing imports; the guard lives with the types (SCRUM-6 design §4.2). */
export { isTaskStatus }

/** SCRUM-1-AC-07: same rules as the backend (title trimmed 1–200, description ≤ 2000, past due dates OK). */
export function validateTaskForm(values: TaskFormValues): FieldErrors {
  const errors: FieldErrors = {}
  const title = values.title.trim()
  if (title.length === 0) errors.title = TITLE_REQUIRED_MESSAGE
  else if (title.length > TITLE_MAX) errors.title = TITLE_TOO_LONG_MESSAGE
  // The backend does not trim description, so neither do we when measuring it.
  if (values.description.length > DESCRIPTION_MAX) errors.description = DESCRIPTION_TOO_LONG_MESSAGE
  return errors
}

/** SCRUM-1-AC-04: title trimmed; empty description/dueDate sent as null. */
export function toCreateRequest(values: TaskFormValues): TaskCreateRequest {
  return {
    title: values.title.trim(),
    description: values.description.trim() === '' ? null : values.description,
    status: values.status,
    dueDate: values.dueDate === '' ? null : values.dueDate,
  }
}

/** SCRUM-1-AC-06: all four mutable fields, status always included. */
export function toUpdateRequest(values: TaskFormValues): TaskUpdateRequest {
  return toCreateRequest(values)
}

/** SCRUM-1-AC-05 */
export function toFormValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    dueDate: task.dueDate ?? '',
  }
}

/** SCRUM-1-AC-08: known fields inline (first message per field); unknown/no fields → form-level message. */
export function mapServerErrors(error: ApiError): FormErrors {
  const fields: FieldErrors = {}
  const unknown: string[] = []
  for (const { field, message } of error.fieldErrors) {
    if (isFormField(field)) fields[field] ??= message
    else unknown.push(`${field}: ${message}`)
  }
  const hasKnown = Object.keys(fields).length > 0
  if (!hasKnown) {
    return { fields, form: unknown.length > 0 ? `${error.message} (${unknown.join('; ')})` : error.message }
  }
  return unknown.length > 0 ? { fields, form: unknown.join('; ') } : { fields }
}
