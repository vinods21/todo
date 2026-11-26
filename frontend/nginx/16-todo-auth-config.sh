#!/bin/sh
# SCRUM-13-AC-16, NFR-05 (ADR 0018 §3, design §8.2): runs before 20-envsubst-on-templates.sh. Refuses to start with auth
# settings that could inject into the CSP header or the /auth-config.json body: AUTH_URL = http(s)://host[:port][/path]
# without a trailing slash, quotes, spaces or semicolons; AUTH_REALM / AUTH_CLIENT_ID = [A-Za-z0-9._-]+.
set -eu

check() { # <name> <value> <extended regex>  (one line only: grep matches per line)
  if [ "$(printf '%s' "$2" | wc -l)" -ne 0 ] || ! printf '%s' "$2" | grep -Eqx "$3"; then
    echo "16-todo-auth-config.sh: invalid $1='$2' (SCRUM-13: must match $3)" >&2
    exit 1
  fi
}

check AUTH_URL "${AUTH_URL:-}" 'https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~-]+)*'
check AUTH_REALM "${AUTH_REALM:-}" '[A-Za-z0-9._-]+'
check AUTH_CLIENT_ID "${AUTH_CLIENT_ID:-}" '[A-Za-z0-9._-]+'
echo "16-todo-auth-config.sh: AUTH_URL=${AUTH_URL} AUTH_REALM=${AUTH_REALM} AUTH_CLIENT_ID=${AUTH_CLIENT_ID}"
