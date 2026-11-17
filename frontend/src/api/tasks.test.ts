import { http, HttpResponse } from 'msw'
import { API, errorBody, makePage, makeTask } from '../test/fixtures'
import { server } from '../test/server'
import { createTask, getTask, listTasks, PAGE_SIZE, updateTask, updateTaskStatus } from './tasks'

describe('SCRUM-1 tasks API', () => {
  it('SCRUM-1-AC-01, SCRUM-1-AC-02: listTasks requests GET /api/tasks?page=N&size=20', async () => {
    let url: URL | undefined
    const page = makePage([makeTask({ id: 3 }), makeTask({ id: 2 })], { page: 2, totalPages: 5 })
    server.use(
      http.get(`${API}/tasks`, ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json(page)
      }),
    )
    expect(PAGE_SIZE).toBe(20)
    await expect(listTasks({ page: 2 })).resolves.toEqual(page)
    expect(url?.searchParams.get('page')).toBe('2')
    expect(url?.searchParams.get('size')).toBe('20')
  })

  it('SCRUM-1-AC-05: getTask requests GET /api/tasks/{id}', async () => {
    const task = makeTask({ id: 7, title: 'Seven' })
    server.use(http.get(`${API}/tasks/7`, () => HttpResponse.json(task)))
    await expect(getTask(7)).resolves.toEqual(task)
  })

  it('SCRUM-1-AC-04: createTask POSTs the request body and returns the 201 task', async () => {
    let body: unknown
    server.use(
      http.post(`${API}/tasks`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(makeTask({ id: 11, title: 'New' }), { status: 201 })
      }),
    )
    const created = await createTask({ title: 'New', description: null, status: 'TODO', dueDate: null })
    expect(created.id).toBe(11)
    expect(body).toEqual({ title: 'New', description: null, status: 'TODO', dueDate: null })
  })

  it('SCRUM-1-AC-06: updateTask PUTs all four fields to /api/tasks/{id}', async () => {
    let body: unknown
    server.use(
      http.put(`${API}/tasks/4`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(makeTask({ id: 4, status: 'DONE' }))
      }),
    )
    const req = { title: 'T', description: 'D', status: 'DONE' as const, dueDate: '2026-12-01' }
    await expect(updateTask(4, req)).resolves.toMatchObject({ id: 4, status: 'DONE' })
    expect(body).toEqual(req)
  })
})

describe('SCRUM-6 tasks API', () => {
  it('SCRUM-6-AC-12: listTasks adds status after page and size; without status there is no status key', async () => {
    const urls: string[] = []
    server.use(
      http.get(`${API}/tasks`, ({ request }) => {
        urls.push(request.url)
        return HttpResponse.json(makePage([makeTask({ status: 'DONE' })]))
      }),
    )
    await listTasks({ page: 0, status: 'DONE' })
    await listTasks({ page: 1 })
    expect(urls).toEqual([`${API}/tasks?page=0&size=20&status=DONE`, `${API}/tasks?page=1&size=20`])
  })

  it('SCRUM-6-AC-09, SCRUM-6-NFR-04: updateTaskStatus PATCHes only { status } as JSON and resolves to the task', async () => {
    let seen: { method: string; url: string; contentType: string | null; body: string } | undefined
    server.use(
      http.patch(`${API}/tasks/3/status`, async ({ request }) => {
        seen = {
          method: request.method,
          url: request.url,
          contentType: request.headers.get('content-type'),
          body: await request.text(),
        }
        return HttpResponse.json(makeTask({ id: 3, status: 'IN_PROGRESS' }))
      }),
    )
    await expect(updateTaskStatus(3, 'IN_PROGRESS')).resolves.toMatchObject({ id: 3, status: 'IN_PROGRESS' })
    expect(seen).toEqual({
      method: 'PATCH',
      url: `${API}/tasks/3/status`,
      contentType: 'application/json',
      body: '{"status":"IN_PROGRESS"}',
    })
  })

  it('SCRUM-6-AC-11: updateTaskStatus rejects with a not-found ApiError on 404', async () => {
    server.use(
      http.patch(`${API}/tasks/9/status`, () =>
        HttpResponse.json(errorBody(404, 'Task with id 9 not found'), { status: 404 }),
      ),
    )
    await expect(updateTaskStatus(9, 'DONE')).rejects.toMatchObject({ kind: 'not-found', status: 404 })
  })
})
