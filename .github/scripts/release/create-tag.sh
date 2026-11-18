#!/usr/bin/env bash
# SCRUM-8-AC-09 (design §9.2 step 8): annotated tag vX.Y.Z on the built commit via the Git Data API (GITHUB_TOKEN, no
# PAT, no bot commit). Creating an existing ref fails (HTTP 422) — tags are never moved or overwritten.
# Usage: create-tag.sh <vX.Y.Z> <sha>   env: GH_TOKEN, REPO, RUN_URL
set -euo pipefail

tag="$1"
sha="$2"
[[ "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo "::error::invalid tag $tag"; exit 1; }
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::invalid sha $sha"; exit 1; }
message="todo ${tag#v}

Commit: ${sha}
Run: ${RUN_URL:-n/a}"

object=$(gh api -X POST "repos/${REPO}/git/tags" -f tag="$tag" -f message="$message" -f object="$sha" -f type=commit --jq .sha)
echo "tag object $object"
gh api -X POST "repos/${REPO}/git/refs" -f ref="refs/tags/$tag" -f sha="$object" --jq .ref

peeled=$(git ls-remote --tags "https://github.com/${REPO}" "refs/tags/${tag}^{}" | cut -f1)
if [ "$peeled" != "$sha" ]; then
  echo "::error::SCRUM-8-AC-09: remote $tag^{} is '$peeled', expected $sha"
  exit 1
fi
echo "annotated tag $tag → $sha"
