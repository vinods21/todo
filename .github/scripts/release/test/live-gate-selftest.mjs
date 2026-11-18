#!/usr/bin/env node
// SCRUM-8-AC-24 (live, ADR 0014): the gate blocks a real fixable HIGH found by the same Trivy binary and DB as the real
// scan, and passes once a valid allow-list entry covers it. Runs only in the Release `scan` job (needs trivy + DB).
// The vulnerable lockfile is written to $RUNNER_TEMP at run time — never committed (no dependency-graph pollution).
// Usage: live-gate-selftest.mjs --cache-dir ~/.cache/trivy --db scan/trivy-version.json
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from '../lib/gh-output.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = parseArgs(process.argv.slice(2))
const cacheDir = args['cache-dir'] ?? join(process.env.HOME ?? '', '.cache', 'trivy')
const db = args.db
const base = process.env.RUNNER_TEMP ?? tmpdir()
mkdirSync(base, { recursive: true })
const dir = mkdtempSync(join(base, 'gate-selftest-'))
const today = new Date().toISOString().slice(0, 10)

writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'gate-selftest', version: '1.0.0', dependencies: { lodash: '4.17.15' } }, null, 2))
writeFileSync(
  join(dir, 'package-lock.json'),
  JSON.stringify(
    {
      name: 'gate-selftest',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': { name: 'gate-selftest', version: '1.0.0', dependencies: { lodash: '4.17.15' } },
        'node_modules/lodash': {
          version: '4.17.15',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.15.tgz',
          integrity: 'sha512-8xOcRHvCjnocdS5cpwXQXVzmmh5e5+saE2QGoeQmbKmRS6J3VQppPOIt0MnmE+4xlZoumy0GPG0D0MVIQbNA1A==',
        },
      },
    },
    null,
    2,
  ),
)

const report = join(dir, 'report.json')
function gate(allowlistFile) {
  const r = spawnSync(
    process.execPath,
    [join(here, '..', 'vuln-gate.mjs'), 'gate', '--allowlist', allowlistFile, '--db', db, '--today', today, '--gated', `frontend-prod=${report}`, '--out', join(dir, `verdict-${Date.now()}.json`)],
    { encoding: 'utf8' },
  )
  return { status: r.status, out: r.stdout + r.stderr }
}

test('SCRUM-8-AC-24 (live): lodash 4.17.15 lockfile → trivy fs → gate BLOCKED', () => {
  assert.ok(db, '--db is required')
  const scan = spawnSync(
    'trivy',
    ['fs', '--scanners', 'vuln', '--format', 'json', '--cache-dir', cacheDir, '--skip-db-update', '--skip-java-db-update', '--exit-code', '0', '--quiet', '--output', report, join(dir, 'package-lock.json')],
    { encoding: 'utf8' },
  )
  assert.equal(scan.status, 0, `trivy failed: ${scan.stderr}`)
  const empty = join(dir, 'allow-empty.json')
  writeFileSync(empty, JSON.stringify({ version: 1, entries: [] }))
  const r = gate(empty)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /SCRUM-8-AC-21 blocking: (HIGH|CRITICAL) \S+ in lodash 4\.17\.15/)
})

test('SCRUM-8-AC-24 (live): the same findings with valid allow-list entries → PASS', () => {
  const ids = new Set()
  for (const res of JSON.parse(readFileSync(report, 'utf8')).Results ?? []) {
    for (const v of res.Vulnerabilities ?? []) {
      if (['HIGH', 'CRITICAL'].includes(v.Severity) && (v.Status === 'fixed' || (v.FixedVersion ?? '') !== '')) ids.add(v.VulnerabilityID)
    }
  }
  assert.ok(ids.size > 0)
  const entries = [...ids].map((id) => ({
    id,
    type: 'vulnerability',
    package: 'lodash',
    targets: ['frontend-prod'],
    justification: 'Live gate self-test fixture only; never shipped (SCRUM-8-AC-24).',
    owner: 'SCRUM-8',
    added: today,
    expires: today,
  }))
  const allow = join(dir, 'allow-valid.json')
  writeFileSync(allow, JSON.stringify({ version: 1, entries }))
  const r = gate(allow)
  assert.equal(r.status, 0, r.out)
  console.log(`suppressed: ${[...ids].join(', ')}`)
})
