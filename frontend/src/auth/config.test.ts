import { AuthConfigError, authConfigFromEnv, DEFAULT_AUTH_CONFIG, loadAuthConfig, parseAuthConfig } from './config'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('SCRUM-13 auth configuration', () => {
  it('SCRUM-13-AC-16: Vite dev mode defaults to http://localhost:8180, realm todo, client todo-frontend', () => {
    expect(authConfigFromEnv({})).toEqual(DEFAULT_AUTH_CONFIG)
    expect(DEFAULT_AUTH_CONFIG).toEqual({ url: 'http://localhost:8180', realm: 'todo', clientId: 'todo-frontend' })
  })

  it('SCRUM-13-AC-16: VITE_AUTH_* override the defaults (trailing slash dropped, blanks ignored)', () => {
    expect(
      authConfigFromEnv({ VITE_AUTH_URL: 'https://sso.example.test/auth/', VITE_AUTH_REALM: 'r1', VITE_AUTH_CLIENT_ID: ' ' }),
    ).toEqual({ url: 'https://sso.example.test/auth', realm: 'r1', clientId: 'todo-frontend' })
  })

  it('SCRUM-13-AC-16: with VITE_AUTH_CONFIG_URL the runtime JSON is used (container image)', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(jsonResponse({ url: 'http://localhost:8280', realm: 'todo', clientId: 'spa' })))
    const config = await loadAuthConfig({ VITE_AUTH_CONFIG_URL: '/auth-config.json', VITE_AUTH_URL: 'http://ignored' }, fetchFn)

    expect(config).toEqual({ url: 'http://localhost:8280', realm: 'todo', clientId: 'spa' })
    expect(fetchFn).toHaveBeenCalledWith('/auth-config.json', expect.objectContaining({ cache: 'no-store' }))
  })

  it('SCRUM-13-AC-16: without VITE_AUTH_CONFIG_URL no request is made', async () => {
    const fetchFn = vi.fn()
    expect(await loadAuthConfig({ VITE_AUTH_REALM: 'other' }, fetchFn)).toEqual({ ...DEFAULT_AUTH_CONFIG, realm: 'other' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it.each([
    ['network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['HTTP 404', () => Promise.resolve(new Response('nope', { status: 404 }))],
    ['not JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ['invalid url', () => Promise.resolve(jsonResponse({ url: 'javascript:alert(1)', realm: 'todo', clientId: 'x' }))],
  ])('SCRUM-13-AC-16: a broken runtime config is rejected (%s)', async (_name, fetchImpl) => {
    await expect(loadAuthConfig({ VITE_AUTH_CONFIG_URL: '/auth-config.json' }, vi.fn(fetchImpl))).rejects.toBeInstanceOf(
      AuthConfigError,
    )
  })

  it.each([
    [null],
    [[]],
    [{ url: 'http://localhost:8180/', realm: 'todo', clientId: 'x' }],
    [{ url: "http://localhost:8180; script-src 'unsafe-inline'", realm: 'todo', clientId: 'x' }],
    [{ url: 'http://localhost:8180', realm: 'to do', clientId: 'x' }],
    [{ url: 'http://localhost:8180', realm: 'todo', clientId: '"x"' }],
    [{ url: 'http://localhost:8180', realm: 'todo' }],
  ])('SCRUM-13-AC-16, SCRUM-13-NFR-05: invalid config values are rejected — %j', (value) => {
    expect(() => parseAuthConfig(value)).toThrow(AuthConfigError)
  })
})
