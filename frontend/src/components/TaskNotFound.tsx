import { Link } from 'react-router'

/** SCRUM-1-AC-11 */
export function TaskNotFound() {
  return (
    <section>
      <h1>Task not found</h1>
      <p>The task does not exist or has been deleted.</p>
      <Link to="/">Back to tasks</Link>
    </section>
  )
}
