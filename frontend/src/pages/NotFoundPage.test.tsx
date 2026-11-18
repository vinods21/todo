import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { NotFoundPage } from './NotFoundPage'

describe('SCRUM-7 NotFoundPage', () => {
  it('SCRUM-7-AC-16: a Page not found heading and a Back to tasks link to /', async () => {
    const router = createMemoryRouter(
      [
        { path: '/', element: <p>list page</p> },
        { path: '*', element: <NotFoundPage /> },
      ],
      { initialEntries: ['/nope'] },
    )
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    const back = screen.getByRole('link', { name: 'Back to tasks' })
    expect(back).toHaveAttribute('href', '/')
    await user.click(back)
    expect(screen.getByText('list page')).toBeInTheDocument()
  })
})
