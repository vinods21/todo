import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { useAuth } from 'react-oidc-context'
import { getCurrentUser } from '../api/me'
import { ErrorPanel } from '../components/ErrorPanel'
import { Loading } from '../components/Loading'
import { useAsync } from '../hooks/useAsync'
import { NoAccessPage } from './NoAccessPage'
import { APP_ROLE, isForbidden, makeSession, SessionContext, SIGN_IN_FAILED, SIGNING_IN, subscribeForbidden } from './session'
import { SignedOutPage } from './SignedOutPage'
import { currentRoute } from './token'
import { CALLBACK_PATH, SIGNED_OUT_PATH } from './userManager'

/** Where to come back to after the login: the current route (never the callback route itself). */
function returnRoute(): string {
  return window.location.pathname === CALLBACK_PATH ? '/' : currentRoute()
}

/**
 * SCRUM-13-AC-09, AC-12..AC-14 (design §7.2): nothing of the app (no task UI, no task request) renders before the user
 * is authenticated and GET /api/me has answered.
 * <ul>
 * <li>no session → top-level redirect to Keycloak (Authorization Code + PKCE), state = current route (AC-09);</li>
 * <li>{@code /signed-out} → public "signed out" page (AC-12);</li>
 * <li>silent renewal failed (e.g. SSO session ended) → login again, not a broken UI (AC-13);</li>
 * <li>no {@code todo-user} role, or an API call answered 403 → "no access" page with username and Log out (AC-14).</li>
 * </ul>
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { signinRedirect, signoutRedirect } = auth
  const signedOutPage = window.location.pathname === SIGNED_OUT_PATH
  const leaving = useRef(false)

  const signIn = useCallback(
    (returnTo: string) => {
      if (leaving.current) return
      leaving.current = true
      signinRedirect({ state: returnTo }).catch(() => {
        leaving.current = false
      })
    },
    [signinRedirect],
  )

  const signOut = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    signoutRedirect().catch(() => {
      leaving.current = false
    })
  }, [signoutRedirect])

  const renewFailed = auth.error?.source === 'renewSilent'
  const needsLogin =
    !signedOutPage && !auth.isLoading && !auth.activeNavigator && (renewFailed || (!auth.isAuthenticated && !auth.error))

  useEffect(() => {
    if (needsLogin) signIn(returnRoute())
  }, [needsLogin, signIn])

  if (signedOutPage) return <SignedOutPage onSignIn={() => signIn('/')} />
  if (auth.error && !renewFailed) {
    return (
      <main className="auth-page">
        <ErrorPanel message={SIGN_IN_FAILED} onRetry={() => signIn('/')} />
      </main>
    )
  }
  if (!auth.isAuthenticated || needsLogin) return <Loading label={SIGNING_IN} />
  return <SessionGate signOut={signOut}>{children}</SessionGate>
}

/** Loads GET /api/me once per signed-in subject and provides the session (or the "no access" page). */
function SessionGate({ signOut, children }: { signOut: () => void; children: ReactNode }) {
  const load = useCallback((signal: AbortSignal) => getCurrentUser(signal), [])
  const me = useAsync(load)
  const apiForbidden = useSyncExternalStore(subscribeForbidden, isForbidden)
  const user = me.status === 'success' ? me.data : undefined
  const session = useMemo(() => (user ? makeSession(user, signOut) : undefined), [user, signOut])

  if (me.status === 'loading') return <Loading label={SIGNING_IN} />
  if (me.status === 'error') {
    // 401: client.ts already started the login (after one renewal attempt).
    if (me.error.kind === 'unauthorized') return <Loading label={SIGNING_IN} />
    return (
      <main className="auth-page">
        <ErrorPanel message={me.error.message} onRetry={me.reload} />
      </main>
    )
  }
  if (!session) return <Loading label={SIGNING_IN} />
  if (apiForbidden || !session.hasRole(APP_ROLE)) {
    return <NoAccessPage username={session.user.username} onSignOut={signOut} />
  }
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}
