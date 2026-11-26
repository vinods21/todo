#!/usr/bin/env bash
# SCRUM-8-AC-15 (design §11.3): Compose resolves the image overrides used to run published releases — no pull, no build.
# SCRUM-13 (design §11.1): + the Keycloak image is pinned by digest; TODO_KEYCLOAK_PORT moves every Keycloak URL.
# Usage: check-compose-images.sh   (needs `docker compose` and jq; run from the repository root)
set -euo pipefail

failures=0
config_json() { # [env assignments...] — the resolved Compose model with defaults (no pull, no build)
  env -u TODO_BACKEND_IMAGE -u TODO_FRONTEND_IMAGE -u TODO_IMAGE_TAG -u TODO_BACKEND_TAG -u TODO_FRONTEND_TAG \
    -u TODO_KEYCLOAK_IMAGE -u TODO_KEYCLOAK_PORT -u TODO_FRONTEND_PORT -u COMPOSE_PROFILES "$@" \
    docker compose --profile app config --format json
}
image_of() { # <service> [env assignments...]
  local svc="$1"
  shift
  config_json "$@" | jq -r ".services.${svc}.image"
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

# SCRUM-13-AC-01, NFR-04: Keycloak (third-party dev/CI service, never built or published) is pinned by tag AND digest.
keycloak=$(image_of keycloak)
if [[ "$keycloak" =~ ^quay\.io/keycloak/keycloak:[0-9][0-9.]*@sha256:[0-9a-f]{64}$ ]]; then
  echo "ok   pinned by tag and digest (SCRUM-13-NFR-04): keycloak → $keycloak"
else
  echo "::error::SCRUM-13-NFR-04: keycloak image '$keycloak' is not pinned as quay.io/keycloak/keycloak:<version>@sha256:<digest>"
  failures=$((failures + 1))
fi

# SCRUM-13-AC-29: one variable moves Keycloak — published port, KC_HOSTNAME, the backend's issuer and the frontend's
# AUTH_URL follow TODO_KEYCLOAK_PORT together; the realm's app URL follows TODO_FRONTEND_PORT.
follow=$(config_json TODO_KEYCLOAK_PORT=8280 TODO_FRONTEND_PORT=3100 | jq -c '{
  port: (.services.keycloak.ports[0].published | tostring),
  hostname: .services.keycloak.environment.KC_HOSTNAME,
  public: .services.keycloak.environment.TODO_KC_PUBLIC_URL,
  app: .services.keycloak.environment.TODO_APP_URL,
  issuer: .services.backend.environment.APP_AUTH_ISSUER_URI,
  auth: .services.frontend.environment.AUTH_URL}')
want='{"port":"8280","hostname":"http://localhost:8280","public":"http://localhost:8280","app":"http://localhost:3100","issuer":"http://localhost:8280/realms/todo","auth":"http://localhost:8280"}'
if [ "$follow" = "$want" ]; then
  echo "ok   TODO_KEYCLOAK_PORT=8280 TODO_FRONTEND_PORT=3100 (SCRUM-13-AC-29): $follow"
else
  echo "::error::SCRUM-13-AC-29: with TODO_KEYCLOAK_PORT=8280 TODO_FRONTEND_PORT=3100 got $follow, expected $want"
  failures=$((failures + 1))
fi

{
  echo "### Compose image overrides (SCRUM-8-AC-15; SCRUM-13-AC-29, NFR-04): $([ "$failures" -eq 0 ] && echo ok || echo "$failures failure(s)")"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
[ "$failures" -eq 0 ]
