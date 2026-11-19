// SCRUM-8-AC-08 (design §8.6): "no overwrite, ever" — probe result interpretation and the pure decision.
// Each probe yields { item, state: 'exists' | 'absent' | 'unknown', detail }.
import { RELEASE_TAG_RE, imageTags } from './semver.mjs'

const GHCR_ABSENT_RE = /manifest unknown|MANIFEST_UNKNOWN|NAME_UNKNOWN|name unknown/i
const GHCR_DENIED_RE = /denied|unauthorized|401|403/i

/** `git ls-remote --tags <repo> refs/tags/vX.Y.Z` */
export function interpretTagProbe(tag, { status, stdout, stderr }) {
  const item = `Git tag ${tag}`
  if (status !== 0) return { item, state: 'unknown', detail: firstLine(stderr) || `git exit ${status}` }
  const hit = stdout.split('\n').some((l) => l.trim().endsWith(`refs/tags/${tag}`))
  return hit ? { item, state: 'exists', detail: firstLine(stdout) } : { item, state: 'absent', detail: 'not on remote' }
}

/** `gh api repos/<repo>/releases/tags/vX.Y.Z` (published releases only). */
export function interpretReleaseProbe(tag, { status, stdout, stderr }) {
  const item = `GitHub Release ${tag}`
  if (status === 0) return { item, state: 'exists', detail: 'published release found' }
  const err = `${stderr}\n${stdout}`
  if (/HTTP 404|Not Found/i.test(err)) return { item, state: 'absent', detail: 'HTTP 404' }
  return { item, state: 'unknown', detail: firstLine(err) || `gh exit ${status}` }
}

/**
 * `gh api --paginate repos/<repo>/releases --jq '.[] | [.tag_name, .name, (.draft|tostring)] | @tsv'`
 * → drafts (visible with write access) and whether any release exists at all.
 */
export function interpretReleaseList(tag, { status, stdout, stderr }) {
  const item = `GitHub Release ${tag} (incl. drafts)`
  if (status !== 0) return { probe: { item, state: 'unknown', detail: firstLine(stderr) || `gh exit ${status}` }, total: null }
  const rows = stdout.split('\n').filter((l) => l.trim() !== '').map((l) => l.split('\t'))
  const match = rows.find(([tagName, name]) => tagName === tag || name === tag)
  const probe = match
    ? { item, state: 'exists', detail: match[2] === 'true' ? 'draft release found' : 'release found' }
    : { item, state: 'absent', detail: `${rows.length} release(s) listed, none named ${tag}` }
  return { probe, total: rows.length }
}

/** `skopeo inspect --raw docker://<image>:<tag>` */
export function interpretGhcrProbe(ref, { status, stdout, stderr }) {
  const item = `GHCR ${ref}`
  if (status === 0 && stdout.trim() !== '') return { item, state: 'exists', detail: 'manifest found' }
  const err = `${stderr}\n${stdout}`
  if (GHCR_ABSENT_RE.test(err)) return { item, state: 'absent', detail: 'manifest unknown' }
  return { item, state: 'unknown', detail: firstLine(err) || `skopeo exit ${status}`, denied: GHCR_DENIED_RE.test(err) }
}

/** The four immutable GHCR references a release would push (AC-08, AC-13). */
export function ghcrRefs(images, version, sha) {
  const { immutable } = imageTags(version, sha)
  return images.flatMap((image) => immutable.map((t) => `${image}:${t}`))
}

/** True when the remote has no vX.Y.Z tag at all — used for the design R3 first-release fallback. */
export function noReleaseTags(lsRemoteStdout) {
  return !lsRemoteStdout
    .split('\n')
    .map((l) => l.split('\t')[1]?.trim().replace(/^refs\/tags\//, '').replace(/\^\{\}$/, ''))
    .some((t) => t && RELEASE_TAG_RE.test(t))
}

/**
 * Pure decision. Any `exists` → refuse (version burnt). Any `unknown` → release: refuse (fail closed); dry-run: warn.
 * Design R3: in release mode a GHCR `denied` answer counts as absent only before the first release (no release tag and
 * no release at all), because a package that was never pushed cannot be read even with a token.
 */
export function decidePreexistence(probes, { mode, version, firstRelease = false }) {
  const rows = probes.map((p) => {
    if (mode === 'release' && firstRelease && p.state === 'unknown' && p.denied) {
      return { ...p, state: 'absent', detail: `${p.detail} — treated as absent: first release, package not created yet (design R3)` }
    }
    return p
  })
  const existing = rows.filter((r) => r.state === 'exists')
  const unknown = rows.filter((r) => r.state === 'unknown')
  const messages = []
  let decision = 'free'
  if (existing.length > 0) {
    decision = 'refuse'
    messages.push(
      `version ${version} is burnt — already published: ${existing.map((r) => r.item).join('; ')}. ` +
        `Dispatch with version=${nextPatch(version)} instead (never overwrite, SCRUM-8-AC-08).`,
    )
  }
  if (unknown.length > 0) {
    if (mode === 'release') {
      decision = 'refuse'
      messages.push(`could not prove absence (fail closed): ${unknown.map((r) => `${r.item}: ${r.detail}`).join('; ')}`)
    } else {
      if (decision === 'free') decision = 'warn'
      messages.push(`unknown — re-checked authoritatively at publish: ${unknown.map((r) => r.item).join('; ')}`)
    }
  }
  return { decision, rows, messages }
}

function nextPatch(version) {
  const [M, m, p] = version.split('.').map(Number)
  return `${M}.${m}.${p + 1}`
}

function firstLine(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).find((l) => l !== '') ?? ''
}
