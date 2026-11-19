// SCRUM-8-AC-10, AC-31 (design §9.4): release notes renderer — pure, offline-testable; the same text in dry-run.
import { cell } from './gh-output.mjs'
import { countsLine } from './gate.mjs'

const JIRA_RE = /^(SCRUM-\d+):\s*/
export const MAX_PER_GROUP = 50
export const JIRA_BASE = 'https://suranagivinod.atlassian.net/browse/'

/** `git log --format=%H%x09%s` output → [{ sha, subject }] (oldest last as git prints them). */
export function parseGitLog(text) {
  return String(text ?? '')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const tab = l.indexOf('\t')
      return { sha: l.slice(0, tab), subject: l.slice(tab + 1) }
    })
}

/** Groups commits by their leading Jira key (SCRUM-<n>:), numerically descending; "Other" last. */
export function groupCommits(commits) {
  const groups = new Map()
  for (const c of commits) {
    const m = JIRA_RE.exec(c.subject)
    const k = m ? m[1] : 'Other'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(c)
  }
  const keys = [...groups.keys()].filter((k) => k !== 'Other').sort((a, b) => Number(b.slice(6)) - Number(a.slice(6)))
  if (groups.has('Other')) keys.push('Other')
  return keys.map((k) => ({ key: k, commits: groups.get(k) }))
}

/**
 * @param {{version, sha, previousTag, dryRun, runUrl, repo, images: {name, digest, tags}[], commits, migrations: string[],
 *          gate: object|null}} d
 */
export function renderNotes(d) {
  const out = []
  const since = d.previousTag ? d.previousTag : null
  out.push(d.dryRun ? `## todo v${d.version} — DRY RUN (would-be release)` : `## todo v${d.version}`, '')
  out.push(
    `Commit \`${d.sha}\` · ${since ? `previous release \`${since}\`` : 'first release'}` + (d.runUrl ? ` · built by ${d.runUrl}` : ''),
    '',
  )
  out.push('### Images (deploy and roll back by digest)', '', '| image | digest reference | tags |', '|---|---|---|')
  for (const img of d.images) {
    out.push(`| \`${img.name}\` | \`${img.name}@${img.digest}\` | ${img.tags.map((t) => `\`${t}\``).join(', ')} |`)
  }
  out.push(
    '',
    `Immutable tags: \`${d.version}\` and \`${d.images[0]?.tags[0] ?? ''}\`; \`${d.version.split('.').slice(0, 2).join('.')}\` and \`latest\` move with later releases — deploy by digest or \`${d.version}\`.`,
    '',
  )
  out.push(
    '### Verify',
    '',
    '```sh',
    `gh release download v${d.version} --repo ${d.repo} -D todo-${d.version} && (cd todo-${d.version} && sha256sum -c SHA256SUMS)`,
    `gh attestation verify todo-${d.version}/todo-backend-${d.version}.jar --repo ${d.repo}`,
    `gh attestation verify todo-${d.version}/todo-frontend-${d.version}.tar.gz --repo ${d.repo}`,
    ...d.images.map((img) => `gh attestation verify oci://${img.name}@${img.digest} --repo ${d.repo}`),
    '```',
    '',
    'Details: docs/release/RELEASE.md#verify-a-release',
    '',
  )
  const groups = groupCommits(d.commits)
  const keys = groups.map((g) => g.key).filter((k) => k !== 'Other')
  out.push(
    `### Changes since ${since ? `\`${since}\`` : 'the beginning'} — Jira: ${keys.length ? keys.map((k) => `[${k}](${JIRA_BASE}${k})`).join(', ') : 'none'}`,
    '',
  )
  if (groups.length === 0) out.push('No commits.', '')
  for (const g of groups) {
    out.push(`#### ${g.key === 'Other' ? 'Other' : `[${g.key}](${JIRA_BASE}${g.key})`}`, '')
    for (const c of g.commits.slice(0, MAX_PER_GROUP)) out.push(`- ${cell(c.subject.replace(JIRA_RE, ''))} (${c.sha.slice(0, 7)})`)
    if (g.commits.length > MAX_PER_GROUP) out.push(`- … and ${g.commits.length - MAX_PER_GROUP} more`)
    out.push('')
  }
  out.push(`### Database migrations since ${since ? `\`${since}\`` : 'the beginning'} (rollback: docs/release/ROLLBACK.md)`, '')
  if (!d.migrations.length) out.push('None — application-only rollback is safe.', '')
  else {
    for (const m of d.migrations) out.push(`- \`${m}\``)
    out.push(
      '',
      `⚠ Review backward compatibility before rolling back past this release: Flyway migrations are forward-only (docs/release/ROLLBACK.md#database-caveat).`,
      '',
    )
  }
  out.push('### Vulnerability summary', '')
  if (!d.gate) out.push('Gate result not available.', '')
  else {
    const g = d.gate
    out.push(
      `Gate **${g.verdict}** · Trivy \`${g.trivy?.version ?? '?'}\`, DB UpdatedAt \`${g.trivy?.db?.UpdatedAt ?? '?'}\``,
      '',
      countsLine(g),
      '',
    )
    if (g.unfixedCriticalHigh?.length) {
      out.push('CRITICAL/HIGH without an available fix (reported, not blocking):', '')
      for (const f of g.unfixedCriticalHigh.slice(0, 30)) out.push(`- ${f.severity} ${f.id} in \`${cell(f.pkg)}\` ${cell(f.installed)} (${f.targets.join(', ')})`)
      if (g.unfixedCriticalHigh.length > 30) out.push(`- … and ${g.unfixedCriticalHigh.length - 30} more (scan reports asset)`)
      out.push('')
    }
    const applied = g.allowlist?.valid ?? []
    if (applied.length) {
      out.push('Allow-list entries in effect:', '', '| id | package | owner | expires |', '|---|---|---|---|')
      for (const e of applied) out.push(`| ${cell(e.id)} | ${cell(e.package)} | ${cell(e.owner)} | ${cell(e.expires)} |`)
      out.push('')
    } else out.push('Allow-list entries in effect: none.', '')
  }
  return `${out.join('\n')}\n`
}
