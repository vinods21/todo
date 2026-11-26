import { Link, Outlet } from 'react-router'
import { BuildInfo } from './BuildInfo'
import { UserMenu } from './UserMenu'

export function Layout() {
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="app-name">
          Todo
        </Link>
        <div className="app-header-actions">
          <Link to="/tasks/new" className="button">
            New task
          </Link>
          {/* SCRUM-13-AC-12: signed-in user + Log out (absent outside a session, e.g. component tests) */}
          <UserMenu />
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <BuildInfo />
      </footer>
    </div>
  )
}
