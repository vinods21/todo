#!/usr/bin/env bash
# SCRUM-8-AC-25: print the manifest digest of a single-image OCI archive; assert it equals the expected digest if given.
# Usage: oci-digest.sh <image.oci.tar> [expected sha256:…]
set -euo pipefail

archive="$1"
expected="${2:-}"
index=$(tar -xOf "$archive" index.json)
count=$(jq '.manifests | length' <<<"$index")
if [ "$count" != "1" ]; then
  echo "::error::SCRUM-8-AC-25: $archive holds $count manifests (expected exactly 1, linux/amd64 without attestations)" >&2
  exit 1
fi
digest=$(jq -r '.manifests[0].digest' <<<"$index")
if ! [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "::error::SCRUM-8-AC-25: $archive has an invalid digest '$digest'" >&2
  exit 1
fi
if [ -n "$expected" ] && [ "$expected" != "$digest" ]; then
  echo "::error::SCRUM-8-AC-25: $archive digest $digest != expected $expected" >&2
  exit 1
fi
echo "$digest"
