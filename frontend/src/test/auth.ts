import { vi } from 'vitest'
import { setTokenSource, type TokenSource } from '../auth/token'
import { TEST_ACCESS_TOKEN } from './fixtures'

// SCRUM-13-AC-17 (ADR 0007 amended): tests run against a fake token source — no Keycloak, no oidc-client-ts.

export interface FakeTokenSource extends TokenSource {
  token: string | undefined
  getAccessToken: ReturnType<typeof vi.fn<() => Promise<string | undefined>>>
  renew: ReturnType<typeof vi.fn<() => Promise<string | undefined>>>
  signIn: ReturnType<typeof vi.fn<(returnTo: string) => void>>
  forbidden: ReturnType<typeof vi.fn<() => void>>
}

/** Installs (and returns) a fake source: token `test-access-token`; renew() resolves to `renewTo` (default: none). */
export function installFakeTokenSource(
  options: { token?: string | undefined; renewTo?: string | undefined } = {},
): FakeTokenSource {
  const source = {
    token: 'token' in options ? options.token : TEST_ACCESS_TOKEN,
  } as FakeTokenSource
  source.getAccessToken = vi.fn(() => Promise.resolve(source.token))
  source.renew = vi.fn(() => {
    if (options.renewTo !== undefined) source.token = options.renewTo
    return Promise.resolve(options.renewTo)
  })
  source.signIn = vi.fn()
  source.forbidden = vi.fn()
  setTokenSource(source)
  return source
}
