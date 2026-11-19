// SCRUM-9-AC-07, AC-09, AC-13 (design §7.4): the @critical guard over Playwright JSON — blocks on any non-pass, on
// too few executed critical tests, and fails closed on a missing or broken report.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { collectTests, criticalVerdict, flakyTests, renderMarkdown, suiteStats } from '../lib/e2e-results.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', 'e2e-gate.mjs')

// Builders for minimal Playwright JSON reports (shape of the 1.65 `json` reporter).
const attempt = (status, retry = 0) => ({ status, retry })
const spec = (title, { tags = ['critical'], status = 'expected', results = [attempt('passed')], project = 'ui' } = {}) => ({
  title,
  file: 'ui/tasks.spec.ts',
  tags,
  tests: [{ projectName: project, status, results }],
})
const report = (specs, { nested = false, stats } = {}) => {
  const inner = { title: 'ui/tasks.spec.ts', file: 'ui/tasks.spec.ts', specs }
  const suites = nested
    ? [{ title: 'ui/tasks.spec.ts', file: 'ui/tasks.spec.ts', specs: [], suites: [{ title: 'outer', specs: [], suites: [{ title: 'inner', specs }] }] }]
    : [inner]
  return { suites, stats: stats ?? { expected: specs.length, unexpected: 0, flaky: 0, skipped: 0, duration: 74_200 } }
}
const criticals = (n, over = {}) => Array.from({ length: n }, (_, i) => spec(`SCRUM-7-AC-18: critical ${i + 1}`, over))
const verdictOf = (r, opts = { min: 12 }) => criticalVerdict(collectTests(r), opts)

function runCli(content, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-gate-'))
  const file = join(dir, 'results.json')
  if (content !== undefined) writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content))
  const summary = join(dir, 'summary.md')
  const r = spawnSync(process.execPath, [cli, '--results', file, '--tag', 'critical', '--min', '12', '--summary', summary, ...extra], {
    encoding: 'utf8',
  })
  return { ...r, summary }
}

test('SCRUM-9-AC-07: all critical tests passed → ok', () => {
  const v = verdictOf(report([...criticals(12), spec('not critical', { tags: [] })]))
  assert.equal(v.ok, true)
  assert.equal(v.executed, 12)
  assert.equal(v.passed, 12)
  assert.deepEqual(v.failures, [])
  const r = runCli(report(criticals(12)))
  assert.equal(r.status, 0, r.stdout)
  assert.match(r.stdout, /\*\*PASS\*\* — 12 @critical tests executed, 12 passed \(min 12\)/)
})

test('SCRUM-9-AC-07: a failed critical test blocks', () => {
  const specs = criticals(12)
  specs[3] = spec('SCRUM-7-AC-18: broken one', { status: 'unexpected', results: [attempt('failed'), attempt('failed', 1)] })
  const v = verdictOf(report(specs))
  assert.equal(v.ok, false)
  assert.deepEqual(v.failures.map((f) => f.title), ['SCRUM-7-AC-18: broken one'])
  const r = runCli(report(specs))
  assert.equal(r.status, 1)
  assert.match(r.stdout, /::error::SCRUM-9-AC-07: @critical test did not pass \(unexpected\/failed\): \[ui\] SCRUM-7-AC-18: broken one/)
})

test('SCRUM-9-AC-07: a failed non-critical test does not affect the guard (the Playwright step itself fails the job)', () => {
  const v = verdictOf(report([...criticals(12), spec('other', { tags: [], status: 'unexpected', results: [attempt('failed')] })]))
  assert.equal(v.ok, true)
})

test('SCRUM-9-AC-07: a skipped critical test blocks', () => {
  const specs = criticals(13)
  specs[0] = spec('SCRUM-7-AC-18: skipped one', { status: 'skipped', results: [attempt('skipped')] })
  const v = verdictOf(report(specs))
  assert.equal(v.ok, false)
  assert.equal(v.executed, 12)
  assert.equal(v.failures[0].title, 'SCRUM-7-AC-18: skipped one')
})

test('SCRUM-9-AC-07: a critical test that never ran (dependency failed) blocks', () => {
  const specs = criticals(13)
  specs[12] = spec('SCRUM-7-AC-18: never ran', { status: 'skipped', results: [] })
  assert.equal(verdictOf(report(specs)).ok, false)
})

test('SCRUM-9-AC-07: an interrupted or timed-out critical test blocks', () => {
  for (const last of ['interrupted', 'timedOut']) {
    const specs = criticals(12)
    specs[5] = spec(`SCRUM-7-AC-18: ${last}`, { status: 'unexpected', results: [attempt('failed'), attempt(last, 1)] })
    const v = verdictOf(report(specs))
    assert.equal(v.ok, false, last)
    assert.equal(v.failures[0].lastResult, last)
  }
})

test('SCRUM-9-AC-07: fewer critical tests than --min blocks', () => {
  const v = verdictOf(report(criticals(11)))
  assert.equal(v.ok, false)
  assert.match(v.reason, /only 11 @critical tests executed \(min 12\)/)
  const r = runCli(report(criticals(11)))
  assert.equal(r.status, 1)
})

test('SCRUM-9-AC-07: no critical tests at all blocks', () => {
  const v = criticalVerdict(collectTests(report([spec('x', { tags: [] })])), { min: 1 })
  assert.equal(v.ok, false)
  assert.equal(v.executed, 0)
  assert.match(v.reason, /only 0 @critical tests executed \(min 1\)/)
  // min below 1 is raised to 1: "at least one executed" always holds
  assert.equal(criticalVerdict([], { min: 0 }).ok, false)
})

test('SCRUM-9-AC-07: tags are matched without the @ prefix as written by the JSON reporter', () => {
  const tests = collectTests(report(criticals(12, { tags: ['dev-smoke', 'critical'] })))
  assert.equal(criticalVerdict(tests, { tag: 'critical', min: 12 }).ok, true)
  assert.equal(criticalVerdict(tests, { tag: '@critical', min: 12 }).ok, true)
  assert.equal(criticalVerdict(tests, { tag: 'dev-smoke', min: 12 }).ok, true)
  assert.equal(criticalVerdict(tests, { tag: 'critica', min: 1 }).ok, false)
})

test('SCRUM-9-AC-07: nested describe suites are walked', () => {
  const tests = collectTests(report(criticals(12), { nested: true }))
  assert.equal(tests.length, 12)
  assert.deepEqual(tests[0].path, ['outer', 'inner'])
  assert.equal(criticalVerdict(tests, { min: 12 }).ok, true)
})

test('SCRUM-9-AC-09: a critical test that passed on retry passes the guard and is reported flaky', () => {
  const specs = criticals(12)
  specs[7] = spec('SCRUM-7-AC-18: wobbly', { status: 'flaky', results: [attempt('failed'), attempt('passed', 1)] })
  const tests = collectTests(report(specs))
  assert.equal(criticalVerdict(tests, { min: 12 }).ok, true)
  assert.deepEqual(flakyTests(tests).map((t) => t.title), ['SCRUM-7-AC-18: wobbly'])
  assert.equal(flakyTests(tests)[0].retries, 1)
  const r = runCli(report(specs))
  assert.equal(r.status, 0)
  assert.match(r.stdout, /::warning::SCRUM-9-AC-09: flaky \(passed on retry\): \[ui\] SCRUM-7-AC-18: wobbly/)
})

test('SCRUM-9-AC-07: missing or unparsable results fail closed (exit 2)', () => {
  for (const [label, content] of [
    ['missing', undefined],
    ['unparsable', '{ not json'],
    ['no suites', { stats: {} }],
    ['no stats', { suites: [] }],
  ]) {
    const r = runCli(content)
    assert.equal(r.status, 2, `${label}: ${r.stdout}`)
    assert.match(r.stdout, /::error::SCRUM-9-AC-07:/, label)
  }
  const bad = runCli(report(criticals(12)), ['--min', 'zero'])
  assert.equal(bad.status, 2)
})

test('SCRUM-9-AC-13: markdown summary lists counts and flaky names', () => {
  const specs = criticals(12)
  specs[1] = spec('SCRUM-7-AC-18: wobbly | pipe', { status: 'flaky', results: [attempt('failed'), attempt('passed', 1)] })
  const r = report(specs, { stats: { expected: 18, unexpected: 0, flaky: 1, skipped: 0, duration: 74_200 } })
  const tests = collectTests(r)
  const md = renderMarkdown(criticalVerdict(tests, { min: 12 }), flakyTests(tests), suiteStats(r))
  assert.match(md, /### Pre-release e2e — critical To-Do workflows \(SCRUM-9-AC-07\)/)
  assert.match(md, /\*\*PASS\*\* — 12 @critical tests executed, 12 passed \(min 12\) · suite: 18 passed, 0 failed, 1 flaky, 0 skipped, 74\.2 s/)
  assert.match(md, /- \[ui\] SCRUM-7-AC-18: wobbly \\\| pipe/)
  const blocked = renderMarkdown(criticalVerdict(collectTests(report(criticals(3))), { min: 12 }), [], suiteStats(r))
  assert.match(blocked, /\*\*BLOCKED\*\*/)
  assert.match(blocked, /\*\*Flaky \(passed on retry, SCRUM-9-AC-09\):\*\* none/)
})
