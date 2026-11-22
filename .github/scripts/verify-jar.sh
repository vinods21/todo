#!/usr/bin/env bash
# SCRUM-8-AC-04 (design §6.1; ADR 0008): the backend jar carries the version and the build identity everywhere.
# Usage: verify-jar.sh <jar> <version> <jira key> <commit sha>
set -euo pipefail

jar="$1"
version="$2"
jira="$3"
sha="$4"
failures=0
fail() {
  echo "::error::SCRUM-8-AC-04: $*"
  failures=$((failures + 1))
}

[ -f "$jar" ] || { fail "$jar not found (expected file name todo-backend-${version}.jar)"; exit 1; }
[ "$(basename "$jar")" = "todo-backend-${version}.jar" ] || fail "jar file name $(basename "$jar") != todo-backend-${version}.jar"

# Read whole entries into variables (no early-exiting grep on a pipe: SIGPIPE under pipefail, ADR 0008).
manifest=$(unzip -p "$jar" META-INF/MANIFEST.MF | tr -d '\r')
info_path=$(unzip -Z1 "$jar" | grep -E '(^|/)META-INF/build-info\.properties$' | head -n1 || true)
[ -n "$info_path" ] || { fail "build-info.properties not found in $jar"; exit 1; }
info=$(unzip -p "$jar" "$info_path" | tr -d '\r')

for line in "Implementation-Version: ${version}" "X-Jira-Issue: ${jira}" "X-Git-Commit: ${sha}"; do
  grep -qxF "$line" <<<"$manifest" || fail "manifest lacks '$line'"
done
for line in "build.version=${version}" "build.jira=${jira}" "build.git-commit=${sha}"; do
  grep -qxF "$line" <<<"$info" || fail "$info_path lacks '$line'"
done

# SCRUM-12-AC-10 / NFR-01 (ADR 0017): the OpenAPI generator is test-scope only — never in the jar. The only allowed
# OpenAPI artefact is swagger-annotations-jakarta (annotations, no dependencies).
libs=$(unzip -Z1 "$jar" | grep -E '^BOOT-INF/lib/' || true)
openapi_libs=$(grep -iE '^BOOT-INF/lib/(springdoc|swagger|webjars-locator|scalar)' <<<"$libs" || true)
forbidden=$(grep -vE '^BOOT-INF/lib/swagger-annotations-jakarta-[0-9][^/]*\.jar$' <<<"$openapi_libs" | grep -v '^$' || true)
if [ -n "$forbidden" ]; then
  echo "::error::SCRUM-12-AC-10: OpenAPI generator/UI jars found in $jar (must be test scope): $(tr '\n' ' ' <<<"$forbidden")"
  failures=$((failures + 1))
else
  echo "SCRUM-12-AC-10: no OpenAPI generator/UI in $(basename "$jar"); OpenAPI jars present: $(tr '\n' ' ' <<<"${openapi_libs:-none}")"
fi

if [ "$failures" -gt 0 ]; then
  echo "--- manifest"; echo "$manifest"; echo "--- $info_path"; echo "$info"
  exit 1
fi
echo "Backend jar $(basename "$jar"): version ${version}, jira ${jira}, commit ${sha:0:12} in manifest and ${info_path}"
