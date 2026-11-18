#!/usr/bin/env bash
# SCRUM-8-AC-15 (design §11.3): Compose resolves the image overrides used to run published releases — no pull, no build.
# Usage: check-compose-images.sh   (needs `docker compose` and jq; run from the repository root)
set -euo pipefail

failures=0
image_of() { # <service> [env assignments...]
  local svc="$1"
  shift
  env -u TODO_BACKEND_IMAGE -u TODO_FRONTEND_IMAGE -u TODO_IMAGE_TAG -u TODO_BACKEND_TAG -u TODO_FRONTEND_TAG \
    -u COMPOSE_PROFILES "$@" docker compose --profile app config --format json | jq -r ".services.${svc}.image"
}
expect() { # <description> <service> <expected> [env...]
  local desc="$1" svc="$2" want="$3"
  shift 3
  local got
  got=$(image_of "$svc" "$@")
  if [ "$got" = "$want" ]; then
    echo "ok   $desc: $svc → $got"
  else
    echo "::error::SCRUM-8-AC-15: $desc: $svc image is '$got', expected '$want'"
    failures=$((failures + 1))
  fi
}

digest="sha256:$(printf '%064d' 0 | tr 0 a)"
expect "defaults (NFR-09)" backend todo-backend:local
expect "defaults (NFR-09)" frontend todo-frontend:local
expect "CI tag" backend todo-backend:SCRUM-8-abc TODO_IMAGE_TAG=SCRUM-8-abc
for svc in backend frontend; do
  expect "published release" "$svc" "ghcr.io/vinods21/todo-$svc:0.1.0" \
    TODO_BACKEND_IMAGE=ghcr.io/vinods21/todo-backend TODO_FRONTEND_IMAGE=ghcr.io/vinods21/todo-frontend TODO_IMAGE_TAG=0.1.0
done
expect "pinned by digest (rollback)" backend "ghcr.io/vinods21/todo-backend:0.1.0@${digest}" \
  TODO_BACKEND_IMAGE=ghcr.io/vinods21/todo-backend TODO_IMAGE_TAG=0.2.0 "TODO_BACKEND_TAG=0.1.0@${digest}"
expect "pinned by digest (rollback)" frontend "ghcr.io/vinods21/todo-frontend:0.1.0@${digest}" \
  TODO_FRONTEND_IMAGE=ghcr.io/vinods21/todo-frontend TODO_IMAGE_TAG=0.2.0 "TODO_FRONTEND_TAG=0.1.0@${digest}"

{
  echo "### Compose image overrides (SCRUM-8-AC-15): $([ "$failures" -eq 0 ] && echo ok || echo "$failures failure(s)")"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
[ "$failures" -eq 0 ]
