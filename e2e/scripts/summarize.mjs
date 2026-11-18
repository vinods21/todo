// SCRUM-7-NFR-09 / design §9.4: Markdown run summary for $GITHUB_STEP_SUMMARY — counts, flaky (passed on retry)
// and skipped tests, and the acceptance-criteria IDs exercised. No dependencies; always exits 0 (informational).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const reports = join(dirname(fileURLToPath(import.meta.url)), '..', 'reports')
const key = process.env.JIRA_KEY ?? 'UNKNOWN'
const out = []

function walk(suites, path, visit) {
  for (const suite of suites ?? []) {
    const next = suite.title ? [...path, suite.title] : path
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) visit(spec, test, next)
    }
    walk(suite.suites, next, visit)
  }
}

for (const mode of ['compose', 'dev']) {
  out.push(`### E2E (${mode}, ${key})`)
  const resultsFile = join(reports, mode, 'results.json')
  if (!existsSync(resultsFile)) {
    out.push('', 'no report (step did not run)', '')
    continue
  }
  try {
    const results = JSON.parse(readFileSync(resultsFile, 'utf8'))
    const s = results.stats ?? {}
    out.push(
      '',
      '| passed | failed | flaky | skipped | duration |',
      '|---|---|---|---|---|',
      `| ${s.expected ?? 0} | ${s.unexpected ?? 0} | ${s.flaky ?? 0} | ${s.skipped ?? 0} | ${((s.duration ?? 0) / 1000).toFixed(1)} s |`,
      '',
    )
    const flaky = []
    const skipped = []
    const failed = []
    walk(results.suites, [], (spec, test) => {
      const name = `[${test.projectName}] ${spec.title}`
      if (test.status === 'flaky') flaky.push(name)
      if (test.status === 'unexpected') failed.push(name)
      if (test.status === 'skipped') {
        const reason = (test.annotations ?? []).find((a) => a.type === 'skip')?.description
        skipped.push(reason ? `${name} — ${reason}` : name)
      }
    })
    out.push(`**Flaky (passed on retry):** ${flaky.length ? '' : 'none'}`)
    for (const name of flaky) out.push(`- ${name}`)
    if (failed.length) {
      out.push('', '**Failed:**')
      for (const name of failed) out.push(`- ${name}`)
    }
    if (skipped.length) {
      out.push('', '**Skipped:**')
      for (const name of skipped) out.push(`- ${name}`)
    }
  } catch (error) {
    out.push('', `could not read ${resultsFile}: ${error.message}`)
  }
  const junitFile = join(reports, mode, 'junit.xml')
  if (existsSync(junitFile)) {
    const ids = [...new Set(readFileSync(junitFile, 'utf8').match(/SCRUM-\d+-(?:AC|NFR)-\d+/g) ?? [])]
    ids.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    out.push('', `**IDs exercised:** ${ids.join(' ') || 'none'}`)
  }
  out.push('')
}

console.log(out.join('\n'))
