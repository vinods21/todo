import { isTaskStatus, TASK_STATUSES, type TaskStatus } from '../api/types'
import { STATUS_LABELS } from './statusLabels'

interface StatusFilterProps {
  /** undefined = "All". */
  value: TaskStatus | undefined
  onChange: (status: TaskStatus | undefined) => void
}

/** SCRUM-6-AC-12, NFR-06: labelled single-select list filter ("All" + the three statuses), controlled by the URL. */
export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <div className="status-filter">
      <label htmlFor="status-filter">Status</label>
      <select
        id="status-filter"
        value={value ?? ''}
        onChange={(event) => {
          const next = event.target.value
          onChange(isTaskStatus(next) ? next : undefined)
        }}
      >
        <option value="">All</option>
        {TASK_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </div>
  )
}
