import { http, HttpResponse } from 'msw'
import { API, errorBody, makeTask } from '../test/fixtures'
import { server } from '../test/server'
import { buildUrl, isAbortError, request } from './client'
import { ApiError, GENERIC_ERROR_MESSAGE, isApiError, isApiErrorBody, NETWORK_ERROR_MESSAGE } from './errors'
import type { Task } from './types'

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (isApiError(error)) return error
    throw error
  }
  throw new Error('expected the request to fail')
}

describe('SCRUM-1 API client', () => {
  it('SCRUM-1-AC-13: sends requests to API_BASE_URL with JSON headers and typed results', async () => {
    let seen: { url: string; accept: string | null; contentType: string | null; body: unknown } | undefined
    server.use(
      http.post(`${API}/things`, async ({ request: req }) => {
        seen = {
          url: req.url,
          accept: req.headers.get('accept'),
          contentType: req.headers.get('content-type'),
          body: await req.json(),
        }
        return HttpResponse.json(makeTask({ id: 9 }), { status: 201 })
      }),
    )
    const task = await request<Task>('POST', '/api/things', { body: { a: 1 }, query: { x: 'y', skip: undefined } })
    expect(task.id).toBe(9)
    expect(seen).toEqual({
      url: 'http://localhost:8080/api/things?x=y',
      accept: 'application/json',
      contentType: 'application/json',
      body: { a: 1 },
    })
  })

  it('SCRUM-1-AC-13: GET requests carry no Content-Type and build query strings', async () => {
    let contentType: string | null = 'unset'
    server.use(
      http.get(`${API}/things`, ({ request: req }) => {
        contentType = req.headers.get('content-type')
        return HttpResponse.json({ ok: true })
      }),
    )
    await request('GET', '/api/things')
    expect(contentType).toBeNull()
    expect(buildUrl('/api/tasks', { page: 2, size: 20 }).toString()).toBe(
      'http://localhost:8080/api/tasks?page=2&size=20',
    )
  })

  it('SCRUM-1-AC-10: network failure (backend down / CORS) becomes a network ApiError', async () => {
    server.use(http.get(`${API}/things`, () => HttpResponse.error()))
    const error = await failure(request('GET', '/api/things'))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.kind).toBe('network')
    expect(error.status).toBe(0)
    expect(error.message).toBe(NETWORK_ERROR_MESSAGE)
  })

  it('SCRUM-1-AC-10: 5xx becomes a server ApiError with a generic message; the body is never leaked', async () => {
    server.use(
      http.get(`${API}/things`, () =>
        HttpResponse.json(errorBody(500, 'java.lang.NullPointerException at Foo.bar'), { status: 500 }),
      ),
    )
    const error = await failure(request('GET', '/api/things'))
    expect(error.kind).toBe('server')
    expect(error.status).toBe(500)
    expect(error.message).toBe(GENERIC_ERROR_MESSAGE)
    expect(error.message).not.toContain('NullPointer')
  })

  it('SCRUM-1-AC-10: HTML 502 from a gateway is a server error with a generic message', async () => {
    server.use(
      http.get(`${API}/things`, () => new HttpResponse('<html>Bad gateway</html>', { status: 502 })),
    )
    const error = await failure(request('GET', '/api/things'))
    expect(error.kind).toBe('server')
    expect(error.message).toBe(GENERIC_ERROR_MESSAGE)
  })

  it('SCRUM-1-AC-08: 400 with an error body exposes message and fieldErrors', async () => {
    const fieldErrors = [{ field: 'title', message: 'must not be blank' }]
    server.use(
      http.post(`${API}/tasks`, () =>
        HttpResponse.json(errorBody(400, 'Validation failed', fieldErrors), { status: 400 }),
      ),
    )
    const error = await failure(request('POST', '/api/tasks', { body: {} }))
    expect(error.kind).toBe('validation')
    expect(error.status).toBe(400)
    expect(error.message).toBe('Validation failed')
    expect(error.fieldErrors).toEqual(fieldErrors)
  })

  it('SCRUM-1-AC-08: 400 with a non-JSON or foreign body falls back to the generic message', async () => {
    server.use(http.post(`${API}/tasks`, () => new HttpResponse('nope', { status: 400 })))
    const error = await failure(request('POST', '/api/tasks', { body: {} }))
    expect(error.kind).toBe('validation')
    expect(error.message).toBe(GENERIC_ERROR_MESSAGE)
    expect(error.fieldErrors).toEqual([])

    server.use(http.post(`${API}/tasks`, () => HttpResponse.json({ detail: 'x' }, { status: 400 })))
    const foreign = await failure(request('POST', '/api/tasks', { body: {} }))
    expect(foreign.message).toBe(GENERIC_ERROR_MESSAGE)
  })

  it('SCRUM-1-AC-11: 404 becomes a not-found ApiError', async () => {
    server.use(
      http.get(`${API}/tasks/5`, () => HttpResponse.json(errorBody(404, 'Task with id 5 not found'), { status: 404 })),
    )
    const error = await failure(request('GET', '/api/tasks/5'))
    expect(error.kind).toBe('not-found')
    expect(error.status).toBe(404)
    expect(error.message).toBe('Task not found')
  })

  it('SCRUM-1-AC-10: other 4xx use the body message when valid, else the generic message', async () => {
    server.use(
      http.get(`${API}/things`, () =>
        HttpResponse.json(errorBody(405, "Request method 'GET' is not supported"), { status: 405 }),
      ),
    )
    const error = await failure(request('GET', '/api/things'))
    expect(error.kind).toBe('http')
    expect(error.message).toBe("Request method 'GET' is not supported")

    server.use(http.get(`${API}/things`, () => new HttpResponse(null, { status: 415 })))
    expect((await failure(request('GET', '/api/things'))).message).toBe(GENERIC_ERROR_MESSAGE)
  })

  it('SCRUM-1-AC-10: a 2xx response that is not JSON becomes a server error', async () => {
    server.use(http.get(`${API}/things`, () => new HttpResponse('not json', { status: 200 })))
    const error = await failure(request('GET', '/api/things'))
    expect(error.kind).toBe('server')
    expect(error.message).toBe(GENERIC_ERROR_MESSAGE)
  })

  it('SCRUM-1-AC-10: aborted requests are rethrown as AbortError, not converted', async () => {
    const controller = new AbortController()
    controller.abort()
    const outcome = await request('GET', '/api/tasks', { signal: controller.signal }).catch((e: unknown) => e)
    expect(isAbortError(outcome)).toBe(true)
    expect(isApiError(outcome)).toBe(false)
  })

  it('SCRUM-1-NFR-05: error bodies are validated by a type guard', () => {
    expect(isApiErrorBody(errorBody(400, 'Validation failed', [{ field: 'title', message: 'x' }]))).toBe(true)
    expect(isApiErrorBody({ status: 400, message: 'x', fieldErrors: [{ field: 1 }] })).toBe(false)
    expect(isApiErrorBody({ status: 400, message: 'x' })).toBe(false)
    expect(isApiErrorBody(null)).toBe(false)
    expect(isApiErrorBody([])).toBe(false)
  })
})

describe('SCRUM-7 same-origin API base', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('SCRUM-7-AC-17: an empty (same-origin) base resolves requests against the page origin', () => {
    expect(window.location.origin).toBe('http://localhost:3000')
    expect(buildUrl('/api/tasks', { page: 0, size: 20, status: 'DONE' }, '').toString()).toBe(
      `${window.location.origin}/api/tasks?page=0&size=20&status=DONE`,
    )
    expect(buildUrl('/api/tasks/7/status', undefined, '').toString()).toBe(`${window.location.origin}/api/tasks/7/status`)
  })

  it('SCRUM-7-AC-17: an absolute base ignores the page origin; the default call is unchanged', () => {
    expect(buildUrl('/api/tasks', undefined, 'https://api.example.test').toString()).toBe(
      'https://api.example.test/api/tasks',
    )
    expect(buildUrl('/api/tasks', { page: 1 }).toString()).toBe('http://localhost:8080/api/tasks?page=1')
  })

  it("SCRUM-7-AC-17: with VITE_API_BASE_URL='/' requests are sent to <page origin>/api/…", async () => {
    vi.stubEnv('VITE_API_BASE_URL', '/')
    vi.resetModules()
    const config = await import('./config')
    const client = await import('./client')
    expect(config.API_BASE_URL).toBe('')
    let seen: string | undefined
    server.use(
      http.get(`${window.location.origin}/api/tasks`, ({ request: req }) => {
        seen = req.url
        return HttpResponse.json({ ok: true })
      }),
    )
    await expect(client.request('GET', '/api/tasks', { query: { page: 0 } })).resolves.toEqual({ ok: true })
    expect(seen).toBe('http://localhost:3000/api/tasks?page=0')
  })
})
