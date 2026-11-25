import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeSession } from '../auth/session'
import { makeCurrentUser } from '../test/fixtures'
import { renderApp } from '../test/renderApp'
import { TestSessionProvider } from '../test/TestSessionProvider'
import { UserMenu } from './UserMenu'

describe('SCRUM-13 UserMenu', () => {
  it('SCRUM-13-AC-12, SCRUM-13-NFR-10: shows the username and a Log out button that signs out', async () => {
    const signOut = vi.fn()
    const user = userEvent.setup()
    render(
      <TestSessionProvider session={makeSession(makeCurrentUser({ username: 'bob' }), signOut)}>
        <UserMenu />
      </TestSessionProvider>,
    )

    expect(screen.getByText('Signed in as', { exact: false })).toHaveTextContent('Signed in as bob')
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('SCRUM-13-AC-12: renders nothing outside a session', () => {
    const { container } = render(<UserMenu />)
    expect(container).toBeEmptyDOMElement()
  })

  it('SCRUM-13-AC-12, SCRUM-13-NFR-10: the header (banner) of the app shows the signed-in user and Log out', async () => {
    renderApp('/')
    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('alice')).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    expect(within(banner).getByRole('link', { name: 'New task' })).toBeInTheDocument()
    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
  })
})
