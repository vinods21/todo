import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import type { ApiError } from '../api/errors'
import type { Task } from '../api/types'
import { makeTask } from '../test/fixtures'
import { requestLog } from '../test/handlers'
import { TaskTable } from './TaskTable'

function EditProbe() {
  const location = useLocation()
  const state = location.state as { returnTo?: string } | null
  return (
    <p>
      edit {location.pathname} returnTo={state?.returnTo ?? 'none'}
    </p>
  )
}

function setup(tasks: Task[], returnTo = '/?status=DONE&page=2') {
  const onChanged = vi.fn<(updated: Task, detached: boolean) => void>()
  const onFailed = vi.fn<(task: Task, error: ApiError, detached: boolean) => void>()
  const router = createMemoryRouter(
    [
      { path: '/', element: <TaskTable tasks={tasks} returnTo={returnTo} onStatusChanged={onChanged} onStatusFailed={onFailed} /> },
      { path: '/tasks/:id/edit', element: <EditProbe /> },
    ],
    { initialEntries: ['/'] },
  )
  const user = userEvent.setup()
  render(<RouterProvider router={router} />)
  return { router, user, onChanged, onFailed }
}

const tasks = [
  makeTask({ id: 3, title: 'Newest', status: 'DONE', dueDate: '2026-12-01' }),
  makeTask({ id: 2, title: 'Middle', status: 'IN_PROGRESS', dueDate: null }),
  makeTask({ id: 1, title: 'Oldest', status: 'TODO', dueDate: '2027-01-31' }),
]

describe('SCRUM-7 TaskTable', () => {
  it('SCRUM-7-AC-16: a table named Tasks has the Title, Status, Due date and Actions columns in order', () => {
    setup(tasks)
    const table = screen.getByRole('table', { name: 'Tasks' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Title',
      'Status',
      'Due date',
      'Actions',
    ])
  })

  it('SCRUM-7-AC-16: one row per task in the given order; due dates verbatim, null as "No due date"', () => {
    setup(tasks)
    const rows = within(screen.getByRole('table', { name: 'Tasks' })).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    const cells = rows.map((row) => within(row).getAllByRole('cell'))
    expect(cells.map((c) => c[0]?.textContent)).toEqual(['Newest', 'Middle', 'Oldest'])
    expect(cells.map((c) => c[2]?.textContent)).toEqual(['2026-12-01', 'No due date', '2027-01-31'])
  })

  it('SCRUM-7-AC-16: each status cell is a combobox named after the task holding its status; no request is sent', () => {
    setup(tasks)
    expect(screen.getByRole('combobox', { name: 'Status for Newest' })).toHaveValue('DONE')
    expect(screen.getByRole('combobox', { name: 'Status for Middle' })).toHaveValue('IN_PROGRESS')
    expect(screen.getByRole('combobox', { name: 'Status for Oldest' })).toHaveValue('TODO')
    expect(requestLog).toEqual([])
  })

  it('SCRUM-7-AC-16: "Edit <title>" links to /tasks/<id>/edit and carries returnTo in the router state', async () => {
    const { user } = setup(tasks)
    const link = screen.getByRole('link', { name: 'Edit Middle' })
    expect(link).toHaveAttribute('href', '/tasks/2/edit')
    expect(link).toHaveTextContent('Edit')
    await user.click(link)
    expect(screen.getByText('edit /tasks/2/edit returnTo=/?status=DONE&page=2')).toBeInTheDocument()
  })

  it('SCRUM-7-AC-16: no tasks renders the header row only', () => {
    setup([])
    const rows = within(screen.getByRole('table', { name: 'Tasks' })).getAllByRole('row')
    expect(rows).toHaveLength(1)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
