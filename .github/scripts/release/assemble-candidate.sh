#!/usr/bin/env bash
# SCRUM-8-AC-10, AC-11, AC-25, AC-26, NFR-06 (design §9.1): assemble the release-candidate bundle — identical in dry-run
# and release mode — and write the run summary.
# Inputs: in/backend, in/frontend, in/sbom, in/scan (downloaded artifacts). Output: candidate/.
# env: MODE, VERSION (stamped), RELEASE_VERSION, BUILD_VERSION, SHA, JIRA_KEY, PREVIOUS_TAG, IMAGE_TAGS,
#      BACKEND_DIGEST, FRONTEND_DIGEST, JAR_SHA256, TARBALL_SHA256, JAR_REPRO, TARBALL_REPRO, COMMIT_EPOCH,
#      IMAGE_BACKEND, IMAGE_FRONTEND, REPO, RUN_URL, CANDIDATE_ARTIFACT, GITHUB_STEP_SUMMARY
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
v="$VERSION"
rm -rf candidate
mkdir -p candidate/assets
a=candidate/assets

die() {
  echo "::error::$*"
  exit 1
}

cp "in/backend/todo-backend-${v}.jar" "$a/"
cp "in/frontend/todo-frontend-${v}.tar.gz" "$a/"
for s in "todo-backend-${v}.cdx.json" "todo-frontend-${v}.cdx.json" "todo-backend-image-${v}.cdx.json" "todo-frontend-image-${v}.cdx.json"; do
  [ -s "in/sbom/$s" ] || die "SCRUM-8-AC-17: SBOM $s missing from the sbom artifact"
  cp "in/sbom/$s" "$a/"
done
[ -s in/scan/verdict.json ] || die "SCRUM-8-AC-23: scan/verdict.json missing"
SOURCE_DATE_EPOCH="$COMMIT_EPOCH" "$here/make-tarball.sh" in/scan "$a/todo-scan-reports-${v}.tar.gz" >/dev/null

jq -n --arg version "$v" --arg commit "$SHA" --arg tags "$IMAGE_TAGS" \
  --arg b "$IMAGE_BACKEND" --arg bd "$BACKEND_DIGEST" --arg f "$IMAGE_FRONTEND" --arg fd "$FRONTEND_DIGEST" \
  '{version: $version, commit: $commit, images: [
     {name: $b, digest: $bd, tags: ($tags | split(" "))},
     {name: $f, digest: $fd, tags: ($tags | split(" "))}]}' > "$a/todo-images-${v}.json"

sums=$(cd "$a" && find . -maxdepth 1 -type f -printf '%f\n' | LC_ALL=C sort | xargs sha256sum)
printf '%s\n' "$sums" > "$a/SHA256SUMS"
(cd "$a" && sha256sum -c --quiet SHA256SUMS) || die "SCRUM-8-AC-26: sha256sum -c SHA256SUMS failed"

sum_of() { awk -v n="$1" '$2 == n {print $1}' "$a/SHA256SUMS"; }
[ "$(sum_of "todo-backend-${v}.jar")" = "$JAR_SHA256" ] ||
  die "SCRUM-8-AC-25: jar checksum $(sum_of "todo-backend-${v}.jar") != built $JAR_SHA256"
[ "$(sum_of "todo-frontend-${v}.tar.gz")" = "$TARBALL_SHA256" ] ||
  die "SCRUM-8-AC-25: tarball checksum $(sum_of "todo-frontend-${v}.tar.gz") != built $TARBALL_SHA256"

notes_version="$RELEASE_VERSION"
dry=()
[ "$MODE" = release ] || dry=(--dry-run)
node "$here/release-notes.mjs" --version "$notes_version" --sha "$SHA" --previous-tag "$PREVIOUS_TAG" \
  --digests "backend=${BACKEND_DIGEST},frontend=${FRONTEND_DIGEST}" --verdict in/scan/verdict.json \
  --repo "$REPO" --run-url "$RUN_URL" "${dry[@]}" --out candidate/release-notes.md
if [ "$MODE" != release ]; then
  { echo; echo "> Dry-run artefacts are stamped with the build version \`$v\`; a release of this commit would stamp \`$RELEASE_VERSION\`."; } >> candidate/release-notes.md
fi
jq -n --arg mode "$MODE" --arg version "$v" --arg release_version "$RELEASE_VERSION" --arg build_version "$BUILD_VERSION" \
  --arg sha "$SHA" --arg jira "$JIRA_KEY" --arg previous_tag "$PREVIOUS_TAG" --arg image_tags "$IMAGE_TAGS" \
  --arg backend_digest "$BACKEND_DIGEST" --arg frontend_digest "$FRONTEND_DIGEST" --arg run "$RUN_URL" \
  '$ARGS.named' > candidate/plan.json

verdict=$(jq -r .verdict in/scan/verdict.json)
counts=$(jq -r '.targets | to_entries | map("\(.key): \(.value.counts.CRITICAL)C/\(.value.counts.HIGH)H/\(.value.counts.MEDIUM)M/\(.value.counts.LOW)L") | join(" · ")' in/scan/verdict.json)
entries=$(jq -r '[.allowlist.valid[] | "\(.id) (\(.package), expires \(.expires))"] | if length == 0 then "none" else join(", ") end' in/scan/verdict.json)
{
  if [ "$MODE" = release ]; then echo "## 📦 RELEASE CANDIDATE \`$v\` — gate passed, publishing next"; else echo "## 🧪 DRY RUN — release candidate \`$v\` (would-be release \`$RELEASE_VERSION\`; nothing published)"; fi
  echo
  echo "Commit \`$SHA\` · Jira key \`$JIRA_KEY\` · previous release ${PREVIOUS_TAG:-none} · candidate artifact \`${CANDIDATE_ARTIFACT:-candidate}\` · [run]($RUN_URL)"
  echo
  echo "| asset | size | SHA-256 |"
  echo "|---|---|---|"
  while read -r sum name; do
    echo "| \`$name\` | $(stat -c %s "$a/$name") B | \`$sum\` |"
  done < "$a/SHA256SUMS"
  echo "| \`SHA256SUMS\` | $(stat -c %s "$a/SHA256SUMS") B | (covers all of the above) |"
  echo
  echo "| image | digest (local, not pushed in dry-run) | tags |"
  echo "|---|---|---|"
  echo "| \`$IMAGE_BACKEND\` | \`$BACKEND_DIGEST\` | $IMAGE_TAGS |"
  echo "| \`$IMAGE_FRONTEND\` | \`$FRONTEND_DIGEST\` | $IMAGE_TAGS |"
  echo
  echo "| SBOM | CycloneDX | components |"
  echo "|---|---|---|"
  for s in "$a"/*.cdx.json; do
    n=$(basename "$s")
    echo "| \`$n\` | $(jq -r .specVersion "$s") | $(jq -r --arg n "$n" '.[$n] // "?"' in/sbom/sbom-counts.json) |"
  done
  echo
  echo "Vulnerability gate: **$verdict** · $counts · allow-list entries in effect: $entries"
  echo
  echo "Reproducibility (NFR-03, report only): jar ${JAR_REPRO:-n/a} · tarball ${TARBALL_REPRO:-n/a}"
  echo
} | tee -a "$summary"
echo "### SHA256SUMS"
cat "$a/SHA256SUMS"
echo "### release-notes.md"
cat candidate/release-notes.md
