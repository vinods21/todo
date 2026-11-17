import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { deferred } from '../test/fixtures'
import { TaskForm, type TaskFormProps } from './TaskForm'
import { EMPTY_FORM, type FormErrors, type TaskFormValues } from './taskForm'

function setup(overrides: Partial<TaskFormProps> = {}) {
  const onSubmit = vi.fn<(v: TaskFormValues) => Promise<FormErrors | undefined>>(async () => undefined)
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(
    <TaskForm initialValues={EMPTY_FORM} submitLabel="Create task" onSubmit={onSubmit} onCancel={onCancel} {...overrides} />,
  )
  return { user, onSubmit, onCancel }
}

describe('SCRUM-1 task form', () => {
  it('SCRUM-1-NFR-07: every control has a label; status offers the three statuses', () => {
    setup()
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA')
    expect(screen.getByLabelText('Due date')).toHaveAttribute('type', 'date')
    const status = screen.getByLabelText('Status')
    expect(status).toHaveValue('TODO')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['To do', 'In progress', 'Done'])
  })

  it('SCRUM-1-AC-07, SCRUM-1-NFR-07: blank title blocks submit, shows a linked inline message and focuses the field', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Title'), '   ')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    const title = screen.getByLabelText('Title')
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(title).toHaveAccessibleDescription('Title is required.')
    expect(title).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('SCRUM-1-AC-07: too-long title and description are reported inline; editing a field clears its error', async () => {
    const { user, onSubmit } = setup()
    const title = screen.getByLabelText('Title')
    const description = screen.getByLabelText('Description')
    await user.click(title)
    await user.paste('a'.repeat(201))
    await user.click(description)
    await user.paste('d'.repeat(2001))
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(title).toHaveAccessibleDescription('Title must be at most 200 characters.')
    expect(description).toHaveAccessibleDescription('Description must be at most 2000 characters.')
    expect(title).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(title, '{Backspace}')
    expect(title).not.toHaveAttribute('aria-invalid')
    expect(description).toHaveAttribute('aria-invalid', 'true')
  })

  it('SCRUM-1-NFR-07: Enter in the title field submits the form with the entered values', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByLabelText('Description'), 'Two litres')
    await user.selectOptions(screen.getByLabelText('Status'), 'In progress')
    await user.type(screen.getByLabelText('Due date'), '2020-01-31')
    await user.type(screen.getByLabelText('Title'), 'Buy milk{Enter}')
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Buy milk',
      description: 'Two litres',
      status: 'IN_PROGRESS',
      dueDate: '2020-01-31',
    })
  })

  it('SCRUM-1-AC-08: server errors are shown inline and form-level; input is preserved', async () => {
    const onSubmit = vi.fn(async () => ({
      fields: { description: 'size must be between 0 and 2000' },
      form: 'priority: unknown',
    }))
    const { user } = setup({ onSubmit })
    await user.type(screen.getByLabelText('Title'), 'Keep me')
    await user.type(screen.getByLabelText('Description'), 'Long text')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('priority: unknown')
    const description = screen.getByLabelText('Description')
    expect(description).toHaveAccessibleDescription('size must be between 0 and 2000')
    expect(description).toHaveFocus()
    expect(screen.getByLabelText('Title')).toHaveValue('Keep me')
    expect(description).toHaveValue('Long text')
  })

  it('SCRUM-1-AC-10, SCRUM-1-NFR-07: a form-level error only is announced and receives focus', async () => {
    const onSubmit = vi.fn(async () => ({ fields: {}, form: 'Could not reach the server.' }))
    const { user } = setup({ onSubmit })
    await user.type(screen.getByLabelText('Title'), 'X')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not reach the server.')
    expect(alert).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Create task' })).toBeEnabled()
  })

  it('SCRUM-1-AC-09: submit is disabled and shows progress while in flight; no double submission', async () => {
    const gate = deferred()
    const onSubmit = vi.fn(async () => {
      await gate.promise
      return undefined
    })
    const { user } = setup({ onSubmit })
    await user.type(screen.getByLabelText('Title'), 'X')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    const saving = screen.getByRole('button', { name: 'Saving…' })
    expect(saving).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving…' }).closest('form')).toHaveAttribute('aria-busy', 'true')
    await user.type(screen.getByLabelText('Title'), '{Enter}')
    await user.click(saving)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    gate.resolve()
    expect(await screen.findByRole('button', { name: 'Create task' })).toBeEnabled()
  })

  it('SCRUM-1-AC-06: Cancel calls onCancel without submitting', async () => {
    const { user, onSubmit, onCancel } = setup()
    await user.type(screen.getByLabelText('Title'), 'X')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
