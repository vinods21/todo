// SCRUM-8-AC-19..AC-24 (ADR 0014, design §8.4): the repository-owned vulnerability gate.
// Pure functions over parsed Trivy JSON reports (SchemaVersion 2), DB metadata and the allow-list.
import { cell } from './gh-output.mjs'

export const SEVERITIES = Object.freeze(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'])
export const MAX_DB_AGE_HOURS = 72
export const VERDICT = Object.freeze({ PASS: 'PASS', BLOCKED: 'BLOCKED', ERROR: 'ERROR' })
export const EXIT = Object.freeze({ PASS: 0, BLOCKED: 1, ERROR: 2 })

/** Validates `trivy version --format json` output; returns { meta, error }. */
export function checkDbMeta(meta, now) {
  if (!meta || typeof meta !== 'object') return { error: 'scanner/DB metadata missing (trivy version --format json)' }
  const db = meta.VulnerabilityDB
  if (!db || !db.UpdatedAt) return { error: 'vulnerability DB metadata missing (VulnerabilityDB.UpdatedAt) — DB not downloaded?' }
  const updated = new Date(db.UpdatedAt)
  if (Number.isNaN(updated.getTime())) return { error: `vulnerability DB UpdatedAt unparsable: ${db.UpdatedAt}` }
  const ageHours = (now.getTime() - updated.getTime()) / 3_600_000
  if (ageHours > MAX_DB_AGE_HOURS) {
    return { error: `vulnerability DB is ${ageHours.toFixed(1)} h old (UpdatedAt ${db.UpdatedAt}; limit ${MAX_DB_AGE_HOURS} h)` }
  }
  return { error: null, ageHours }
}

/** One Trivy report → findings; throws Error with a clear message for anything that is not a usable report. */
export function normalizeReport(target, cls, report) {
  if (!report || typeof report !== 'object') throw new Error(`${target}: report is not a JSON object`)
  if (report.SchemaVersion !== 2) throw new Error(`${target}: unsupported Trivy SchemaVersion ${report.SchemaVersion} (expected 2)`)
  if (!report.ArtifactName) throw new Error(`${target}: report has no ArtifactName`)
  const findings = []
  for (const r of report.Results ?? []) {
    for (const v of r.Vulnerabilities ?? []) {
      findings.push({
        target,
        class: cls,
        kind: 'vulnerability',
        id: v.VulnerabilityID,
        pkg: v.PkgName ?? '',
        installed: v.InstalledVersion ?? '',
        fixed: v.FixedVersion ?? '',
        status: v.Status ?? '',
        severity: SEVERITIES.includes(v.Severity) ? v.Severity : 'UNKNOWN',
        source: v.SeveritySource ?? '',
        title: v.Title ?? '',
        url: v.PrimaryURL ?? '',
        location: r.Target ?? '',
      })
    }
    for (const s of r.Secrets ?? []) {
      findings.push({
        target,
        class: cls,
        kind: 'secret',
        id: `secret:${s.RuleID}`,
        pkg: r.Target ?? '',
        installed: '',
        fixed: '',
        status: '',
        severity: SEVERITIES.includes(s.Severity) ? s.Severity : 'UNKNOWN',
        source: 'trivy-secret',
        title: s.Title ?? '',
        url: '',
        location: `${r.Target ?? ''}:${s.StartLine ?? ''}`,
      })
    }
  }
  return { artifact: report.ArtifactName, findings }
}

export const fixable = (f) => f.status === 'fixed' || String(f.fixed).trim() !== ''

export function isBlocking(f) {
  if (f.class !== 'gated') return false
  if (f.kind === 'secret') return /image$/.test(f.target)
  return (f.severity === 'CRITICAL' || f.severity === 'HIGH') && fixable(f)
}

export function suppressingEntry(f, validEntries) {
  return validEntries.find(
    (e) =>
      e.id === f.id &&
      Array.isArray(e.targets) &&
      e.targets.includes(f.target) &&
      e.package === f.pkg &&
      (e.type === 'secret') === (f.kind === 'secret'),
  )
}

const key = (f) => `${f.id}\u0000${f.pkg}\u0000${f.installed}`

function dedup(findings) {
  const map = new Map()
  for (const f of findings) {
    const k = key(f)
    const prev = map.get(k)
    if (prev) {
      if (!prev.targets.includes(f.target)) prev.targets.push(f.target)
    } else map.set(k, { ...f, targets: [f.target] })
  }
  return [...map.values()].sort(bySeverityThenId)
}

function bySeverityThenId(a, b) {
  return SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.id.localeCompare(b.id) || a.pkg.localeCompare(b.pkg)
}

/**
 * @param {{targets: {name, class, report?, error?}[], dbMeta, allowlist: {valid, invalid, warnings}|null,
 *          allowlistError?: string, now: Date, today: string}} input
 */
export function evaluateGate({ targets, dbMeta, allowlist, allowlistError = null, now, today }) {
  const errors = []
  const db = checkDbMeta(dbMeta, now)
  if (db.error) errors.push(db.error)
  if (allowlistError) errors.push(allowlistError)
  const all = []
  const perTarget = {}
  for (const t of targets) {
    const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]))
    perTarget[t.name] = { class: t.class, counts, secrets: 0, artifact: '' }
    if (t.error) {
      errors.push(`${t.name}: ${t.error}`)
      continue
    }
    try {
      const { artifact, findings } = normalizeReport(t.name, t.class, t.report)
      perTarget[t.name].artifact = artifact
      for (const f of findings) {
        if (f.kind === 'secret') perTarget[t.name].secrets += 1
        else counts[f.severity] += 1
      }
      all.push(...findings)
    } catch (e) {
      errors.push(e.message)
    }
  }
  const valid = allowlist?.valid ?? []
  const blockingAll = all.filter(isBlocking)
  const suppressed = []
  const blocking = []
  const used = new Set()
  for (const f of blockingAll) {
    const e = suppressingEntry(f, valid)
    if (e) {
      suppressed.push({ finding: f, entry: e })
      used.add(e.index)
    } else blocking.push(f)
  }
  const gatedKeys = new Set(all.filter((f) => f.class === 'gated').map(key))
  const unfixedCriticalHigh = dedup(
    all.filter((f) => f.class === 'gated' && f.kind === 'vulnerability' && ['CRITICAL', 'HIGH'].includes(f.severity) && !fixable(f)),
  )
  const reportedOnly = dedup(
    all.filter((f) => f.class === 'reported' && !gatedKeys.has(key(f)) && ['CRITICAL', 'HIGH'].includes(f.severity)),
  )
  const verdict = errors.length ? VERDICT.ERROR : blocking.length ? VERDICT.BLOCKED : VERDICT.PASS
  return {
    verdict,
    generatedAt: now.toISOString(),
    today,
    trivy: {
      version: dbMeta?.Version ?? null,
      db: dbMeta?.VulnerabilityDB ?? null,
      javaDb: dbMeta?.JavaDB ?? null,
      dbAgeHours: db.ageHours === undefined ? null : Number(db.ageHours.toFixed(1)),
    },
    targets: perTarget,
    blocking: dedup(blocking),
    suppressed: suppressed.map(({ finding, entry }) => ({ finding: { ...finding, targets: [finding.target] }, entry })),
    unfixedCriticalHigh,
    reportedOnly,
    allowlist: {
      valid: valid.map(strip),
      invalid: (allowlist?.invalid ?? []).map(({ entry, reasons }) => ({ entry: strip(entry), reasons })),
      unused: valid.filter((e) => !used.has(e.index)).map(strip),
      warnings: allowlist?.warnings ?? [],
    },
    errors,
  }
}

function strip(e) {
  const { index, ...rest } = e
  return rest
}

export const exitCodeFor = (verdict) => EXIT[verdict]

function findingRow(f) {
  return `| ${cell(f.severity)} | ${cell(f.id)} | ${cell(f.pkg)} | ${cell(f.installed)} | ${cell(f.fixed || '—')} | ${cell(f.targets?.join(', ') ?? f.target)} |`
}

/** AC-23: summary markdown (job summary, release notes input, scan report). */
export function renderGateMarkdown(result, { heading = '### Vulnerability gate (SCRUM-8-AC-21..AC-23)' } = {}) {
  const icon = { PASS: '✅ PASS', BLOCKED: '❌ BLOCKED', ERROR: '⛔ ERROR (fail closed)' }[result.verdict]
  const out = [heading, '', `**Verdict: ${icon}** · policy: fixable CRITICAL/HIGH in a shipped component or any image secret blocks (docs/release/vulnerability-policy.md)`, '']
  const db = result.trivy.db
  out.push(
    `Scanner: Trivy \`${result.trivy.version ?? 'unknown'}\` · vulnerability DB v${db?.Version ?? '?'} UpdatedAt \`${db?.UpdatedAt ?? 'unknown'}\`` +
      (result.trivy.dbAgeHours === null ? '' : ` (${result.trivy.dbAgeHours} h old)`) +
      ` · Java DB UpdatedAt \`${result.trivy.javaDb?.UpdatedAt ?? 'unknown'}\` · evaluated ${result.generatedAt}`,
    '',
  )
  out.push('| target | class | CRITICAL | HIGH | MEDIUM | LOW | UNKNOWN | secrets |', '|---|---|---|---|---|---|---|---|')
  for (const [name, t] of Object.entries(result.targets)) {
    out.push(`| ${name} | ${t.class} | ${SEVERITIES.map((s) => t.counts[s]).join(' | ')} | ${t.secrets} |`)
  }
  out.push('')
  const table = (title, rows) => {
    out.push(`#### ${title}`, '')
    if (rows.length === 0) {
      out.push('None.', '')
      return
    }
    out.push('| severity | id | package | installed | fixed | targets |', '|---|---|---|---|---|---|')
    for (const f of rows.slice(0, 100)) out.push(findingRow(f))
    if (rows.length > 100) out.push(`| … | ${rows.length - 100} more (see verdict.json) | | | | |`)
    out.push('')
  }
  table(`Blocking findings (${result.blocking.length})`, result.blocking)
  table(`CRITICAL/HIGH without a fix — reported, not blocking (${result.unfixedCriticalHigh.length})`, result.unfixedCriticalHigh)
  table(`CRITICAL/HIGH only in test/dev scope — reported (${result.reportedOnly.length})`, result.reportedOnly)
  out.push(`#### Allow-list (.github/security/vulnerability-allowlist.json)`, '')
  const al = result.allowlist
  if (al.valid.length + al.invalid.length === 0) out.push('No entries.', '')
  else {
    out.push('| id | package | targets | owner | expires | state |', '|---|---|---|---|---|---|')
    const suppressedIds = new Set(result.suppressed.map((s) => `${s.entry.id}\u0000${s.entry.package}`))
    for (const e of al.valid) {
      const state = suppressedIds.has(`${e.id}\u0000${e.package}`) ? 'applied' : 'valid, unused (stale?)'
      out.push(`| ${cell(e.id)} | ${cell(e.package)} | ${cell((e.targets ?? []).join(', '))} | ${cell(e.owner)} | ${cell(e.expires)} | ${state} |`)
    }
    for (const { entry: e, reasons } of al.invalid) {
      out.push(`| ${cell(e.id)} | ${cell(e.package)} | ${cell(Array.isArray(e.targets) ? e.targets.join(', ') : '')} | ${cell(e.owner)} | ${cell(e.expires)} | **INVALID** — ${cell(reasons.join('; '))} (suppresses nothing) |`)
    }
    out.push('')
  }
  if (result.errors.length) {
    out.push('#### Errors (gate fails closed)', '')
    for (const e of result.errors) out.push(`- ${cell(e)}`)
    out.push('')
  }
  return `${out.join('\n')}\n`
}

/** Compact one-liner per target for notes: "backend-image: 0 C / 1 H / 3 M / 5 L". */
export function countsLine(result) {
  return Object.entries(result.targets)
    .map(([n, t]) => `${n}: ${t.counts.CRITICAL} C / ${t.counts.HIGH} H / ${t.counts.MEDIUM} M / ${t.counts.LOW} L / ${t.counts.UNKNOWN} U${t.secrets ? ` / ${t.secrets} secrets` : ''}`)
    .join(' · ')
}
