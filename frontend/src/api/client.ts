import { API_BASE_URL } from './config'
import { ApiError, GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE, toApiError } from './errors'

// The only module that calls fetch (ADR 0006).

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

export async function request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const init: RequestInit = { method, headers, signal: opts.signal }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, opts.query), init)
  } catch (error) {
    if (isAbortError(error)) throw error
    // SCRUM-1-AC-10: backend down, DNS or CORS failure all surface as a TypeError.
    throw new ApiError('network', 0, NETWORK_ERROR_MESSAGE)
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
