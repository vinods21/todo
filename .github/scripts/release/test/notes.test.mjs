// SCRUM-8-AC-10, AC-31 (design §9.4): release notes rendering.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { groupCommits, parseGitLog, renderNotes } from '../lib/notes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const commits = parseGitLog(readFileSync(join(here, 'fixtures', 'git-log.txt'), 'utf8'))
const D = 'sha256:' + 'a'.repeat(64)
const E = 'sha256:' + 'b'.repeat(64)
const gate = {
  verdict: 'PASS',
  trivy: { version: '0.76.2', db: { UpdatedAt: '2026-11-18T06:00:00Z' } },
  targets: { 'backend-image': { counts: { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 0 }, secrets: 0 } },
  unfixedCriticalHigh: [{ severity: 'HIGH', id: 'CVE-2026-1', pkg: 'zlib', installed: '1.3', targets: ['backend-image'] }],
  allowlist: { valid: [{ id: 'CVE-2026-11111', package: 'org.example:lib', owner: 'SCRUM-8', expires: '2027-01-31' }] },
}
const data = (over = {}) => ({
  version: '0.2.0',
  sha: 'f'.repeat(40),
  previousTag: 'v0.1.0',
  dryRun: false,
  runUrl: 'https://github.com/vinods21/todo/actions/runs/1',
  repo: 'vinods21/todo',
  images: [
    { name: 'ghcr.io/vinods21/todo-backend', digest: D, tags: ['0.2.0-fffffff', '0.2.0', '0.2', 'latest'] },
    { name: 'ghcr.io/vinods21/todo-frontend', digest: E, tags: ['0.2.0-fffffff', '0.2.0', '0.2', 'latest'] },
  ],
  commits,
  migrations: [],
  gate,
  ...over,
})

test('SCRUM-8-AC-10: commits are grouped by Jira key (highest first) with "Other" last', () => {
  const g = groupCommits(commits)
  assert.deepEqual(g.map((x) => x.key), ['SCRUM-8', 'SCRUM-7', 'Other'])
  assert.equal(g[0].commits.length, 2)
  const md = renderNotes(data())
  assert.match(md, /Jira: \[SCRUM-8\]\(https:\/\/suranagivinod\.atlassian\.net\/browse\/SCRUM-8\), \[SCRUM-7\]/)
  assert.match(md, /- \[DEV\] stamp the product version into the backend jar via \$\{revision\} \(0f27ee9\)/)
  assert.ok(md.indexOf('#### Other') > md.indexOf('#### [SCRUM-7]'))
})

test('SCRUM-8-AC-10: images are referenced by digest and tags', () => {
  const md = renderNotes(data())
  assert.match(md, new RegExp(`ghcr\\.io/vinods21/todo-backend@${D}`))
  assert.match(md, new RegExp(`ghcr\\.io/vinods21/todo-frontend@${E}`))
  assert.match(md, /`0\.2\.0-fffffff`, `0\.2\.0`, `0\.2`, `latest`/)
  assert.match(md, /gh attestation verify oci:\/\/ghcr\.io\/vinods21\/todo-backend@sha256:a{64} --repo vinods21\/todo/)
  assert.match(md, /sha256sum -c SHA256SUMS/)
})

test('SCRUM-8-AC-10, SCRUM-8-AC-31: migrations since the previous release are listed with a rollback warning', () => {
  const md = renderNotes(data({ migrations: ['V3__add_priority.sql'] }))
  assert.match(md, /- `V3__add_priority\.sql`/)
  assert.match(md, /Review backward compatibility before rolling back/)
})

test('SCRUM-8-AC-31: no migrations → "None — application-only rollback is safe."', () => {
  assert.match(renderNotes(data()), /None — application-only rollback is safe\./)
})

test('SCRUM-8-AC-10: first release wording when there is no previous tag', () => {
  const md = renderNotes(data({ previousTag: '', version: '0.1.0' }))
  assert.match(md, /· first release/)
  assert.match(md, /Changes since the beginning/)
})

test('SCRUM-8-AC-10: vulnerability summary with verdict, counts, unfixed findings and allow-list expiry', () => {
  const md = renderNotes(data())
  assert.match(md, /Gate \*\*PASS\*\*/)
  assert.match(md, /backend-image: 0 C \/ 1 H \/ 2 M \/ 3 L \/ 0 U/)
  assert.match(md, /- HIGH CVE-2026-1 in `zlib` 1\.3/)
  assert.match(md, /\| CVE-2026-11111 \| org\.example:lib \| SCRUM-8 \| 2027-01-31 \|/)
})

test('SCRUM-8-AC-11: dry-run notes carry the DRY RUN banner', () => {
  assert.match(renderNotes(data({ dryRun: true })), /^## todo v0\.2\.0 — DRY RUN \(would-be release\)/)
  assert.match(renderNotes(data()), /^## todo v0\.2\.0\n/)
})

test('SCRUM-8-AC-10: long groups are truncated with a count', () => {
  const many = Array.from({ length: 55 }, (_, i) => ({ sha: String(i).padStart(40, '0'), subject: `SCRUM-9: change ${i}` }))
  assert.match(renderNotes(data({ commits: many })), /… and 5 more/)
})
