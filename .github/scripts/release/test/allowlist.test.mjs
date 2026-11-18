// SCRUM-8-AC-22 (design §8.5): allow-list validation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AllowlistError, parseAllowlist, validateAllowlist } from '../lib/allowlist.mjs'

const TODAY = '2026-11-18'
const valid = () => ({
  id: 'CVE-2026-11111',
  type: 'vulnerability',
  package: 'org.example:vulnerable-lib',
  targets: ['backend-runtime', 'backend-image'],
  justification: 'Not reachable: the vulnerable parser is never invoked by the application.',
  owner: 'SCRUM-8',
  added: '2026-11-18',
  expires: '2027-02-16',
})
const check = (entry, today = TODAY) => validateAllowlist({ version: 1, entries: [entry] }, today)
const reasonsOf = (entry, today) => check(entry, today).invalid[0]?.reasons ?? []

test('SCRUM-8-AC-22: a complete entry with expiry ≤ 90 days is valid', () => {
  const r = check(valid())
  assert.equal(r.valid.length, 1)
  assert.equal(r.invalid.length, 0)
})

for (const field of ['id', 'type', 'package', 'targets', 'justification', 'owner', 'added', 'expires']) {
  test(`SCRUM-8-AC-22: missing ${field} → invalid`, () => {
    const e = valid()
    delete e[field]
    assert.ok(reasonsOf(e).includes(`missing ${field}`), reasonsOf(e).join())
  })
}

test('SCRUM-8-AC-22: id must be CVE-/GHSA- (secret:<rule> only for type secret)', () => {
  assert.ok(reasonsOf({ ...valid(), id: 'RHSA-2026:1' }).includes('id not CVE-/GHSA-'))
  assert.ok(reasonsOf({ ...valid(), id: 'secret:aws-access-key-id' }).includes('id not CVE-/GHSA-'))
  assert.equal(check({ ...valid(), id: 'GHSA-jfh8-c2jp-5v3q' }).valid.length, 1)
  assert.equal(check({ ...valid(), type: 'secret', id: 'secret:aws-access-key-id', package: '/app/x.properties', targets: ['backend-image'] }).valid.length, 1)
  assert.ok(reasonsOf({ ...valid(), type: 'secret' }).some((r) => /secret:<rule-id>/.test(r)))
})

test('SCRUM-8-AC-22: type must be vulnerability or secret', () => {
  assert.ok(reasonsOf({ ...valid(), type: 'license' }).includes('type not vulnerability|secret'))
})

test('SCRUM-8-AC-22: wildcard package → invalid (no global wildcards)', () => {
  assert.ok(reasonsOf({ ...valid(), package: 'org.example:*' }).includes('wildcard in package'))
  assert.ok(reasonsOf({ ...valid(), package: '*' }).includes('wildcard in package'))
})

test('SCRUM-8-AC-22: unknown or empty targets → invalid', () => {
  assert.ok(reasonsOf({ ...valid(), targets: ['backend-all-scopes'] }).includes('unknown target backend-all-scopes'))
  assert.ok(reasonsOf({ ...valid(), targets: [] }).includes('targets empty'))
  assert.ok(reasonsOf({ ...valid(), targets: ['*'] }).some((r) => /wildcard/.test(r)))
})

test('SCRUM-8-AC-22: justification shorter than 20 characters → invalid', () => {
  assert.ok(reasonsOf({ ...valid(), justification: 'not reachable' }).includes('justification shorter than 20 characters'))
})

test('SCRUM-8-AC-22: owner must be a Jira key or GitHub login', () => {
  assert.ok(reasonsOf({ ...valid(), owner: 'the security team' }).includes('owner not a Jira key or GitHub login'))
  assert.equal(check({ ...valid(), owner: '@vinods21' }).valid.length, 1)
  assert.equal(check({ ...valid(), owner: 'vinods21' }).valid.length, 1)
})

test('SCRUM-8-AC-22: expiry more than 90 days after added → invalid', () => {
  assert.ok(reasonsOf({ ...valid(), expires: '2027-02-17' }).includes('expiry more than 90 days after added'))
  assert.equal(check({ ...valid(), expires: '2027-02-16' }).valid.length, 1) // exactly 90 days
})

test('SCRUM-8-AC-22: expires before added → invalid', () => {
  assert.ok(reasonsOf({ ...valid(), added: '2026-11-10', expires: '2026-11-01' }).includes('expires before added'))
})

test('SCRUM-8-AC-22: added in the future → invalid', () => {
  assert.ok(reasonsOf({ ...valid(), added: '2026-11-19', expires: '2026-12-01' }).includes('added in the future'))
})

test('SCRUM-8-AC-22: expired yesterday → invalid; expires today → still valid (UTC, inclusive)', () => {
  const e = { ...valid(), added: '2026-10-01', expires: '2026-11-17' }
  assert.ok(reasonsOf(e).includes('expired on 2026-11-17'))
  assert.equal(check({ ...e, expires: '2026-11-18' }).valid.length, 1)
})

test('SCRUM-8-AC-22: malformed dates → invalid', () => {
  assert.ok(reasonsOf({ ...valid(), added: '18.11.2026' }).includes('added not YYYY-MM-DD'))
  assert.ok(reasonsOf({ ...valid(), expires: '2026-02-30' }).includes('expires not YYYY-MM-DD'))
})

test('SCRUM-8-AC-22: unknown extra fields only warn', () => {
  const r = check({ ...valid(), ticket: 'x' })
  assert.equal(r.valid.length, 1)
  assert.match(r.warnings[0].warnings.join(), /unknown field ticket/)
})

test('SCRUM-8-AC-22: unparsable file or wrong version → error', () => {
  assert.throws(() => parseAllowlist('{ not json'), AllowlistError)
  assert.throws(() => parseAllowlist('{"version": 2, "entries": []}'), AllowlistError)
  assert.throws(() => parseAllowlist('{"version": 1}'), AllowlistError)
})

test('SCRUM-8-AC-22: the committed allow-list parses and every entry is well-formed (expiry is the gate\'s business)', () => {
  const file = fileURLToPath(new URL('../../../security/vulnerability-allowlist.json', import.meta.url))
  const doc = parseAllowlist(readFileSync(file, 'utf8'))
  // Evaluated on each entry's own "added" day so the result does not depend on the clock (NFR-08).
  for (const entry of doc.entries) {
    const r = validateAllowlist({ version: 1, entries: [entry] }, entry.added)
    assert.deepEqual(r.invalid, [], JSON.stringify(entry))
  }
})
