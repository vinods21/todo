// ADR 0008 (amended by ADR 0013): the Jira key derived from the branch — same regex as the former inline step.
// feature/SCRUM-<n>-<slug> → SCRUM-<n>; main → main; anything else → NONE (local builds: UNKNOWN).
const FEATURE_RE = /^feature\/(SCRUM-[0-9]+)(-|$)/

export function jiraKeyFromBranch(branch) {
  const m = FEATURE_RE.exec(branch ?? '')
  if (m) return m[1]
  if (branch === 'main') return 'main'
  return 'NONE'
}
