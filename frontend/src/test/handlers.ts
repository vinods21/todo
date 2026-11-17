import { http, HttpResponse } from 'msw'
import type { Page, Task, TaskCreateRequest } from '../api/types'
import { API, errorBody } from './fixtures'

// Default MSW handlers: an in-memory task store with SCRUM-2 semantics (newest first, page/size, 404 and 400 bodies).

interface Store {
  tasks: Task[]
  nextId: number
  clock: number
}

const store: Store = { tasks: [], nextId: 1, clock: Date.parse('2026-11-01T00:00:00Z') }

/** Every request the default handlers served, e.g. `GET /api/tasks?page=0&size=20`. */
export const requestLog: string[] = []
/** JSON bodies of POST/PUT requests the default handlers served, in order. */
export const bodyLog: unknown[] = []

function nextCreatedAt(): string {
  store.clock += 60_000
  return new Date(store.clock).toISOString()
}

function newestFirst(a: Task, b: Task): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id - a.id
}

export function resetStore(): void {
  store.tasks = []
  store.nextId = 1
  store.clock = Date.parse('2026-11-01T00:00:00Z')
  requestLog.length = 0
  bodyLog.length = 0
}

/** Adds tasks to the store; later entries are newer. Returns the stored tasks. */
export function seedTasks(tasks: Partial<Task>[]): Task[] {
  return tasks.map((partial) => {
    const task: Task = {
      id: store.nextId++,
      title: 'Task',
      description: null,
      status: 'TODO',
      dueDate: null,
      ...partial,
      createdAt: partial.createdAt ?? nextCreatedAt(),
    }
    store.tasks.push(task)
    return task
  })
}

/** Seeds `n` tasks titled "Task 1".."Task n" (Task n is the newest). */
export function seedManyTasks(n: number): Task[] {
  return seedTasks(Array.from({ length: n }, (_, i) => ({ title: `Task ${i + 1}` })))
}

export function storedTask(id: number): Task | undefined {
  return store.tasks.find((t) => t.id === id)
}

function log(request: Request): void {
  const url = new URL(request.url)
  requestLog.push(`${request.method} ${url.pathname}${url.search}`)
}

function validate(body: TaskCreateRequest, path: string) {
  const fieldErrors = []
  const title = body.title.trim()
  if (title === '') fieldErrors.push({ field: 'title', message: 'must not be blank' })
  if (title.length > 200) fieldErrors.push({ field: 'title', message: 'size must be between 0 and 200' })
  if (body.description !== null && body.description.length > 2000)
    fieldErrors.push({ field: 'description', message: 'size must be between 0 and 2000' })
  return fieldErrors.length > 0
    ? HttpResponse.json(errorBody(400, 'Validation failed', fieldErrors, path), { status: 400 })
    : undefined
}

function idOf(params: Record<string, string | readonly string[] | undefined>): number {
  return Number(params.id)
}

export const handlers = [
  http.get(`${API}/tasks`, ({ request }) => {
    log(request)
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Math.min(Number(url.searchParams.get('size') ?? '20'), 100)
    const sorted = [...store.tasks].sort(newestFirst)
    const body: Page<Task> = {
      items: sorted.slice(page * size, page * size + size),
      page,
      size,
      totalElements: sorted.length,
      totalPages: Math.ceil(sorted.length / size),
    }
    return HttpResponse.json(body)
  }),

  http.get(`${API}/tasks/:id`, ({ request, params }) => {
    log(request)
    const task = storedTask(idOf(params))
    return task
      ? HttpResponse.json(task)
      : HttpResponse.json(errorBody(404, `Task with id ${params.id} not found`), { status: 404 })
  }),

  http.post(`${API}/tasks`, async ({ request }) => {
    log(request)
    const body = (await request.json()) as TaskCreateRequest
    bodyLog.push(body)
    const invalid = validate(body, '/api/tasks')
    if (invalid) return invalid
    const [task] = seedTasks([{ ...body, title: body.title.trim(), status: body.status ?? 'TODO' }])
    return HttpResponse.json(task, { status: 201 })
  }),

  http.put(`${API}/tasks/:id`, async ({ request, params }) => {
    log(request)
    const id = idOf(params)
    const existing = storedTask(id)
    if (!existing) return HttpResponse.json(errorBody(404, `Task with id ${id} not found`), { status: 404 })
    const body = (await request.json()) as TaskCreateRequest
    bodyLog.push(body)
    const invalid = validate(body, `/api/tasks/${id}`)
    if (invalid) return invalid
    Object.assign(existing, { ...body, title: body.title.trim() })
    return HttpResponse.json(existing)
  }),
]
