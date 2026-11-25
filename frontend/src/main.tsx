import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oidc-context'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthGate } from './auth/AuthGate'
import { loadAuthConfig } from './auth/config'
import { safeReturnTo, setTokenSource } from './auth/token'
import { createUserManager } from './auth/userManager'
import { userManagerTokenSource } from './auth/userManagerTokenSource'
import { ErrorPanel } from './components/ErrorPanel'
import './index.css'
import { routes } from './routes'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')
const root = createRoot(rootElement)

// SCRUM-13 (ADR 0018, design §7.2): auth settings first (runtime /auth-config.json in the image), then the app behind
// the AuthGate — nothing of the app renders and no API call is made before the login.
loadAuthConfig().then(
  (config) => {
    const userManager = createUserManager(config)
    setTokenSource(userManagerTokenSource(userManager))
    const router = createBrowserRouter(routes)
    root.render(
      <StrictMode>
        <AuthProvider
          userManager={userManager}
          // AC-09: back to the route the login started from (state), replacing /oidc/callback?code=… in the history.
          onSigninCallback={(user) => {
            void router.navigate(safeReturnTo(user?.state), { replace: true })
          }}
        >
          <AuthGate>
            <RouterProvider router={router} />
          </AuthGate>
        </AuthProvider>
      </StrictMode>,
    )
  },
  () => {
    // AC-16: a broken configuration is shown as such — never a redirect loop.
    root.render(
      <StrictMode>
        <main className="auth-page">
          <ErrorPanel message="Configuration error: the sign-in settings of this application are invalid." />
        </main>
      </StrictMode>,
    )
  },
)
