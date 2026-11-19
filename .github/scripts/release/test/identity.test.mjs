// ADR 0008 parity (SCRUM-8-AC-03 identity, NFR-09): Jira key from the branch, same as the former inline bash.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jiraKeyFromBranch } from '../lib/identity.mjs'

test('SCRUM-8-AC-03, SCRUM-8-NFR-09: feature/SCRUM-<n>-<slug> → SCRUM-<n>', () => {
  assert.equal(jiraKeyFromBranch('feature/SCRUM-8-versioning-and-release-strategy'), 'SCRUM-8')
  assert.equal(jiraKeyFromBranch('feature/SCRUM-12'), 'SCRUM-12')
})

test('SCRUM-8-AC-03, SCRUM-8-NFR-09: main → main', () => {
  assert.equal(jiraKeyFromBranch('main'), 'main')
})

test('SCRUM-8-AC-03, SCRUM-8-NFR-09: anything else → NONE', () => {
  for (const b of ['feature/scrum-8', 'bugfix/SCRUM-8-x', 'feature/SCRUM-8x', 'dependabot/npm', '', undefined, 'mainline']) {
    assert.equal(jiraKeyFromBranch(b), 'NONE', String(b))
  }
})
