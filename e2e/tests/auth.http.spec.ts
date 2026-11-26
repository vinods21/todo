// SCRUM-13-AC-02, AC-03, AC-16, AC-18..AC-20, AC-26 (b, c), NFR-05 — project `http`: Keycloak, nginx and the backend
// at HTTP level (request API only, no browser).
import { expect, test, type APIResponse } from '@playwright/test'
import { clientCredentials, clientToken, decodeJwt, issuer, tokenEndpoint } from './support/auth'
import { credentials, env } from './support/env'
import { API_ERROR_KEYS } from './support/fixtures'

async function expectUnauthorized(response: APIResponse, path: string): Promise<string> {
  expect(response.status(), `${path}: ${await response.text()}`).toBe(401)
  expect(response.headers()['content-type']).toMatch(/^application\/json/)
  const body = (await response.json()) as Record<string, unknown>
  expect(Object.keys(body).sort()).toEqual(API_ERROR_KEYS)
  expect(body).toMatchObject({ status: 401, error: 'Unauthorized', path })
  const challenge = response.headers()['www-authenticate'] ?? ''
  expect(challenge, `${path}: WWW-Authenticate`).toMatch(/^Bearer/)
  return challenge
}

test('SCRUM-13-AC-19, SCRUM-13-AC-20, SCRUM-13-AC-26: anonymous API requests get 401 + ApiError + WWW-Authenticate (proxy and backend port)', { tag: '@critical' }, async ({
  playwright,
}) => {
  const anonymous = await playwright.request.newContext()
  for (const base of [env.baseURL, env.backendURL]) {
    await expectUnauthorized(await anonymous.get(`${base}/api/tasks`), '/api/tasks')
    await expectUnauthorized(await anonymous.post(`${base}/api/tasks`, { data: { title: 'anonymous' } }), '/api/tasks')
    await expectUnauthorized(await anonymous.get(`${base}/api/me`), '/api/me')
    // AC-20: no endpoint enumeration for anonymous callers.
    await expectUnauthorized(await anonymous.get(`${base}/api/nope`), '/api/nope')
  }
  // Public: health through the proxy, info on the backend port.
  expect((await anonymous.get(`${env.baseURL}/actuator/health`)).status()).toBe(200)
  expect((await anonymous.get(`${env.backendURL}/actuator/info`)).status()).toBe(200)
  await anonymous.dispose()
})

test('SCRUM-13-AC-18, SCRUM-13-AC-26: a Keycloak token past its lifetime (+ clock skew) is rejected with 401 invalid_token', async ({
  playwright,
}) => {
  const token = (await clientCredentials('short')).access_token
  const claims = decodeJwt(token)
  expect(Number(claims.exp) - Number(claims.iat)).toBe(5)
  const context = await playwright.request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } })
  expect((await context.get(`${env.apiURL}/api/tasks?size=1`)).status(), 'fresh short token accepted').toBe(200)

  const deadline = Date.now() + (5 + env.clockSkewSeconds + 5) * 1000
  let response = await context.get(`${env.apiURL}/api/tasks?size=1`)
  while (response.status() === 200 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    response = await context.get(`${env.apiURL}/api/tasks?size=1`)
  }
  const challenge = await expectUnauthorized(response, '/api/tasks')
  expect(challenge).toContain('error="invalid_token"')
  expect(((await response.json()) as { message: string }).message).toBe('Invalid or expired access token')
  await context.dispose()
})

test('SCRUM-13-AC-18: one issuer for every client — Keycloak discovery (runner) equals the issuer the backend accepts', async ({
  playwright,
}) => {
  const anonymous = await playwright.request.newContext()
  const discovery = (await (await anonymous.get(`${issuer}/.well-known/openid-configuration`)).json()) as {
    issuer: string
    code_challenge_methods_supported: string[]
  }
  expect(discovery.issuer).toBe(`${env.authURL}/realms/todo`)
  expect(discovery.code_challenge_methods_supported).toContain('S256')

  const token = await clientToken()
  expect(decodeJwt(token).iss).toBe(discovery.issuer)
  const me = await anonymous.get(`${env.backendURL}/api/me`, { headers: { Authorization: `Bearer ${token}` } })
  expect(me.status()).toBe(200)
  expect(await me.json()).toEqual({
    subject: decodeJwt(token).sub,
    username: 'service-account-todo-e2e',
    email: null,
    name: null,
    roles: ['todo-user'],
  })
  await anonymous.dispose()
})

test('SCRUM-13-AC-03: access tokens of realm todo live 300 s (explicit lifetime ≤ 5 min)', async () => {
  const response = await clientCredentials('e2e')
  const claims = decodeJwt(response.access_token)
  expect(response.expires_in).toBe(300)
  expect(Number(claims.exp) - Number(claims.iat)).toBe(300)
  expect([claims.aud].flat()).toEqual(['todo-api'])
  expect((claims.realm_access as { roles: string[] }).roles).toEqual(['todo-user'])
})

test('SCRUM-13-AC-02: the SPA client accepts only Authorization Code + PKCE — no PKCE and the password grant are refused', async ({
  playwright,
}) => {
  const anonymous = await playwright.request.newContext()
  const withoutPkce = await anonymous.get(`${issuer}/protocol/openid-connect/auth`, {
    params: {
      client_id: 'todo-frontend',
      response_type: 'code',
      scope: 'openid',
      redirect_uri: `${env.baseURL}/oidc/callback`,
      state: 'e2e',
    },
    maxRedirects: 0,
  })
  expect(withoutPkce.status()).toBe(302)
  expect(withoutPkce.headers()['location']).toContain('error=invalid_request')

  const foreignRedirect = await anonymous.get(`${issuer}/protocol/openid-connect/auth`, {
    params: {
      client_id: 'todo-frontend',
      response_type: 'code',
      redirect_uri: 'http://evil.test/oidc/callback',
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'S256',
    },
    maxRedirects: 0,
  })
  expect(foreignRedirect.status(), 'foreign redirect_uri').toBe(400)

  const password = await anonymous.post(tokenEndpoint, {
    form: { grant_type: 'password', client_id: 'todo-frontend', username: 'alice', password: credentials.users.alice.password },
  })
  expect(password.status()).toBeGreaterThanOrEqual(400)
  expect(((await password.json()) as { error: string }).error).toBe('unauthorized_client')
  await anonymous.dispose()
})

test('SCRUM-13-AC-16, SCRUM-13-NFR-05: /auth-config.json comes from the container env; CSP adds only the Keycloak origin to connect-src', async ({
  playwright,
}) => {
  test.skip(env.mode !== 'compose', 'nginx (frontend image) only')
  const anonymous = await playwright.request.newContext()
  const config = await anonymous.get(`${env.baseURL}/auth-config.json`)
  expect(config.status()).toBe(200)
  expect(config.headers()['content-type']).toContain('application/json')
  expect(config.headers()['cache-control']).toBe('no-cache')
  expect(await config.json()).toEqual({ url: env.authURL, realm: 'todo', clientId: 'todo-frontend' })

  for (const path of ['/', '/auth-config.json', '/tasks/new']) {
    const csp = (await anonymous.get(`${env.baseURL}${path}`)).headers()['content-security-policy']
    expect(csp, path).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
        `connect-src 'self' ${env.authURL}/; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
    )
  }
  await anonymous.dispose()
})
