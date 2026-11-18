// SCRUM-8-AC-01, AC-02, AC-03, AC-13 (ADR 0013 §1, design §4): pure version arithmetic — no I/O, no clock.
// Same tag set + same input ⇒ same result, independent of tag order (NFR-08).

export const RELEASE_TAG_RE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const FIRST_RELEASE = '0.1.0'
export const BUMPS = Object.freeze(['major', 'minor', 'patch'])

export class VersionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'VersionError'
  }
}

/** "1.2.3" → [1, 2, 3] (BigInt-free: numbers are well below 2^53 in practice; validated by VERSION_RE). */
export function parseVersion(version) {
  const m = VERSION_RE.exec(version)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function compareVersions(a, b) {
  const pa = typeof a === 'string' ? parseVersion(a) : a
  const pb = typeof b === 'string' ? parseVersion(b) : b
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

export const formatVersion = (p) => `${p[0]}.${p[1]}.${p[2]}`

/** Release tags only (RELEASE_TAG_RE); everything else — pre-releases, unprefixed, leading zeros — is ignored. */
export function releaseTags(tags) {
  return [...new Set(tags.map((t) => String(t).trim()))].filter((t) => RELEASE_TAG_RE.test(t))
}

/** Highest release by SemVer precedence (not lexical/date order): { tag, version } or null. */
export function highestRelease(tags) {
  let best = null
  for (const tag of releaseTags(tags)) {
    const v = parseVersion(tag.slice(1))
    if (best === null || compareVersions(v, best.parts) > 0) best = { tag, version: formatVersion(v), parts: v }
  }
  return best && { tag: best.tag, version: best.version }
}

/**
 * AC-02: next release version from the tag set and either a bump type or an explicit version.
 * @param {string[]} tags
 * @param {{bump?: string, explicit?: string}} input
 */
export function nextVersion(tags, { bump = 'patch', explicit } = {}) {
  const highest = highestRelease(tags)
  const highestText = highest ? `highest release tag ${highest.tag}` : 'no release tag yet'
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    if (!VERSION_RE.test(explicit)) {
      throw new VersionError(
        `explicit version ${JSON.stringify(explicit)} is not a release version MAJOR.MINOR.PATCH ` +
          `(no "v", no leading zeros, no pre-release/build metadata; ${highestText})`,
      )
    }
    if (highest && compareVersions(explicit, highest.version) <= 0) {
      throw new VersionError(
        `explicit version ${explicit} must be strictly greater than the ${highestText} (${highest.version})`,
      )
    }
    return explicit
  }
  if (!BUMPS.includes(bump)) {
    throw new VersionError(`bump ${JSON.stringify(bump)} is not one of ${BUMPS.join('|')} (${highestText})`)
  }
  if (!highest) return FIRST_RELEASE
  const [M, m, p] = parseVersion(highest.version)
  if (bump === 'major') return `${M + 1}.0.0`
  if (bump === 'minor') return `${M}.${m + 1}.0`
  return `${M}.${m}.${p + 1}`
}

/** Q-07: `<id>` = sha7, prefixed with "g" only when sha7 is all digits with a leading zero (invalid SemVer number). */
export function shaId(sha) {
  if (typeof sha !== 'string' || !/^[0-9a-fA-F]{40}$/.test(sha)) {
    throw new VersionError(`commit SHA ${JSON.stringify(sha)} is not a full 40-character hex SHA`)
  }
  const sha7 = sha.toLowerCase().slice(0, 7)
  return /^0[0-9]{6}$/.test(sha7) ? `g${sha7}` : sha7
}

/** AC-03: build version for every non-release build: next patch after the highest release (0.1.0 before) + id. */
export function buildVersion(tags, sha) {
  const id = shaId(sha)
  const highest = highestRelease(tags)
  const base = highest ? nextVersion(tags, { bump: 'patch' }) : FIRST_RELEASE
  return `${base}-${id}`
}

/** AC-13: image tags of a release — immutable first (pushed before the release), then moving. */
export function imageTags(release, sha) {
  const p = parseVersion(release)
  if (!p) throw new VersionError(`release version ${JSON.stringify(release)} is invalid`)
  return {
    immutable: [`${release}-${shaId(sha)}`, release],
    moving: [`${p[0]}.${p[1]}`, 'latest'],
  }
}
