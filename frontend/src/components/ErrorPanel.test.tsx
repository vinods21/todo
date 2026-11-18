import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorPanel } from './ErrorPanel'

describe('SCRUM-7 ErrorPanel', () => {
  it('SCRUM-7-AC-16: an alert announces the message; no Retry button without onRetry', () => {
    render(<ErrorPanel message="Could not load tasks." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load tasks.')
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('SCRUM-7-AC-16: Retry calls onRetry once per click', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<ErrorPanel message="Oops" onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('SCRUM-7-AC-16: children are rendered inside the alert', () => {
    render(
      <ErrorPanel message="Oops">
        <a href="/">Back to tasks</a>
      </ErrorPanel>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toContainElement(screen.getByRole('link', { name: 'Back to tasks' }))
  })
})
