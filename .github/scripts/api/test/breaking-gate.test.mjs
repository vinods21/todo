// SCRUM-12-AC-08, AC-09, AC-13 (design §7.5): breaking-gate.mjs against oasdiff 1.39.0 output captured from real runs
// (fixtures/oasdiff-*.json: removing TaskResponse.dueDate; a type change + a newly required parameter; additive-only).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseAck } from '../breaking-gate.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', 'breaking-gate.mjs')
const fixture = (name) => join(here, 'fixtures', name)
const removedDueDate = JSON.parse(readFileSync(fixture('oasdiff-removed-duedate.json'), 'utf8'))

const HEADER = '# SCRUM-12 test ack file\n# comment lines and blank lines are ignored\n\n'
const JUSTIFICATION = 'due dates moved elsewhere; the only client is updated in the same PR'

function ackFor(key, changes) {
  return changes.map((c) => `${key} ${c.operation} ${c.path} ${c.text} -- ${JUSTIFICATION}`).join('\n')
}

function run({ ack = HEADER, changes, key = 'SCRUM-15', extra = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'breaking-gate-'))
  const ackFile = join(dir, 'breaking-changes.ack')
  const summary = join(dir, 'summary.md')
  const out = join(dir, 'verdict.json')
  writeFileSync(ackFile, ack)
  writeFileSync(summary, '')
  const args = [cli, '--ack', ackFile, '--jira-key', key, '--summary', summary]
  if (changes !== undefined) {
    const changesFile = join(dir, 'changes.json')
    writeFileSync(changesFile, typeof changes === 'string' ? changes : JSON.stringify(changes))
    args.push('--base', 'abc1234', '--changes', changesFile, '--changelog', fixture('oasdiff-removed-duedate.md'), '--out', out)
  }
  args.push(...extra)
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  let verdict = null
  try {
    verdict = JSON.parse(readFileSync(out, 'utf8'))
  } catch {
    verdict = null
  }
  return { status: r.status, log: r.stdout + r.stderr, summary: readFileSync(summary, 'utf8'), verdict }
}

test('SCRUM-12-AC-08: no changes → PASS', () => {
  const r = run({ changes: [] })
  assert.equal(r.status, 0, r.log)
  assert.equal(r.verdict.verdict, 'PASS')
  assert.match(r.summary, /No changes to `api\/openapi.yaml`/)
})

test('SCRUM-12-AC-08: only non-breaking (info/warn) changes → PASS, listed in the summary', () => {
  const changes = JSON.parse(readFileSync(fixture('oasdiff-nonbreaking.json'), 'utf8'))
  const r = run({ changes })
  assert.equal(r.status, 0, r.log)
  assert.equal(r.verdict.breaking, 0)
  assert.match(r.summary, /\| INFO \| new-optional-request-parameter \| GET \/api\/tasks \|/)
  assert.match(r.summary, /response-optional-property-added/)
  assert.equal((r.summary.match(/^\| INFO \|/gm) ?? []).length, changes.length)
})

test('SCRUM-12-AC-08, SCRUM-12-AC-13: unacknowledged breaking change → BLOCKED with the line to add', () => {
  const r = run({ changes: removedDueDate })
  assert.equal(r.status, 1, r.log)
  assert.equal(r.verdict.verdict, 'BLOCKED')
  assert.equal(r.verdict.unacknowledged.length, 5)
  const getTask = removedDueDate.find((c) => c.operationId === 'getTask')
  const line = `SCRUM-15 GET /api/tasks/{id} ${getTask.text} -- <why this break is acceptable>`
  assert.ok(r.log.includes(`::error title=Unacknowledged breaking API change::SCRUM-12-AC-08: [response-required-property-removed] GET /api/tasks/{id}`), r.log)
  assert.ok(r.log.includes(`ack line: ${line}`), r.log)
  assert.match(r.summary, /\*\*not acknowledged\*\*/)
  assert.match(r.summary, /<details><summary>oasdiff changelog<\/summary>/)
})

test('SCRUM-12-AC-08: a type change and a newly required parameter are breaking', () => {
  const changes = JSON.parse(readFileSync(fixture('oasdiff-mixed.json'), 'utf8'))
  const r = run({ changes })
  assert.equal(r.status, 1, r.log)
  const ids = new Set(r.verdict.unacknowledged.map((c) => c.id))
  assert.deepEqual([...ids].sort(), ['request-parameter-became-required', 'response-property-type-changed'])
})

test('SCRUM-12-AC-09: all breaking changes acknowledged by the branch\'s key → PASS', () => {
  const r = run({ ack: HEADER + ackFor('SCRUM-15', removedDueDate), changes: removedDueDate })
  assert.equal(r.status, 0, r.log)
  assert.equal(r.verdict.acknowledged, 5)
  assert.match(r.summary, /SCRUM-15 \(ack line 4\)/)
  assert.doesNotMatch(r.log, /::warning/)
})

test('SCRUM-12-AC-09: entry with another story\'s key does not acknowledge on a feature branch', () => {
  const r = run({ ack: HEADER + ackFor('SCRUM-14', removedDueDate), changes: removedDueDate, key: 'SCRUM-15' })
  assert.equal(r.status, 1, r.log)
  assert.match(r.log, /::warning file=.*line=4::SCRUM-12-AC-09: entry of SCRUM-14 does not acknowledge on SCRUM-15/)
})

test('SCRUM-12-AC-09: on main any key acknowledges', () => {
  const r = run({ ack: HEADER + ackFor('SCRUM-14', removedDueDate), changes: removedDueDate, key: 'main' })
  assert.equal(r.status, 0, r.log)
  assert.equal(r.verdict.acknowledged, 5)
})

test('SCRUM-12-AC-09: partial text / other path / other method does not acknowledge', () => {
  const [first, ...rest] = removedDueDate
  const others = ackFor('SCRUM-15', rest)
  const variants = [
    `SCRUM-15 ${first.operation} ${first.path} removed the required property -- ${JUSTIFICATION}`,
    `SCRUM-15 ${first.operation} /api/other ${first.text} -- ${JUSTIFICATION}`,
    `SCRUM-15 DELETE ${first.path} ${first.text} -- ${JUSTIFICATION}`,
  ]
  for (const variant of variants) {
    const r = run({ ack: `${HEADER}${others}\n${variant}\n`, changes: removedDueDate })
    assert.equal(r.status, 1, `${variant}\n${r.log}`)
    assert.equal(r.verdict.unacknowledged.length, 1, variant)
    assert.match(r.log, /::warning file=.*SCRUM-12-AC-09: acknowledgment matches no breaking change/, variant)
  }
})

test('SCRUM-12-AC-09: malformed entry (no justification, bad method, no key) → ERROR with line number', () => {
  const c = removedDueDate[0]
  const malformed = [
    `SCRUM-15 ${c.operation} ${c.path} ${c.text}`,
    `SCRUM-15 ${c.operation} ${c.path} ${c.text} -- short`,
    `SCRUM-15 FETCH ${c.path} ${c.text} -- ${JUSTIFICATION}`,
    `${c.operation} ${c.path} ${c.text} -- ${JUSTIFICATION}`,
    `ANY -- ${JUSTIFICATION}`,
  ]
  for (const line of malformed) {
    const r = run({ ack: `${HEADER}${line}\n`, changes: removedDueDate })
    assert.equal(r.status, 2, `${line}\n${r.log}`)
    assert.match(r.log, /::error file=.*::SCRUM-12-AC-09: malformed acknowledgment, line 4: /, line)
    assert.match(r.summary, /\*\*ERROR\*\*/)
  }
  // also with --no-base: the format is checked even when there is nothing to compare
  const r = run({ ack: `${HEADER}${malformed[0]}\n`, extra: ['--no-base'] })
  assert.equal(r.status, 2, r.log)
})

test('SCRUM-12-AC-09: unused entry → warning, verdict unchanged', () => {
  const ack = `${HEADER}SCRUM-15 GET /api/tasks removed the required property \`nope\` from the response with the \`200\` status -- ${JUSTIFICATION}\n`
  const r = run({ ack, changes: [] })
  assert.equal(r.status, 0, r.log)
  assert.match(r.log, /::warning file=.*line=4::SCRUM-12-AC-09: acknowledgment matches no breaking change against abc1234/)
  assert.deepEqual(r.verdict.unusedEntries, [{ line: 4, key: 'SCRUM-15' }])
})

test('SCRUM-12-AC-08: --no-base → PASS with notice', () => {
  const r = run({ extra: ['--no-base'] })
  assert.equal(r.status, 0, r.log)
  assert.match(r.log, /::notice::SCRUM-12-AC-08: no base document/)
  assert.match(r.summary, /first introduction/)
})

test('SCRUM-12-AC-08: missing/unparsable changes file → ERROR', () => {
  assert.equal(run({ changes: 'not json' }).status, 2)
  assert.equal(run({ changes: '{"not":"an array"}' }).status, 2)
  assert.equal(run({ changes: '[{"id":"x"}]' }).status, 2)
  const r = run({}) // neither --changes nor --no-base
  assert.equal(r.status, 2, r.log)
  assert.match(r.log, /--changes <oasdiff changelog json> is required/)
})

test('SCRUM-12-AC-09: the committed api/breaking-changes.ack is well-formed', () => {
  const text = readFileSync(join(here, '..', '..', '..', '..', 'api', 'breaking-changes.ack'), 'utf8')
  const { errors } = parseAck(text)
  assert.deepEqual(errors, [])
})
