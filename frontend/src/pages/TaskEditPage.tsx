import { useCallback, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { GENERIC_ERROR_MESSAGE, isApiError } from '../api/errors'
import { getTask, updateTask } from '../api/tasks'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { TaskForm } from '../components/TaskForm'
import { TaskNotFound } from '../components/TaskNotFound'
import { mapServerErrors, toFormValues, toUpdateRequest, type FormErrors, type TaskFormValues } from '../components/taskForm'
import { useAsync } from '../hooks/useAsync'
import { parseTaskId, returnTarget } from './params'

/** SCRUM-1-AC-05..AC-11 */
export function TaskEditPage() {
  const id = parseTaskId(useParams().id)
  // SCRUM-1-AC-11/AC-12: a non-numeric id is "not found" without issuing a request.
  return <section>{id === undefined ? <TaskNotFound /> : <EditTask key={id} id={id} />}</section>
}

function EditTask({ id }: { id: number }) {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = returnTarget(location.state)
  const [deleted, setDeleted] = useState(false)
  const load = useCallback((signal: AbortSignal) => getTask(id, signal), [id])
  const result = useAsync(load)

  async function handleSubmit(values: TaskFormValues): Promise<FormErrors | undefined> {
    try {
      await updateTask(id, toUpdateRequest(values))
    } catch (error) {
      if (isApiError(error) && error.kind === 'not-found') {
        // SCRUM-1-AC-11: the task disappeared — never keep a stale form around.
        setDeleted(true)
        return undefined
      }
      if (isApiError(error) && error.kind === 'validation') return mapServerErrors(error)
      return { fields: {}, form: isApiError(error) ? error.message : GENERIC_ERROR_MESSAGE }
    }
    await navigate(returnTo)
    return undefined
  }

  if (deleted || (result.status === 'error' && result.error.kind === 'not-found')) return <TaskNotFound />

  return (
    <>
      <h1>Edit task</h1>
      {result.status === 'loading' && <Loading label="Loading task…" />}
      {result.status === 'error' && <ErrorPanel message={result.error.message} onRetry={result.reload} />}
      {result.status === 'success' && (
        <TaskForm
          initialValues={toFormValues(result.data)}
          submitLabel="Save changes"
          onSubmit={handleSubmit}
          onCancel={() => void navigate(returnTo)}
        />
      )}
    </>
  )
}
