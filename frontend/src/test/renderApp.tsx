import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '../routes'

/** Renders the real route table at `initialPath` (a direct entry = browser refresh). */
export function renderApp(initialPath = '/', state?: unknown) {
  const router = createMemoryRouter(routes, { initialEntries: [{ ...toEntry(initialPath), state }] })
  const user = userEvent.setup()
  const view = render(<RouterProvider router={router} />)
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
