#!/usr/bin/env bash
# SCRUM-9-AC-03, AC-04, AC-13 (ADR 0015, design §5): load the release-candidate OCI archives into the Docker daemon
# without rebuilding or pulling, and prove that the running Compose containers are exactly those images.
# Usage: e2e-images.sh load <images-dir>        → loads + tags both images, writes $RECORD
#        e2e-images.sh assert-running [label]   → reads $RECORD; Compose stack up (COMPOSE_* env); appends .running
# env: IMAGE_BACKEND, IMAGE_FRONTEND, VERSION, BACKEND_DIGEST, FRONTEND_DIGEST (all required — fail closed),
#      MODE (optional), RECORD (default e2e/reports/release-images.json), GITHUB_STEP_SUMMARY (optional)
#
# Digest chain (store-aware, design §5.2):
#   running container .Image == local Image.Id == archive CONFIG digest   (classic image store)
#                                             == archive MANIFEST digest (containerd image store)
#   archive manifest digest == `images` job output == scanned / SBOM'd / pushed digest (SCRUM-8-AC-25)
set -euo pipefail
shopt -s inherit_errexit # errexit also inside $(load_one …)

here="$(cd "$(dirname "$0")" && pwd)"
record="${RECORD:-e2e/reports/release-images.json}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

die() {
  echo "::error::$*" >&2
  exit 1
}

need() {
  local name
  for name in "$@"; do
    [ -n "${!name:-}" ] || die "SCRUM-9-AC-03: environment variable $name is required"
  done
}

detect_store() {
  # The containerd image store reports the snapshotter as driver-type; the classic store reports graph drivers.
  # Fail closed (design R2): a store that is neither is never guessed, so the image-ID rule is never assumed.
  local status driver # captured first: `docker info | grep -q` could SIGPIPE docker and, with pipefail, misreport
  status=$(docker info -f '{{ json .DriverStatus }}')
  driver=$(docker info -f '{{ .Driver }}')
  if [[ "$status" == *io.containerd.snapshotter* ]]; then
    echo containerd
    return
  fi
  case "$driver" in
    overlay2 | fuse-overlayfs | btrfs | zfs | vfs | devicemapper | aufs) echo classic ;;
    *) die "SCRUM-9-AC-04: unknown Docker image store (driver '$driver', DriverStatus $status) — refusing to guess the image-ID rule" ;;
  esac
}

blob_sha() { # <archive> <sha256:…> → sha256:<hash of the blob bytes>
  echo "sha256:$(tar -xOf "$1" "blobs/sha256/${2#sha256:}" | sha256sum | cut -d' ' -f1)"
}

load_one() { # <svc> <archive> <repo> <expected manifest digest> <store>
  local svc="$1" archive="$2" repo="$3" want="$4" store="$5"
  local m mt c out loaded id expect kind loader=docker-load
  [ -f "$archive" ] || die "SCRUM-9-AC-03: $svc archive $archive not found"

  # 1. The archive is the one `images` produced, scanned, SBOM'd and `publish` will push (SCRUM-8-AC-25).
  m=$("$here/oci-digest.sh" "$archive" "$want") # exactly 1 manifest, == images output
  mt=$(tar -xOf "$archive" index.json | jq -r '.manifests[0].mediaType')
  [ "$mt" = application/vnd.oci.image.manifest.v1+json ] || die "SCRUM-9-AC-03: $svc $archive is not a single image manifest ($mt)"
  [ "$(blob_sha "$archive" "$m")" = "$m" ] || die "SCRUM-9-AC-03: $svc manifest blob does not hash to $m"
  c=$(tar -xOf "$archive" "blobs/sha256/${m#sha256:}" | jq -r .config.digest)
  [[ "$c" =~ ^sha256:[0-9a-f]{64}$ ]] || die "SCRUM-9-AC-03: $svc invalid config digest '$c'"
  [ "$(blob_sha "$archive" "$c")" = "$c" ] || die "SCRUM-9-AC-03: $svc config blob does not hash to $c"
  echo "$svc: archive $archive manifest $m (== images output) config $c" >&2

  # 2. Load exactly these blobs (no rebuild, no registry) and give them the release name.
  if out=$(docker load -i "$archive" 2>&1); then
    echo "$out" >&2
    loaded=$(sed -nE 's/^Loaded image ID: //p' <<<"$out" | tail -n1)
    [ -n "$loaded" ] || loaded=$(sed -nE 's/^Loaded image: //p' <<<"$out" | tail -n1)
    [ -n "$loaded" ] || die "SCRUM-9-AC-03: docker load printed no image for $svc: $out"
    docker tag "$loaded" "$repo:$VERSION"
  elif [ "$store" = classic ] && command -v skopeo >/dev/null; then
    # Fallback (design §5.1, R1): classic store only — the image ID stays the config digest.
    echo "::warning::SCRUM-9-AC-03: docker load rejected $archive ($out); falling back to skopeo copy (classic store)"
    skopeo copy "oci-archive:$archive" "docker-daemon:$repo:$VERSION" >&2
    loader=skopeo
  else
    die "SCRUM-9-AC-03: docker load of $archive failed (store $store): $out"
  fi

  # 3. Image.Id must be the archive's digest of the kind the image store uses — never anything else.
  id=$(docker image inspect -f '{{ .Id }}' "$repo:$VERSION")
  case "$store" in
    classic) expect="$c" kind=config ;;      # classic store: image ID = sha256 of the config blob
    containerd) expect="$m" kind=manifest ;; # containerd store: image ID = target (manifest) digest = pushed digest
  esac
  [ "$id" = "$expect" ] || die "SCRUM-9-AC-04: $svc $repo:$VERSION Id $id != archive $kind digest $expect (store $store; manifest $m, config $c)"
  echo "$svc: loaded $repo:$VERSION Id $id == archive $kind digest (store $store, loader $loader)" >&2

  jq -n --arg ref "$repo:$VERSION" --arg archive "$(basename "$archive")" --arg m "$m" --arg c "$c" \
    --arg id "$id" --arg kind "$kind" --arg loader "$loader" \
    '{ref: $ref, archive: $archive, manifest_digest: $m, config_digest: $c, image_id: $id, id_kind: $kind, loader: $loader}'
}

cmd_load() {
  local dir="${1:?usage: e2e-images.sh load <images-dir>}" store docker_version driver be fe
  need IMAGE_BACKEND IMAGE_FRONTEND VERSION BACKEND_DIGEST FRONTEND_DIGEST
  store=$(detect_store)
  docker_version=$(docker version -f '{{ .Server.Version }}')
  driver=$(docker info -f '{{ .Driver }}')
  echo "Docker Engine $docker_version, storage driver $driver, image store $store"
  be=$(load_one backend "$dir/todo-backend.oci.tar" "$IMAGE_BACKEND" "$BACKEND_DIGEST" "$store")
  fe=$(load_one frontend "$dir/todo-frontend.oci.tar" "$IMAGE_FRONTEND" "$FRONTEND_DIGEST" "$store")
  mkdir -p "$(dirname "$record")"
  jq -n --arg mode "${MODE:-}" --arg version "$VERSION" --arg store "$store" --arg docker "$docker_version" \
    --arg driver "$driver" --argjson be "$be" --argjson fe "$fe" \
    '{mode: $mode, version: $version, store: $store, docker: $docker, storage_driver: $driver,
      images: {backend: $be, frontend: $fe}, running: []}' > "$record"
  echo "SCRUM-9-AC-03: candidate images loaded (no rebuild, no pull); record $record:"
  cat "$record"
}

cmd_assert_running() {
  local label="${1:-after up}" svc ref want running cfg now cid state first rows=() mode_txt
  [ -f "$record" ] || die "SCRUM-9-AC-04: $record missing — run 'e2e-images.sh load' first"
  first=$(jq '.running | length == 0' "$record")
  for svc in backend frontend; do
    ref=$(jq -r --arg s "$svc" '.images[$s].ref' "$record")
    want=$(jq -r --arg s "$svc" '.images[$s].image_id' "$record")
    mapfile -t cids < <(docker compose ps -q "$svc")
    [ "${#cids[@]}" -eq 1 ] || die "SCRUM-9-AC-04 ($label): expected 1 $svc container, found ${#cids[@]}"
    cid="${cids[0]}"
    state=$(docker inspect -f '{{ .State.Running }}' "$cid")
    [ "$state" = true ] || die "SCRUM-9-AC-04 ($label): $svc container $cid is not running"
    running=$(docker inspect -f '{{ .Image }}' "$cid")       # what the container was created from
    cfg=$(docker inspect -f '{{ .Config.Image }}' "$cid")    # the ref Compose resolved
    now=$(docker image inspect -f '{{ .Id }}' "$ref")        # the tag was not moved meanwhile
    echo "$svc ($label): container ${cid:0:12} .Image $running .Config.Image $cfg; $ref Id $now; expected $want"
    [ "$running" = "$want" ] || die "SCRUM-9-AC-04 ($label): $svc container image $running != candidate image $want"
    [ "$now" = "$want" ] || die "SCRUM-9-AC-04 ($label): $ref now points to $now, not the candidate $want"
    [ "$cfg" = "$ref" ] || die "SCRUM-9-AC-04 ($label): $svc container was created from '$cfg', not '$ref'"
    jq --arg s "$svc" --arg c "${cid:0:12}" --arg i "$running" --arg r "$cfg" --arg l "$label" \
      --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '.running += [{service: $s, container: $c, image: $i, config_image: $r, label: $l, at: $at}]' \
      "$record" > "$record.tmp" && mv "$record.tmp" "$record"
    rows+=("$(jq -r --arg s "$svc" --arg i "$running" --arg l "$label" '.store as $st | .images[$s] |
      "| \($s) | `\(.ref)` | `\(.manifest_digest)` | `\(.config_digest)` | `\(.image_id)` (\(.id_kind)) | `\($i)` (\($l)) | \($st) | ok |"' "$record")")
  done
  {
    if [ "$first" = true ]; then
      mode_txt=$(jq -r 'if .mode == "release" then "RELEASE" elif .mode == "" then "local" else "DRY RUN" end' "$record")
      echo "### Pre-release e2e — candidate images (SCRUM-9-AC-03, AC-04) — $mode_txt, version $(jq -r .version "$record"), store $(jq -r .store "$record"), Docker $(jq -r .docker "$record")"
    else
      echo "#### Candidate images re-checked ($label, SCRUM-9-AC-04)"
    fi
    echo
    echo "| service | ref | archive manifest digest (= published) | config digest | image ID (kind) | running container image | store | result |"
    echo "|---|---|---|---|---|---|---|---|"
    printf '%s\n' "${rows[@]}"
    echo
  } >> "$summary"
  printf '%s\n' "${rows[@]}"
  echo "SCRUM-9-AC-04 ($label): running backend and frontend containers are the candidate images"
}

case "${1:-}" in
  load) shift; cmd_load "$@" ;;
  assert-running) shift; cmd_assert_running "$@" ;;
  *) echo "usage: $0 load <images-dir> | assert-running [label]" >&2; exit 2 ;;
esac
