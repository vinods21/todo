// SCRUM-13-AC-11, AC-14 (design §7.4): bridge between the React auth state and the non-React API client
// (client.ts stays the only fetch caller for the API, ADR 0006). main.tsx installs the real source (UserManager);
// tests install a fake (src/test/auth.tsx).

export interface TokenSource {
  /** The current access token, or undefined when signed out. */
  getAccessToken(): Promise<string | undefined>
  /** Renews the access token (refresh-token grant); resolves to the new token, or undefined when that failed. */
  renew(): Promise<string | undefined>
  /** Starts the login (top-level redirect); `returnTo` = path + search to come back to. */
  signIn(returnTo: string): void
  /** An API call was answered 403: the signed-in user lacks access (AC-14). */
  forbidden(): void
}

const notConfigured: TokenSource = {
  getAccessToken: () => Promise.reject(new Error('auth token source not configured')),
  renew: () => Promise.resolve(undefined),
  signIn: () => undefined,
  forbidden: () => undefined,
}

let current: TokenSource = notConfigured

export function setTokenSource(source: TokenSource | undefined): void {
  current = source ?? notConfigured
}

export function tokenSource(): TokenSource {
  return current
}

/** The route to come back to after a login started now. */
export function currentRoute(): string {
  return `${window.location.pathname}${window.location.search}`
}

/** Only same-origin absolute paths are accepted as a return target (no open redirect via `state`). */
export function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : '/'
}
