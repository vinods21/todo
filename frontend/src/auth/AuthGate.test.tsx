import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { API, errorBody, makeCurrentUser } from '../test/fixtures'
import { requestLog } from '../test/handlers'
import { server } from '../test/server'
import { AuthGate } from './AuthGate'
import { markForbidden, SIGN_IN_FAILED, SIGNING_IN, useSession } from './session'

// SCRUM-13-AC-09, AC-12..AC-15 (design §7.5): react-oidc-context's useAuth is faked — no Keycloak, no oidc-client-ts.
const auth = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  signinRedirect: vi.fn(() => Promise.resolve()),
  signoutRedirect: vi.fn(() => Promise.resolve()),
}))

vi.mock('react-oidc-context', () => ({
  useAuth: () => ({ ...auth.state, signinRedirect: auth.signinRedirect, signoutRedirect: auth.signoutRedirect }),
}))

function setAuth(state: Record<string, unknown>) {
  auth.state = { isLoading: false, isAuthenticated: false, activeNavigator: undefined, error: undefined, ...state }
}

function App() {
  const session = useSession()
  return (
    <p>
      app for {session?.user.username} ({session?.user.roles.join(',')}) admin={String(session?.hasRole('todo-admin'))}
    </p>
  )
}

function renderGate(path = '/') {
  window.history.replaceState({}, '', path)
  const user = userEvent.setup()
  render(
    <AuthGate>
      <App />
    </AuthGate>,
  )
  return { user }
}

beforeEach(() => {
  auth.signinRedirect.mockClear()
  auth.signoutRedirect.mockClear()
  setAuth({})
})

afterEach(() => window.history.replaceState({}, '', '/'))

describe('SCRUM-13 AuthGate', () => {
  it('SCRUM-13-AC-09: without a session it starts the login with the deep link as state and renders no app, no request', () => {
    renderGate('/tasks/42/edit?status=DONE&page=2')

    expect(auth.signinRedirect).toHaveBeenCalledTimes(1)
    expect(auth.signinRedirect).toHaveBeenCalledWith({ state: '/tasks/42/edit?status=DONE&page=2' })
    expect(screen.getByRole('status')).toHaveTextContent(SIGNING_IN)
    expect(screen.queryByText(/app for/)).not.toBeInTheDocument()
    expect(requestLog).toEqual([])
  })

  it('SCRUM-13-AC-09: on the callback route without a session the login returns to /', () => {
    renderGate('/oidc/callback')
    expect(auth.signinRedirect).toHaveBeenCalledWith({ state: '/' })
  })

  it('SCRUM-13-AC-09: while the library initialises or navigates nothing is started', () => {
    setAuth({ isLoading: true })
    renderGate('/')
    expect(auth.signinRedirect).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(SIGNING_IN)
  })

  it('SCRUM-13-AC-15: authenticated with todo-user → the app renders with the session from GET /api/me', async () => {
    server.use(http.get(`${API}/me`, () => HttpResponse.json(makeCurrentUser({ roles: ['todo-admin', 'todo-user'] }))))
    setAuth({ isAuthenticated: true })
    renderGate('/')

    expect(await screen.findByText('app for alice (todo-admin,todo-user) admin=true')).toBeInTheDocument()
    expect(auth.signinRedirect).not.toHaveBeenCalled()
  })

  it('SCRUM-13-AC-14: authenticated without todo-user → "no access" page with the username and Log out', async () => {
    server.use(http.get(`${API}/me`, () => HttpResponse.json(makeCurrentUser({ username: 'carol', roles: [] }))))
    setAuth({ isAuthenticated: true })
    const { user } = renderGate('/')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'You do not have access to this application' }),
    ).toBeInTheDocument()
    expect(screen.getByText('carol')).toBeInTheDocument()
    expect(screen.queryByText(/app for/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(auth.signoutRedirect).toHaveBeenCalledTimes(1)
    expect(auth.signinRedirect).not.toHaveBeenCalled()
  })

  it('SCRUM-13-AC-14: an API call answered 403 switches the app to the "no access" page', async () => {
    setAuth({ isAuthenticated: true })
    renderGate('/')
    expect(await screen.findByText(/app for alice/)).toBeInTheDocument()

    act(() => markForbidden())

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this application' }),
    ).toBeInTheDocument()
  })

  it('SCRUM-13-AC-12: /signed-out is public — no login is started; "Sign in again" starts it', async () => {
    const { user } = renderGate('/signed-out')

    expect(screen.getByRole('heading', { level: 1, name: 'You are signed out' })).toBeInTheDocument()
    expect(auth.signinRedirect).not.toHaveBeenCalled()
    expect(requestLog).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(auth.signinRedirect).toHaveBeenCalledWith({ state: '/' })
  })

  it('SCRUM-13-AC-13: a failed silent renewal (SSO session ended) leads to the login, not a broken UI', () => {
    setAuth({ isAuthenticated: true, error: Object.assign(new Error('invalid_grant'), { source: 'renewSilent' }) })
    renderGate('/tasks/new')

    expect(auth.signinRedirect).toHaveBeenCalledWith({ state: '/tasks/new' })
    expect(screen.getByRole('status')).toHaveTextContent(SIGNING_IN)
  })

  it('SCRUM-13-AC-09: a failed sign-in callback shows an error with a way to sign in again (no redirect loop)', async () => {
    setAuth({ error: Object.assign(new Error('No matching state'), { source: 'signinCallback' }) })
    const { user } = renderGate('/oidc/callback?code=x&state=y')

    expect(screen.getByRole('alert')).toHaveTextContent(SIGN_IN_FAILED)
    expect(auth.signinRedirect).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(auth.signinRedirect).toHaveBeenCalledWith({ state: '/' })
  })

  it('SCRUM-13-AC-12: Log out starts the RP-initiated logout once', async () => {
    setAuth({ isAuthenticated: true })
    server.use(http.get(`${API}/me`, () => HttpResponse.json(makeCurrentUser({ username: 'carol', roles: [] }))))
    const { user } = renderGate('/')
    const logout = await screen.findByRole('button', { name: 'Log out' })
    await user.click(logout)
    await user.click(logout)
    expect(auth.signoutRedirect).toHaveBeenCalledTimes(1)
  })

  it('SCRUM-13-AC-14: GET /api/me failing with 5xx shows an error with Retry', async () => {
    let calls = 0
    server.use(
      http.get(`${API}/me`, () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json(errorBody(503), { status: 503 })
          : HttpResponse.json(makeCurrentUser())
      }),
    )
    setAuth({ isAuthenticated: true })
    const { user } = renderGate('/')

    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/app for alice/)).toBeInTheDocument()
  })

  it('SCRUM-13-AC-14: GET /api/me answered 401 keeps "Signing in…" (the client has started the login)', async () => {
    server.use(
      http.get(`${API}/me`, () =>
        HttpResponse.json(errorBody(401, 'Authentication required', [], '/api/me'), {
          status: 401,
          headers: { 'WWW-Authenticate': 'Bearer' },
        }),
      ),
    )
    setAuth({ isAuthenticated: true })
    renderGate('/')

    expect(await screen.findByRole('status')).toHaveTextContent(SIGNING_IN)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
