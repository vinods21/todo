import type { UserManager } from 'oidc-client-ts'
import { markForbidden } from './session'
import { safeReturnTo, type TokenSource } from './token'

/**
 * SCRUM-13-AC-11, AC-13, AC-14 (design §7.4): the token source the app uses — backed by the UserManager (tokens in
 * memory). One renewal at a time (refresh tokens rotate: two parallel refreshes with the same token would fail); one
 * login redirect at a time.
 */
export function userManagerTokenSource(userManager: UserManager): TokenSource {
  let renewal: Promise<string | undefined> | undefined
  let signingIn = false
  return {
    async getAccessToken() {
      return (await userManager.getUser())?.access_token
    },
    renew() {
      renewal ??= userManager
        .signinSilent()
        .then(
          (user) => user?.access_token,
          () => undefined,
        )
        .finally(() => {
          renewal = undefined
        })
      return renewal
    },
    signIn(returnTo) {
      if (signingIn) return
      signingIn = true
      userManager.signinRedirect({ state: safeReturnTo(returnTo) }).catch(() => {
        signingIn = false
      })
    },
    forbidden: markForbidden,
  }
}
