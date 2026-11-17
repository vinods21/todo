import { useNavigate } from 'react-router'
import { GENERIC_ERROR_MESSAGE, isApiError } from '../api/errors'
import { createTask } from '../api/tasks'
import { TaskForm } from '../components/TaskForm'
import { EMPTY_FORM, mapServerErrors, toCreateRequest, type FormErrors, type TaskFormValues } from '../components/taskForm'

/** SCRUM-1-AC-04, AC-07..AC-10 */
export function TaskCreatePage() {
  const navigate = useNavigate()

  async function handleSubmit(values: TaskFormValues): Promise<FormErrors | undefined> {
    try {
      await createTask(toCreateRequest(values))
    } catch (error) {
      if (isApiError(error) && error.kind === 'validation') return mapServerErrors(error)
      return { fields: {}, form: isApiError(error) ? error.message : GENERIC_ERROR_MESSAGE }
    }
    // Newest first: the new task is on the first page.
    await navigate('/')
    return undefined
  }

  return (
    <section>
      <h1>New task</h1>
      <TaskForm
        initialValues={EMPTY_FORM}
        submitLabel="Create task"
        onSubmit={handleSubmit}
        onCancel={() => void navigate('/')}
      />
    </section>
  )
}
