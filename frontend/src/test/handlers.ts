import { http, HttpResponse, type HttpResponseResolver } from 'msw'
import { isTaskStatus, type Page, type Task, type TaskCreateRequest, type TaskStatusUpdateRequest } from '../api/types'
import { API, errorBody, makeCurrentUser, TEST_ACCESS_TOKEN } from './fixtures'

// Default MSW handlers: an in-memory task store with SCRUM-2 semantics (newest first, page/size, 404 and 400 bodies).
// SCRUM-13 (ADR 0007 amended): like the backend, every handler requires `Authorization: Bearer test-access-token`
// (the fake token source's token) and otherwise answers 401 with the ApiError body and a WWW-Authenticate header.

interface Store {
  tasks: Task[]
  nextId: number
  clock: number
}

const store: Store = { tasks: [], nextId: 1, clock: Date.parse('2026-11-01T00:00:00Z') }

/** Every request the default handlers served, e.g. `GET /api/tasks?page=0&size=20`. */
export const requestLog: string[] = []
/** JSON bodies of POST/PUT/PATCH requests the default handlers served, in order. */
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
  authorizationLog.length = 0
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

/** Every Authorization header the default handlers saw, in order (null = none). */
export const authorizationLog: (string | null)[] = []

function unauthorized(request: Request): Response {
  const path = new URL(request.url).pathname
  return HttpResponse.json(errorBody(401, 'Authentication required', [], path), {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer' },
  })
}

/** Wraps a resolver: 401 unless the request carries the test access token (backend fidelity). */
function authenticated(resolver: HttpResponseResolver): HttpResponseResolver {
  return (info) => {
    const authorization = info.request.headers.get('authorization')
    authorizationLog.push(authorization)
    if (authorization !== `Bearer ${TEST_ACCESS_TOKEN}`) {
      log(info.request)
      return unauthorized(info.request)
    }
    return resolver(info)
  }
}

export const handlers = [
  // SCRUM-13-AC-21: the signed-in user (alice with the application role).
  http.get(
    `${API}/me`,
    authenticated(({ request }) => {
      log(request)
      return HttpResponse.json(makeCurrentUser())
    }),
  ),

  http.get(`${API}/tasks`, authenticated(({ request }) => {
    log(request)
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Math.min(Number(url.searchParams.get('size') ?? '20'), 100)
    // SCRUM-6-AC-05..AC-07 semantics: exact enum name filters; anything else is a 400 (the app never sends it).
    const status = url.searchParams.get('status')
    if (status !== null && !isTaskStatus(status)) {
      return HttpResponse.json(errorBody(400, "Invalid value for parameter 'status'"), { status: 400 })
    }
    const sorted = store.tasks.filter((t) => status === null || t.status === status).sort(newestFirst)
    const body: Page<Task> = {
      items: sorted.slice(page * size, page * size + size),
      page,
      size,
      totalElements: sorted.length,
      totalPages: Math.ceil(sorted.length / size),
    }
    return HttpResponse.json(body)
  })),

  http.get(`${API}/tasks/:id`, authenticated(({ request, params }) => {
    log(request)
    const task = storedTask(idOf(params))
    return task
      ? HttpResponse.json(task)
      : HttpResponse.json(errorBody(404, `Task with id ${params.id} not found`), { status: 404 })
  })),

  http.post(`${API}/tasks`, authenticated(async ({ request }) => {
    log(request)
    const body = (await request.json()) as TaskCreateRequest
    bodyLog.push(body)
    const invalid = validate(body, '/api/tasks')
    if (invalid) return invalid
    const [task] = seedTasks([{ ...body, title: body.title.trim(), status: body.status ?? 'TODO' }])
    // SCRUM-12-AC-07: Location is a required header of 201 in api/openapi.yaml (the backend always sends it)
    return HttpResponse.json(task, { status: 201, headers: { Location: `${API}/tasks/${task?.id}` } })
  })),

  http.put(`${API}/tasks/:id`, authenticated(async ({ request, params }) => {
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
  })),

  // SCRUM-6-AC-01..AC-03 semantics: only status changes; 404 unknown id; 400 with a status field error.
  http.patch(`${API}/tasks/:id/status`, authenticated(async ({ request, params }) => {
    log(request)
    const id = idOf(params)
    const path = `/api/tasks/${id}/status`
    const body = (await request.json()) as TaskStatusUpdateRequest
    bodyLog.push(body)
    const existing = storedTask(id)
    if (!existing) return HttpResponse.json(errorBody(404, `Task with id ${id} not found`, [], path), { status: 404 })
    if (typeof body.status !== 'string' || !isTaskStatus(body.status)) {
      return HttpResponse.json(
        errorBody(400, "Invalid value for field 'status'", [{ field: 'status', message: 'invalid value' }], path),
        { status: 400 },
      )
    }
    existing.status = body.status
    return HttpResponse.json(existing)
  })),
]
