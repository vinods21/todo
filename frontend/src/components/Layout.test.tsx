import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { Layout } from './Layout'

function setup(initialPath = '/') {
  const router = createMemoryRouter(
    [
      {
        element: <Layout />,
        children: [
          { index: true, element: <p>child: list</p> },
          { path: 'tasks/new', element: <p>child: new</p> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )
  const user = userEvent.setup()
  render(<RouterProvider router={router} />)
  return { router, user }
}

describe('SCRUM-7 Layout', () => {
  it('SCRUM-7-AC-16: the banner links Todo to / and New task to /tasks/new', async () => {
    const { user, router } = setup('/tasks/new')
    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('link', { name: 'Todo' })).toHaveAttribute('href', '/')
    expect(within(banner).getByRole('link', { name: 'New task' })).toHaveAttribute('href', '/tasks/new')
    await user.click(within(banner).getByRole('link', { name: 'Todo' }))
    expect(router.state.location.pathname).toBe('/')
  })

  it('SCRUM-7-AC-16: main renders the matched child route (Outlet)', async () => {
    const { user } = setup('/')
    const main = screen.getByRole('main')
    expect(main).toHaveTextContent('child: list')
    await user.click(screen.getByRole('link', { name: 'New task' }))
    expect(screen.getByRole('main')).toHaveTextContent('child: new')
  })

  it('SCRUM-7-AC-16: the contentinfo footer shows the build identity <JIRA_KEY> · <short sha>', () => {
    setup()
    expect(screen.getByRole('contentinfo')).toHaveTextContent(`${__JIRA_KEY__} · ${__GIT_SHA__.slice(0, 7)}`)
  })
})
