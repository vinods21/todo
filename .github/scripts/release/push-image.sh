#!/usr/bin/env bash
# SCRUM-8-AC-13, AC-25 (design §9.2 steps 5/11): push the verified OCI archive by digest under the given tags and
# assert that every pushed manifest has exactly the scanned digest. Never builds anything.
# Usage: push-image.sh <image.oci.tar> <ghcr image> <expected sha256:…> <tag>...   (skopeo logged in to ghcr.io)
set -euo pipefail

archive="$1"
image="$2"
expected="$3"
shift 3
[ "$#" -gt 0 ] || { echo "usage: $0 <archive> <image> <digest> <tag>..." >&2; exit 2; }
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

for tag in "$@"; do
  [[ "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || { echo "::error::invalid tag $tag"; exit 1; }
  echo "pushing $image:$tag (expected $expected)"
  skopeo copy --retry-times 3 --preserve-digests "oci-archive:$archive" "docker://$image:$tag"
  got="sha256:$(skopeo inspect --retry-times 3 --raw "docker://$image:$tag" | sha256sum | cut -d' ' -f1)"
  if [ "$got" != "$expected" ]; then
    echo "::error::SCRUM-8-AC-25: $image:$tag has digest $got, expected $expected — STOP, see docs/release/RELEASE.md#failure-recovery"
    exit 1
  fi
  echo "| \`$image:$tag\` | \`$got\` | ok |" | tee -a "$summary"
done
