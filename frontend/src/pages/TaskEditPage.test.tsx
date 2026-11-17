import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { API, deferred, errorBody } from '../test/fixtures'
import { bodyLog, requestLog, seedManyTasks, seedTasks, storedTask } from '../test/handlers'
import { currentPath, renderApp } from '../test/renderApp'
import { server } from '../test/server'
import { parsePageParam, parseTaskId, returnTarget } from './params'

describe('SCRUM-1 edit task', () => {
  it('SCRUM-1-AC-05, SCRUM-1-AC-09: shows a loading status, then the form prefilled with the task', async () => {
    const [task] = seedTasks([
      { title: 'Write docs', description: 'README', status: 'IN_PROGRESS', dueDate: '2026-12-01' },
    ])
    const gate = deferred()
    server.use(
      http.get(`${API}/tasks/:id`, async () => {
        await gate.promise
        return HttpResponse.json(task)
      }),
    )
    renderApp('/tasks/1/edit')
    expect(screen.getByRole('status')).toHaveTextContent('Loading task…')
    gate.resolve()
    expect(await screen.findByLabelText('Title')).toHaveValue('Write docs')
    expect(screen.getByLabelText('Description')).toHaveValue('README')
    expect(screen.getByLabelText('Status')).toHaveValue('IN_PROGRESS')
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-12-01')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('SCRUM-1-AC-05: the list Edit action opens the edit form for that task', async () => {
    seedTasks([{ title: 'First' }, { title: 'Second', description: 'two' }])
    const { user, router } = renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'Edit Second' }))
    expect(currentPath(router)).toBe('/tasks/2/edit')
    expect(await screen.findByLabelText('Description')).toHaveValue('two')
    expect(requestLog).toEqual(['GET /api/tasks?page=0&size=20', 'GET /api/tasks/2'])
  })

  it('SCRUM-1-AC-06: submitting PUTs all four fields and returns to the list showing the updated values', async () => {
    seedTasks([{ title: 'Old title', description: 'Old', status: 'TODO', dueDate: '2026-12-01' }])
    const { user, router } = renderApp('/tasks/1/edit')
    const title = await screen.findByLabelText('Title')
    await user.clear(title)
    await user.type(title, ' New title ')
    await user.clear(screen.getByLabelText('Description'))
    await user.selectOptions(screen.getByLabelText('Status'), 'Done')
    await user.clear(screen.getByLabelText('Due date'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const row = (await screen.findByRole('cell', { name: 'New title' })).closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Done')).toBeInTheDocument()
    expect(within(row as HTMLElement).getByText('No due date')).toBeInTheDocument()
    expect(currentPath(router)).toBe('/')
    expect(bodyLog).toEqual([{ title: 'New title', description: null, status: 'DONE', dueDate: null }])
    expect(requestLog).toEqual(['GET /api/tasks/1', 'PUT /api/tasks/1', 'GET /api/tasks?page=0&size=20'])
  })

  it('SCRUM-1-AC-06: status is always sent even when unchanged', async () => {
    seedTasks([{ title: 'Keep', status: 'IN_PROGRESS' }])
    const { user } = renderApp('/tasks/1/edit')
    await user.click(await screen.findByRole('button', { name: 'Save changes' }))
    await screen.findByRole('heading', { name: 'Tasks' })
    expect(bodyLog).toEqual([{ title: 'Keep', description: null, status: 'IN_PROGRESS', dueDate: null }])
  })

  it('SCRUM-1-AC-06, SCRUM-1-AC-12: edit from page 2 returns to page 2; Cancel sends no request', async () => {
    seedManyTasks(25)
    const { user, router } = renderApp('/?page=2')
    await user.click(await screen.findByRole('link', { name: 'Edit Task 5' }))
    await user.type(await screen.findByLabelText('Title'), ' changed')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    expect(currentPath(router)).toBe('/?page=2')
    expect(storedTask(5)?.title).toBe('Task 5')
    expect(requestLog).toEqual([
      'GET /api/tasks?page=1&size=20',
      'GET /api/tasks/5',
      'GET /api/tasks?page=1&size=20',
    ])
  })

  it('SCRUM-1-AC-07: invalid edits are blocked client-side without a PUT', async () => {
    seedTasks([{ title: 'Valid' }])
    const { user } = renderApp('/tasks/1/edit')
    await user.clear(await screen.findByLabelText('Title'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Title is required.')
    expect(requestLog).toEqual(['GET /api/tasks/1'])
  })

  it('SCRUM-1-AC-08: server validation errors on PUT are shown inline and input is preserved', async () => {
    seedTasks([{ title: 'Valid' }])
    server.use(
      http.put(`${API}/tasks/1`, () =>
        HttpResponse.json(errorBody(400, 'Validation failed', [{ field: 'status', message: 'must not be null' }]), {
          status: 400,
        }),
      ),
    )
    const { user } = renderApp('/tasks/1/edit')
    await user.type(await screen.findByLabelText('Title'), ' edited')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('must not be null')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Title')).toHaveValue('Valid edited')
  })

  it('SCRUM-1-AC-10: a load failure shows an alert and Retry loads the task', async () => {
    seedTasks([{ title: 'Eventually' }])
    server.use(http.get(`${API}/tasks/1`, () => HttpResponse.error(), { once: true }))
    const { user } = renderApp('/tasks/1/edit')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not reach the server.')
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByLabelText('Title')).toHaveValue('Eventually')
  })

  it('SCRUM-1-AC-10: a 5xx on PUT shows a form-level error and keeps the input', async () => {
    seedTasks([{ title: 'Valid' }])
    server.use(http.put(`${API}/tasks/1`, () => HttpResponse.json(errorBody(500), { status: 500 }), { once: true }))
    const { user, router } = renderApp('/tasks/1/edit')
    await user.type(await screen.findByLabelText('Title'), '!')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(screen.getByLabelText('Title')).toHaveValue('Valid!')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('cell', { name: 'Valid!' })).toBeInTheDocument()
    expect(currentPath(router)).toBe('/')
  })

  it('SCRUM-1-AC-11: GET 404 shows "Task not found" with a link back to the list and no form', async () => {
    const { user, router } = renderApp('/tasks/42/edit')
    expect(await screen.findByRole('heading', { name: 'Task not found' })).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Back to tasks' }))
    expect(currentPath(router)).toBe('/')
  })

  it('SCRUM-1-AC-11: PUT 404 (task deleted elsewhere) replaces the form with "Task not found"', async () => {
    seedTasks([{ title: 'Doomed' }])
    server.use(
      http.put(`${API}/tasks/1`, () => HttpResponse.json(errorBody(404, 'Task with id 1 not found'), { status: 404 })),
    )
    const { user } = renderApp('/tasks/1/edit')
    await user.click(await screen.findByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('heading', { name: 'Task not found' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('SCRUM-1-AC-11, SCRUM-1-AC-12: a non-numeric or non-positive id is not found without any request', async () => {
    for (const path of ['/tasks/abc/edit', '/tasks/0/edit', '/tasks/1.5/edit', '/tasks/-3/edit']) {
      const view = renderApp(path)
      expect(screen.getByRole('heading', { name: 'Task not found' })).toBeInTheDocument()
      view.unmount()
    }
    expect(requestLog).toEqual([])
  })

  it('SCRUM-1-AC-12: URL helpers parse page, id and return target defensively', () => {
    expect(parsePageParam(null)).toBe(1)
    expect(parsePageParam('0')).toBe(1)
    expect(parsePageParam('3')).toBe(3)
    expect(parsePageParam('99999999999999999999')).toBe(1)
    expect(parseTaskId(undefined)).toBeUndefined()
    expect(parseTaskId('12')).toBe(12)
    expect(parseTaskId('99999999999999999999')).toBeUndefined()
    expect(returnTarget({ returnTo: '/?page=2' })).toBe('/?page=2')
    expect(returnTarget({ returnTo: 'https://evil.test' })).toBe('/')
    expect(returnTarget({ returnTo: '//evil.test' })).toBe('/')
    expect(returnTarget(null)).toBe('/')
    expect(returnTarget('x')).toBe('/')
  })
})
