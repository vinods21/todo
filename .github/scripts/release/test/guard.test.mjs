// SCRUM-8-AC-06, AC-11 (design §4.4): mode derivation and release guard rails.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkReleaseGuard, deriveMode } from '../lib/guard.mjs'

const sha = 'a'.repeat(40)

test('SCRUM-8-AC-11: push, pull_request and dispatch with dry_run=true are dry runs', () => {
  assert.equal(deriveMode('push', ''), 'dry-run')
  assert.equal(deriveMode('pull_request', undefined), 'dry-run')
  assert.equal(deriveMode('workflow_dispatch', 'true'), 'dry-run')
  assert.equal(deriveMode('push', 'false'), 'dry-run')
})

test('SCRUM-8-AC-06: workflow_dispatch with dry_run=false is a release', () => {
  assert.equal(deriveMode('workflow_dispatch', 'false'), 'release')
  assert.equal(deriveMode('workflow_dispatch', false), 'release')
})

test('SCRUM-8-AC-06: a release on refs/heads/main for the dispatched, untagged commit passes', () => {
  assert.deepEqual(checkReleaseGuard({ mode: 'release', ref: 'refs/heads/main', dispatchedSha: sha, headSha: sha, tagsAtHead: [] }).ok, true)
})

test('SCRUM-8-AC-06: a release on refs/heads/feature/x is refused', () => {
  const r = checkReleaseGuard({ mode: 'release', ref: 'refs/heads/feature/x', dispatchedSha: sha, headSha: sha })
  assert.equal(r.ok, false)
  assert.match(r.reasons.join(), /main only/)
})

test('SCRUM-8-AC-06: checked-out commit different from the dispatched one is refused', () => {
  const r = checkReleaseGuard({ mode: 'release', ref: 'refs/heads/main', dispatchedSha: sha, headSha: 'b'.repeat(40) })
  assert.equal(r.ok, false)
  assert.match(r.reasons.join(), /not the dispatched commit/)
})

test('SCRUM-8-AC-06: a commit that already carries v0.1.0 is refused (no second version per commit)', () => {
  const r = checkReleaseGuard({ mode: 'release', ref: 'refs/heads/main', dispatchedSha: sha, headSha: sha, tagsAtHead: ['v0.1.0', 'foo'] })
  assert.equal(r.ok, false)
  assert.match(r.reasons.join(), /already released as v0\.1\.0/)
})

test('SCRUM-8-AC-06: non-release tags on the commit do not block', () => {
  assert.equal(checkReleaseGuard({ mode: 'release', ref: 'refs/heads/main', dispatchedSha: sha, headSha: sha, tagsAtHead: ['v1.0.0-rc.1', 'nightly'] }).ok, true)
})

test('SCRUM-8-AC-11: a dry run is never refused but reports what a release would refuse', () => {
  const r = checkReleaseGuard({ mode: 'dry-run', ref: 'refs/pull/5/merge', dispatchedSha: sha, headSha: sha, tagsAtHead: ['v0.1.0'] })
  assert.equal(r.ok, true)
  assert.equal(r.reasons.length, 0)
  assert.equal(r.wouldRefuse.length, 2)
})
