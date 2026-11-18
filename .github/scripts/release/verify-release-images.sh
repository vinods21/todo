#!/usr/bin/env bash
# SCRUM-8-AC-04, AC-14, AC-25 (design §6.2 images): the images built once from the tested artefacts carry the right
# labels and exactly the tested payload. Usage: verify-release-images.sh <backend ref> <frontend ref> <in/backend> <in/frontend>
# env: VERSION, SHA, JIRA_KEY, GITHUB_STEP_SUMMARY (optional). Images must be loaded into the Docker daemon.
set -euo pipefail

backend="$1"
frontend="$2"
in_backend="$3"
in_frontend="$4"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
failures=0
fail() {
  echo "::error::$*"
  failures=$((failures + 1))
}
label() {
  docker image inspect -f "{{ index .Config.Labels \"$2\" }}" "$1"
}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rows=()

for svc in backend frontend; do
  if [ "$svc" = backend ]; then img="$backend"; else img="$frontend"; fi
  result=ok
  for pair in "org.opencontainers.image.version=$VERSION" "org.opencontainers.image.revision=$SHA" \
              "org.opencontainers.image.source=https://github.com/vinods21/todo" "com.vinods21.todo.jira=$JIRA_KEY"; do
    k="${pair%%=*}"
    want="${pair#*=}"
    got=$(label "$img" "$k")
    [ "$got" = "$want" ] || { fail "$svc: label $k='$got', expected '$want'"; result=FAIL; }
  done
  for k in org.opencontainers.image.created org.opencontainers.image.base.name org.opencontainers.image.title; do
    got=$(label "$img" "$k")
    if [ -z "$got" ] || [ "$got" = "<no value>" ] || [ "$got" = UNKNOWN ]; then fail "$svc: label $k is empty/UNKNOWN"; result=FAIL; fi
  done
  user=$(docker image inspect -f '{{ .Config.User }}' "$img")
  [[ "${user%%:*}" =~ ^[1-9][0-9]*$ ]] || { fail "$svc: image user '$user' is not a non-root UID"; result=FAIL; }

  cid=$(docker create "$img")
  if [ "$svc" = backend ]; then
    docker cp "$cid:/app/app.jar" "$work/app.jar" >/dev/null
    a=$(sha256sum "$work/app.jar" | cut -d' ' -f1)
    b=$(sha256sum "$in_backend/todo-backend-${VERSION}.jar" | cut -d' ' -f1)
    [ "$a" = "$b" ] || { fail "backend: /app/app.jar ($a) is not the tested jar ($b) — build once violated (AC-25)"; result=FAIL; }
    payload="app.jar = tested jar \`${a:0:12}\`"
  else
    mkdir -p "$work/dist" "$work/html"
    tar -xzf "$in_frontend/todo-frontend-${VERSION}.tar.gz" -C "$work/dist"
    docker cp "$cid:/usr/share/nginx/html/." "$work/html" >/dev/null
    if diff -r "$work/dist" "$work/html" >/dev/null; then
      payload="html/ = tested bundle"
    else
      fail "frontend: /usr/share/nginx/html differs from the tested bundle (AC-25)"
      diff -rq "$work/dist" "$work/html" | head -n 20 || true
      result=FAIL
      payload="differs"
    fi
    v=$(jq -r .version "$work/html/build-info.json")
    [ "$v" = "$VERSION" ] || { fail "frontend: build-info.json version '$v' != $VERSION"; result=FAIL; }
  fi
  docker rm "$cid" >/dev/null
  bytes=$(docker image inspect -f '{{ .Size }}' "$img")
  rows+=("| $svc | \`$img\` | \`$(label "$img" org.opencontainers.image.version)\` | \`$(label "$img" org.opencontainers.image.base.name)\` | \`$user\` | $(( (bytes + 524288) / 1048576 )) MB | $payload | $result |")
done

{
  echo "### Release images (SCRUM-8-AC-04, AC-14, AC-25)"
  echo
  echo "| image | ref | version label | base | user | size (uncompressed) | payload | result |"
  echo "|---|---|---|---|---|---|---|---|"
  printf '%s\n' "${rows[@]}"
  echo
} | tee -a "$summary"
[ "$failures" -eq 0 ] || { echo "$failures check(s) failed"; exit 1; }
echo "release image checks passed"
