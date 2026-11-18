#!/usr/bin/env bash
# SCRUM-8-AC-16, AC-28 (design §9.3): post-publish verification from the outside. Any failure → exit 1 with recovery
# instructions. env: VERSION, SHA, IMAGE_TAGS, BACKEND_DIGEST, FRONTEND_DIGEST, IMAGE_BACKEND, IMAGE_FRONTEND, REPO,
# GH_TOKEN, GITHUB_STEP_SUMMARY. skopeo must be logged in to ghcr.io (packages may still be private, Q-09).
set -uo pipefail

summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
failures=0
rows=()
row() { # <check> <ok|FAIL|info> <detail>
  rows+=("| $1 | $2 | $3 |")
  if [ "$2" = FAIL ]; then
    failures=$((failures + 1))
    echo "::error::SCRUM-8-AC-28: $1 — $3"
  fi
}
signer="${REPO}/.github/workflows/release.yml"

for pair in "${IMAGE_BACKEND}=${BACKEND_DIGEST}" "${IMAGE_FRONTEND}=${FRONTEND_DIGEST}"; do
  img="${pair%%=*}"
  digest="${pair#*=}"
  # 1. every tag resolves to the expected digest
  for t in $IMAGE_TAGS; do
    got="sha256:$(skopeo inspect --retry-times 3 --raw "docker://$img:$t" 2>/dev/null | sha256sum | cut -d' ' -f1)"
    if [ "$got" = "$digest" ]; then row "\`$img:$t\` digest" ok "\`$digest\`"; else row "\`$img:$t\` digest" FAIL "got \`$got\`"; fi
  done
  # 2. labels
  cfg=$(skopeo inspect --retry-times 3 --config "docker://$img@$digest" 2>/dev/null || echo '{}')
  for kv in "org.opencontainers.image.version=$VERSION" "org.opencontainers.image.revision=$SHA" \
            "org.opencontainers.image.source=https://github.com/vinods21/todo" "com.vinods21.todo.jira=main"; do
    k="${kv%%=*}"
    want="${kv#*=}"
    got=$(jq -r --arg k "$k" '.config.Labels[$k] // ""' <<<"$cfg")
    if [ "$got" = "$want" ]; then row "\`$img\` label $k" ok "\`$got\`"; else row "\`$img\` label $k" FAIL "got \`$got\`, want \`$want\`"; fi
  done
  # 3. provenance + SBOM attestations
  if gh attestation verify "oci://$img@$digest" --repo "$REPO" --signer-workflow "$signer" >/dev/null 2>"/tmp/att.err"; then
    row "\`$img\` provenance attestation" ok "gh attestation verify"
  else row "\`$img\` provenance attestation" FAIL "$(head -c 300 /tmp/att.err | tr '\n' ' ')"; fi
  if gh attestation verify "oci://$img@$digest" --repo "$REPO" --predicate-type https://cyclonedx.org/bom >/dev/null 2>"/tmp/att.err"; then
    row "\`$img\` SBOM attestation" ok "predicate https://cyclonedx.org/bom"
  else row "\`$img\` SBOM attestation" FAIL "$(head -c 300 /tmp/att.err | tr '\n' ' ')"; fi
done

# 4. release assets: checksums + file attestations
rm -rf dl && mkdir dl
if gh release download "v$VERSION" --repo "$REPO" -D dl >/dev/null 2>&1; then
  if (cd dl && sha256sum -c SHA256SUMS); then row "release assets" ok "\`sha256sum -c SHA256SUMS\`"; else row "release assets" FAIL "sha256sum -c failed"; fi
  for f in "todo-backend-${VERSION}.jar" "todo-frontend-${VERSION}.tar.gz"; do
    if gh attestation verify "dl/$f" --repo "$REPO" --signer-workflow "$signer" >/dev/null 2>/tmp/att.err; then row "\`$f\` attestation" ok "gh attestation verify"
    else row "\`$f\` attestation" FAIL "$(head -c 300 /tmp/att.err | tr '\n' ' ')"; fi
  done
else
  row "release assets" FAIL "gh release download v$VERSION failed"
fi

# 5. annotated tag on the built commit
refs=$(git ls-remote --tags "https://github.com/$REPO" "refs/tags/v$VERSION" "refs/tags/v$VERSION^{}")
peeled=$(awk -v r="refs/tags/v$VERSION^{}" '$2 == r {print $1}' <<<"$refs")
if [ "$(wc -l <<<"$refs")" = 2 ] && [ "$peeled" = "$SHA" ]; then row "tag \`v$VERSION\`" ok "annotated, → \`$SHA\`"
else row "tag \`v$VERSION\`" FAIL "ls-remote: $(tr '\n' ' ' <<<"$refs")"; fi

# 6. release is published and latest
rel=$(gh api "repos/$REPO/releases/tags/v$VERSION" --jq '"\(.draft) \(.prerelease)"' 2>/dev/null || echo "error")
latest=$(gh api "repos/$REPO/releases/latest" --jq .tag_name 2>/dev/null || echo "error")
if [ "$rel" = "false false" ] && [ "$latest" = "v$VERSION" ]; then row "GitHub Release" ok "published, latest"; else row "GitHub Release" FAIL "draft/prerelease=$rel latest=$latest"; fi

# 7. immutable releases (informational when the setting or the gh command is unavailable)
if [ "$(gh api "repos/$REPO/immutable-releases" --jq .enabled 2>/dev/null)" = true ]; then
  if gh release verify "v$VERSION" --repo "$REPO" >/dev/null 2>&1; then row "release attestation (immutable releases)" ok "gh release verify"
  else row "release attestation (immutable releases)" info "gh release verify unavailable or failed — check manually"; fi
else
  row "immutable releases" info "not enabled on the repository (AC-29: owner setting)"
fi

{
  echo "### Post-publish verification (SCRUM-8-AC-28)"
  echo
  echo "| check | result | detail |"
  echo "|---|---|---|"
  printf '%s\n' "${rows[@]}"
  echo
  if [ "$failures" -gt 0 ]; then
    echo "**$failures check(s) FAILED.** Recovery: docs/release/RELEASE.md#failure-recovery — never overwrite or delete;"
    echo "the version is published, fix forward with the next patch release."
  fi
} | tee -a "$summary"
[ "$failures" -eq 0 ]
