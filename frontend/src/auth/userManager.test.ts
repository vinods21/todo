import { InMemoryWebStorage, User, UserManager } from 'oidc-client-ts'
import { createUserManager, userManagerSettings } from './userManager'

const config = { url: 'http://localhost:8180', realm: 'todo', clientId: 'todo-frontend' }

describe('SCRUM-13 UserManager settings', () => {
  it('SCRUM-13-AC-09, SCRUM-13-AC-12: Authorization Code against the realm; callback and logout on the app origin', () => {
    const settings = userManagerSettings(config, 'http://localhost:3000')

    expect(settings.authority).toBe('http://localhost:8180/realms/todo')
    expect(settings.client_id).toBe('todo-frontend')
    expect(settings.response_type).toBe('code')
    expect(settings.redirect_uri).toBe('http://localhost:3000/oidc/callback')
    expect(settings.post_logout_redirect_uri).toBe('http://localhost:3000/signed-out')
    expect(settings.scope).toBe('openid')
  })

  it('SCRUM-13-AC-13: silent renewal by refresh token, 60 s before expiry; no session iframe, no silent_redirect_uri', () => {
    const settings = userManagerSettings(config, 'http://localhost:3000')

    expect(settings.automaticSilentRenew).toBe(true)
    expect(settings.accessTokenExpiringNotificationTimeInSeconds).toBe(60)
    expect(settings.monitorSession).toBe(false)
    expect(settings.silent_redirect_uri).toBeUndefined() // no iframe fallback (CSP has no frame-src)
    expect(settings.loadUserInfo).toBe(false)
  })

  it('SCRUM-13-AC-10: the user store is in memory; PKCE uses S256 (library default)', async () => {
    const manager = createUserManager(config)
    expect(manager).toBeInstanceOf(UserManager)
    expect(manager.settings.userStore).toBeDefined()
    expect(manager.settings.disablePKCE).toBe(false)
    const settings = userManagerSettings(config)
    // InMemoryWebStorage behind the WebStorageStateStore
    expect((settings.userStore as unknown as { _store: unknown })._store).toBeInstanceOf(InMemoryWebStorage)
  })

  it('SCRUM-13-AC-10, SCRUM-13-NFR-02: after a login no token is in localStorage, sessionStorage or cookies', async () => {
    localStorage.clear()
    sessionStorage.clear()
    const manager = createUserManager(config)
    await manager.storeUser(
      new User({
        access_token: 'secret-access-token',
        refresh_token: 'secret-refresh-token',
        id_token: 'secret-id-token',
        token_type: 'Bearer',
        profile: { sub: 'alice', iss: 'http://localhost:8180/realms/todo', aud: 'todo-frontend', exp: 0, iat: 0 },
        expires_at: Math.floor(Date.now() / 1000) + 300,
      }),
    )

    expect((await manager.getUser())?.access_token).toBe('secret-access-token')
    const persisted = [
      ...Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`),
      ...Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`),
      document.cookie,
    ].join('\n')
    expect(persisted).not.toContain('secret-')
  })
})
