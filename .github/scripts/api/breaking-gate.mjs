#!/usr/bin/env node
// SCRUM-12-AC-08, AC-09 (ADR 0017, design §7.5): fails on breaking changes of api/openapi.yaml (oasdiff level 3 = ERR)
// that are not acknowledged in api/breaking-changes.ack. Node >= 22 built-ins only. Exit: 0 PASS, 1 BLOCKED, 2 ERROR.
//   breaking-gate.mjs --ack api/breaking-changes.ack --jira-key SCRUM-n|main|NONE [--summary $GITHUB_STEP_SUMMARY]
//                     ( --no-base | --base <sha> --changes changes.json [--changelog changelog.md] [--out verdict.json] )
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { appendSummary, cell, parseArgs } from '../release/lib/gh-output.mjs'

export const EXIT = { PASS: 0, BLOCKED: 1, ERROR: 2 }
const LEVELS = { 3: 'ERR', 2: 'WARN', 1: 'INFO' }
const HEAD = /^(SCRUM-\d+) (GET|PUT|POST|DELETE|OPTIONS|HEAD|PATCH|TRACE) (\/\S*) (.+)$/
const SEPARATOR = ' -- '
const MIN_JUSTIFICATION = 10

export class GateError extends Error {}

/** Parses the ack file; malformed lines are returned in `errors` (with 1-based line numbers). */
export function parseAck(text) {
  const entries = []
  const errors = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim()
    const lineNo = index + 1
    if (line === '' || line.startsWith('#')) return
    const split = line.lastIndexOf(SEPARATOR)
    if (split < 0) {
      errors.push(`line ${lineNo}: missing " -- <justification>": ${line}`)
      return
    }
    const head = line.slice(0, split)
    const justification = line.slice(split + SEPARATOR.length).trim()
    const match = HEAD.exec(head)
    if (!match) {
      errors.push(`line ${lineNo}: expected "<SCRUM-n> <METHOD> </path> <oasdiff text> -- <justification>": ${line}`)
      return
    }
    if (justification.length < MIN_JUSTIFICATION) {
      errors.push(`line ${lineNo}: justification must have at least ${MIN_JUSTIFICATION} characters: ${line}`)
      return
    }
    const [, key, method, path, changeText] = match
    entries.push({ line: lineNo, key, method, path, text: changeText, justification })
  })
  return { entries, errors }
}

/** Validates oasdiff `changelog --format json` output. */
export function parseChanges(json) {
  if (!Array.isArray(json)) throw new GateError('changes file is not a JSON array (oasdiff changelog --format json)')
  return json.map((c, i) => {
    if (typeof c !== 'object' || c === null || typeof c.id !== 'string' || typeof c.text !== 'string' || ![1, 2, 3].includes(c.level)) {
      throw new GateError(`change #${i + 1} lacks id/text/level: ${JSON.stringify(c)}`)
    }
    return { id: c.id, text: c.text, level: c.level, operation: String(c.operation ?? ''), path: String(c.path ?? '') }
  })
}

export function ackLine(key, change) {
  return `${key} ${change.operation} ${change.path} ${change.text} -- <why this break is acceptable>`
}

/**
 * Pure evaluation. Feature-branch / PR keys (SCRUM-n) only accept entries of the same key; any other key (main, NONE)
 * accepts entries of every story (they were reviewed on their branch).
 */
export function evaluate({ changes, entries, jiraKey }) {
  const branchScoped = /^SCRUM-\d+$/.test(jiraKey)
  const used = new Set()
  const foreign = new Set()
  const rows = changes.map((change) => {
    let acknowledgedBy = null
    if (change.level === 3) {
      for (const entry of entries) {
        if (entry.method !== change.operation || entry.path !== change.path || entry.text !== change.text) continue
        if (branchScoped && entry.key !== jiraKey) {
          foreign.add(entry)
          continue
        }
        acknowledgedBy = entry
        used.add(entry)
        break
      }
    }
    return { ...change, breaking: change.level === 3, acknowledgedBy }
  })
  const unacknowledged = rows.filter((r) => r.breaking && !r.acknowledgedBy)
  return {
    verdict: unacknowledged.length > 0 ? 'BLOCKED' : 'PASS',
    rows,
    breaking: rows.filter((r) => r.breaking).length,
    acknowledged: rows.filter((r) => r.acknowledgedBy).length,
    unacknowledged,
    unusedEntries: entries.filter((e) => !used.has(e) && !foreign.has(e)),
    foreignEntries: [...foreign],
  }
}

function renderMarkdown({ result, base, jiraKey, changelog }) {
  const out = ['### API contract: breaking-change gate (SCRUM-12-AC-08, AC-09)', '']
  out.push(`Base: \`${base}\` · key: \`${jiraKey}\` · verdict: **${result.verdict}** · ${result.rows.length} change(s), ` +
    `${result.breaking} breaking, ${result.acknowledged} acknowledged, ${result.unacknowledged.length} unacknowledged`, '')
  if (result.rows.length === 0) out.push('No changes to `api/openapi.yaml` against the base.')
  else {
    out.push('| level | rule | operation | change | acknowledged by |', '|---|---|---|---|---|')
    for (const r of result.rows) {
      const ack = r.acknowledgedBy ? `${r.acknowledgedBy.key} (ack line ${r.acknowledgedBy.line})` : r.breaking ? '**not acknowledged**' : '—'
      out.push(`| ${LEVELS[r.level]} | ${cell(r.id)} | ${cell(`${r.operation} ${r.path}`)} | ${cell(r.text)} | ${cell(ack)} |`)
    }
  }
  for (const e of result.unusedEntries) out.push('', `Warning: ack line ${e.line} (${e.key}) matches no breaking change — remove it once the change is on main.`)
  for (const e of result.foreignEntries) out.push('', `Warning: ack line ${e.line} belongs to ${e.key}; on this branch only ${jiraKey} entries acknowledge.`)
  if (changelog) out.push('', '<details><summary>oasdiff changelog</summary>', '', changelog.trim(), '', '</details>')
  return `${out.join('\n')}\n`
}

function main(argv) {
  let args
  try {
    args = parseArgs(argv, { booleans: ['no-base'] })
  } catch (e) {
    console.log(`::error::SCRUM-12-AC-08: ${e.message}`)
    return EXIT.ERROR
  }
  const jiraKey = args['jira-key'] ?? 'UNKNOWN'
  const ackPath = args.ack ?? 'api/breaking-changes.ack'
  const ackText = existsSync(ackPath) ? readFileSync(ackPath, 'utf8') : ''
  const { entries, errors } = parseAck(ackText)
  if (errors.length > 0) {
    for (const e of errors) console.log(`::error file=${ackPath}::SCRUM-12-AC-09: malformed acknowledgment, ${e}`)
    appendSummary(args.summary, `### API contract: breaking-change gate (SCRUM-12-AC-08, AC-09)\n\n**ERROR**: ${errors.length} malformed line(s) in \`${ackPath}\`:\n\n${errors.map((e) => `- ${cell(e)}`).join('\n')}\n`)
    return EXIT.ERROR
  }

  if (args['no-base']) {
    console.log(`::notice::SCRUM-12-AC-08: no base document — breaking-change check skipped (first introduction); ${entries.length} ack entr${entries.length === 1 ? 'y' : 'ies'} well-formed`)
    appendSummary(args.summary, `### API contract: breaking-change gate (SCRUM-12-AC-08, AC-09)\n\nVerdict: **PASS** — the base has no \`api/openapi.yaml\` (first introduction, SCRUM-12 A-04); nothing to compare. \`${ackPath}\`: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, well-formed.\n`)
    return EXIT.PASS
  }

  let changes
  try {
    if (!args.changes) throw new GateError('--changes <oasdiff changelog json> is required (or --no-base)')
    changes = parseChanges(JSON.parse(readFileSync(args.changes, 'utf8')))
  } catch (e) {
    console.log(`::error::SCRUM-12-AC-08: cannot read the oasdiff changes: ${e.message}`)
    appendSummary(args.summary, `### API contract: breaking-change gate (SCRUM-12-AC-08, AC-09)\n\n**ERROR**: cannot read the oasdiff changes: ${cell(e.message)}\n`)
    return EXIT.ERROR
  }
  const changelog = args.changelog && existsSync(args.changelog) ? readFileSync(args.changelog, 'utf8') : ''
  const base = args.base ?? 'unknown'
  const result = evaluate({ changes, entries, jiraKey })

  for (const r of result.rows) console.log(`${LEVELS[r.level]} [${r.id}] ${r.operation} ${r.path}: ${r.text}${r.acknowledgedBy ? ` (acknowledged by ${r.acknowledgedBy.key}, ack line ${r.acknowledgedBy.line})` : ''}`)
  const ackKey = /^SCRUM-\d+$/.test(jiraKey) ? jiraKey : 'SCRUM-<n>'
  for (const r of result.unacknowledged) {
    console.log(`::error title=Unacknowledged breaking API change::SCRUM-12-AC-08: [${r.id}] ${r.operation} ${r.path}: ${r.text}. If intended, add this line to ${ackPath} (with a real justification): ${ackLine(ackKey, r)}`)
    console.log(`  ack line: ${ackLine(ackKey, r)}`)
  }
  for (const e of result.unusedEntries) console.log(`::warning file=${ackPath},line=${e.line}::SCRUM-12-AC-09: acknowledgment matches no breaking change against ${base} (stale? remove it once the change is on main)`)
  for (const e of result.foreignEntries) console.log(`::warning file=${ackPath},line=${e.line}::SCRUM-12-AC-09: entry of ${e.key} does not acknowledge on ${jiraKey} (only entries of the branch's Jira key count)`)
  console.log(`SCRUM-12-AC-08: ${result.verdict} — ${result.rows.length} change(s), ${result.breaking} breaking, ${result.acknowledged} acknowledged, ${result.unacknowledged.length} unacknowledged (base ${base})`)

  appendSummary(args.summary, renderMarkdown({ result, base, jiraKey, changelog }))
  if (args.out) {
    const verdict = {
      verdict: result.verdict,
      base,
      jiraKey,
      breaking: result.breaking,
      acknowledged: result.acknowledged,
      unacknowledged: result.unacknowledged.map(({ id, operation, path, text }) => ({ id, operation, path, text })),
      unusedEntries: result.unusedEntries.map(({ line, key }) => ({ line, key })),
    }
    writeFileSync(args.out, `${JSON.stringify(verdict, null, 2)}\n`)
  }
  return result.verdict === 'PASS' ? EXIT.PASS : EXIT.BLOCKED
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
