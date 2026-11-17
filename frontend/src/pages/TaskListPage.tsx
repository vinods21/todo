import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE, type ApiError } from '../api/errors'
import { listTasks } from '../api/tasks'
import type { Task, TaskStatus } from '../api/types'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { Pager } from '../components/Pager'
import { StatusFilter } from '../components/StatusFilter'
import { STATUS_LABELS } from '../components/statusLabels'
import { TaskTable } from '../components/TaskTable'
import { useAsync } from '../hooks/useAsync'
import { listPath, listSearchParams, parseListParams } from './params'

/** A message that belongs to one list view (page + filter); it disappears when the view changes. */
interface ViewMessage {
  view: string
  text: string
}

/** The view a clamp navigation (SCRUM-6-AC-10) came from, carried in location state. */
function clampedFrom(state: unknown): string | undefined {
  if (typeof state === 'object' && state !== null && 'clampedFrom' in state) {
    const { clampedFrom: from } = state
    if (typeof from === 'string') return from
  }
  return undefined
}

/** SCRUM-1-AC-01..03, AC-09, AC-10; SCRUM-6-AC-08..AC-15, NFR-06 */
export function TaskListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const { page, status } = parseListParams(searchParams)
  const view = listPath({ page, status })
  // SCRUM-6-AC-13: an invalid ?status is "All" and never sent to the API.
  const load = useCallback((signal: AbortSignal) => listTasks({ page: page - 1, status }, signal), [page, status])
  const result = useAsync(load)
  const { reload } = result
  // role="status" (success) and role="alert" (row failure) messages; rendered only when non-empty.
  const [announcement, setAnnouncement] = useState<ViewMessage | null>(null)
  const [rowError, setRowError] = useState<ViewMessage | null>(null)
  const clampAfterChange = useRef(false)

  // SCRUM-6-AC-10: after a filtered change emptied a page beyond the new last page, show the last non-empty page.
  // Only after a status change: a stale bookmarked ?page keeps the SCRUM-1 "This page is empty." state.
  const settled = result.status === 'loading' ? null : result
  useEffect(() => {
    if (settled === null || !clampAfterChange.current) return
    clampAfterChange.current = false
    if (settled.status !== 'success') return
    const { items, totalPages } = settled.data
    if (items.length === 0 && page > 1 && totalPages > 0) {
      // Location state keeps the change's announcement visible on the clamped page.
      setSearchParams(listSearchParams({ page: totalPages, status }), { replace: true, state: { clampedFrom: view } })
    }
  }, [settled, page, status, view, setSearchParams])

  function changeFilter(next: TaskStatus | undefined) {
    // SCRUM-6-AC-13: a new filter starts at page 1; pushed so Back/Forward restore the previous filter.
    setSearchParams(listSearchParams({ page: 1, status: next }))
  }

  function handleStatusStarted() {
    setAnnouncement(null)
    setRowError(null)
  }

  function handleStatusChanged(task: Task) {
    setRowError(null)
    setAnnouncement({ view, text: `Status of "${task.title}" changed to ${STATUS_LABELS[task.status]}.` })
    if (status !== undefined) {
      // SCRUM-6-AC-10: the task no longer matches the filter — reload so it leaves the current view.
      clampAfterChange.current = true
      reload()
    }
  }

  function handleStatusFailed(task: Task, error: ApiError) {
    setAnnouncement(null)
    if (error.kind === 'not-found') {
      // SCRUM-6-AC-11: deleted elsewhere — say so and refresh the list.
      setRowError({ view, text: `Task not found: "${task.title}" may have been deleted.` })
      reload()
      return
    }
    // SCRUM-6-AC-11: generic, user-friendly text; never the server's message.
    const reason = error.kind === 'network' ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE
    setRowError({ view, text: `Could not change the status of "${task.title}". ${reason}` })
  }

  // Messages belong to the view they were raised in (filter/page changes clear them), or to its clamp target.
  const from = clampedFrom(location.state)
  const visible = (message: ViewMessage | null) =>
    message !== null && (message.view === view || message.view === from) ? message.text : null
  const announcementText = visible(announcement)
  const rowErrorText = visible(rowError)

  return (
    <section>
      <h1>Tasks</h1>
      <div className="list-toolbar">
        <StatusFilter value={status} onChange={changeFilter} />
      </div>
      {announcementText && <p role="status">{announcementText}</p>}
      {rowErrorText && (
        <div role="alert" className="error-panel">
          {rowErrorText}
        </div>
      )}
      {result.status === 'loading' && <Loading label="Loading tasks…" />}
      {result.status === 'error' && (
        <ErrorPanel
          // A 404 here means a wrong VITE_API_BASE_URL, not a missing task: don't show "Task not found".
          message={result.error.kind === 'not-found' ? GENERIC_ERROR_MESSAGE : result.error.message}
          onRetry={result.reload}
        />
      )}
      {result.status === 'success' &&
        (result.data.items.length > 0 ? (
          <>
            <TaskTable
              tasks={result.data.items}
              returnTo={view}
              onStatusStarted={handleStatusStarted}
              onStatusChanged={handleStatusChanged}
              onStatusFailed={handleStatusFailed}
            />
            <Pager
              page={result.data.page}
              totalPages={result.data.totalPages}
              onPageChange={(p) => setSearchParams(listSearchParams({ page: p + 1, status }))}
            />
          </>
        ) : status !== undefined && result.data.totalElements === 0 ? (
          // SCRUM-6-AC-14: filter-aware empty state.
          <div className="empty-state">
            <p>No tasks with status {STATUS_LABELS[status]}.</p>
            <Link to="/">Show all tasks</Link>
          </div>
        ) : page === 1 ? (
          <div className="empty-state">
            <p>No tasks yet.</p>
            <Link to="/tasks/new">Create your first task</Link>
          </div>
        ) : (
          <div className="empty-state">
            <p>This page is empty.</p>
            <Link to={listPath({ page: 1, status })}>Go to the first page</Link>
          </div>
        ))}
    </section>
  )
}
