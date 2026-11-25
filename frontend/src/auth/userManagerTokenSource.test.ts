import type { User, UserManager } from 'oidc-client-ts'
import { isForbidden } from './session'
import { userManagerTokenSource } from './userManagerTokenSource'

function fakeManager(overrides: Partial<Record<'getUser' | 'signinSilent' | 'signinRedirect', ReturnType<typeof vi.fn>>> = {}) {
  const manager = {
    getUser: vi.fn(() => Promise.resolve({ access_token: 'at-1' } as User)),
    signinSilent: vi.fn(() => Promise.resolve({ access_token: 'at-2' } as User)),
    signinRedirect: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
  return { manager, source: userManagerTokenSource(manager as unknown as UserManager) }
}

describe('SCRUM-13 UserManager token source', () => {
  it('SCRUM-13-AC-11: the access token comes from the in-memory user; none when signed out', async () => {
    const { source } = fakeManager()
    expect(await source.getAccessToken()).toBe('at-1')
    const signedOut = fakeManager({ getUser: vi.fn(() => Promise.resolve(null)) })
    expect(await signedOut.source.getAccessToken()).toBeUndefined()
  })

  it('SCRUM-13-AC-14: parallel renewals share one refresh (refresh tokens rotate); a failure yields undefined', async () => {
    const { manager, source } = fakeManager()
    const [a, b] = await Promise.all([source.renew(), source.renew()])
    expect([a, b]).toEqual(['at-2', 'at-2'])
    expect(manager.signinSilent).toHaveBeenCalledTimes(1)

    await source.renew()
    expect(manager.signinSilent).toHaveBeenCalledTimes(2) // a new renewal once the previous one settled

    const failing = fakeManager({ signinSilent: vi.fn(() => Promise.reject(new Error('invalid_grant'))) })
    expect(await failing.source.renew()).toBeUndefined()
  })

  it('SCRUM-13-AC-14: signIn redirects once with a safe return route', async () => {
    const { manager, source } = fakeManager()
    source.signIn('/tasks/1/edit')
    source.signIn('/other')
    expect(manager.signinRedirect).toHaveBeenCalledTimes(1)
    expect(manager.signinRedirect).toHaveBeenCalledWith({ state: '/tasks/1/edit' })

    const external = fakeManager()
    external.source.signIn('//evil.test')
    expect(external.manager.signinRedirect).toHaveBeenCalledWith({ state: '/' })

    const failing = fakeManager({ signinRedirect: vi.fn(() => Promise.reject(new Error('blocked'))) })
    failing.source.signIn('/a')
    await Promise.resolve()
    await Promise.resolve()
    failing.source.signIn('/b')
    expect(failing.manager.signinRedirect).toHaveBeenCalledTimes(2) // retried after a failed start
  })

  it('SCRUM-13-AC-14: forbidden() marks the session as forbidden', () => {
    const { source } = fakeManager()
    expect(isForbidden()).toBe(false)
    source.forbidden()
    expect(isForbidden()).toBe(true)
  })
})
