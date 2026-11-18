#!/usr/bin/env node
// SCRUM-8-AC-17, NFR-11 (design §7.3): finalize SBOMs in place.
// Flags: --version v --sha <40> --jira KEY [--digest backend-image=sha256:… --digest frontend-image=sha256:…]
//        [--workspace $GITHUB_WORKSPACE] [--counts counts.json] [--summary f] files…
import { readFileSync, writeFileSync } from 'node:fs'
import { appendSummary, parseArgs } from './lib/gh-output.mjs'
import { finalizeSbom, kindFromFileName } from './lib/sbom.mjs'
import { fail } from './lib/exec.mjs'

const a = parseArgs(process.argv.slice(2), { multi: ['digest'] })
if (!a.version || !a.sha || !a.jira) fail('--version, --sha and --jira are required')
const digests = Object.fromEntries(a.digest.map((d) => d.split('=')))
const counts = {}
const rows = []
for (const file of a._) {
  const kind = kindFromFileName(file)
  if (!kind) fail(`SCRUM-8-AC-17: cannot tell the SBOM kind from the file name ${file}`)
  let doc
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    fail(`SCRUM-8-AC-17: ${file} is not JSON: ${e.message}`)
  }
  try {
    const { doc: out, count } = finalizeSbom(doc, {
      kind,
      version: a.version,
      sha: a.sha,
      jira: a.jira,
      digest: digests[kind],
      workspace: a.workspace ?? process.env.GITHUB_WORKSPACE,
    })
    writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`)
    counts[file.split('/').pop()] = count
    rows.push(`| \`${file.split('/').pop()}\` | ${kind} | ${out.specVersion} | ${count} |`)
  } catch (e) {
    fail(`SCRUM-8-AC-17: ${e.message}`)
  }
}
const md = ['### SBOMs (SCRUM-8-AC-17)', '', '| file | kind | CycloneDX | components |', '|---|---|---|---|', ...rows, ''].join('\n')
if (a.counts) writeFileSync(a.counts, `${JSON.stringify(counts, null, 2)}\n`)
appendSummary(a.summary, md)
console.log(md)
