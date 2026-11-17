import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { API, deferred, errorBody } from '../test/fixtures'
import { requestLog, seedManyTasks, seedTasks } from '../test/handlers'
import { currentPath, renderApp } from '../test/renderApp'
import { server } from '../test/server'

function rows() {
  // First row is the header row.
  return screen.getAllByRole('row').slice(1)
}

describe('SCRUM-1 task list', () => {
  it('SCRUM-1-AC-01: shows title, status label and due date (or placeholder) in API order', async () => {
    seedTasks([
      { title: 'Oldest', status: 'DONE', dueDate: '2026-12-24' },
      { title: 'Middle', status: 'IN_PROGRESS', dueDate: null },
      { title: 'Newest', status: 'TODO', dueDate: '2025-01-01' },
    ])
    renderApp('/')
    expect(await screen.findByRole('table', { name: 'Tasks' })).toBeInTheDocument()
    expect(requestLog).toEqual(['GET /api/tasks?page=0&size=20'])
    // SCRUM-6 (design §8.3): the status cell is now a control; its selected option carries the label.
    const cells = rows().map((row) => {
      const [title, , due] = within(row).getAllByRole('cell').map((c) => c.textContent)
      return [title, due]
    })
    expect(cells).toEqual([
      ['Newest', '2025-01-01'],
      ['Middle', 'No due date'],
      ['Oldest', '2026-12-24'],
    ])
    expect(screen.getByRole('combobox', { name: 'Status for Newest' })).toHaveDisplayValue('To do')
    expect(screen.getByRole('combobox', { name: 'Status for Middle' })).toHaveDisplayValue('In progress')
    expect(screen.getByRole('combobox', { name: 'Status for Oldest' })).toHaveDisplayValue('Done')
    expect(screen.getByRole('link', { name: 'Edit Middle' })).toHaveAttribute('href', '/tasks/2/edit')
  })

  it('SCRUM-1-AC-02: paging is hidden when there is a single page', async () => {
    seedManyTasks(20)
    renderApp('/')
    expect(await screen.findAllByRole('row')).toHaveLength(21)
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('SCRUM-1-AC-02, SCRUM-1-AC-12: Previous/Next load adjacent pages via ?page and disable at the bounds', async () => {
    seedManyTasks(45) // 3 pages of 20
    const { user, router } = renderApp('/')
    const pager = await screen.findByRole('navigation', { name: 'Pagination' })
    expect(within(pager).getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('cell', { name: 'Task 45' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()
    expect(currentPath(router)).toBe('/?page=2')
    expect(screen.getByRole('cell', { name: 'Task 25' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(rows()).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()
    expect(currentPath(router)).toBe('/?page=2')
    expect(requestLog).toEqual([
      'GET /api/tasks?page=0&size=20',
      'GET /api/tasks?page=1&size=20',
      'GET /api/tasks?page=2&size=20',
      'GET /api/tasks?page=1&size=20',
    ])
  })

  it('SCRUM-1-AC-02: an invalid ?page falls back to the first page', async () => {
    seedManyTasks(2)
    renderApp('/?page=abc')
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(requestLog).toEqual(['GET /api/tasks?page=0&size=20'])
  })

  it('SCRUM-1-AC-03: shows an empty state with a create call to action when there are no tasks', async () => {
    const { user, router } = renderApp('/')
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Create your first task' }))
    expect(currentPath(router)).toBe('/tasks/new')
    expect(await screen.findByRole('heading', { name: 'New task' })).toBeInTheDocument()
  })

  it('SCRUM-1-AC-03: an empty page beyond the last one offers a link to the first page', async () => {
    seedManyTasks(3)
    const { user } = renderApp('/?page=9')
    expect(await screen.findByText('This page is empty.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Go to the first page' }))
    expect(await screen.findAllByRole('row')).toHaveLength(4)
  })

  it('SCRUM-1-AC-09: shows a loading status while the list is being fetched', async () => {
    const gate = deferred()
    server.use(
      http.get(`${API}/tasks`, async () => {
        await gate.promise
        return HttpResponse.json({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })
      }),
    )
    renderApp('/')
    expect(screen.getByRole('status')).toHaveTextContent('Loading tasks…')
    gate.resolve()
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('SCRUM-1-AC-10: a 500 shows a generic alert without the body; Retry re-requests and recovers', async () => {
    seedTasks([{ title: 'Recovered' }])
    let calls = 0
    server.use(
      http.get(`${API}/tasks`, () => {
        calls += 1
        return HttpResponse.json(errorBody(500, 'org.postgresql.util.PSQLException: boom'), { status: 500 })
      }, { once: true }),
    )
    const { user } = renderApp('/')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(alert).not.toHaveTextContent('PSQLException')
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('cell', { name: 'Recovered' })).toBeInTheDocument()
    expect(calls).toBe(1)
    expect(requestLog).toEqual(['GET /api/tasks?page=0&size=20'])
  })

  it('SCRUM-1-AC-10: a network error shows a connection message and Retry re-issues the request', async () => {
    let calls = 0
    server.use(
      http.get(`${API}/tasks`, () => {
        calls += 1
        return HttpResponse.error()
      }),
    )
    const { user } = renderApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(calls).toBe(2))
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('SCRUM-1-AC-10: a 404 from the list endpoint (wrong API base URL) shows a generic error, not "Task not found"', async () => {
    server.use(
      http.get(`${API}/tasks`, () =>
        HttpResponse.json(errorBody(404, 'No endpoint GET /api/api/tasks'), { status: 404 }),
      ),
    )
    renderApp('/')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(alert).not.toHaveTextContent('Task not found')
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
