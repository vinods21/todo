import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ApiError, GENERIC_ERROR_MESSAGE, isApiError } from '../api/errors'
import { updateTaskStatus } from '../api/tasks'
import { isTaskStatus, TASK_STATUSES, type Task, type TaskStatus } from '../api/types'
import { useIsMounted } from '../hooks/useIsMounted'
import { STATUS_LABELS } from './statusLabels'

export interface StatusSelectProps {
  task: Task
  /** A change was sent (the page clears stale messages). */
  onStarted?: (task: Task) => void
  /**
   * After a 200, with the server's task. `detached` is true when this row was unmounted while the request was in
   * flight (e.g. another row's change reloaded the list): the page's current data may not include this change.
   */
  onChanged: (updated: Task, detached: boolean) => void
  /** After any failure; the control has already reverted (unless `detached`, see `onChanged`). */
  onFailed: (task: Task, error: ApiError, detached: boolean) => void
}

/**
 * SCRUM-6-AC-08..AC-11, NFR-06: per-row status control. Sends `PATCH /api/tasks/{id}/status` on change; disabled,
 * `aria-busy` and described by "Saving…" while in flight; shows the server value on success and reverts on failure
 * (pessimistic, A-05). Keyboard focus is restored after the request because a disabled control loses focus.
 */
export function StatusSelect({ task, onStarted, onChanged, onFailed }: StatusSelectProps) {
  const [value, setValue] = useState<TaskStatus>(task.status)
  const [pending, setPending] = useState(false)
  const selectRef = useRef<HTMLSelectElement>(null)
  const restoreFocus = useRef(false)
  const isMounted = useIsMounted()

  useEffect(() => {
    if (pending || !restoreFocus.current) return
    restoreFocus.current = false
    selectRef.current?.focus()
  }, [pending])

  async function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value
    // SCRUM-6-AC-10: no double submission while a request for this row is in flight.
    if (pending || !isTaskStatus(next) || next === value) return
    const previous = value
    restoreFocus.current = document.activeElement === selectRef.current
    setValue(next)
    setPending(true)
    onStarted?.(task)
    try {
      const updated = await updateTaskStatus(task.id, next)
      // Still reported when this row is gone, so the page can reload data that may predate this change.
      const detached = !isMounted()
      if (!detached) {
        setValue(updated.status)
        setPending(false)
      }
      onChanged(updated, detached)
    } catch (error) {
      const detached = !isMounted()
      if (!detached) {
        // SCRUM-6-AC-11: revert to the last confirmed value.
        setValue(previous)
        setPending(false)
      }
      onFailed(task, isApiError(error) ? error : new ApiError('server', 0, GENERIC_ERROR_MESSAGE), detached)
    }
  }

  const savingId = `status-saving-${task.id}`
  return (
    <>
      <select
        ref={selectRef}
        aria-label={`Status for ${task.title}`}
        value={value}
        disabled={pending}
        aria-busy={pending}
        aria-describedby={pending ? savingId : undefined}
        onChange={(event) => void handleChange(event)}
      >
        {TASK_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      {pending && (
        <span id={savingId} className="row-saving">
          Saving…
        </span>
      )}
    </>
  )
}
