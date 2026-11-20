// SCRUM-9-AC-07, AC-09, AC-13 (ADR 0015, design §7.2): pure functions over the Playwright JSON report (reporter
// `json`, @playwright/test 1.65.x). The JSON reporter writes spec tags WITHOUT the leading '@' ("critical").
//   test.status  (outcome):  expected | unexpected | flaky | skipped
//   result.status (attempt): passed | failed | timedOut | skipped | interrupted
import { cell } from './gh-output.mjs'

export class E2eResultsError extends Error {}

const normTag = (tag) => String(tag ?? '').replace(/^@/, '')

/** Walks suites → specs → tests; one entry per (spec, project). Throws E2eResultsError on an unusable report. */
export function collectTests(results) {
  if (!results || typeof results !== 'object' || !Array.isArray(results.suites)) {
    throw new E2eResultsError('Playwright JSON report has no "suites" array')
  }
  if (!results.stats || typeof results.stats !== 'object') {
    throw new E2eResultsError('Playwright JSON report has no "stats" object')
  }
  const out = []
  const walk = (suites, path, file) => {
    for (const suite of suites ?? []) {
      const f = suite.file ?? file
      const next = suite.title && suite.title !== f ? [...path, suite.title] : path
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const results = Array.isArray(test.results) ? test.results : []
          out.push({
            project: test.projectName ?? '',
            file: spec.file ?? f ?? '',
            title: spec.title ?? '',
            path: next,
            tags: (spec.tags ?? []).map(normTag),
            status: test.status ?? 'unknown',
            lastResult: results.length ? results[results.length - 1].status : 'none',
            retries: results.length ? Math.max(...results.map((r) => r.retry ?? 0)) : 0,
            attempts: results.length,
          })
        }
      }
      walk(suite.suites, next, f)
    }
  }
  walk(results.suites, [], undefined)
  return out
}

/** A test passed ⇔ its outcome is expected/flaky and its final attempt passed (skipped never passes). */
export const testPassed = (t) => (t.status === 'expected' || t.status === 'flaky') && t.lastResult === 'passed'

/** An attempt ran ⇔ at least one result exists whose status is not 'skipped'. */
const executedTest = (t) => t.attempts > 0 && !(t.status === 'skipped' || t.lastResult === 'skipped')

/**
 * Guard for the tagged tests: ok ⇔ at least `min` (≥ 1) tagged tests executed and every tagged test in the report
 * passed. Failed, timed-out, interrupted, skipped and never-run tagged tests all block.
 */
export function criticalVerdict(tests, { tag = 'critical', min = 1 } = {}) {
  const want = normTag(tag)
  const floor = Math.max(1, Number(min) || 1)
  const tagged = tests.filter((t) => t.tags.includes(want))
  const executed = tagged.filter(executedTest).length
  const passed = tagged.filter(testPassed).length
  const failures = tagged
    .filter((t) => !testPassed(t))
    .map(({ title, project, file, status, lastResult }) => ({ title, project, file, status, lastResult }))
  const reasons = []
  if (executed < floor) reasons.push(`only ${executed} @${want} tests executed (min ${floor})`)
  if (failures.length) reasons.push(`${failures.length} @${want} test(s) did not pass`)
  return { ok: reasons.length === 0, tag: want, min: floor, found: tagged.length, executed, passed, failures, reason: reasons.join('; ') }
}

/** Tests that passed only on retry (Playwright outcome 'flaky'). */
export function flakyTests(tests) {
  return tests.filter((t) => t.status === 'flaky')
}

/** Suite counts from `stats` (Playwright naming → ours). */
export function suiteStats(results) {
  const s = results?.stats ?? {}
  return {
    passed: s.expected ?? 0,
    failed: s.unexpected ?? 0,
    flaky: s.flaky ?? 0,
    skipped: s.skipped ?? 0,
    durationS: Number(((s.duration ?? 0) / 1000).toFixed(1)),
  }
}

const name = (t) => `[${t.project}] ${t.title}`

/** Markdown for $GITHUB_STEP_SUMMARY (SCRUM-9-AC-13). */
export function renderMarkdown(verdict, flaky, stats) {
  const out = [`### Pre-release e2e — critical To-Do workflows (SCRUM-9-AC-07)`, '']
  out.push(
    `**${verdict.ok ? 'PASS' : 'BLOCKED'}** — ${verdict.executed} @${verdict.tag} tests executed, ${verdict.passed} passed ` +
      `(min ${verdict.min}) · suite: ${stats.passed} passed, ${stats.failed} failed, ${stats.flaky} flaky, ` +
      `${stats.skipped} skipped, ${stats.durationS} s`,
  )
  if (!verdict.ok) out.push('', `Reason: ${cell(verdict.reason)}`)
  if (verdict.failures.length) {
    out.push('', '| project | test | outcome | last attempt |', '|---|---|---|---|')
    for (const f of verdict.failures) out.push(`| ${cell(f.project)} | ${cell(f.title)} | ${cell(f.status)} | ${cell(f.lastResult)} |`)
  }
  out.push('', `**Flaky (passed on retry, SCRUM-9-AC-09):** ${flaky.length ? '' : 'none'}`)
  for (const t of flaky) out.push(`- ${cell(name(t))}`)
  return `${out.join('\n')}\n`
}

/** Workflow commands for the job log. */
export function annotations(verdict, flaky) {
  const lines = []
  for (const t of flaky) lines.push(`::warning::SCRUM-9-AC-09: flaky (passed on retry): ${name(t)}`)
  if (!verdict.ok) {
    for (const f of verdict.failures) {
      lines.push(`::error::SCRUM-9-AC-07: @${verdict.tag} test did not pass (${f.status}/${f.lastResult}): [${f.project}] ${f.title}`)
    }
    lines.push(`::error::SCRUM-9-AC-07: release blocked — ${verdict.reason}`)
  }
  return lines
}
