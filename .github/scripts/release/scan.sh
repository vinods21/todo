#!/usr/bin/env bash
# SCRUM-8-AC-19, AC-20, AC-23 (ADR 0014, design §8.2): Trivy scans of every target into scan/<target>.json + .sarif.
# Usage: scan.sh <version>   (inputs: in/backend, in/frontend, images/, frontend/package-lock.json; DB already updated)
# Any Trivy error fails the script (set -e) → the gate is never reached → release-gate fails (fail closed, AC-21).
# Trivy's own exit code is not the policy (--exit-code 0): vuln-gate.mjs is.
set -euo pipefail

v="$1"
cache="${TRIVY_CACHE_DIR:-$HOME/.cache/trivy}"
mkdir -p scan
common=(--format json --cache-dir "$cache" --skip-db-update --skip-java-db-update --exit-code 0 --quiet --timeout 15m)

scan() { # <target> <trivy args...>
  local t="$1"
  shift
  echo "::group::trivy $* → scan/$t.json"
  trivy "$@" "${common[@]}" --output "scan/$t.json"
  trivy convert --format sarif --output "scan/$t.sarif" "scan/$t.json"
  echo "results: $(jq '[.Results[]? | (.Vulnerabilities // []) | length] | add // 0' "scan/$t.json") vulnerabilities, $(jq '[.Results[]? | (.Secrets // []) | length] | add // 0' "scan/$t.json") secrets"
  echo "::endgroup::"
}

scan backend-runtime sbom "in/backend/todo-backend-${v}.cdx.json"
scan backend-all-scopes sbom "in/backend/todo-backend-all-scopes-${v}.cdx.json"
scan frontend-prod sbom "in/frontend/todo-frontend-${v}.cdx.json"
scan frontend-all fs --scanners vuln --include-dev-deps frontend/package-lock.json
scan backend-image image --input images/todo-backend.oci.tar --scanners vuln,secret
scan frontend-image image --input images/todo-frontend.oci.tar --scanners vuln,secret
ls -l scan
