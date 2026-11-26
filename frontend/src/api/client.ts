import { currentRoute, tokenSource } from '../auth/token'
import { API_BASE_URL } from './config'
import { ApiError, GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE, SESSION_EXPIRED_MESSAGE, toApiError } from './errors'

// The only module that calls fetch for the API (ADR 0006). SCRUM-13 (ADR 0018 §2): it attaches the access token and
// owns the 401 renewal + retry.

// Upper-case on purpose: fetch only normalises GET/POST/PUT/DELETE/HEAD/OPTIONS, a lower-case 'patch' is sent verbatim.
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH'
export type Query = Record<string, string | number | undefined>

export interface RequestOptions {
  query?: Query
  body?: unknown
  signal?: AbortSignal
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

/**
 * SCRUM-1-AC-13, SCRUM-7-AC-17 (ADR 0011).
 * Absolute API_BASE_URL → used as is (the second URL argument is ignored for absolute inputs).
 * '' (VITE_API_BASE_URL='/', same-origin) → resolved against the page origin: <origin>/api/….
 * `baseUrl` is a parameter only so tests can exercise both modes without re-importing the module.
 */
export function buildUrl(path: string, query?: Query, baseUrl: string = API_BASE_URL): URL {
  const url = new URL(baseUrl + path, window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }
  return url
}

/** SCRUM-13-AC-11: the token is attached only to URLs on the API origin (same origin when API_BASE_URL is ''). */
export function isApiUrl(url: URL, baseUrl: string = API_BASE_URL): boolean {
  return url.origin === new URL(baseUrl || '/', window.location.origin).origin
}

async function accessToken(): Promise<string | undefined> {
  try {
    return await tokenSource().getAccessToken()
  } catch {
    return undefined
  }
}

async function send(url: URL, method: HttpMethod, opts: RequestOptions, token: string | undefined): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  // SCRUM-13-AC-11: the bearer token goes in a header (never a URL) and only to the API origin.
  if (token !== undefined) headers.Authorization = `Bearer ${token}`
  const init: RequestInit = { method, headers, signal: opts.signal }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }
  try {
    return await fetch(url, init)
  } catch (error) {
    if (isAbortError(error)) throw error
    // SCRUM-1-AC-10: backend down, DNS or CORS failure all surface as a TypeError.
    throw new ApiError('network', 0, NETWORK_ERROR_MESSAGE)
  }
}

export async function request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.query)
  const toApi = isApiUrl(url)
  let response = await send(url, method, opts, toApi ? await accessToken() : undefined)

  if (toApi && response.status === 401) {
    // SCRUM-13-AC-14: renew once and retry the identical request once; otherwise start the login (back to this route).
    const renewed = await tokenSource().renew()
    if (renewed !== undefined) response = await send(url, method, opts, renewed)
    if (response.status === 401) {
      tokenSource().signIn(currentRoute())
      throw new ApiError('unauthorized', 401, SESSION_EXPIRED_MESSAGE)
    }
  }
  if (toApi && response.status === 403) {
    // SCRUM-13-AC-14: "You do not have access" page, not a generic error and not a login loop.
    tokenSource().forbidden()
  }

  if (!response.ok) {
    throw await toApiError(response)
  }
  try {
    // Successful bodies are trusted to match the SCRUM-2 contract (design §5.1).
    return (await response.json()) as T
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiError('server', response.status, GENERIC_ERROR_MESSAGE)
  }
}
