import { render, screen } from '@testing-library/react'
import { BuildInfo } from './BuildInfo'

describe('SCRUM-1 build identity', () => {
  it('SCRUM-1-NFR-09, SCRUM-6-NFR-07: footer shows the build\'s Jira key and short commit, full commit in the title', () => {
    render(<BuildInfo />)
    const sha = __GIT_SHA__
    const info = screen.getByText(`${__JIRA_KEY__} · ${sha.slice(0, 7)}`)
    // ADR 0008: the key comes from CI (JIRA_KEY derived from the branch) or is UNKNOWN locally.
    expect(__JIRA_KEY__).toMatch(/^(SCRUM-\d+|main|NONE|UNKNOWN)$/)
    expect(sha.length).toBeGreaterThan(0)
    expect(info).toHaveAttribute('title', sha)
  })
})
