// SCRUM-8-AC-02, AC-03, AC-06, AC-11: version.mjs identity|plan against a throw-away Git repository.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', 'version.mjs')
const repo = mkdtempSync(join(tmpdir(), 'version-cli-'))
const g = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } }).trim()
g('init', '-q', '-b', 'main')
g('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'first')
const first = g('rev-parse', 'HEAD')
g('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'tag', '-a', 'v0.1.0', '-m', 'todo 0.1.0')
g('tag', 'v0.10.0-rc.1')
g('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'second')
const head = g('rev-parse', 'HEAD')

function run(sub, env) {
  const dir = mkdtempSync(join(tmpdir(), 'version-out-'))
  const out = join(dir, 'out')
  const summary = join(dir, 'summary')
  writeFileSync(out, '')
  const r = spawnSync(process.execPath, [cli, sub, '--github-output', out, '--summary', summary], {
    cwd: repo,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  })
  const outputs = Object.fromEntries(readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  return { status: r.status, outputs, log: r.stdout + r.stderr }
}

test('SCRUM-8-AC-03: identity outputs the ADR 0008 Jira key and the build version from the tags', () => {
  const r = run('identity', { BRANCH: 'feature/SCRUM-8-x', SHA: head })
  assert.equal(r.status, 0, r.log)
  assert.equal(r.outputs.jira_key, 'SCRUM-8')
  assert.equal(r.outputs.build_version, `0.1.1-${head.slice(0, 7).replace(/^(0\d{6})$/, 'g$1')}`)
})

test('SCRUM-8-AC-11: plan on a push is a dry run stamped with the build version and the would-be release', () => {
  const r = run('plan', { EVENT_NAME: 'push', REF: 'refs/heads/feature/SCRUM-8-x', BRANCH: 'feature/SCRUM-8-x', SHA: head })
  assert.equal(r.status, 0, r.log)
  assert.equal(r.outputs.mode, 'dry-run')
  assert.equal(r.outputs.release_version, '0.1.1')
  assert.equal(r.outputs.version, r.outputs.build_version)
  assert.equal(r.outputs.previous_tag, 'v0.1.0')
  assert.equal(r.outputs.jira_key, 'SCRUM-8')
  assert.match(r.outputs.image_tags, /^0\.1\.1-\S+ 0\.1\.1 0\.1 latest$/)
  assert.match(r.outputs.commit_epoch, /^\d+$/)
  assert.match(r.log, /DRY RUN/)
})

test('SCRUM-8-AC-06: plan in release mode on main stamps the release version', () => {
  const r = run('plan', { EVENT_NAME: 'workflow_dispatch', INPUT_DRY_RUN: 'false', INPUT_BUMP: 'minor', REF: 'refs/heads/main', BRANCH: 'main', SHA: head })
  assert.equal(r.status, 0, r.log)
  assert.equal(r.outputs.mode, 'release')
  assert.equal(r.outputs.version, '0.2.0')
  assert.equal(r.outputs.jira_key, 'main')
})

test('SCRUM-8-AC-06: release mode refuses a non-main ref and an already released commit', () => {
  assert.equal(run('plan', { EVENT_NAME: 'workflow_dispatch', INPUT_DRY_RUN: 'false', REF: 'refs/heads/feature/x', BRANCH: 'feature/x', SHA: head }).status, 1)
  g('checkout', '-q', first)
  const r = run('plan', { EVENT_NAME: 'workflow_dispatch', INPUT_DRY_RUN: 'false', REF: 'refs/heads/main', BRANCH: 'main', SHA: first })
  g('checkout', '-q', 'main')
  assert.equal(r.status, 1)
  assert.match(r.log, /already released as v0\.1\.0/)
})

test('SCRUM-8-AC-02: an invalid explicit version is rejected before any build work (also in dry run)', () => {
  const r = run('plan', { EVENT_NAME: 'workflow_dispatch', INPUT_DRY_RUN: 'true', INPUT_VERSION: '0.1.0', REF: 'refs/heads/main', BRANCH: 'main', SHA: head })
  assert.equal(r.status, 1)
  assert.match(r.log, /::error::SCRUM-8-AC-02: explicit version 0\.1\.0 must be strictly greater/)
})
