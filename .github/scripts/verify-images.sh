#!/usr/bin/env bash
# SCRUM-7-AC-22 (design §9.2): image labels, non-root users, runtime contents, no secrets in history, sizes.
# Usage: verify-images.sh <backend-image> <frontend-image>
# Env: GIT_COMMIT, JIRA_KEY, GITHUB_STEP_SUMMARY (optional); docker compose env (COMPOSE_*) for the running stack.
set -euo pipefail

backend="$1"
frontend="$2"
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
failures=0

fail() {
  echo "::error::$*"
  failures=$((failures + 1))
}

label() {
  docker image inspect -f "{{ index .Config.Labels \"$2\" }}" "$1"
}

declare -A size_target=([backend]=300 [frontend]=80)
declare -A image=([backend]="$backend" [frontend]="$frontend")
rows=()

for svc in backend frontend; do
  img="${image[$svc]}"
  result="ok"

  # 1. NFR-05: OCI labels and the Jira key.
  revision=$(label "$img" org.opencontainers.image.revision)
  jira=$(label "$img" com.vinods21.todo.jira)
  [ "$revision" = "$GIT_COMMIT" ] || { fail "$svc: org.opencontainers.image.revision='$revision', expected '$GIT_COMMIT'"; result="FAIL"; }
  [ "$jira" = "$JIRA_KEY" ] || { fail "$svc: com.vinods21.todo.jira='$jira', expected '$JIRA_KEY'"; result="FAIL"; }
  for l in title description version source created licenses; do
    v=$(label "$img" "org.opencontainers.image.$l")
    [ -n "$v" ] && [ "$v" != "<no value>" ] || { fail "$svc: label org.opencontainers.image.$l is empty"; result="FAIL"; }
  done
  for l in version created; do
    v=$(label "$img" "org.opencontainers.image.$l")
    [ "$v" != "UNKNOWN" ] || { fail "$svc: label org.opencontainers.image.$l is UNKNOWN"; result="FAIL"; }
  done

  # 2. NFR-01: non-root image user and running process.
  user=$(docker image inspect -f '{{ .Config.User }}' "$img")
  uid="${user%%:*}"
  if [ -z "$user" ] || ! [[ "$uid" =~ ^[0-9]+$ ]] || [ "$uid" = "0" ]; then
    fail "$svc: image user '$user' is not a numeric non-root UID"; result="FAIL"
  fi
  runtime_uid=$(docker compose exec -T "$svc" id -u 2>/dev/null | tr -d '\r' || echo "n/a")
  if [ "$runtime_uid" = "0" ] || ! [[ "$runtime_uid" =~ ^[0-9]+$ ]]; then
    fail "$svc: running container UID is '$runtime_uid'"; result="FAIL"
  fi

  # 3. NFR-02: no build tools in the runtime image.
  if [ "$svc" = backend ]; then
    check='! command -v javac && ! command -v mvn && [ ! -e /workspace ] && [ -f /app/app.jar ]'
  else
    check='! command -v node && ! command -v npm && [ -f /usr/share/nginx/html/index.html ]'
  fi
  if ! docker run --rm --entrypoint sh "$img" -c "$check" >/dev/null 2>&1; then
    fail "$svc: runtime image contains build tooling or misses its payload ($check)"; result="FAIL"
  fi

  # 4. NFR-06: no secret-bearing build arguments or env files in the history.
  if docker history --no-trunc --format '{{ .CreatedBy }}' "$img" | grep -Eq 'DB_PASSWORD|POSTGRES_PASSWORD|NPM_TOKEN|_authToken|\.env'; then
    fail "$svc: docker history mentions a secret-bearing value"; result="FAIL"
  fi

  # 5. NFR-03: size target (warning only).
  bytes=$(docker image inspect -f '{{ .Size }}' "$img")
  mb=$(( (bytes + 524288) / 1048576 ))
  target=${size_target[$svc]}
  size_note="$mb MB"
  if [ "$mb" -gt "$target" ]; then
    echo "::warning::$svc image is $mb MB (target <= $target MB, SCRUM-7-NFR-03)"
    size_note="$mb MB (over target)"
  fi

  rows+=("| $svc | \`$img\` | \`${revision:0:12}\` | \`$jira\` | \`$user\` | $runtime_uid | $size_note | <= $target MB | $result |")
done

{
  echo "### Images (SCRUM-7-AC-22, NFR-01..NFR-06)"
  echo
  echo "| image | tag | revision | jira | user | runtime UID | size | target | result |"
  echo "|---|---|---|---|---|---|---|---|---|"
  printf '%s\n' "${rows[@]}"
  echo
  echo "Sizes: \`docker image inspect .Size\` (uncompressed)."
} >> "$summary"

if [ "$failures" -gt 0 ]; then
  echo "$failures image check(s) failed"
  exit 1
fi
echo "All image checks passed"
