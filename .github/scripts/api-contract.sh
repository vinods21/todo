#!/usr/bin/env bash
# SCRUM-12-AC-08, AC-09 (ADR 0017, design §7.4): validate api/openapi.yaml; gate breaking changes against main.
# Env: EVENT_NAME, BASE_REF (pull_request only), REF_NAME, JIRA_KEY, OUT (default reports/api-contract),
#      GITHUB_STEP_SUMMARY. Needs oasdiff on PATH (.github/scripts/release/install-tools.sh oasdiff) and full history.
# Base: pull_request → merge-base(origin/$BASE_REF, HEAD); push to main → HEAD^1; other push → merge-base(origin/main, HEAD).
# Exit: 0 pass · 1 unacknowledged breaking change · 2 error (invalid spec, malformed ack file, missing tool).
set -euo pipefail

spec=api/openapi.yaml
ack=api/breaking-changes.ack
out="${OUT:-reports/api-contract}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
root="$PWD"
mkdir -p "$out"
work=$(mktemp -d) # oasdiff runs here, so no repo-level .oasdiff.* config can change severities

command -v oasdiff >/dev/null || { echo "::error::SCRUM-12-AC-08: oasdiff not found (install-tools.sh oasdiff)"; exit 2; }
for f in .oasdiff.yaml .oasdiff.yml .oasdiff.json; do
  if [ -e "$f" ]; then
    echo "::error::SCRUM-12-AC-09: $f is not allowed (it would bypass the reviewed gate)"
    exit 2
  fi
done
[ -f "$spec" ] || { echo "::error::SCRUM-12-AC-01: $spec not found"; exit 2; }

echo "oasdiff validate ${spec} ($(oasdiff --version))"
if ! (cd "$work" && oasdiff validate "$root/$spec" --allow-external-refs=false --fail-on ERR --format githubactions); then
  echo "::error::SCRUM-12-AC-01: ${spec} is not a valid OpenAPI document (oasdiff validate)"
  exit 2
fi
echo "SCRUM-12-AC-01: ${spec} is valid"

case "${EVENT_NAME:-push}" in
  pull_request)
    base=$(git merge-base "origin/${BASE_REF:?BASE_REF required for pull_request}" HEAD)
    ;;
  *)
    if [ "${REF_NAME:-}" = main ]; then
      base=$(git rev-parse --verify --quiet 'HEAD^1' || true)
    else
      base=$(git merge-base origin/main HEAD)
    fi
    ;;
esac

gate=(node "$root/.github/scripts/api/breaking-gate.mjs" --ack "$ack" --jira-key "${JIRA_KEY:-UNKNOWN}" --summary "$summary")
if [ -z "$base" ] || ! git cat-file -e "${base}:${spec}" 2>/dev/null; then
  echo "::notice::SCRUM-12-AC-08: no ${spec} at base ${base:-<none>}; breaking-change check skipped (first introduction)"
  exec "${gate[@]}" --no-base
fi

git show "${base}:${spec}" > "$work/base.yaml"
echo "Comparing ${spec} with ${base} (${EVENT_NAME:-push} ${REF_NAME:-})"
(cd "$work" && oasdiff changelog base.yaml "$root/$spec" --allow-external-refs=false --format json) > "$out/changes.json"
(cd "$work" && oasdiff changelog base.yaml "$root/$spec" --allow-external-refs=false --format markdown) > "$out/changelog.md"
exec "${gate[@]}" --base "$base" --changes "$out/changes.json" --changelog "$out/changelog.md" --out "$out/verdict.json"
