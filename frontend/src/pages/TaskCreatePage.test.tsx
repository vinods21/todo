import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { API, deferred, errorBody } from '../test/fixtures'
import { bodyLog, requestLog, seedTasks } from '../test/handlers'
import { currentPath, renderApp } from '../test/renderApp'
import { server } from '../test/server'

describe('SCRUM-1 create task', () => {
  it('SCRUM-1-AC-04: "New task" opens the form with title, description, status (default To do) and due date', async () => {
    const { user, router } = renderApp('/')
    await screen.findByText('No tasks yet.')
    await user.click(screen.getByRole('link', { name: 'New task' }))
    expect(currentPath(router)).toBe('/tasks/new')
    expect(screen.getByRole('heading', { name: 'New task' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('TODO')
    expect(screen.getByLabelText('Due date')).toHaveValue('')
  })

  it('SCRUM-1-AC-04: submitting POSTs trimmed title and nulls, then shows the new task on the first page', async () => {
    seedTasks([{ title: 'Existing' }])
    const { user, router } = renderApp('/tasks/new')
    await user.type(screen.getByLabelText('Title'), '  Buy milk  ')
    await user.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByRole('cell', { name: 'Buy milk' })).toBeInTheDocument()
    expect(bodyLog).toEqual([{ title: 'Buy milk', description: null, status: 'TODO', dueDate: null }])
    expect(currentPath(router)).toBe('/')
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Buy milk')
    expect(requestLog).toEqual(['POST /api/tasks', 'GET /api/tasks?page=0&size=20'])
  })

  it('SCRUM-1-AC-04: description, status and due date are sent when filled in', async () => {
    let posted: unknown
    server.use(
      http.post(`${API}/tasks`, async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json({ id: 1, createdAt: '2026-11-17T00:00:00Z', ...(posted as object) }, { status: 201 })
      }),
    )
    const { user } = renderApp('/tasks/new')
    await user.type(screen.getByLabelText('Title'), 'Plan trip')
    await user.type(screen.getByLabelText('Description'), 'Book hotel')
    await user.selectOptions(screen.getByLabelText('Status'), 'Done')
    await user.type(screen.getByLabelText('Due date'), '2026-12-31')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await screen.findByRole('heading', { name: 'Tasks' })
    expect(posted).toEqual({ title: 'Plan trip', description: 'Book hotel', status: 'DONE', dueDate: '2026-12-31' })
  })

  it('SCRUM-1-AC-06: Cancel returns to the list without sending a create request', async () => {
    const { user, router } = renderApp('/tasks/new')
    await user.type(screen.getByLabelText('Title'), 'Never sent')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    expect(currentPath(router)).toBe('/')
    await screen.findByText('No tasks yet.')
    expect(requestLog).toEqual(['GET /api/tasks?page=0&size=20'])
  })

  it('SCRUM-1-AC-07: invalid input is reported inline and no request is sent', async () => {
    const { user } = renderApp('/tasks/new')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Title is required.')
    expect(requestLog).toEqual([])
  })

  it('SCRUM-1-AC-08: server fieldErrors are shown inline, unknown ones at form level; input preserved', async () => {
    server.use(
      http.post(`${API}/tasks`, () =>
        HttpResponse.json(
          errorBody(400, 'Validation failed', [
            { field: 'title', message: 'must not be blank' },
            { field: 'owner', message: 'is not allowed' },
          ]),
          { status: 400 },
        ),
      ),
    )
    const { user, router } = renderApp('/tasks/new')
    await user.type(screen.getByLabelText('Title'), 'Rejected by server')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('owner: is not allowed')
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('must not be blank')
    expect(screen.getByLabelText('Title')).toHaveValue('Rejected by server')
    expect(currentPath(router)).toBe('/tasks/new')
  })

  it('SCRUM-1-AC-08: a 400 without fieldErrors shows the response message at form level', async () => {
    server.use(
      http.post(`${API}/tasks`, () =>
        HttpResponse.json(errorBody(400, "Invalid value for field 'dueDate'"), { status: 400 }),
      ),
    )
    const { user } = renderApp('/tasks/new')
    await user.type(screen.getByLabelText('Title'), 'X')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Invalid value for field 'dueDate'")
  })

  it('SCRUM-1-AC-09: double clicking submit sends a single POST', async () => {
    const gate = deferred()
    let posts = 0
    server.use(
      http.post(`${API}/tasks`, async () => {
        posts += 1
        await gate.promise
        return HttpResponse.json(errorBody(400, 'Validation failed'), { status: 400 })
      }),
    )
    const { user } = renderApp('/tasks/new')
    await user.type(screen.getByLabelText('Title'), 'Once')
    await user.dblClick(screen.getByRole('button', { name: 'Create task' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    gate.resolve()
    expect(await screen.findByRole('button', { name: 'Create task' })).toBeEnabled()
    expect(posts).toBe(1)
  })

  it('SCRUM-1-AC-10: a 5xx on submit shows a form-level error, keeps input, and resubmitting works', async () => {
    server.use(
      http.post(`${API}/tasks`, () => HttpResponse.json(errorBody(503, 'db down'), { status: 503 }), { once: true }),
    )
    const { user, router } = renderApp('/tasks/new')
    await user.type(screen.getByLabelText('Title'), 'Retry me')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong. Please try again.')
    expect(alert).not.toHaveTextContent('db down')
    expect(screen.getByLabelText('Title')).toHaveValue('Retry me')

    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByRole('cell', { name: 'Retry me' })).toBeInTheDocument()
    expect(currentPath(router)).toBe('/')
  })

  it('SCRUM-1-AC-10: a network error on submit shows a connection message and keeps input', async () => {
    server.use(http.post(`${API}/tasks`, () => HttpResponse.error()))
    const { user } = renderApp('/tasks/new')
    await user.type(screen.getByLabelText('Title'), 'Offline')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create task' })).toBeEnabled())
    expect(screen.getByLabelText('Title')).toHaveValue('Offline')
  })
})
