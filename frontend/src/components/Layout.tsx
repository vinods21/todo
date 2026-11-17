import { Link, Outlet } from 'react-router'
import { BuildInfo } from './BuildInfo'

export function Layout() {
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="app-name">
          Todo
        </Link>
        <Link to="/tasks/new" className="button">
          New task
        </Link>
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
