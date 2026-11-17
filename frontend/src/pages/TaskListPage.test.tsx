import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { API, deferred, errorBody } from '../test/fixtures'
import { bodyLog, requestLog, seedManyTasks, seedTasks, storedTask } from '../test/handlers'
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

describe('SCRUM-6 task list status', () => {
  function statusSelect(title: string) {
    return screen.getByRole('combobox', { name: `Status for ${title}` })
  }

  function filter() {
    return screen.getByRole('combobox', { name: 'Status' })
  }

  it('SCRUM-6-AC-08, SCRUM-6-NFR-06: every row has a status control for its task with the current value; Edit remains', async () => {
    seedTasks([
      { title: 'Alpha', status: 'DONE' },
      { title: 'Beta', status: 'IN_PROGRESS' },
    ])
    renderApp('/')
    expect(await screen.findByRole('combobox', { name: 'Status for Alpha' })).toHaveDisplayValue('Done')
    expect(statusSelect('Beta')).toHaveDisplayValue('In progress')
    expect(within(statusSelect('Beta')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'To do',
      'In progress',
      'Done',
    ])
    expect(screen.getByRole('link', { name: 'Edit Alpha' })).toHaveAttribute('href', '/tasks/1/edit')
    expect(screen.getByRole('link', { name: 'Edit Beta' })).toHaveAttribute('href', '/tasks/2/edit')
  })

  it('SCRUM-6-AC-09, SCRUM-6-NFR-06: changing a status sends only a PATCH, stays on the list and announces the change', async () => {
    seedTasks([{ title: 'Alpha', description: 'keep me', status: 'TODO' }])
    const { user, router } = renderApp('/')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status for Alpha' }), 'Done')
    expect(await screen.findByRole('status')).toHaveTextContent('Status of "Alpha" changed to Done.')
    expect(statusSelect('Alpha')).toHaveDisplayValue('Done')
    expect(currentPath(router)).toBe('/')
    expect(requestLog).toEqual(['GET /api/tasks?page=0&size=20', 'PATCH /api/tasks/1/status'])
    expect(bodyLog).toEqual([{ status: 'DONE' }])
    expect(storedTask(1)).toMatchObject({ status: 'DONE', description: 'keep me', title: 'Alpha' })
  })

  it('SCRUM-6-AC-10: only the row being saved is disabled; other rows stay usable', async () => {
    seedTasks([{ title: 'Alpha' }, { title: 'Beta' }])
    const gate = deferred()
    server.use(
      http.patch(`${API}/tasks/1/status`, async () => {
        await gate.promise
        return HttpResponse.json({ ...storedTask(1), status: 'IN_PROGRESS' })
      }),
    )
    const { user } = renderApp('/')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status for Alpha' }), 'In progress')
    expect(statusSelect('Alpha')).toBeDisabled()
    expect(statusSelect('Alpha')).toHaveAttribute('aria-busy', 'true')
    expect(statusSelect('Beta')).toBeEnabled()
    gate.resolve()
    expect(await screen.findByRole('status')).toHaveTextContent('Status of "Alpha" changed to In progress.')
    expect(statusSelect('Alpha')).toBeEnabled()
  })

  it('SCRUM-6-AC-10: in a filtered list a changed task is reloaded out of the view', async () => {
    seedTasks([
      { title: 'Stay', status: 'TODO' },
      { title: 'Move', status: 'TODO' },
    ])
    const { user, router } = renderApp('/?status=TODO')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status for Move' }), 'Done')
    expect(await screen.findByRole('status')).toHaveTextContent('Status of "Move" changed to Done.')
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Status for Move' })).not.toBeInTheDocument())
    expect(await screen.findByRole('combobox', { name: 'Status for Stay' })).toHaveDisplayValue('To do')
    expect(currentPath(router)).toBe('/?status=TODO')
    expect(requestLog).toEqual([
      'GET /api/tasks?page=0&size=20&status=TODO',
      'PATCH /api/tasks/2/status',
      'GET /api/tasks?page=0&size=20&status=TODO',
    ])
  })

  it('SCRUM-6-AC-10: when the change empties the last filtered page the list moves to the new last page', async () => {
    seedManyTasks(21) // all TODO; page 2 holds only "Task 1"
    const { user, router } = renderApp('/?status=TODO&page=2')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status for Task 1' }), 'Done')
    await waitFor(() => expect(currentPath(router)).toBe('/?status=TODO'))
    expect(await screen.findByRole('combobox', { name: 'Status for Task 21' })).toBeInTheDocument()
    expect(rows()).toHaveLength(20)
    expect(screen.getByRole('status')).toHaveTextContent('Status of "Task 1" changed to Done.')
    expect(screen.queryByText('This page is empty.')).not.toBeInTheDocument()
    expect(requestLog).toEqual([
      'GET /api/tasks?page=1&size=20&status=TODO',
      'PATCH /api/tasks/1/status',
      'GET /api/tasks?page=1&size=20&status=TODO',
      'GET /api/tasks?page=0&size=20&status=TODO',
    ])
  })

  it('SCRUM-6-AC-10, SCRUM-6-AC-14: when the change empties the whole filtered set the filter-aware empty state is shown', async () => {
    seedTasks([{ title: 'Only', status: 'IN_PROGRESS' }])
    const { user } = renderApp('/?status=IN_PROGRESS')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status for Only' }), 'Done')
    expect(await screen.findByText('No tasks with status In progress.')).toBeInTheDocument()
  })

  it('SCRUM-6-AC-11: a 500 reverts the row and shows a generic alert without the body; retrying succeeds', async () => {
    seedTasks([{ title: 'Alpha', status: 'TODO' }])
    server.use(
      http.patch(
        `${API}/tasks/1/status`,
        () => HttpResponse.json(errorBody(500, 'org.postgresql.util.PSQLException: boom'), { status: 500 }),
        { once: true },
      ),
    )
    const { user } = renderApp('/')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status for Alpha' }), 'Done')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not change the status of "Alpha". Something went wrong. Please try again.')
    expect(alert).not.toHaveTextContent('PSQLException')
    expect(statusSelect('Alpha')).toHaveDisplayValue('To do')
    expect(statusSelect('Alpha')).toBeEnabled()

    await user.selectOptions(statusSelect('Alpha'), 'Done')
    expect(await screen.findByRole('status')).toHaveTextContent('Status of "Alpha" changed to Done.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(storedTask(1)?.status).toBe('DONE')
  })

  it('SCRUM-6-AC-11: a network error reverts the row and announces a connection problem', async () => {
    seedTasks([{ title: 'Alpha', status: 'IN_PROGRESS' }])
    server.use(http.patch(`${API}/tasks/1/status`, () => HttpResponse.error()))
    const { user } = renderApp('/')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status for Alpha' }), 'Done')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not change the status of "Alpha". Could not reach the server.',
    )
    expect(statusSelect('Alpha')).toHaveDisplayValue('In progress')
  })

  it('SCRUM-6-AC-11: a 400 reverts the row with a generic message, never the raw server message', async () => {
    seedTasks([{ title: 'Alpha', status: 'TODO' }])
    server.use(
      http.patch(`${API}/tasks/1/status`, () =>
        HttpResponse.json(errorBody(400, 'Raw server detail XYZ', [{ field: 'status', message: 'invalid value' }]), {
          status: 400,
        }),
      ),
    )
    const { user } = renderApp('/')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status for Alpha' }), 'Done')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(alert).not.toHaveTextContent('XYZ')
    expect(statusSelect('Alpha')).toHaveDisplayValue('To do')
  })

  it('SCRUM-6-AC-11: a 404 (deleted elsewhere) shows "Task not found" and reloads the list', async () => {
    seedTasks([{ title: 'Ghost', status: 'TODO' }])
    server.use(
      http.patch(`${API}/tasks/1/status`, () =>
        HttpResponse.json(errorBody(404, 'Task with id 1 not found'), { status: 404 }),
      ),
    )
    const { user } = renderApp('/')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status for Ghost' }), 'Done')
    expect(await screen.findByRole('alert')).toHaveTextContent('Task not found: "Ghost" may have been deleted.')
    await waitFor(() =>
      expect(requestLog).toEqual(['GET /api/tasks?page=0&size=20', 'GET /api/tasks?page=0&size=20']),
    )
  })

  it('SCRUM-6-AC-12: the Status filter offers All/To do/In progress/Done and drives the status parameter', async () => {
    seedTasks([
      { title: 'Open', status: 'TODO' },
      { title: 'Finished', status: 'DONE' },
    ])
    const { user } = renderApp('/')
    await screen.findByRole('table')
    expect(filter()).toHaveDisplayValue('All')
    expect(within(filter()).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All',
      'To do',
      'In progress',
      'Done',
    ])

    await user.selectOptions(filter(), 'Done')
    expect(await screen.findByRole('combobox', { name: 'Status for Finished' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Status for Open' })).not.toBeInTheDocument()

    await user.selectOptions(filter(), 'All')
    expect(await screen.findByRole('combobox', { name: 'Status for Open' })).toBeInTheDocument()
    expect(requestLog).toEqual([
      'GET /api/tasks?page=0&size=20',
      'GET /api/tasks?page=0&size=20&status=DONE',
      'GET /api/tasks?page=0&size=20',
    ])
  })

  it('SCRUM-6-AC-13: the filter is reflected in the URL and a filter change resets to page 1', async () => {
    seedManyTasks(25)
    const { user, router } = renderApp('/?page=2')
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    await user.selectOptions(filter(), 'In progress')
    expect(currentPath(router)).toBe('/?status=IN_PROGRESS')
    expect(await screen.findByText('No tasks with status In progress.')).toBeInTheDocument()
    expect(requestLog).toEqual(['GET /api/tasks?page=1&size=20', 'GET /api/tasks?page=0&size=20&status=IN_PROGRESS'])
  })

  it('SCRUM-6-AC-13: direct entry restores filter and page; paging keeps the filter', async () => {
    seedTasks(Array.from({ length: 25 }, (_, i) => ({ title: `Done ${i + 1}`, status: 'DONE' as const })))
    seedTasks([{ title: 'Not done', status: 'TODO' }])
    const { user, router } = renderApp('/?status=DONE&page=2')
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    expect(filter()).toHaveDisplayValue('Done')
    expect(rows()).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument()
    expect(currentPath(router)).toBe('/?status=DONE')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    expect(currentPath(router)).toBe('/?status=DONE&page=2')
    expect(requestLog).toEqual([
      'GET /api/tasks?page=1&size=20&status=DONE',
      'GET /api/tasks?page=0&size=20&status=DONE',
      'GET /api/tasks?page=1&size=20&status=DONE',
    ])
  })

  it('SCRUM-6-AC-13: an invalid ?status is treated as All and never sent to the API', async () => {
    seedTasks([{ title: 'Any', status: 'DONE' }])
    renderApp('/?status=done')
    expect(await screen.findByRole('combobox', { name: 'Status for Any' })).toBeInTheDocument()
    expect(filter()).toHaveDisplayValue('All')
    expect(requestLog).toEqual(['GET /api/tasks?page=0&size=20'])
  })

  it('SCRUM-6-AC-14: an empty filtered result names the filter and "Show all tasks" clears it', async () => {
    seedTasks([{ title: 'Open', status: 'TODO' }])
    const { user, router } = renderApp('/?status=DONE')
    expect(await screen.findByText('No tasks with status Done.')).toBeInTheDocument()
    expect(screen.queryByText('No tasks yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Show all tasks' }))
    expect(currentPath(router)).toBe('/')
    expect(await screen.findByRole('combobox', { name: 'Status for Open' })).toBeInTheDocument()
    expect(filter()).toHaveDisplayValue('All')
  })

  it('SCRUM-6-AC-14: the unfiltered empty list still says "No tasks yet."; a filtered page beyond the end links to its first page', async () => {
    const first = renderApp('/')
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
    first.unmount()

    seedTasks([{ title: 'Done one', status: 'DONE' }])
    const { user, router } = renderApp('/?status=DONE&page=5')
    expect(await screen.findByText('This page is empty.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Go to the first page' }))
    expect(currentPath(router)).toBe('/?status=DONE')
    expect(await screen.findByRole('combobox', { name: 'Status for Done one' })).toBeInTheDocument()
  })

  it('SCRUM-6-AC-11, SCRUM-6-AC-13: messages are cleared when the filter changes', async () => {
    seedTasks([{ title: 'Alpha', status: 'TODO' }])
    const { user } = renderApp('/')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status for Alpha' }), 'Done')
    expect(await screen.findByRole('status')).toHaveTextContent('changed to Done')
    await user.selectOptions(filter(), 'Done')
    expect(await screen.findByRole('combobox', { name: 'Status for Alpha' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
