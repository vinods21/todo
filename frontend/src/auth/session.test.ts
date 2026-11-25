import { makeCurrentUser } from '../test/fixtures'
import { APP_ROLE, isForbidden, makeSession, markForbidden, resetForbidden, subscribeForbidden } from './session'

describe('SCRUM-13 session', () => {
  it('SCRUM-13-AC-15: the roles from /api/me are available to UI code (hasRole)', () => {
    const signOut = vi.fn()
    const session = makeSession(makeCurrentUser({ roles: ['todo-admin', 'todo-user'] }), signOut)

    expect(session.user.roles).toEqual(['todo-admin', 'todo-user'])
    expect(session.hasRole(APP_ROLE)).toBe(true)
    expect(session.hasRole('todo-admin')).toBe(true)
    expect(makeSession(makeCurrentUser({ roles: [] }), signOut).hasRole(APP_ROLE)).toBe(false)
    session.signOut()
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('SCRUM-13-AC-14: the forbidden flag notifies subscribers once', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeForbidden(listener)
    markForbidden()
    markForbidden()
    expect(isForbidden()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    resetForbidden()
    markForbidden()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
