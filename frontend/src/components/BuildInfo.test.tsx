import { render, screen } from '@testing-library/react'
import { BuildInfo } from './BuildInfo'

describe('SCRUM-1 build identity', () => {
  it('SCRUM-1-NFR-09: footer shows the Jira key and short commit, full commit in the title', () => {
    render(<BuildInfo />)
    const sha = __GIT_SHA__
    const info = screen.getByText(`${__JIRA_KEY__} · ${sha.slice(0, 7)}`)
    expect(__JIRA_KEY__).toBe('SCRUM-1')
    expect(sha.length).toBeGreaterThan(0)
    expect(info).toHaveAttribute('title', sha)
  })
})
