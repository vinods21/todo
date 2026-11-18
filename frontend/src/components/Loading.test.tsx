import { render, screen } from '@testing-library/react'
import { Loading } from './Loading'

describe('SCRUM-7 Loading', () => {
  it('SCRUM-7-AC-16: the label is announced through a status region', () => {
    render(<Loading label="Loading tasks…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading tasks…')
  })
})
