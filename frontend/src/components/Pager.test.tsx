import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pager } from './Pager'

function setup(page: number, totalPages: number) {
  const onPageChange = vi.fn<(page: number) => void>()
  const user = userEvent.setup()
  const view = render(<Pager page={page} totalPages={totalPages} onPageChange={onPageChange} />)
  return { onPageChange, user, ...view }
}

describe('SCRUM-7 Pager', () => {
  it.each([0, 1])('SCRUM-7-AC-16: renders nothing when totalPages is %i', (totalPages) => {
    const { container } = setup(0, totalPages)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('SCRUM-7-AC-16: a navigation landmark named Pagination shows the 1-based page of the total', () => {
    setup(1, 3)
    const nav = screen.getByRole('navigation', { name: 'Pagination' })
    expect(nav).toHaveTextContent('Page 2 of 3')
  })

  it('SCRUM-7-AC-16: on the first page Previous is disabled and Next asks for page 1', async () => {
    const { user, onPageChange } = setup(0, 3)
    const previous = screen.getByRole('button', { name: 'Previous' })
    expect(previous).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    await user.click(previous)
    expect(onPageChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('SCRUM-7-AC-16: on the last page Next is disabled and Previous asks for page - 1', async () => {
    const { user, onPageChange } = setup(2, 3)
    const next = screen.getByRole('button', { name: 'Next' })
    expect(next).toBeDisabled()
    await user.click(next)
    expect(onPageChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('SCRUM-7-AC-16: on a middle page both buttons are enabled and call back with the neighbours', async () => {
    const { user, onPageChange } = setup(1, 3)
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPageChange.mock.calls).toEqual([[0], [2]])
  })
})
