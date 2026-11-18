// SCRUM-7-AC-19 (+ AC-02, AC-04..AC-06, NFR-12): HTTP-level smoke of the composed stack — request API only, no
// browser. Project `http` (compose mode).
import { expect, test, type APIResponse } from '@playwright/test'
import { env } from './support/env'
import { API_ERROR_KEYS, expectedIdentity, TasksApi, uniqueTitle, type Task } from './support/fixtures'

const origin = new URL(env.baseURL).origin

function expectHtmlIndex(response: APIResponse, body: string) {
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/html')
  expect(response.headers()['cache-control']).toBe('no-cache')
  expect(body).toContain('<div id="root">')
}

async function expectApiError(response: APIResponse, status: number, path: string) {
  expect(response.status(), `${path}: ${await response.text()}`).toBe(status)
  expect(response.headers()['content-type']).toMatch(/^application\/json/)
  const body = (await response.json()) as Record<string, unknown>
  expect(Object.keys(body).sort()).toEqual(API_ERROR_KEYS)
  expect(body).toMatchObject({ status, path })
  return body
}

async function assetPaths(request: import('@playwright/test').APIRequestContext): Promise<string[]> {
  const html = await (await request.get('/')).text()
  const paths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1] as string)
  expect(paths.length).toBeGreaterThanOrEqual(2)
  return paths
}

test('SCRUM-7-AC-19, SCRUM-7-AC-04, SCRUM-7-AC-05: / serves index.html with the build identity and no-cache', async ({
  request,
}) => {
  const identity = await expectedIdentity(request)
  const response = await request.get('/')
  const body = await response.text()
  expectHtmlIndex(response, body)
  expect(body).toContain(`<meta name="build-info" content="${identity.jira} ${identity.commit}">`)
})

test('SCRUM-7-AC-05, SCRUM-7-AC-19: client-side routes loaded directly return index.html', async ({ request }) => {
  for (const path of ['/tasks/new', '/tasks/42/edit', '/?status=DONE&page=2']) {
    const response = await request.get(path)
    expectHtmlIndex(response, await response.text())
  }
})

test('SCRUM-7-AC-05: fingerprinted assets have correct types and a long-lived immutable cache policy', async ({
  request,
}) => {
  const paths = await assetPaths(request)
  expect(paths.some((p) => p.endsWith('.js'))).toBe(true)
  expect(paths.some((p) => p.endsWith('.css'))).toBe(true)
  for (const path of paths) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    const type = response.headers()['content-type'] ?? ''
    expect(type, path).toContain(path.endsWith('.js') ? 'javascript' : 'text/css')
    const cache = response.headers()['cache-control'] ?? ''
    expect(cache, path).toContain('max-age=31536000')
    expect(cache, path).toContain('immutable')
  }
})

test('SCRUM-7-AC-05, SCRUM-7-AC-19: a missing asset returns 404, not index.html', async ({ request }) => {
  for (const path of ['/assets/nope.js', '/nope.png']) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    expect(await response.text(), path).not.toContain('id="root"')
  }
})

test('SCRUM-7-AC-04: /build-info.json carries the identity of the build', async ({ request }) => {
  const response = await request.get('/build-info.json')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/json')
  const info = (await response.json()) as Record<string, string>
  expect(Object.keys(info).sort()).toEqual(['branch', 'builtAt', 'commit', 'jira'])
  if (env.expectedJiraKey) expect(info.jira).toBe(env.expectedJiraKey)
  if (env.expectedSha) expect(info.commit).toBe(env.expectedSha)
})

test('SCRUM-7-AC-06, SCRUM-7-AC-19: /actuator/health is proxied and UP; other actuator paths are not exposed via the frontend', async ({
  request,
}) => {
  const health = await request.get('/actuator/health')
  expect(health.status()).toBe(200)
  // In a container Spring Boot also lists its probe groups (liveness/readiness); no components or details.
  const body = (await health.json()) as Record<string, unknown>
  expect(body.status).toBe('UP')
  expect(body).not.toHaveProperty('components')
  expect(body).not.toHaveProperty('details')
  for (const path of ['/actuator/info', '/actuator/env', '/actuator']) {
    expect((await request.get(path)).status(), path).toBe(404)
  }
})

test('SCRUM-7-AC-02, SCRUM-7-AC-19: backend /actuator/info reports the build identity', async ({ request }) => {
  const identity = await expectedIdentity(request)
  const response = await request.get(`${env.backendURL}/actuator/info`)
  expect(response.status()).toBe(200)
  const info = (await response.json()) as { build?: Record<string, string> }
  expect(info.build?.jira).toBe(identity.jira)
  expect(info.build?.['git-commit']).toBe(identity.commit)
})

test('SCRUM-7-AC-06, SCRUM-7-AC-19: API round-trip through the proxy', async ({ request }) => {
  const created = await request.post('/api/tasks', { data: { title: uniqueTitle('http round-trip') } })
  expect(created.status()).toBe(201)
  const task = (await created.json()) as Task
  // A-09: Host $http_host → the backend builds Location for the frontend origin.
  expect(created.headers()['location']).toBe(`${origin}/api/tasks/${task.id}`)

  const patched = await request.patch(`/api/tasks/${task.id}/status`, { data: { status: 'DONE' } })
  expect(patched.status()).toBe(200)
  expect(((await patched.json()) as Task).status).toBe('DONE')

  const filtered = await request.get('/api/tasks?status=DONE&size=100')
  expect(filtered.status()).toBe(200)
  const page = (await filtered.json()) as { items: Task[] }
  expect(page.items.map((t) => t.id)).toContain(task.id)
  expect(page.items.every((t) => t.status === 'DONE')).toBe(true)

  expect((await request.delete(`/api/tasks/${task.id}`)).status()).toBe(204)
  const gone = await expectApiError(await request.get(`/api/tasks/${task.id}`), 404, `/api/tasks/${task.id}`)
  expect(gone.message).toBe(`Task with id ${task.id} not found`)
})

test('SCRUM-7-AC-06: backend error bodies pass through the proxy unchanged', async ({ request }) => {
  const api = new TasksApi(request)
  const target = await api.create({ title: uniqueTitle('error pass-through') })

  const invalid = await expectApiError(await request.post('/api/tasks', { data: { title: ' ' } }), 400, '/api/tasks')
  expect(invalid.message).toBe('Validation failed')
  expect((invalid.fieldErrors as { field: string }[])[0]?.field).toBe('title')

  const unknown = await expectApiError(await request.get('/api/nope'), 404, '/api/nope')
  expect(unknown.message).toBe('No endpoint GET /api/nope')

  const method = await expectApiError(
    await request.patch(`/api/tasks/${target.id}`, { data: { title: 'x' } }),
    405,
    `/api/tasks/${target.id}`,
  )
  expect(method.message).toBe("Request method 'PATCH' is not supported")

  const media = await expectApiError(
    await request.post('/api/tasks', { data: 'title=x', headers: { 'content-type': 'text/plain' } }),
    415,
    '/api/tasks',
  )
  expect(media.message).toMatch(/^Content type 'text\/plain.*' is not supported$/)

  await api.remove(target.id)
})

test('SCRUM-7-NFR-12: responses carry security headers and hide the nginx version', async ({ request }) => {
  const [asset] = await assetPaths(request)
  for (const path of ['/', asset as string, '/api/tasks', '/tasks/new']) {
    const response = await request.get(path)
    const headers = response.headers()
    expect(headers['x-content-type-options'], path).toBe('nosniff')
    expect(headers['x-frame-options'], path).toBe('DENY')
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
    expect(headers['content-security-policy'], path).toContain("default-src 'self'")
    expect(headers['server'], path).toBe('nginx')
  }
})
