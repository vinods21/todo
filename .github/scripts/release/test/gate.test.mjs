// SCRUM-8-AC-21, AC-23, AC-24 (design §8.4): the gate blocks, passes with a valid exception, fails closed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { evaluateGate, renderGateMarkdown } from '../lib/gate.mjs'
import { validateAllowlist } from '../lib/allowlist.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fx = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'))
const NOW = new Date('2026-11-18T12:00:00Z')
const TODAY = '2026-11-18'
const DB = fx('trivy-version.json')
const entry = (over = {}) => ({
  id: 'CVE-2026-11111',
  type: 'vulnerability',
  package: 'org.example:vulnerable-lib',
  targets: ['backend-runtime'],
  justification: 'Not reachable: the vulnerable parser is never invoked by the application.',
  owner: 'SCRUM-8',
  added: '2026-11-18',
  expires: '2027-01-31',
  ...over,
})
const allow = (...entries) => validateAllowlist({ version: 1, entries }, TODAY)
const gated = (name, report) => ({ name, class: 'gated', report })
const reported = (name, report) => ({ name, class: 'reported', report })
const clean = () => gated('frontend-image', fx('trivy-clean.json'))
function gate({ targets, allowlist = allow(), dbMeta = DB, now = NOW, allowlistError } = {}) {
  return evaluateGate({ targets, dbMeta, allowlist, allowlistError, now, today: TODAY })
}
function withSeverity(severity) {
  const r = fx('trivy-fixable-high.json')
  r.Results[0].Vulnerabilities[0].Severity = severity
  return r
}

test('SCRUM-8-AC-24 (a), SCRUM-8-AC-21: fixable HIGH in a gated target → BLOCKED', () => {
  const r = gate({ targets: [gated('backend-runtime', fx('trivy-fixable-high.json')), clean()] })
  assert.equal(r.verdict, 'BLOCKED')
  assert.deepEqual(r.blocking.map((f) => f.id), ['CVE-2026-11111'])
  assert.equal(r.blocking[0].fixed, '1.0.1')
})

test('SCRUM-8-AC-24 (a), SCRUM-8-AC-21: fixable CRITICAL in a gated target → BLOCKED', () => {
  assert.equal(gate({ targets: [gated('backend-image', withSeverity('CRITICAL'))] }).verdict, 'BLOCKED')
})

test('SCRUM-8-AC-21: fixable (FixedVersion present, Status missing) counts as fixable', () => {
  const r = fx('trivy-fixable-high.json')
  delete r.Results[0].Vulnerabilities[0].Status
  assert.equal(gate({ targets: [gated('backend-runtime', r)] }).verdict, 'BLOCKED')
})

test('SCRUM-8-AC-24 (b), SCRUM-8-AC-22: the same finding with a valid allow-list entry → PASS and listed as suppressed', () => {
  const r = gate({ targets: [gated('backend-runtime', fx('trivy-fixable-high.json'))], allowlist: allow(entry()) })
  assert.equal(r.verdict, 'PASS')
  assert.equal(r.suppressed.length, 1)
  assert.equal(r.suppressed[0].entry.id, 'CVE-2026-11111')
  assert.equal(r.allowlist.unused.length, 0)
})

test('SCRUM-8-AC-24 (c), SCRUM-8-AC-22: with an expired entry → BLOCKED and the entry is reported invalid', () => {
  const r = gate({
    targets: [gated('backend-runtime', fx('trivy-fixable-high.json'))],
    allowlist: allow(entry({ added: '2026-08-01', expires: '2026-11-17' })),
  })
  assert.equal(r.verdict, 'BLOCKED')
  assert.equal(r.allowlist.invalid.length, 1)
  assert.match(r.allowlist.invalid[0].reasons.join(), /expired on 2026-11-17/)
})

test('SCRUM-8-AC-22: an entry for another target or another package does not suppress → BLOCKED', () => {
  assert.equal(gate({ targets: [gated('backend-runtime', fx('trivy-fixable-high.json'))], allowlist: allow(entry({ targets: ['backend-image'] })) }).verdict, 'BLOCKED')
  assert.equal(gate({ targets: [gated('backend-runtime', fx('trivy-fixable-high.json'))], allowlist: allow(entry({ package: 'org.example:other' })) }).verdict, 'BLOCKED')
})

test('SCRUM-8-AC-24 (d): missing report → ERROR (fail closed)', () => {
  const r = gate({ targets: [{ name: 'backend-runtime', class: 'gated', error: 'report scan/backend-runtime.json missing' }] })
  assert.equal(r.verdict, 'ERROR')
})

test('SCRUM-8-AC-24 (d): SchemaVersion 1 or no ArtifactName → ERROR', () => {
  assert.equal(gate({ targets: [gated('backend-runtime', { ...fx('trivy-clean.json'), SchemaVersion: 1 })] }).verdict, 'ERROR')
  const noName = fx('trivy-clean.json')
  delete noName.ArtifactName
  assert.equal(gate({ targets: [gated('backend-runtime', noName)] }).verdict, 'ERROR')
  assert.equal(gate({ targets: [gated('backend-runtime', null)] }).verdict, 'ERROR')
})

test('SCRUM-8-AC-24 (d): missing DB metadata → ERROR', () => {
  assert.equal(gate({ targets: [clean()], dbMeta: null }).verdict, 'ERROR')
  assert.equal(gate({ targets: [clean()], dbMeta: { Version: '0.76.2' } }).verdict, 'ERROR')
})

test('SCRUM-8-AC-24 (d), SCRUM-8-AC-21: DB UpdatedAt 4 days old → ERROR; 71 h → PASS', () => {
  const old = { ...DB, VulnerabilityDB: { ...DB.VulnerabilityDB, UpdatedAt: '2026-11-14T12:00:00Z' } }
  const r = gate({ targets: [clean()], dbMeta: old })
  assert.equal(r.verdict, 'ERROR')
  assert.match(r.errors.join(), /h old/)
  const recent = { ...DB, VulnerabilityDB: { ...DB.VulnerabilityDB, UpdatedAt: '2026-11-15T13:00:00Z' } }
  assert.equal(gate({ targets: [clean()], dbMeta: recent }).verdict, 'PASS')
})

test('SCRUM-8-AC-24 (d): unusable allow-list → ERROR', () => {
  assert.equal(gate({ targets: [clean()], allowlist: null, allowlistError: 'allow-list is not valid JSON' }).verdict, 'ERROR')
})

test('SCRUM-8-AC-21: unfixed CRITICAL → PASS but listed individually', () => {
  const r = fx('trivy-fixable-high.json')
  r.Results[0].Vulnerabilities.splice(0, 1) // drop the fixable HIGH
  const g = gate({ targets: [gated('backend-runtime', r)] })
  assert.equal(g.verdict, 'PASS')
  assert.deepEqual(g.unfixedCriticalHigh.map((f) => f.id), ['CVE-2026-22222'])
})

test('SCRUM-8-AC-21: fixable MEDIUM → PASS (counted)', () => {
  const g = gate({ targets: [gated('backend-runtime', withSeverity('MEDIUM'))] })
  assert.equal(g.verdict, 'PASS')
  assert.equal(g.targets['backend-runtime'].counts.MEDIUM, 2)
})

test('SCRUM-8-AC-21: fixable HIGH only in a reported (test/dev) target → PASS but reported', () => {
  const g = gate({ targets: [clean(), reported('backend-all-scopes', fx('trivy-fixable-high.json'))] })
  assert.equal(g.verdict, 'PASS')
  assert.ok(g.reportedOnly.some((f) => f.id === 'CVE-2026-11111'))
})

test('SCRUM-8-AC-21: a finding in both gated and reported targets is not "reported only"', () => {
  const g = gate({ targets: [gated('backend-runtime', fx('trivy-fixable-high.json')), reported('backend-all-scopes', fx('trivy-fixable-high.json'))] })
  assert.equal(g.reportedOnly.length, 0)
  assert.equal(g.blocking.length, 1)
})

test('SCRUM-8-AC-21: a secret in an image → BLOCKED', () => {
  const g = gate({ targets: [gated('backend-image', fx('trivy-secret.json'))] })
  assert.equal(g.verdict, 'BLOCKED')
  assert.equal(g.blocking[0].id, 'secret:aws-access-key-id')
  assert.equal(g.targets['backend-image'].secrets, 1)
})

test('SCRUM-8-AC-22: a secret allow-listed by exact path → PASS', () => {
  const e = entry({ id: 'secret:aws-access-key-id', type: 'secret', package: '/app/config/leaked.properties', targets: ['backend-image'] })
  assert.equal(gate({ targets: [gated('backend-image', fx('trivy-secret.json'))], allowlist: allow(e) }).verdict, 'PASS')
  const wrongPath = { ...e, package: '/app/other.properties' }
  assert.equal(gate({ targets: [gated('backend-image', fx('trivy-secret.json'))], allowlist: allow(wrongPath) }).verdict, 'BLOCKED')
})

test('SCRUM-8-AC-22: an unused valid entry is reported as stale', () => {
  const g = gate({ targets: [clean()], allowlist: allow(entry()) })
  assert.equal(g.verdict, 'PASS')
  assert.equal(g.allowlist.unused.length, 1)
})

test('SCRUM-8-AC-21: duplicate findings across targets are shown once with both targets', () => {
  const g = gate({ targets: [gated('backend-runtime', fx('trivy-fixable-high.json')), gated('backend-image', fx('trivy-fixable-high.json'))] })
  assert.equal(g.blocking.length, 1)
  assert.deepEqual(g.blocking[0].targets, ['backend-runtime', 'backend-image'])
  assert.equal(g.targets['backend-image'].counts.HIGH, 1)
})

test('SCRUM-8-AC-23: markdown contains verdict, per-target counts, DB version and blocking rows', () => {
  const g = gate({ targets: [gated('backend-runtime', fx('trivy-fixable-high.json')), clean()], allowlist: allow(entry({ added: '2026-08-15', expires: '2026-11-01' })) })
  const md = renderGateMarkdown(g)
  assert.match(md, /Verdict: ❌ BLOCKED/)
  assert.match(md, /\| backend-runtime \| gated \| 1 \| 1 \| 1 \| 0 \| 0 \| 0 \|/)
  assert.match(md, /\| frontend-image \| gated \| 0 \| 0 \| 0 \| 1 \| 0 \| 0 \|/)
  assert.match(md, /UpdatedAt `2026-11-18T06:00:00Z`/)
  assert.match(md, /Trivy `0\.76\.2`/)
  assert.match(md, /\| HIGH \| CVE-2026-11111 \| org\.example:vulnerable-lib \| 1\.0\.0 \| 1\.0\.1 \|/)
  assert.match(md, /\*\*INVALID\*\* — expired on 2026-11-01/)
})

// The CLI: exit codes 0 / 1 / 2 and output files (SCRUM-8-AC-23, AC-24).
function cli(args) {
  const r = spawnSync(process.execPath, [join(here, '..', 'vuln-gate.mjs'), ...args], { encoding: 'utf8' })
  return { status: r.status, out: r.stdout + r.stderr }
}
const dir = mkdtempSync(join(tmpdir(), 'gate-'))
const emptyAllow = join(dir, 'allow-empty.json')
writeFileSync(emptyAllow, JSON.stringify({ version: 1, entries: [] }))
const validAllow = join(dir, 'allow-valid.json')
writeFileSync(validAllow, JSON.stringify({ version: 1, entries: [entry()] }))
const base = ['gate', '--db', join(here, 'fixtures', 'trivy-version.json'), '--today', TODAY, '--now', NOW.toISOString()]

test('SCRUM-8-AC-24 (a): CLI exits 1 (BLOCKED) for a fixable HIGH and annotates it', () => {
  const out = join(dir, 'verdict.json')
  const r = cli([...base, '--allowlist', emptyAllow, '--gated', `backend-runtime=${join(here, 'fixtures', 'trivy-fixable-high.json')}`, '--out', out])
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /::error::SCRUM-8-AC-21 blocking: HIGH CVE-2026-11111/)
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).verdict, 'BLOCKED')
})

test('SCRUM-8-AC-24 (b): CLI exits 0 (PASS) with a valid allow-list entry', () => {
  const r = cli([...base, '--allowlist', validAllow, '--gated', `backend-runtime=${join(here, 'fixtures', 'trivy-fixable-high.json')}`])
  assert.equal(r.status, 0, r.out)
})

test('SCRUM-8-AC-24 (d): CLI exits 2 (ERROR) for a missing report or DB metadata', () => {
  assert.equal(cli([...base, '--allowlist', emptyAllow, '--gated', `backend-runtime=${join(dir, 'nope.json')}`]).status, 2)
  const noDb = ['gate', '--db', join(dir, 'nope.json'), '--today', TODAY, '--allowlist', emptyAllow, '--gated', `frontend-image=${join(here, 'fixtures', 'trivy-clean.json')}`]
  assert.equal(cli(noDb).status, 2)
  const bad = join(dir, 'bad.json')
  writeFileSync(bad, '{ "SchemaVersion": 2, ')
  assert.equal(cli([...base, '--allowlist', emptyAllow, '--gated', `backend-runtime=${bad}`]).status, 2)
  assert.equal(cli([...base, '--allowlist', bad, '--gated', `frontend-image=${join(here, 'fixtures', 'trivy-clean.json')}`]).status, 2)
})

test('SCRUM-8-AC-22: check-allowlist exits 0 with invalid entries (warned) and 2 for an unparsable file', () => {
  const expired = join(dir, 'allow-expired.json')
  writeFileSync(expired, JSON.stringify({ version: 1, entries: [entry({ added: '2026-08-01', expires: '2026-11-01' })] }))
  const r = cli(['check-allowlist', '--allowlist', expired, '--today', TODAY])
  assert.equal(r.status, 0, r.out)
  assert.match(r.out, /::warning::SCRUM-8-AC-22/)
  const bad = join(dir, 'bad2.json')
  writeFileSync(bad, 'nope')
  assert.equal(cli(['check-allowlist', '--allowlist', bad, '--today', TODAY]).status, 2)
})

// SCRUM-11-AC-08 (ADR 0016): fixable MEDIUM/UNKNOWN in gated targets are itemised and annotated, never blocking.
const fmuIds = (r) => r.fixableMediumUnknown.map((f) => f.id)

test('SCRUM-11-AC-08: fixable MEDIUM in a gated target → PASS, listed, in the markdown table and annotated', () => {
  const r = gate({ targets: [gated('backend-image', withSeverity('MEDIUM'))] })
  assert.equal(r.verdict, 'PASS')
  assert.ok(fmuIds(r).includes('CVE-2026-11111'))
  assert.deepEqual(r.fixableMediumUnknown.find((f) => f.id === 'CVE-2026-11111').targets, ['backend-image'])
  const md = renderGateMarkdown(r)
  assert.match(md, /#### MEDIUM\/UNKNOWN with a fix — reported, not blocking; triage per ADR 0016 \(2\)/)
  assert.match(md, /\| MEDIUM \| CVE-2026-11111 \| org\.example:vulnerable-lib \| 1\.0\.0 \| 1\.0\.1 \| backend-image \|/)
  const report = join(dir, 'medium.json')
  writeFileSync(report, JSON.stringify(withSeverity('MEDIUM')))
  const c = cli([...base, '--allowlist', emptyAllow, '--gated', `backend-image=${report}`])
  assert.equal(c.status, 0, c.out)
  assert.match(c.out, /::warning::SCRUM-11 \(ADR 0016\) fixable MEDIUM CVE-2026-11111 in org\.example:vulnerable-lib 1\.0\.0 → 1\.0\.1 \[backend-image\]/)
  assert.match(c.out, /::warning::SCRUM-11: 2 fixable MEDIUM\/UNKNOWN finding\(s\) in shipped components — not blocking/)
})

test('SCRUM-11-AC-08: fixable UNKNOWN in a gated target → PASS and listed', () => {
  const r = gate({ targets: [gated('backend-image', withSeverity('UNKNOWN'))] })
  assert.equal(r.verdict, 'PASS')
  assert.ok(fmuIds(r).includes('CVE-2026-11111'))
  assert.equal(r.fixableMediumUnknown.find((f) => f.id === 'CVE-2026-11111').severity, 'UNKNOWN')
})

test('SCRUM-11-AC-08: MEDIUM without a fix → not listed', () => {
  const rep = withSeverity('MEDIUM')
  delete rep.Results[0].Vulnerabilities[0].FixedVersion
  rep.Results[0].Vulnerabilities[0].Status = 'affected'
  const r = gate({ targets: [gated('backend-image', rep)] })
  assert.equal(r.verdict, 'PASS')
  assert.ok(!fmuIds(r).includes('CVE-2026-11111'))
  assert.equal(r.targets['backend-image'].counts.MEDIUM, 2)
})

test('SCRUM-11-AC-08: fixable MEDIUM only in a reported target → not listed', () => {
  const r = gate({ targets: [reported('backend-all-scopes', withSeverity('MEDIUM')), clean()] })
  assert.equal(r.verdict, 'PASS')
  assert.deepEqual(r.fixableMediumUnknown, [])
  assert.match(renderGateMarkdown(r), /triage per ADR 0016 \(0\)\n\nNone\./)
})

test('SCRUM-11-AC-08: fixable HIGH still BLOCKED and not in the MEDIUM/UNKNOWN list', () => {
  const r = gate({ targets: [gated('backend-runtime', fx('trivy-fixable-high.json'))] })
  assert.equal(r.verdict, 'BLOCKED')
  assert.deepEqual(r.blocking.map((f) => f.id), ['CVE-2026-11111'])
  assert.ok(!fmuIds(r).includes('CVE-2026-11111'))
  assert.ok(r.fixableMediumUnknown.every((f) => f.severity === 'MEDIUM' || f.severity === 'UNKNOWN'))
})
