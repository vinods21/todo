import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Session } from '../auth/session'
import { routes } from '../routes'
import { TestSessionProvider } from './TestSessionProvider'

/**
 * Renders the real route table at `initialPath` (a direct entry = browser refresh). SCRUM-13-AC-17: inside the
 * authenticated test session (alice, todo-user) unless `session` is given.
 */
export function renderApp(initialPath = '/', state?: unknown, session?: Session) {
  const router = createMemoryRouter(routes, { initialEntries: [{ ...toEntry(initialPath), state }] })
  const user = userEvent.setup()
  const view = render(
    <TestSessionProvider session={session}>
      <RouterProvider router={router} />
    </TestSessionProvider>,
  )
  return { router, user, ...view }
}

function toEntry(path: string): { pathname: string; search: string } {
  const [pathname = '/', search = ''] = path.split('?')
  return { pathname, search: search ? `?${search}` : '' }
}

/** Current router location as `pathname + search`. */
export function currentPath(router: ReturnType<typeof createMemoryRouter>): string {
  const { pathname, search } = router.state.location
  return pathname + search
}
