#!/usr/bin/env bash
# SCRUM-8-AC-17 (design §7.3): CycloneDX schema validation of each SBOM with its own specVersion (>= 1.5).
# Usage: validate-sboms.sh <file.cdx.json>...   (needs cyclonedx-cli as `cyclonedx` and jq)
set -euo pipefail

[ "$#" -gt 0 ] || { echo "usage: $0 <sbom>..." >&2; exit 2; }
for f in "$@"; do
  v=$(jq -r '.specVersion // empty' "$f")
  case "$v" in
    1.5 | 1.6 | 1.7) ;;
    *) echo "::error::SCRUM-8-AC-17: $f has specVersion '$v' (need CycloneDX >= 1.5)"; exit 1 ;;
  esac
  echo "validating $f (CycloneDX $v)"
  cyclonedx validate --input-file "$f" --input-format json --input-version "v${v/./_}" --fail-on-errors
done
