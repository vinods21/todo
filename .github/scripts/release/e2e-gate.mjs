#!/usr/bin/env node
// SCRUM-9-AC-07, AC-09, AC-13 (ADR 0015, design §7.2): guard over the Playwright JSON report of the pre-release run.
// Usage: e2e-gate.mjs --results e2e/reports/compose/results.json [--tag critical] [--min 12] [--summary file]
// Exit codes: 0 PASS · 1 BLOCKED (a @tag test did not pass, or fewer than --min executed) · 2 ERROR (fail closed:
// missing/unparsable report, bad flags). Flaky tests (passed on retry) do not block; each raises a ::warning::.
import { readFileSync } from 'node:fs'
import { appendSummary, parseArgs } from './lib/gh-output.mjs'
import { annotations, collectTests, criticalVerdict, flakyTests, renderMarkdown, suiteStats } from './lib/e2e-results.mjs'

const EXIT = { OK: 0, BLOCKED: 1, ERROR: 2 }

function error(message) {
  console.log(`::error::SCRUM-9-AC-07: ${message}`)
  process.exit(EXIT.ERROR)
}

let args
try {
  args = parseArgs(process.argv.slice(2))
} catch (e) {
  error(e.message)
}
if (!args.results) error('--results <results.json> is required')
const min = args.min === undefined ? 1 : Number(args.min)
if (!Number.isInteger(min) || min < 1) error(`--min must be an integer ≥ 1 (got '${args.min}')`)
const tag = args.tag ?? 'critical'

let report
try {
  report = JSON.parse(readFileSync(args.results, 'utf8'))
} catch (e) {
  error(`Playwright report ${args.results} missing or unparsable (${e.message}) — did the test run crash?`)
}

let tests
try {
  tests = collectTests(report)
} catch (e) {
  error(`${args.results}: ${e.message}`)
}

const verdict = criticalVerdict(tests, { tag, min })
const flaky = flakyTests(tests)
const stats = suiteStats(report)
const markdown = renderMarkdown(verdict, flaky, stats)
appendSummary(args.summary, markdown)
console.log(markdown)
for (const line of annotations(verdict, flaky)) console.log(line)
process.exit(verdict.ok ? EXIT.OK : EXIT.BLOCKED)
