// SCRUM-13-AC-08..AC-14, AC-26 (a, c, d, e, f) — project `auth`, fresh browser contexts (no alice session), real
// Keycloak (realm todo brokering to realm mock-idp) and the real backend. Serial: bob's login is reused by the later
// tests; logout and the no-access user come last.
import type { Page, Request } from '@playwright/test'
import { clientCredentials, decodeJwt, expectAppRealmLogin, expectMockIdpForm, issuer, loginViaCorpSso, webStorageTokens } from '../support/auth'
import { credentials, env } from '../support/env'
import { expect, test, uniqueTitle } from '../support/fixtures'

const BOB_STATE = '.auth/bob.json'
const appOrigin = new URL(env.baseURL).origin
const apiOrigin = new URL(env.apiURL).origin

test.describe.configure({ mode: 'serial' })

function isApi(request: Request): boolean {
  const url = new URL(request.url())
  return url.origin === apiOrigin && url.pathname.startsWith('/api/')
}

function bearerOf(request: Request): string | undefined {
  return request.headers()['authorization']?.replace(/^Bearer /, '')
}

/** Every request of the page: method, URL, Authorization header. */
function recordRequests(page: Page): Request[] {
  const requests: Request[] = []
  page.on('request', (request) => requests.push(request))
  return requests
}

test('SCRUM-13-AC-09, SCRUM-13-AC-10, SCRUM-13-AC-26: a deep link without a session goes to Keycloak and back to the deep link; reload keeps the session', { tag: '@critical' }, async ({
  page,
  api,
}) => {
  const task = await api.create({ title: uniqueTitle('deep link'), description: 'kept' })
  const requests = recordRequests(page)

  await page.goto(`/tasks/${task.id}/edit?from=deep-link`)
  // AC-26a: redirected to the application realm (Authorization Code + PKCE), no app data requested before.
  await expectAppRealmLogin(page)
  const authorize = requests.find((r) => r.url().startsWith(`${issuer}/protocol/openid-connect/auth`))
  expect(authorize, 'authorization request').toBeDefined()
  const params = new URL(authorize?.url() ?? 'http://x').searchParams
  expect(params.get('response_type')).toBe('code')
  expect(params.get('code_challenge_method')).toBe('S256')
  expect(params.get('client_id')).toBe('todo-frontend')
  expect(requests.filter(isApi), 'no API call before the login').toEqual([])

  await loginViaCorpSso(page, credentials.users.bob)

  await expect(page).toHaveURL(`${env.baseURL}/tasks/${task.id}/edit?from=deep-link`)
  await expect(page.getByRole('heading', { level: 1, name: 'Edit task' })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue(task.title)
  // AC-10: tokens in memory only.
  expect(await webStorageTokens(page)).toEqual([])
  expect((await page.context().cookies(appOrigin)).map((c) => c.name)).toEqual([])

  // AC-10: a reload re-establishes the session via Keycloak's SSO cookie — no login page, same route.
  const shown: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) shown.push(frame.url())
  })
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Edit task' })).toBeVisible()
  await expect(page).toHaveURL(`${env.baseURL}/tasks/${task.id}/edit?from=deep-link`)
  expect(shown.filter((url) => url.startsWith(env.authURL)), 'Keycloak pages shown on reload').toEqual([])
  expect(await webStorageTokens(page)).toEqual([])

  await page.context().storageState({ path: BOB_STATE })
})

test('SCRUM-13-AC-02, SCRUM-13-AC-05, SCRUM-13-AC-08, SCRUM-13-AC-11, SCRUM-13-AC-21: bob\'s session — /api/me claims, bearer only to the API, token audience', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: BOB_STATE })
  const page = await context.newPage()
  const requests = recordRequests(page)
  const me = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/me' && r.status() === 200)

  await page.goto('/')
  const body = (await (await me).json()) as { username: string; email: string; roles: string[]; name: string }
  await expect(page.getByRole('banner').getByText('bob', { exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Tasks' })).toBeVisible()

  // AC-05, AC-08, AC-21: claims from the mock IdP (groups → roles) as the backend sees them.
  expect(body).toMatchObject({ username: 'bob', email: credentials.users.bob.email, name: 'Bob Admin' })
  expect(body.roles).toEqual(['todo-admin', 'todo-user'])

  // AC-11: every API request carried a bearer token; nothing else (Keycloak, assets) got one; no token in a URL.
  const api = requests.filter(isApi)
  expect(api.length).toBeGreaterThanOrEqual(2)
  for (const request of api) expect(bearerOf(request), request.url()).toMatch(/^eyJ/)
  for (const request of requests.filter((r) => !isApi(r))) {
    expect(request.headers()['authorization'], request.url()).toBeUndefined()
  }
  for (const request of requests) expect(request.url(), 'token in a URL').not.toMatch(/eyJ[A-Za-z0-9_-]+\.eyJ/)

  // AC-02: the access token is issued for the backend (aud todo-api) to the SPA client (azp todo-frontend).
  const claims = decodeJwt(bearerOf(api[0] as Request) ?? '')
  expect(claims.iss).toBe(issuer)
  expect([claims.aud].flat()).toContain('todo-api')
  expect(claims.azp).toBe('todo-frontend')
  expect(claims.preferred_username).toBe('bob')
  await context.close()
})

test('SCRUM-13-AC-13, SCRUM-13-AC-26: the access token is renewed silently before it expires — no reload, form input kept', { tag: '@critical' }, async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: BOB_STATE })
  const page = await context.newPage()
  await page.clock.install()
  const requests = recordRequests(page)

  await page.goto('/tasks/new')
  await expect(page.getByRole('heading', { level: 1, name: 'New task' })).toBeVisible()
  const firstToken = bearerOf(requests.filter(isApi)[0] as Request)
  expect(firstToken).toBeDefined()
  const title = uniqueTitle('typed before renewal')
  await page.getByLabel('Title').fill(title)
  await page.evaluate(() => {
    ;(window as unknown as { __noReload: boolean }).__noReload = true
  })

  // 4 min 10 s later the token (300 s) is within the 60 s renewal window: refresh-token grant, no user interaction.
  const refreshed = page.waitForResponse(
    (r) => r.url() === `${issuer}/protocol/openid-connect/token` && /grant_type=refresh_token/.test(r.request().postData() ?? ''),
  )
  await page.clock.fastForward('04:10')
  expect((await refreshed).status()).toBe(200)

  await expect(page.getByLabel('Title')).toHaveValue(title)
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/tasks')
  await page.getByRole('button', { name: 'Create task' }).click()
  const response = await created
  expect(response.status()).toBe(201)
  expect(bearerOf(response.request())).toBeDefined()
  expect(bearerOf(response.request()), 'the API call after the renewal uses the new token').not.toBe(firstToken)
  await expect(page.getByRole('table', { name: 'Tasks' })).toContainText(title)
  await context.close()
})

test('SCRUM-13-AC-14, SCRUM-13-AC-26: a token past its lifetime is rejected (401) and the SPA recovers by renewal without an error', { tag: '@critical' }, async ({
  browser,
  request,
}) => {
  // A real Keycloak token (client todo-e2e-short, 5 s lifetime), waited out until the backend rejects it.
  const short = (await clientCredentials('short')).access_token
  const deadline = Date.now() + (5 + env.clockSkewSeconds + 15) * 1000
  for (;;) {
    const probe = await request.get(`${env.apiURL}/api/tasks?size=1`, { headers: { Authorization: `Bearer ${short}` } })
    if (probe.status() === 401) break
    expect(Date.now(), 'short token still accepted').toBeLessThan(deadline)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  const context = await browser.newContext({ storageState: BOB_STATE })
  const page = await context.newPage()
  let replaced = false
  // The first list request goes out with the expired token (as if the app's token had expired unnoticed).
  await page.route(/\/api\/tasks\?/, async (route) => {
    if (replaced) return route.continue()
    replaced = true
    await route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${short}` } })
  })
  const statuses: number[] = []
  page.on('response', (r) => {
    if (new URL(r.url()).pathname === '/api/tasks' && r.request().method() === 'GET') statuses.push(r.status())
  })
  const renewal = page.waitForResponse(
    (r) => r.url() === `${issuer}/protocol/openid-connect/token` && /grant_type=refresh_token/.test(r.request().postData() ?? ''),
  )

  await page.goto('/')

  expect((await renewal).status()).toBe(200)
  await expect(page.getByRole('table', { name: 'Tasks' })).toBeVisible()
  expect(statuses.slice(0, 2)).toEqual([401, 200])
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page).toHaveURL(`${env.baseURL}/`)
  await context.close()
})

test('SCRUM-13-AC-12, SCRUM-13-AC-26: Log out ends the session (propagated to the mock IdP); back and reload require a new login', { tag: '@critical' }, async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: BOB_STATE })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('table', { name: 'Tasks' })).toBeVisible()

  await page.getByRole('banner').getByRole('button', { name: 'Log out' }).click()

  await expect(page).toHaveURL(`${env.baseURL}/signed-out`)
  await expect(page.getByRole('heading', { level: 1, name: 'You are signed out' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Tasks' })).toHaveCount(0)

  // AC-26e: back button → the app needs a login again (no task data shown).
  await page.goBack()
  await expectAppRealmLogin(page)
  await expect(page.getByRole('table', { name: 'Tasks' })).toHaveCount(0)
  // … and so does a reload of the app.
  await page.goto('/')
  await expectAppRealmLogin(page)
  // ADR 0019 §2: the logout was propagated — Corp SSO asks for credentials again (no silent IdP session).
  await page.getByRole('link', { name: 'Corp SSO' }).click()
  await expectMockIdpForm(page)
  await context.close()
})

test('SCRUM-13-AC-08, SCRUM-13-AC-14, SCRUM-13-AC-26: carol (no entitlement) signs in and sees the "no access" page, not the tasks', { tag: '@critical' }, async ({
  page,
}) => {
  const requests = recordRequests(page)
  await page.goto('/')
  await loginViaCorpSso(page, credentials.users.carol)

  await expect(page.getByRole('heading', { level: 1, name: 'You do not have access to this application' })).toBeVisible()
  await expect(page.getByText('carol', { exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Tasks' })).toHaveCount(0)
  expect([...new Set(requests.filter(isApi).map((r) => new URL(r.url()).pathname))]).toEqual(['/api/me'])

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(`${env.baseURL}/signed-out`)
})
