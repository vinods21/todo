import { Link } from 'react-router'
import type { Task } from '../api/types'
import { STATUS_LABELS } from './statusLabels'

interface TaskTableProps {
  tasks: Task[]
  /** URL to return to after edit/cancel (keeps the current list page). */
  returnTo: string
}

/** SCRUM-1-AC-01: title, status label and due date in API order. */
export function TaskTable({ tasks, returnTo }: TaskTableProps) {
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
            <td>{STATUS_LABELS[task.status]}</td>
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
