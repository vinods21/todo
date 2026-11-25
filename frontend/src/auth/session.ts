import { createContext, useContext } from 'react'
import type { CurrentUser } from '../api/types'

// SCRUM-13-AC-12, AC-14, AC-15 (design §7.2): who is signed in, for UI code. Filled by AuthGate from GET /api/me.

export const SIGNING_IN = 'Signing in…'
export const SIGN_IN_FAILED = 'Sign-in failed. Please try again.'

/** The application role that grants access to the To-Do API (Keycloak realm role, SCRUM-13-AC-02). */
export const APP_ROLE = 'todo-user'

/**
 * GET /api/me: subject, username, email|null, name|null and the application roles (todo-user, todo-admin), sorted —
 * AC-15: available for future role-based UI.
 */
export type SessionUser = CurrentUser

export interface Session {
  user: SessionUser
  hasRole(role: string): boolean
  /** RP-initiated logout (ends the Keycloak session, propagated to the mock IdP — ADR 0019 §2). */
  signOut(): void
}

export function makeSession(user: SessionUser, signOut: () => void): Session {
  return { user, hasRole: (role) => user.roles.includes(role), signOut }
}

export const SessionContext = createContext<Session | undefined>(undefined)

/** The current session; undefined outside AuthGate (e.g. components rendered on their own in tests). */
export function useSession(): Session | undefined {
  return useContext(SessionContext)
}

// SCRUM-13-AC-14: an API call answered 403 switches the whole app to the "no access" page (set by client.ts via the
// token source; read by AuthGate with useSyncExternalStore).
let forbidden = false
const listeners = new Set<() => void>()

export function markForbidden(): void {
  if (forbidden) return
  forbidden = true
  listeners.forEach((listener) => listener())
}

export function isForbidden(): boolean {
  return forbidden
}

export function subscribeForbidden(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Tests only: back to "not forbidden". */
export function resetForbidden(): void {
  forbidden = false
}
