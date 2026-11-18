// SCRUM-8-AC-06, AC-11 (design §4.4): mode derivation and the release guard rails.
import { RELEASE_TAG_RE } from './semver.mjs'

/** release ⇔ workflow_dispatch with dry_run=false; everything else (push, pull_request, dry_run=true) is a dry run. */
export function deriveMode(eventName, inputDryRun) {
  return eventName === 'workflow_dispatch' && String(inputDryRun).trim().toLowerCase() === 'false'
    ? 'release'
    : 'dry-run'
}

/**
 * Release mode only: refuse unless ref is main, the checked-out commit is the dispatched one and that commit has no
 * release tag yet. Returns { ok, reasons[] }; a dry run is never refused (the summary says what a release would do).
 */
export function checkReleaseGuard({ mode, ref, dispatchedSha, headSha, tagsAtHead = [] }) {
  const reasons = []
  const released = tagsAtHead.filter((t) => RELEASE_TAG_RE.test(t))
  if (ref !== 'refs/heads/main') {
    reasons.push(`releases are cut from main only (ref is ${ref}); re-run with dry_run=true to test another ref`)
  }
  if (!headSha || !dispatchedSha || headSha.toLowerCase() !== dispatchedSha.toLowerCase()) {
    reasons.push(`checked-out commit ${headSha} is not the dispatched commit ${dispatchedSha}`)
  }
  if (released.length > 0) {
    reasons.push(`commit ${dispatchedSha} is already released as ${released.join(', ')} (no second version per commit)`)
  }
  if (mode !== 'release') return { ok: true, reasons: [], wouldRefuse: reasons }
  return { ok: reasons.length === 0, reasons, wouldRefuse: reasons }
}
