#!/usr/bin/env node
// SCRUM-8-AC-08 (design §8.6): refuse when tag, release or immutable GHCR tag of VERSION already exists.
// env: MODE (release|dry-run), VERSION, SHA, REPO, IMAGE_BACKEND, IMAGE_FRONTEND; GIT_BIN/GH_BIN/SKOPEO_BIN (tests).
// Flags: --summary <file>. Exit 1 on refuse.
import { appendSummary, cell, parseArgs } from './lib/gh-output.mjs'
import { VERSION_RE } from './lib/semver.mjs'
import {
  decidePreexistence,
  ghcrRefs,
  interpretGhcrProbe,
  interpretReleaseList,
  interpretReleaseProbe,
  interpretTagProbe,
  noReleaseTags,
} from './lib/preexistence.mjs'
import { fail, run } from './lib/exec.mjs'

const args = parseArgs(process.argv.slice(2))
const env = process.env
const mode = env.MODE === 'release' ? 'release' : 'dry-run'
const version = env.VERSION ?? ''
const repo = env.REPO ?? ''
if (!VERSION_RE.test(version)) fail(`SCRUM-8-AC-08: VERSION ${JSON.stringify(version)} is not X.Y.Z`, 2)
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) fail(`SCRUM-8-AC-08: REPO ${JSON.stringify(repo)} invalid`, 2)
if (!/^[0-9a-fA-F]{40}$/.test(env.SHA ?? '')) fail('SCRUM-8-AC-08: SHA must be a full commit SHA', 2)
const git = env.GIT_BIN || 'git'
const gh = env.GH_BIN || 'gh'
const skopeo = env.SKOPEO_BIN || 'skopeo'
const images = [env.IMAGE_BACKEND || 'ghcr.io/vinods21/todo-backend', env.IMAGE_FRONTEND || 'ghcr.io/vinods21/todo-frontend']
const tag = `v${version}`
const remote = `https://github.com/${repo}`

const probes = []
probes.push(interpretTagProbe(tag, run(git, ['ls-remote', '--tags', remote, `refs/tags/${tag}`])))
probes.push(interpretReleaseProbe(tag, run(gh, ['api', `repos/${repo}/releases/tags/${tag}`])))
const list = interpretReleaseList(
  tag,
  run(gh, ['api', '--paginate', `repos/${repo}/releases`, '--jq', '.[] | [.tag_name, .name, (.draft|tostring)] | @tsv']),
)
probes.push(list.probe)
for (const ref of ghcrRefs(images, version, env.SHA)) {
  probes.push(interpretGhcrProbe(ref, run(skopeo, ['inspect', '--raw', `docker://${ref}`])))
}
const allTags = run(git, ['ls-remote', '--tags', remote])
const firstRelease = allTags.status === 0 && noReleaseTags(allTags.stdout) && list.total === 0

const result = decidePreexistence(probes, { mode, version, firstRelease })
const md = [
  `### Pre-existence check for \`${version}\` — ${mode} (SCRUM-8-AC-08)`,
  '',
  '| item | state | detail |',
  '|---|---|---|',
  ...result.rows.map((r) => `| ${cell(r.item)} | ${r.state === 'exists' ? '**exists**' : r.state} | ${cell(r.detail)} |`),
  '',
  `Decision: **${result.decision}**${result.messages.length ? ` — ${result.messages.join(' ')}` : ''}`,
  '',
].join('\n')
appendSummary(args.summary, md)
console.log(md)
if (result.decision === 'refuse') fail(`SCRUM-8-AC-08: ${result.messages.join(' ')}`)
if (result.decision === 'warn') console.log(`::warning::SCRUM-8-AC-08: ${result.messages.join(' ')}`)
