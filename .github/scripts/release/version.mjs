#!/usr/bin/env node
// SCRUM-8-AC-02, AC-03, AC-06, AC-11, NFR-06 (design §4, §11.2). Subcommands:
//   identity  — CI `identity` job: jira_key (ADR 0008) + build_version.          env: BRANCH, SHA
//   plan      — Release `version` job: mode, versions, guard, image tag plan.     env: EVENT_NAME, REF, BRANCH, SHA,
//               INPUT_BUMP, INPUT_VERSION, INPUT_DRY_RUN, ACTOR (untrusted inputs arrive via env only, NFR-01)
// Flags: --github-output <file> --summary <file>. Tags are read with `git tag --list` (checkout with fetch-tags).
import { appendOutput, appendSummary, parseArgs } from './lib/gh-output.mjs'
import { buildVersion, highestRelease, imageTags, nextVersion, VersionError } from './lib/semver.mjs'
import { jiraKeyFromBranch } from './lib/identity.mjs'
import { checkReleaseGuard, deriveMode } from './lib/guard.mjs'
import { fail, runOk } from './lib/exec.mjs'

const git = process.env.GIT_BIN || 'git'
const [command, ...rest] = process.argv.slice(2)
const args = parseArgs(rest)
const env = process.env

function tags() {
  return runOk(git, ['tag', '--list', 'v*']).split('\n').filter(Boolean)
}

try {
  if (command === 'identity') identity()
  else if (command === 'plan') plan()
  else fail(`usage: version.mjs identity|plan [--github-output f] [--summary f] (got ${command})`, 2)
} catch (e) {
  fail(e instanceof VersionError ? `SCRUM-8-AC-02: ${e.message}` : e.message)
}

function identity() {
  const sha = env.SHA
  const jiraKey = jiraKeyFromBranch(env.BRANCH)
  const bv = buildVersion(tags(), sha)
  appendOutput(args['github-output'], 'jira_key', jiraKey)
  appendOutput(args['github-output'], 'build_version', bv)
  const line = `### Build identity: \`${jiraKey}\` (commit \`${sha.slice(0, 7)}\`) · build version \`${bv}\``
  appendSummary(args.summary, line)
  console.log(`jira_key=${jiraKey} build_version=${bv}`)
}

function plan() {
  const sha = env.SHA
  const all = tags()
  const mode = deriveMode(env.EVENT_NAME, env.INPUT_DRY_RUN)
  const explicit = (env.INPUT_VERSION ?? '') === '' ? undefined : env.INPUT_VERSION
  const bump = (env.INPUT_BUMP ?? '') === '' ? 'patch' : env.INPUT_BUMP
  const releaseVersion = nextVersion(all, { bump, explicit })
  const bv = buildVersion(all, sha)
  const version = mode === 'release' ? releaseVersion : bv
  const previous = highestRelease(all)
  const head = runOk(git, ['rev-parse', 'HEAD']).trim()
  const tagsAtHead = runOk(git, ['tag', '--points-at', 'HEAD']).split('\n').filter(Boolean)
  const epoch = runOk(git, ['log', '-1', '--format=%ct', 'HEAD']).trim()
  const guard = checkReleaseGuard({ mode, ref: env.REF, dispatchedSha: sha, headSha: head, tagsAtHead })
  const branch = env.BRANCH ?? ''
  const jiraKey = mode === 'release' ? 'main' : jiraKeyFromBranch(branch)
  const t = imageTags(releaseVersion, sha)
  const imageTagList = [...t.immutable, ...t.moving]

  const outputs = {
    mode,
    version,
    release_version: releaseVersion,
    build_version: bv,
    previous_tag: previous?.tag ?? '',
    image_tags: imageTagList.join(' '),
    jira_key: jiraKey,
    branch,
    sha,
    commit_epoch: epoch,
  }
  for (const [k, v] of Object.entries(outputs)) appendOutput(args['github-output'], k, v)

  const banner = mode === 'release' ? '## 🚀 RELEASE' : '## 🧪 DRY RUN — nothing will be published (SCRUM-8-AC-11)'
  const md = [
    banner,
    '',
    '| field | value |',
    '|---|---|',
    `| mode | **${mode === 'release' ? 'RELEASE' : 'DRY RUN'}** |`,
    `| event / actor | \`${env.EVENT_NAME}\` / \`${env.ACTOR ?? ''}\` |`,
    `| ref | \`${env.REF}\` |`,
    `| commit | \`${sha}\` (checked out \`${head}\`) |`,
    `| previous release | ${previous ? `\`${previous.tag}\`` : 'none (first release)'} |`,
    `| ${mode === 'release' ? 'release version' : 'would-be release version'} | \`${releaseVersion}\` (${explicit ? `explicit ${explicit}` : `bump ${bump}`}) |`,
    `| build version | \`${bv}\` |`,
    `| version stamped into artefacts | \`${version}\` |`,
    `| image tags (${mode === 'release' ? 'to push' : 'would push'}) | ${imageTagList.map((x) => `\`${x}\``).join(' ')} — immutable: ${t.immutable.map((x) => `\`${x}\``).join(', ')} |`,
    `| Jira key (ADR 0008) | \`${jiraKey}\` |`,
    `| guard (SCRUM-8-AC-06) | ${guard.wouldRefuse.length === 0 ? 'ok' : `${mode === 'release' ? '**REFUSED**' : 'a release here would be refused'}: ${guard.wouldRefuse.join('; ')}`} |`,
    '',
  ].join('\n')
  appendSummary(args.summary, md)
  console.log(md)
  if (!guard.ok) fail(`SCRUM-8-AC-06: release refused — ${guard.reasons.join('; ')}`)
}
