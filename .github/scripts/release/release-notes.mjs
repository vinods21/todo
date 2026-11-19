#!/usr/bin/env node
// SCRUM-8-AC-10, AC-31 (design §9.4): render release notes from git history, digests and the gate verdict.
// Flags: --version X.Y.Z --sha <40> [--previous-tag vA.B.C] --digests backend=sha256:…,frontend=sha256:…
//        [--verdict verdict.json] --repo owner/name [--run-url URL] [--dry-run] --out notes.md
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from './lib/gh-output.mjs'
import { imageTags, RELEASE_TAG_RE, VERSION_RE } from './lib/semver.mjs'
import { parseGitLog, renderNotes } from './lib/notes.mjs'
import { fail, runOk } from './lib/exec.mjs'

const git = process.env.GIT_BIN || 'git'
const a = parseArgs(process.argv.slice(2), { booleans: ['dry-run'] })
if (!VERSION_RE.test(a.version ?? '')) fail('--version X.Y.Z required')
if (!/^[0-9a-f]{40}$/.test(a.sha ?? '')) fail('--sha <full lower-case sha> required')
const prev = a['previous-tag'] || ''
if (prev && !RELEASE_TAG_RE.test(prev)) fail(`--previous-tag ${prev} is not a release tag`)
const digests = Object.fromEntries(
  String(a.digests ?? '')
    .split(',')
    .filter(Boolean)
    .map((kv) => kv.split('=')),
)
for (const k of ['backend', 'frontend']) if (!/^sha256:[0-9a-f]{64}$/.test(digests[k] ?? '')) fail(`--digests ${k}=sha256:… missing`)

const range = prev ? [`${prev}..${a.sha}`] : [a.sha]
const commits = parseGitLog(runOk(git, ['log', '--no-merges', '--format=%H%x09%s', ...range]))
const migrationDir = 'src/main/resources/db/migration'
const migrations = (
  prev
    ? runOk(git, ['diff', '--name-only', '--diff-filter=A', prev, a.sha, '--', migrationDir])
    : runOk(git, ['ls-tree', '-r', '--name-only', a.sha, '--', migrationDir])
)
  .split('\n')
  .filter(Boolean)
  .map((p) => p.split('/').pop())
  .sort()
const gate = a.verdict ? JSON.parse(readFileSync(a.verdict, 'utf8')) : null
const t = imageTags(a.version, a.sha)
const tags = [...t.immutable, ...t.moving]
const notes = renderNotes({
  version: a.version,
  sha: a.sha,
  previousTag: prev,
  dryRun: Boolean(a['dry-run']),
  runUrl: a['run-url'] ?? '',
  repo: a.repo ?? 'vinods21/todo',
  images: [
    { name: process.env.IMAGE_BACKEND || 'ghcr.io/vinods21/todo-backend', digest: digests.backend, tags },
    { name: process.env.IMAGE_FRONTEND || 'ghcr.io/vinods21/todo-frontend', digest: digests.frontend, tags },
  ],
  commits,
  migrations,
  gate,
})
if (a.out) writeFileSync(a.out, notes)
else process.stdout.write(notes)
console.log(`release notes: ${commits.length} commits, ${migrations.length} migrations${a.out ? ` → ${a.out}` : ''}`)
