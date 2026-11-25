import type { ReactNode } from 'react'
import { makeSession, SessionContext, type Session } from '../auth/session'
import { makeCurrentUser } from './fixtures'

/** SCRUM-13-AC-17: the authenticated test default (alice, todo-user) — or any session a test passes. */
export function TestSessionProvider({ session, children }: { session?: Session; children: ReactNode }) {
  return (
    <SessionContext.Provider value={session ?? makeSession(makeCurrentUser(), () => undefined)}>
      {children}
    </SessionContext.Provider>
  )
}
