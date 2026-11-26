#!/usr/bin/env bash
# SCRUM-7-AC-03, AC-10 (design §9.3): clean SIGTERM shutdown of the backend, data kept across backend restart and
# down/up without re-applying migrations, data removed by down -v. Uses curl, jq and docker compose (COMPOSE_* env).
# SCRUM-13-AC-33: every API call authenticates with a client-credentials token of the service account todo-e2e
# (LOCAL DEVELOPMENT ONLY secret, keycloak/realms/todo-realm.json); a fresh token after each `up` (a new Keycloak
# container re-imports the realm, so earlier tokens' keys are gone).
set -euo pipefail

FE="http://localhost:${TODO_FRONTEND_PORT:-3000}"
KC="http://localhost:${TODO_KEYCLOAK_PORT:-8180}"
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
reports="e2e/reports"
mkdir -p "$reports"

token() {
  curl -sf -d grant_type=client_credentials -d client_id="${E2E_CLIENT_ID:-todo-e2e}" \
    -d client_secret="${E2E_CLIENT_SECRET:-dev-only-todo-e2e-secret}" \
    "$KC/realms/todo/protocol/openid-connect/token" | jq -r .access_token
}

status_of() {
  curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $(token)" "$1"
}

flyway_count() {
  docker compose exec -T postgres psql -U "${TODO_DB_USER:-todo}" -d "${TODO_DB_NAME:-todo}" -tAc \
    'select count(*) from flyway_schema_history' | tr -d '[:space:]'
}

fail() {
  echo "::error::$*"
  echo "- FAIL: $*" >> "$summary"
  exit 1
}

echo "### Lifecycle and persistence (SCRUM-7-AC-03, AC-10)" >> "$summary"
echo >> "$summary"

# 1. Marker task through the proxy.
# SCRUM-13-AC-26b / AC-33: anonymous requests are refused (401), authenticated ones work.
anonymous=$(curl -s -o /dev/null -w '%{http_code}' "$FE/api/tasks")
echo "- SCRUM-13: anonymous \`GET /api/tasks\` → **$anonymous** (expected 401); API calls below use a todo-e2e token" >> "$summary"
[ "$anonymous" = "401" ] || fail "anonymous GET /api/tasks returned $anonymous (expected 401)"
id=$(curl -sf -X POST "$FE/api/tasks" -H 'Content-Type: application/json' -H "Authorization: Bearer $(token)" \
  -d '{"title":"SCRUM-7 lifecycle marker"}' | sed -E 's/.*"id":([0-9]+).*/\1/')
[[ "$id" =~ ^[0-9]+$ ]] || fail "could not create the marker task"
echo "marker task id: $id"

# 2. Flyway history before restarts.
before=$(flyway_count)
echo "flyway_schema_history rows: $before"

# 3. AC-03: docker stop (SIGTERM, 10 s grace) → JVM exits by itself, never SIGKILL (137).
cid=$(docker compose ps -q backend)
start_ms=$(date +%s%3N)
docker compose stop backend
elapsed_ms=$(( $(date +%s%3N) - start_ms ))
elapsed="$((elapsed_ms / 1000)).$(printf '%03d' $((elapsed_ms % 1000)))"
exit_code=$(docker inspect -f '{{ .State.ExitCode }}' "$cid")
oom=$(docker inspect -f '{{ .State.OOMKilled }}' "$cid")
echo "backend stop: exit code $exit_code after ${elapsed}s (OOMKilled=$oom)"
echo "- AC-03: \`docker compose stop backend\` → exit code **$exit_code** after **${elapsed} s** (OOMKilled=$oom)" >> "$summary"
[ "$exit_code" = "143" ] || [ "$exit_code" = "0" ] || fail "backend exit code $exit_code (expected 143 or 0, 137 = SIGKILL)"
[ "$oom" = "false" ] || fail "backend was OOM-killed"
[ "$elapsed_ms" -lt 10000 ] || fail "backend took ${elapsed}s to stop (>= 10 s grace period)"

# 4. AC-10: backend restart keeps data and does not re-apply migrations; nginx re-resolves the backend.
docker compose up -d --no-build --wait backend
code=$(status_of "$FE/api/tasks/$id")
after=$(flyway_count)
echo "- AC-10: after backend restart marker GET → **$code**, flyway rows $before → $after" >> "$summary"
[ "$code" = "200" ] || fail "marker task not found after backend restart ($code)"
[ "$after" = "$before" ] || fail "flyway_schema_history changed after backend restart ($before → $after)"

# 5. AC-10: down (volume kept) + up → data still there.
docker compose logs --no-color --timestamps > "$reports/compose-logs-before-down.txt" 2>&1 || true
docker compose down
docker compose up -d --no-build --wait
code=$(status_of "$FE/api/tasks/$id")
echo "- AC-10: after \`down\` + \`up\` marker GET → **$code**" >> "$summary"
[ "$code" = "200" ] || fail "marker task lost after down/up ($code)"

# 6. AC-10: down -v + up → fresh database, marker gone.
docker compose down -v
docker compose up -d --no-build --wait
code=$(status_of "$FE/api/tasks/$id")
echo "- AC-10: after \`down -v\` + \`up\` marker GET → **$code** (expected 404)" >> "$summary"
[ "$code" = "404" ] || fail "marker task still present after down -v ($code)"

echo >> "$summary"
echo "Lifecycle checks passed"
