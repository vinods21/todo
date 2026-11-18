import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { TaskNotFound } from './TaskNotFound'

describe('SCRUM-7 TaskNotFound', () => {
  it('SCRUM-7-AC-16: a level-1 heading, an explanation and a Back to tasks link to /', async () => {
    const router = createMemoryRouter(
      [
        { path: '/tasks/:id/edit', element: <TaskNotFound /> },
        { path: '/', element: <p>list page</p> },
      ],
      { initialEntries: ['/tasks/9/edit'] },
    )
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Task not found' })).toBeInTheDocument()
    expect(screen.getByText('The task does not exist or has been deleted.')).toBeInTheDocument()
    const back = screen.getByRole('link', { name: 'Back to tasks' })
    expect(back).toHaveAttribute('href', '/')
    await user.click(back)
    expect(screen.getByText('list page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})
