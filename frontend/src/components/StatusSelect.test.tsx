import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ApiError } from '../api/errors'
import type { Task } from '../api/types'
import { API, deferred, errorBody } from '../test/fixtures'
import { bodyLog, requestLog, seedTasks } from '../test/handlers'
import { server } from '../test/server'
import { StatusSelect } from './StatusSelect'

function setup(task: Task) {
  const onStarted = vi.fn<(task: Task) => void>()
  const onChanged = vi.fn<(updated: Task) => void>()
  const onFailed = vi.fn<(task: Task, error: ApiError) => void>()
  const user = userEvent.setup()
  render(<StatusSelect task={task} onStarted={onStarted} onChanged={onChanged} onFailed={onFailed} />)
  const select = screen.getByRole('combobox', { name: `Status for ${task.title}` })
  return { user, select, onStarted, onChanged, onFailed }
}

describe('SCRUM-6 status select', () => {
  it('SCRUM-6-AC-08, SCRUM-6-NFR-06: a combobox named after the task offers the three labelled statuses, current one selected', () => {
    const [task] = seedTasks([{ title: 'Write docs', status: 'IN_PROGRESS' }])
    const { select } = setup(task as Task)
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['To do', 'In progress', 'Done'])
    expect(select).toHaveValue('IN_PROGRESS')
    expect(select).toHaveDisplayValue('In progress')
    expect(select).toBeEnabled()
    expect(requestLog).toEqual([])
  })

  it('SCRUM-6-AC-09: choosing a status sends one PATCH with only { status } and reports the server task', async () => {
    const [task] = seedTasks([{ title: 'Write docs', description: 'keep', status: 'TODO' }])
    const { user, select, onStarted, onChanged, onFailed } = setup(task as Task)
    await user.selectOptions(select, 'Done')
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ id: 1, status: 'DONE', description: 'keep' }))
    expect(onStarted).toHaveBeenCalledTimes(1)
    expect(onFailed).not.toHaveBeenCalled()
    expect(requestLog).toEqual(['PATCH /api/tasks/1/status'])
    expect(bodyLog).toEqual([{ status: 'DONE' }])
    expect(select).toHaveValue('DONE')
  })

  it('SCRUM-6-AC-10, SCRUM-6-NFR-06: while in flight the control is disabled, busy and described by "Saving…"; focus returns afterwards', async () => {
    const [task] = seedTasks([{ title: 'Slow', status: 'TODO' }])
    const gate = deferred()
    server.use(
      http.patch(`${API}/tasks/1/status`, async () => {
        await gate.promise
        return HttpResponse.json({ ...task, status: 'IN_PROGRESS' })
      }),
    )
    const { user, select, onChanged } = setup(task as Task)
    act(() => select.focus())
    await user.selectOptions(select, 'In progress')

    expect(select).toBeDisabled()
    expect(select).toHaveAttribute('aria-busy', 'true')
    expect(select).toHaveAccessibleDescription('Saving…')
    // A second change while in flight is ignored (no double submission).
    fireEvent.change(select, { target: { value: 'DONE' } })
    // Browsers blur a control when it becomes disabled.
    act(() => select.blur())

    gate.resolve()
    await waitFor(() => expect(select).toBeEnabled())
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(select).toHaveValue('IN_PROGRESS')
    expect(select).toHaveAttribute('aria-busy', 'false')
    expect(select).not.toHaveAccessibleDescription('Saving…')
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument()
    expect(select).toHaveFocus()
  })

  it('SCRUM-6-AC-11: a 500 reverts to the previous status and reports a server error', async () => {
    const [task] = seedTasks([{ title: 'Fragile', status: 'TODO' }])
    server.use(
      http.patch(`${API}/tasks/1/status`, () => HttpResponse.json(errorBody(500, 'boom'), { status: 500 })),
    )
    const { user, select, onChanged, onFailed } = setup(task as Task)
    await user.selectOptions(select, 'Done')
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))
    expect(onFailed.mock.calls[0]?.[1]).toMatchObject({ kind: 'server', status: 500 })
    expect(onChanged).not.toHaveBeenCalled()
    expect(select).toHaveValue('TODO')
    expect(select).toBeEnabled()
  })

  it('SCRUM-6-AC-11: a network error reverts and reports a network error; the user can try again', async () => {
    const [task] = seedTasks([{ title: 'Offline', status: 'DONE' }])
    server.use(http.patch(`${API}/tasks/1/status`, () => HttpResponse.error(), { once: true }))
    const { user, select, onChanged, onFailed } = setup(task as Task)
    await user.selectOptions(select, 'To do')
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))
    expect(onFailed.mock.calls[0]?.[1]).toMatchObject({ kind: 'network', status: 0 })
    expect(select).toHaveValue('DONE')

    await user.selectOptions(select, 'To do')
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(select).toHaveValue('TODO')
  })

  it('SCRUM-6-AC-11: a 200 with an unreadable body is treated as a failure and reverts', async () => {
    const [task] = seedTasks([{ title: 'Odd', status: 'TODO' }])
    server.use(http.patch(`${API}/tasks/1/status`, () => new HttpResponse('not json', { status: 200 })))
    const { user, select, onFailed } = setup(task as Task)
    await user.selectOptions(select, 'Done')
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1))
    expect(onFailed.mock.calls[0]?.[1]).toMatchObject({ kind: 'server' })
    expect(select).toHaveValue('TODO')
  })
})
