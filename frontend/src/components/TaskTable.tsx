import { Link } from 'react-router'
import type { ApiError } from '../api/errors'
import type { Task } from '../api/types'
import { StatusSelect } from './StatusSelect'

interface TaskTableProps {
  tasks: Task[]
  /** URL to return to after edit/cancel (keeps the current list page and filter). */
  returnTo: string
  onStatusStarted?: (task: Task) => void
  onStatusChanged: (updated: Task, detached: boolean) => void
  onStatusFailed: (task: Task, error: ApiError, detached: boolean) => void
}

/** SCRUM-1-AC-01: title, status and due date in API order. SCRUM-6-AC-08: the status is a per-row control. */
export function TaskTable({ tasks, returnTo, onStatusStarted, onStatusChanged, onStatusFailed }: TaskTableProps) {
  return (
    <table className="task-table">
      <caption className="visually-hidden">Tasks</caption>
      <thead>
        <tr>
          <th scope="col">Title</th>
          <th scope="col">Status</th>
          <th scope="col">Due date</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <tr key={task.id}>
            <td>{task.title}</td>
            <td>
              {/* Keyed by server status: fresh data after a reload resets the control's local state. */}
              <StatusSelect
                key={`${task.id}:${task.status}`}
                task={task}
                onStarted={onStatusStarted}
                onChanged={onStatusChanged}
                onFailed={onStatusFailed}
              />
            </td>
            {/* A-05: plain calendar date, no Date parsing or timezone shift. */}
            <td>{task.dueDate ?? 'No due date'}</td>
            <td>
              <Link to={`/tasks/${task.id}/edit`} state={{ returnTo }} aria-label={`Edit ${task.title}`}>
                Edit
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
