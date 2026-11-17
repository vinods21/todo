import type { RouteObject } from 'react-router'
import { ErrorPanel } from './components/ErrorPanel'
import { Layout } from './components/Layout'
import { NotFoundPage } from './pages/NotFoundPage'
import { TaskCreatePage } from './pages/TaskCreatePage'
import { TaskEditPage } from './pages/TaskEditPage'
import { TaskListPage } from './pages/TaskListPage'

/** SCRUM-1-AC-12: distinct, refresh-safe URLs. Shared by the app (browser router) and tests (memory router). */
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    // Render-error backstop: generic message, never a stack trace.
    errorElement: <ErrorPanel message="Something went wrong." />,
    children: [
      { index: true, element: <TaskListPage /> },
      { path: 'tasks/new', element: <TaskCreatePage /> },
      { path: 'tasks/:id/edit', element: <TaskEditPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
