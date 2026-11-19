#!/usr/bin/env bash
# SCRUM-8-NFR-02 (ADR 0014, design §8.1): the only place that pins downloaded CLI tools — version + SHA-256.
# Usage: install-tools.sh <tool>...   tools: trivy cyclonedx-cli shellcheck
# Installs into $RUNNER_TEMP/tools/bin (CI, added to $GITHUB_PATH) or ./.tools/bin (local). Fails on checksum mismatch.
# Bumping a tool = change its version and checksum here (checksums from the release page, verified with sha256sum).
set -euo pipefail

TRIVY_VERSION=0.76.2
TRIVY_SHA256=bc0fc726e017b8927a62b2d3531d7a84ee01769daf5c99ed866dced54089fdbf
CYCLONEDX_CLI_VERSION=0.33.1
CYCLONEDX_CLI_SHA256=bfc8b2538da86fe239bc53658bbb63c1c8c510a293c1e6891aa5bea5d3c58746
SHELLCHECK_VERSION=0.11.0
SHELLCHECK_SHA256=8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198

if [ "$#" -eq 0 ]; then
  echo "usage: $0 trivy|cyclonedx-cli|shellcheck ..." >&2
  exit 2
fi

root="${RUNNER_TEMP:+$RUNNER_TEMP/tools}"
root="${root:-$PWD/.tools}"
bin="$root/bin"
mkdir -p "$bin" "$root/dl"

fetch() { # <url> <sha256> <file>
  local url="$1" sum="$2" file="$root/dl/$3"
  curl -sSfL --retry 3 --retry-delay 2 -o "$file" "$url"
  echo "$sum  $file" | sha256sum -c --quiet - || { echo "::error::checksum mismatch for $url"; exit 1; }
}

for tool in "$@"; do
  case "$tool" in
    trivy)
      fetch "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
        "$TRIVY_SHA256" trivy.tar.gz
      tar -xzf "$root/dl/trivy.tar.gz" -C "$bin" trivy
      echo "trivy ${TRIVY_VERSION} ($("$bin/trivy" --version | head -n1))"
      ;;
    cyclonedx-cli)
      fetch "https://github.com/CycloneDX/cyclonedx-cli/releases/download/v${CYCLONEDX_CLI_VERSION}/cyclonedx-linux-x64" \
        "$CYCLONEDX_CLI_SHA256" cyclonedx
      install -m 0755 "$root/dl/cyclonedx" "$bin/cyclonedx"
      echo "cyclonedx-cli ${CYCLONEDX_CLI_VERSION} ($("$bin/cyclonedx" --version 2>/dev/null | head -n1))"
      ;;
    shellcheck)
      fetch "https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/shellcheck-v${SHELLCHECK_VERSION}.linux.x86_64.tar.xz" \
        "$SHELLCHECK_SHA256" shellcheck.tar.xz
      tar -xJf "$root/dl/shellcheck.tar.xz" -C "$root/dl"
      install -m 0755 "$root/dl/shellcheck-v${SHELLCHECK_VERSION}/shellcheck" "$bin/shellcheck"
      echo "shellcheck ${SHELLCHECK_VERSION} ($("$bin/shellcheck" --version | sed -n 2p))"
      ;;
    *)
      echo "unknown tool $tool" >&2
      exit 2
      ;;
  esac
done

if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$bin" >> "$GITHUB_PATH"
fi
echo "installed into $bin"
