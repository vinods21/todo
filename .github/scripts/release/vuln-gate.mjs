#!/usr/bin/env node
// SCRUM-8-AC-21..AC-24 (ADR 0014, design §8.4). Exit codes: 0 PASS, 1 BLOCKED, 2 ERROR (fail closed).
//   gate            --allowlist f --db trivy-version.json --today YYYY-MM-DD [--now ISO]
//                   --gated name=report.json … --reported name=report.json …
//                   [--out verdict.json] [--markdown summary.md] [--summary $GITHUB_STEP_SUMMARY]
//   check-allowlist --allowlist f --today YYYY-MM-DD [--summary f]     (exit 2 only if the file is unusable)
import { readFileSync, writeFileSync } from 'node:fs'
import { appendSummary, cell, parseArgs } from './lib/gh-output.mjs'
import { AllowlistError, parseAllowlist, validateAllowlist } from './lib/allowlist.mjs'
import { evaluateGate, exitCodeFor, renderGateMarkdown, EXIT } from './lib/gate.mjs'

const [command, ...rest] = process.argv.slice(2)
let args
try {
  args = parseArgs(rest, { multi: ['gated', 'reported'] })
} catch (e) {
  console.log(`::error::${e.message}`)
  process.exit(EXIT.ERROR)
}
const today = args.today ?? new Date().toISOString().slice(0, 10)

function loadAllowlist() {
  if (!args.allowlist) return { allowlist: null, error: '--allowlist is required' }
  let text
  try {
    text = readFileSync(args.allowlist, 'utf8')
  } catch (e) {
    return { allowlist: null, error: `allow-list ${args.allowlist} unreadable: ${e.message}` }
  }
  try {
    return { allowlist: validateAllowlist(parseAllowlist(text), today), error: null }
  } catch (e) {
    if (e instanceof AllowlistError) return { allowlist: null, error: e.message }
    throw e
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function allowlistMarkdown(al) {
  const out = ['### Allow-list check (SCRUM-8-AC-22)', '']
  if (al.valid.length + al.invalid.length === 0) out.push('No entries (file is valid).')
  else {
    out.push('| id | package | targets | owner | added | expires | state |', '|---|---|---|---|---|---|---|')
    for (const e of al.valid) out.push(`| ${cell(e.id)} | ${cell(e.package)} | ${cell(e.targets.join(', '))} | ${cell(e.owner)} | ${cell(e.added)} | ${cell(e.expires)} | valid |`)
    for (const { entry: e, reasons } of al.invalid) {
      out.push(`| ${cell(e.id)} | ${cell(e.package)} | ${cell(Array.isArray(e.targets) ? e.targets.join(', ') : '')} | ${cell(e.owner)} | ${cell(e.added)} | ${cell(e.expires)} | **INVALID**: ${cell(reasons.join('; '))} |`)
    }
  }
  for (const { entry: e, warnings } of al.warnings) out.push('', `Warning (entry ${e.index}): ${warnings.join('; ')}`)
  return `${out.join('\n')}\n`
}

if (command === 'check-allowlist') {
  const { allowlist, error } = loadAllowlist()
  if (error) {
    console.log(`::error::SCRUM-8-AC-22: ${error}`)
    process.exit(EXIT.ERROR)
  }
  const md = allowlistMarkdown(allowlist)
  appendSummary(args.summary, md)
  console.log(md)
  for (const { entry, reasons } of allowlist.invalid) {
    console.log(`::warning::SCRUM-8-AC-22: allow-list entry ${entry.index} (${entry.id ?? 'no id'}) is invalid and suppresses nothing: ${reasons.join('; ')}`)
  }
  process.exit(0)
} else if (command === 'gate') {
  const { allowlist, error: allowlistError } = loadAllowlist()
  let dbMeta = null
  const preErrors = []
  if (!args.db) preErrors.push('--db (trivy version --format json) is required')
  else {
    try {
      dbMeta = readJson(args.db)
    } catch (e) {
      preErrors.push(`scanner/DB metadata ${args.db} unreadable: ${e.message}`)
    }
  }
  const targets = []
  for (const [cls, list] of [['gated', args.gated], ['reported', args.reported]]) {
    for (const spec of list) {
      const eq = spec.indexOf('=')
      const name = spec.slice(0, eq)
      const path = spec.slice(eq + 1)
      if (eq <= 0 || !path) {
        preErrors.push(`bad target spec ${spec} (name=path)`)
        continue
      }
      try {
        targets.push({ name, class: cls, report: readJson(path) })
      } catch (e) {
        targets.push({ name, class: cls, error: `report ${path} missing or unparsable: ${e.message}` })
      }
    }
  }
  if (!targets.some((t) => t.class === 'gated')) preErrors.push('no --gated target given')
  const now = args.now ? new Date(args.now) : new Date()
  const result = evaluateGate({ targets, dbMeta, allowlist, allowlistError, now, today })
  if (preErrors.length) {
    result.errors.unshift(...preErrors)
    result.verdict = 'ERROR'
  }
  const md = renderGateMarkdown(result)
  if (args.out) writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`)
  if (args.markdown) writeFileSync(args.markdown, md)
  appendSummary(args.summary, md)
  console.log(md)
  for (const f of result.blocking) {
    console.log(`::error::SCRUM-8-AC-21 blocking: ${f.severity} ${f.id} in ${f.pkg} ${f.installed} (fixed: ${f.fixed || 'n/a'}) [${f.targets.join(', ')}]`)
  }
  for (const e of result.errors) console.log(`::error::SCRUM-8-AC-21 gate error (fail closed): ${e}`)
  // SCRUM-11-AC-08 (ADR 0016): annotate fixable MEDIUM/UNKNOWN (at most 10 + one summary line); never blocking.
  const fmu = result.fixableMediumUnknown ?? []
  for (const f of fmu.slice(0, 10)) {
    console.log(`::warning::SCRUM-11 (ADR 0016) fixable ${f.severity} ${f.id} in ${f.pkg} ${f.installed} → ${f.fixed} [${f.targets.join(', ')}]`)
  }
  if (fmu.length) {
    console.log(`::warning::SCRUM-11: ${fmu.length} fixable MEDIUM/UNKNOWN finding(s) in shipped components — not blocking; triage within 5 working days (ADR 0016)`)
  }
  console.log(`Gate verdict: ${result.verdict}`)
  process.exit(exitCodeFor(result.verdict))
} else {
  console.log('::error::usage: vuln-gate.mjs gate|check-allowlist …')
  process.exit(EXIT.ERROR)
}
