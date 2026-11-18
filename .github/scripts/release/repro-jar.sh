#!/usr/bin/env bash
# SCRUM-8-NFR-03 (design §10): rebuild the jar offline with the same inputs and compare SHA-256. Report only — never
# fails the job. Usage: repro-jar.sh <staged jar>   env: VERSION, JIRA_KEY, COMMIT_EPOCH, GITHUB_STEP_SUMMARY
# Prints "repro=yes|no" on the last line and appends a summary row.
set -uo pipefail

staged="$1"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
rebuilt="target/todo-backend-${VERSION}.jar"
result="no"
if ./mvnw -o -B -ntp -q clean package -Dmaven.test.skip=true -Djacoco.skip=true \
     "-Drevision=${VERSION}" "-Djira.issue=${JIRA_KEY}" "-Dproject.build.outputTimestamp=${COMMIT_EPOCH}"; then
  a=$(sha256sum "$staged" | cut -d' ' -f1)
  b=$(sha256sum "$rebuilt" | cut -d' ' -f1)
  if [ "$a" = "$b" ]; then
    result="yes"
    detail="identical SHA-256 \`$a\`"
  else
    detail="differs: \`$a\` vs \`$b\`"
    echo "Differing entries (name, CRC):"
    diff <(unzip -lv "$staged" | awk 'NR>3 {print $8, $7}' | sort) <(unzip -lv "$rebuilt" | awk 'NR>3 {print $8, $7}' | sort) | head -n 40 || true
    for e in META-INF/build-info.properties BOOT-INF/classes/git.properties BOOT-INF/classes/META-INF/build-info.properties; do
      if unzip -l "$staged" "$e" >/dev/null 2>&1; then
        echo "--- $e"
        diff <(unzip -p "$staged" "$e") <(unzip -p "$rebuilt" "$e") || true
      fi
    done
  fi
else
  detail="offline rebuild failed (see log)"
fi
{
  echo "### Reproducibility — jar (SCRUM-8-NFR-03, report only)"
  echo
  echo "| artefact | bit-for-bit | detail |"
  echo "|---|---|---|"
  echo "| \`$(basename "$staged")\` | $result | $detail |"
} | tee -a "$summary"
echo "repro=$result"
