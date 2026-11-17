import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router'
import { GENERIC_ERROR_MESSAGE } from '../api/errors'
import { listTasks } from '../api/tasks'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { Pager } from '../components/Pager'
import { TaskTable } from '../components/TaskTable'
import { useAsync } from '../hooks/useAsync'
import { parsePageParam } from './params'

/** SCRUM-1-AC-01..03, AC-09, AC-10 */
export function TaskListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parsePageParam(searchParams.get('page'))
  const load = useCallback((signal: AbortSignal) => listTasks(page - 1, signal), [page])
  const result = useAsync(load)
  const returnTo = page === 1 ? '/' : `/?page=${page}`

  return (
    <section>
      <h1>Tasks</h1>
      {result.status === 'loading' && <Loading label="Loading tasks…" />}
      {result.status === 'error' && (
        <ErrorPanel
          // A 404 here means a wrong VITE_API_BASE_URL, not a missing task: don't show "Task not found".
          message={result.error.kind === 'not-found' ? GENERIC_ERROR_MESSAGE : result.error.message}
          onRetry={result.reload}
        />
      )}
      {result.status === 'success' &&
        (result.data.items.length === 0 ? (
          page === 1 ? (
            <div className="empty-state">
              <p>No tasks yet.</p>
              <Link to="/tasks/new">Create your first task</Link>
            </div>
          ) : (
            <div className="empty-state">
              <p>This page is empty.</p>
              <Link to="/">Go to the first page</Link>
            </div>
          )
        ) : (
          <>
            <TaskTable tasks={result.data.items} returnTo={returnTo} />
            <Pager
              page={result.data.page}
              totalPages={result.data.totalPages}
              onPageChange={(p) => setSearchParams({ page: String(p + 1) })}
            />
          </>
        ))}
    </section>
  )
}
