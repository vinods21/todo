import { currentRoute, safeReturnTo, setTokenSource, tokenSource } from './token'

describe('SCRUM-13 token source bridge', () => {
  it('SCRUM-13-AC-09: only same-origin absolute paths are accepted as return targets', () => {
    expect(safeReturnTo('/tasks/42/edit?x=1')).toBe('/tasks/42/edit?x=1')
    for (const bad of ['https://evil.test/', '//evil.test/x', '/\\evil.test', 'tasks', undefined, 42, null]) {
      expect(safeReturnTo(bad), String(bad)).toBe('/')
    }
  })

  it('SCRUM-13-AC-09: the current route is path + search', () => {
    window.history.replaceState({}, '', '/tasks/7/edit?status=DONE')
    expect(currentRoute()).toBe('/tasks/7/edit?status=DONE')
    window.history.replaceState({}, '', '/')
  })

  it('SCRUM-13-AC-11: without a configured source no token is available and nothing happens', async () => {
    setTokenSource(undefined)
    await expect(tokenSource().getAccessToken()).rejects.toThrow('not configured')
    await expect(tokenSource().renew()).resolves.toBeUndefined()
    expect(() => tokenSource().signIn('/')).not.toThrow()
    expect(() => tokenSource().forbidden()).not.toThrow()
  })
})
