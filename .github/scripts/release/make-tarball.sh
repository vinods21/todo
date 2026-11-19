#!/usr/bin/env bash
# SCRUM-8-AC-10, NFR-03 (design §10): deterministic .tar.gz of a directory (sorted names, fixed mtime/owner, no gzip
# timestamp). Usage: SOURCE_DATE_EPOCH=<commit epoch> make-tarball.sh <dir> <out.tar.gz>
set -euo pipefail

dir="$1"
out="$2"
: "${SOURCE_DATE_EPOCH:?SOURCE_DATE_EPOCH (commit time) is required for a reproducible tarball}"
mkdir -p "$(dirname "$out")"
tar --sort=name --mtime="@${SOURCE_DATE_EPOCH}" --owner=0 --group=0 --numeric-owner --format=posix \
  --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
  -cf - -C "$dir" . | gzip -n -9 > "$out"
echo "$out $(sha256sum "$out" | cut -d' ' -f1)"
