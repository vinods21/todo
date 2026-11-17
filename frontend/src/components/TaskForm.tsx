import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { TASK_STATUSES } from '../api/types'
import { STATUS_LABELS } from './statusLabels'
import {
  isTaskStatus,
  validateTaskForm,
  type FieldErrors,
  type FormErrors,
  type FormField,
  type TaskFormValues,
} from './taskForm'

export interface TaskFormProps {
  initialValues: TaskFormValues
  submitLabel: string
  /**
   * Called with valid values. Resolves with errors to display (server validation, network/5xx), or with
   * nothing when the submission succeeded or the page has taken over (navigation, not-found state).
   */
  onSubmit: (values: TaskFormValues) => Promise<FormErrors | undefined>
  onCancel: () => void
}

type FocusTarget = FormField | 'form'

/**
 * SCRUM-1-AC-04..AC-10, NFR-07: shared create/edit form. Inputs are never reset on error; a field's error
 * clears when the user edits it; focus moves to the first invalid field (or the form-level alert) after a
 * failed submit.
 */
export function TaskForm({ initialValues, submitLabel, onSubmit, onCancel }: TaskFormProps) {
  const [values, setValues] = useState<TaskFormValues>(initialValues)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  const pendingFocus = useRef<FocusTarget | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const target = pendingFocus.current
    if (target === null || formRef.current === null) return
    pendingFocus.current = null
    const selector = target === 'form' ? '#form-error' : `#${target}`
    formRef.current.querySelector<HTMLElement>(selector)?.focus()
  })

  function showErrors(errors: FormErrors) {
    setFieldErrors(errors.fields)
    setFormError(errors.form)
    const firstInvalid = (['title', 'description', 'status', 'dueDate'] as const).find((f) => errors.fields[f])
    pendingFocus.current = firstInvalid ?? (errors.form ? 'form' : null)
  }

  function update<K extends FormField>(field: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // SCRUM-1-AC-09: no double submission.
    if (inFlight.current) return
    // SCRUM-1-AC-07: block submission before any request is sent.
    const clientErrors = validateTaskForm(values)
    if (Object.keys(clientErrors).length > 0) {
      showErrors({ fields: clientErrors })
      return
    }
    inFlight.current = true
    setSubmitting(true)
    setFormError(undefined)
    try {
      const errors = await onSubmit(values)
      if (errors) showErrors(errors)
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  function describedBy(field: FormField): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
    return fieldErrors[field] ? { 'aria-invalid': true, 'aria-describedby': `${field}-error` } : {}
  }

  function errorFor(field: FormField) {
    const message = fieldErrors[field]
    return message ? (
      <p id={`${field}-error`} className="field-error">
        {message}
      </p>
    ) : null
  }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} aria-busy={submitting} className="task-form">
      {formError && (
        <div id="form-error" role="alert" tabIndex={-1} className="form-error">
          {formError}
        </div>
      )}

      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          type="text"
          aria-required="true"
          value={values.title}
          onChange={(e: ChangeEvent<HTMLInputElement>) => update('title', e.target.value)}
          {...describedBy('title')}
        />
        {errorFor('title')}
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          rows={4}
          value={values.description}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => update('description', e.target.value)}
          {...describedBy('description')}
        />
        {errorFor('description')}
      </div>

      <div className="field">
        <label htmlFor="status">Status</label>
        <select
          id="status"
          name="status"
          value={values.status}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            if (isTaskStatus(e.target.value)) update('status', e.target.value)
          }}
          {...describedBy('status')}
        >
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        {errorFor('status')}
      </div>

      <div className="field">
        <label htmlFor="dueDate">Due date</label>
        <input
          id="dueDate"
          name="dueDate"
          type="date"
          value={values.dueDate}
          onChange={(e: ChangeEvent<HTMLInputElement>) => update('dueDate', e.target.value)}
          {...describedBy('dueDate')}
        />
        {errorFor('dueDate')}
      </div>

      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
