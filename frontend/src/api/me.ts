import { request } from './client'
import type { CurrentUser } from './types'

/** SCRUM-13-AC-21: the authenticated user (needs a valid token, not the role). */
export function getCurrentUser(signal?: AbortSignal): Promise<CurrentUser> {
  return request<CurrentUser>('GET', '/api/me', { signal })
}
