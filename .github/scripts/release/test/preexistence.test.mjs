// SCRUM-8-AC-08 (design §8.6): pre-existence probes and decision — through the real CLI with stubbed git/gh/skopeo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { decidePreexistence, interpretGhcrProbe } from '../lib/preexistence.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', 'preexistence.mjs')
const stubs = join(here, 'stubs')
const SHA = 'a1b2c3d' + '0'.repeat(33)
const B = 'ghcr.io/vinods21/todo-backend'
const F = 'ghcr.io/vinods21/todo-frontend'

function runCli(mode, stubEnv = {}) {
  const r = spawnSync(process.execPath, [cli], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      MODE: mode,
      VERSION: '0.2.0',
      SHA,
      REPO: 'vinods21/todo',
      GIT_BIN: join(stubs, 'git'),
      GH_BIN: join(stubs, 'gh'),
      SKOPEO_BIN: join(stubs, 'skopeo'),
      STUB_RELEASE_TAG: 'v0.2.0',
      STUB_REMOTE_TAGS: 'v0.1.0',
      STUB_OTHER_RELEASES: 'v0.1.0',
      ...stubEnv,
    },
  })
  return { status: r.status, out: r.stdout + r.stderr }
}

for (const mode of ['release', 'dry-run']) {
  test(`SCRUM-8-AC-08: all absent → free (${mode})`, () => {
    const r = runCli(mode)
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /Decision: \*\*free\*\*/)
  })

  test(`SCRUM-8-AC-08: remote tag v0.2.0 exists → refuse (${mode})`, () => {
    const r = runCli(mode, { STUB_REMOTE_TAGS: 'v0.1.0 v0.2.0' })
    assert.equal(r.status, 1, r.out)
    assert.match(r.out, /Git tag v0\.2\.0 \| \*\*exists\*\*/)
  })

  test(`SCRUM-8-AC-08: published release v0.2.0 exists → refuse (${mode})`, () => {
    const r = runCli(mode, { STUB_RELEASE: 'published' })
    assert.equal(r.status, 1, r.out)
    assert.match(r.out, /GitHub Release v0\.2\.0 \| \*\*exists\*\*/)
  })

  test(`SCRUM-8-AC-08: GHCR backend 0.2.0 exists → refuse (${mode})`, () => {
    const r = runCli(mode, { STUB_GHCR_EXISTS: `${B}:0.2.0` })
    assert.equal(r.status, 1, r.out)
    assert.match(r.out, /GHCR ghcr\.io\/vinods21\/todo-backend:0\.2\.0 \| \*\*exists\*\*/)
  })

  test(`SCRUM-8-AC-08: GHCR frontend 0.2.0-<id> exists → refuse (${mode})`, () => {
    const r = runCli(mode, { STUB_GHCR_EXISTS: `${F}:0.2.0-a1b2c3d` })
    assert.equal(r.status, 1, r.out)
    assert.match(r.out, /todo-frontend:0\.2\.0-a1b2c3d \| \*\*exists\*\*/)
  })
}

test('SCRUM-8-AC-08: draft release named v0.2.0 (release mode) → refuse', () => {
  const r = runCli('release', { STUB_RELEASE: 'draft' })
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /draft release found/)
})

test('SCRUM-8-AC-08: GHCR denied → release refuses (fail closed), dry-run warns and continues', () => {
  const rel = runCli('release', { STUB_GHCR_MODE: 'denied' })
  assert.equal(rel.status, 1, rel.out)
  assert.match(rel.out, /could not prove absence/)
  const dry = runCli('dry-run', { STUB_GHCR_MODE: 'denied' })
  assert.equal(dry.status, 0, dry.out)
  assert.match(dry.out, /Decision: \*\*warn\*\*/)
  assert.match(dry.out, /re-checked authoritatively at publish/)
})

test('SCRUM-8-AC-08: network error on the tag probe → release refuses, dry-run warns', () => {
  assert.equal(runCli('release', { STUB_GIT_FAIL: '1' }).status, 1)
  assert.equal(runCli('dry-run', { STUB_GIT_FAIL: '1' }).status, 0)
})

test('SCRUM-8-AC-08 (design R3): GHCR denied before the first release (no tags, no releases) counts as absent in release mode', () => {
  const r = runCli('release', { STUB_GHCR_MODE: 'denied', STUB_REMOTE_TAGS: '', STUB_OTHER_RELEASES: '' })
  assert.equal(r.status, 0, r.out)
  assert.match(r.out, /treated as absent: first release/)
})

test('SCRUM-8-AC-08 (design R3): a GHCR network error is never treated as absent', () => {
  const r = runCli('release', { STUB_GHCR_MODE: 'network', STUB_REMOTE_TAGS: '', STUB_OTHER_RELEASES: '' })
  assert.equal(r.status, 1, r.out)
})

test('SCRUM-8-AC-08: the burnt-version message suggests the next patch', () => {
  const d = decidePreexistence([{ item: 'Git tag v1.4.2', state: 'exists', detail: '' }], { mode: 'release', version: '1.4.2' })
  assert.equal(d.decision, 'refuse')
  assert.match(d.messages[0], /version 1\.4\.2 is burnt/)
  assert.match(d.messages[0], /version=1\.4\.3/)
})

test('SCRUM-8-AC-08: GHCR probe interpretation (exists / manifest unknown / denied / other)', () => {
  assert.equal(interpretGhcrProbe('x:1', { status: 0, stdout: '{}', stderr: '' }).state, 'exists')
  assert.equal(interpretGhcrProbe('x:1', { status: 1, stdout: '', stderr: 'MANIFEST_UNKNOWN' }).state, 'absent')
  assert.equal(interpretGhcrProbe('x:1', { status: 1, stdout: '', stderr: 'NAME_UNKNOWN: repository name not known' }).state, 'absent')
  const denied = interpretGhcrProbe('x:1', { status: 1, stdout: '', stderr: 'denied: denied' })
  assert.equal(denied.state, 'unknown')
  assert.equal(denied.denied, true)
  assert.equal(interpretGhcrProbe('x:1', { status: 127, stdout: '', stderr: 'skopeo: ENOENT' }).state, 'unknown')
})
