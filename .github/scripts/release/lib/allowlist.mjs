// SCRUM-8-AC-22 (ADR 0014, design §8.5): allow-list validation. Invalid or expired entries suppress nothing.
export const GATED_TARGETS = Object.freeze(['backend-runtime', 'frontend-prod', 'backend-image', 'frontend-image'])
export const REQUIRED_FIELDS = Object.freeze([
  'id',
  'type',
  'package',
  'targets',
  'justification',
  'owner',
  'added',
  'expires',
])
const KNOWN_FIELDS = new Set([...REQUIRED_FIELDS, '$comment', 'comment', 'reference'])
const CVE_RE = /^CVE-\d{4}-\d{4,}$/
const GHSA_RE = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/
const SECRET_RE = /^secret:[A-Za-z0-9._-]+$/
const OWNER_RE = /^SCRUM-\d+$|^@?[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const MAX_DAYS = 90

export class AllowlistError extends Error {}

/** Parses the file text; throws AllowlistError for unparsable JSON or an unsupported version. */
export function parseAllowlist(text) {
  let doc
  try {
    doc = JSON.parse(text)
  } catch (e) {
    throw new AllowlistError(`allow-list is not valid JSON: ${e.message}`)
  }
  if (!doc || typeof doc !== 'object' || doc.version !== 1 || !Array.isArray(doc.entries)) {
    throw new AllowlistError('allow-list must be an object with "version": 1 and an "entries" array')
  }
  return doc
}

function parseDate(text) {
  if (typeof text !== 'string' || !DATE_RE.test(text)) return null
  const d = new Date(`${text}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? null : d
}

const DAY = 86_400_000

/** Reasons why one entry is invalid on `today` (YYYY-MM-DD, UTC); empty array = valid. */
export function entryProblems(entry, today) {
  const reasons = []
  const warnings = []
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { reasons: ['entry is not an object'], warnings }
  for (const f of REQUIRED_FIELDS) {
    const v = entry[f]
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && f !== 'targets' && v.length === 0)) {
      reasons.push(`missing ${f}`)
    }
  }
  for (const k of Object.keys(entry)) if (!KNOWN_FIELDS.has(k)) warnings.push(`unknown field ${k}`)
  const { id, type, targets, justification, owner } = entry
  const pkg = entry.package
  if (type !== undefined && type !== 'vulnerability' && type !== 'secret') reasons.push('type not vulnerability|secret')
  if (typeof id === 'string' && id !== '') {
    if (type === 'secret') {
      if (!SECRET_RE.test(id)) reasons.push('id not secret:<rule-id> for type secret')
    } else if (!CVE_RE.test(id) && !GHSA_RE.test(id)) {
      reasons.push('id not CVE-/GHSA-')
    }
  }
  if (targets !== undefined) {
    if (!Array.isArray(targets) || targets.length === 0) reasons.push('targets empty')
    else {
      for (const t of targets) {
        if (typeof t !== 'string' || /[*?]/.test(t)) reasons.push(`wildcard or invalid target ${t}`)
        else if (!GATED_TARGETS.includes(t)) reasons.push(`unknown target ${t}`)
      }
    }
  }
  if (typeof pkg === 'string' && /[*?]/.test(pkg)) reasons.push('wildcard in package')
  if (pkg !== undefined && typeof pkg !== 'string') reasons.push('package not a string')
  if (typeof justification === 'string' && justification.trim() !== '' && justification.trim().length < 20) {
    reasons.push('justification shorter than 20 characters')
  }
  if (typeof owner === 'string' && owner !== '' && !OWNER_RE.test(owner)) reasons.push('owner not a Jira key or GitHub login')
  const added = entry.added === undefined ? undefined : parseDate(entry.added)
  const expires = entry.expires === undefined ? undefined : parseDate(entry.expires)
  const now = parseDate(today)
  if (!now) throw new AllowlistError(`today ${JSON.stringify(today)} is not YYYY-MM-DD`)
  if (entry.added !== undefined && added === null) reasons.push('added not YYYY-MM-DD')
  if (entry.expires !== undefined && expires === null) reasons.push('expires not YYYY-MM-DD')
  if (added && added > now) reasons.push('added in the future')
  if (added && expires) {
    if (expires < added) reasons.push('expires before added')
    else if ((expires - added) / DAY > MAX_DAYS) reasons.push(`expiry more than ${MAX_DAYS} days after added`)
  }
  if (expires && now > expires) reasons.push(`expired on ${entry.expires}`)
  return { reasons, warnings }
}

/** → { valid: entries[], invalid: [{ entry, reasons }], warnings: [{ entry, warnings }] } */
export function validateAllowlist(doc, today) {
  const valid = []
  const invalid = []
  const warnings = []
  doc.entries.forEach((entry, index) => {
    const { reasons, warnings: w } = entryProblems(entry, today)
    const labelled = { ...entry, index }
    if (reasons.length) invalid.push({ entry: labelled, reasons })
    else valid.push(labelled)
    if (w.length) warnings.push({ entry: labelled, warnings: w })
  })
  return { valid, invalid, warnings }
}
