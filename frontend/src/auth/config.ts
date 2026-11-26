// SCRUM-13-AC-16 (ADR 0018 §3, design §7.2): Keycloak URL, realm and client ID are configuration, not code.
// The container image is built with VITE_AUTH_CONFIG_URL=/auth-config.json (rendered by nginx from AUTH_URL /
// AUTH_REALM / AUTH_CLIENT_ID at container start), so one image runs on any host/port. Vite dev mode uses
// VITE_AUTH_URL / VITE_AUTH_REALM / VITE_AUTH_CLIENT_ID with the local defaults below.

export interface AuthConfig {
  /** Keycloak base URL (origin, optional path prefix), no trailing slash — e.g. http://localhost:8180 */
  url: string
  realm: string
  clientId: string
}

export interface AuthEnv {
  VITE_AUTH_CONFIG_URL?: string
  VITE_AUTH_URL?: string
  VITE_AUTH_REALM?: string
  VITE_AUTH_CLIENT_ID?: string
}

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  url: 'http://localhost:8180',
  realm: 'todo',
  clientId: 'todo-frontend',
}

// Same rules as frontend/nginx/16-todo-auth-config.sh (they also guard the CSP header).
const URL_PATTERN = /^https?:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~-]+)*$/
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/

export class AuthConfigError extends Error {
  override readonly name = 'AuthConfigError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validates an untrusted config object (from /auth-config.json or the environment). */
export function parseAuthConfig(value: unknown): AuthConfig {
  if (!isRecord(value)) throw new AuthConfigError('auth configuration is not an object')
  const { url, realm, clientId } = value
  if (typeof url !== 'string' || !URL_PATTERN.test(url)) throw new AuthConfigError('invalid auth url')
  if (typeof realm !== 'string' || !NAME_PATTERN.test(realm)) throw new AuthConfigError('invalid auth realm')
  if (typeof clientId !== 'string' || !NAME_PATTERN.test(clientId)) throw new AuthConfigError('invalid auth client id')
  return { url, realm, clientId }
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** Vite dev mode / tests: VITE_AUTH_* with the documented defaults; a trailing slash on the URL is dropped. */
export function authConfigFromEnv(env: AuthEnv): AuthConfig {
  return parseAuthConfig({
    url: (nonBlank(env.VITE_AUTH_URL) ?? DEFAULT_AUTH_CONFIG.url).replace(/\/+$/, ''),
    realm: nonBlank(env.VITE_AUTH_REALM) ?? DEFAULT_AUTH_CONFIG.realm,
    clientId: nonBlank(env.VITE_AUTH_CLIENT_ID) ?? DEFAULT_AUTH_CONFIG.clientId,
  })
}

/**
 * Loads the auth settings before the app renders: from VITE_AUTH_CONFIG_URL when set (image: /auth-config.json),
 * otherwise from VITE_AUTH_*. Rejects with an AuthConfigError — the caller shows a static configuration error instead
 * of starting a login (no redirect loop).
 */
export async function loadAuthConfig(
  env: AuthEnv = import.meta.env,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<AuthConfig> {
  const configUrl = nonBlank(env.VITE_AUTH_CONFIG_URL)
  if (!configUrl) return authConfigFromEnv(env)
  let response: Response
  try {
    response = await fetchFn(configUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  } catch {
    throw new AuthConfigError(`cannot load ${configUrl}`)
  }
  if (!response.ok) throw new AuthConfigError(`cannot load ${configUrl} (HTTP ${response.status})`)
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new AuthConfigError(`${configUrl} is not JSON`)
  }
  return parseAuthConfig(body)
}
