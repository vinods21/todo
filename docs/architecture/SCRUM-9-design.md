# SCRUM-9 — Pre-Release E2E Gate: Solution Design

| Field | Value |
|---|---|
| Jira | [SCRUM-9](https://suranagivinod.atlassian.net/browse/SCRUM-9) |
| Requirements | [`docs/requirements/SCRUM-9.md`](../requirements/SCRUM-9.md) (SCRUM-9-AC-01..AC-17, NFR-01..NFR-08) |
| ADRs | **New:** [0015](../adr/0015-pre-release-e2e-gate.md) (amends [0012](../adr/0012-end-to-end-testing-playwright.md), [0013](../adr/0013-versioning-and-release-process.md)) · Related: [0008](../adr/0008-ci-derived-build-identity.md) (artifact naming), [0010](../adr/0010-container-images-and-build-identity.md) |
| Builds on | [SCRUM-8 design](SCRUM-8-design.md) §6.2 (`release.yml`), §6.4 (pinned SHAs), §6.5 (insertion point) · [SCRUM-7 design](SCRUM-7-design.md) §8–§9 (e2e, scripts) |
| Author role | Architect |

## 0. Workspace constraints and what was verified

- The authoring workspace has the Docker **CLI** (29.9.3, Compose v5.7.0, Buildx 0.38.1) but **no daemon**, no
  `skopeo`, and no network to Docker Hub / GHCR. Nothing in §5 could be executed here; the first dry-run on the branch
  is the first real run (as for SCRUM-7/8). Risks in §12 list what only CI can confirm.
- Verified in the installed `@playwright/test` 1.65.1 (`e2e/node_modules/playwright/lib/runner/index.js`,
  `_serializeTestSpec`): the JSON reporter writes spec tags **without** the `@` (`tags: test.tags.map(t => t.substring(1))`),
  so `@critical` appears as `"critical"` in `results.json`. Tags given in the test details object are not part of the
  title (AC IDs in titles unchanged) and are matched by `grep`, so the dev-mode `grep: /@dev-smoke/` is unaffected.
- Verified from `release.yml`: `images` already outputs `backend_digest` / `frontend_digest` (manifest digests of the
  single-manifest OCI archives, asserted by `oci-digest.sh`), uploads `todo-release-images-<KEY>-<sha>`
  (`compression-level: 0`, 7 days); `release-gate`'s "Every gate passed" step fails on any `needs.*.result != success`
  (so `skipped`/`cancelled` block too); `publish` needs `release-gate` and has no `always()` → it is skipped when the
  gate fails. Workflow permissions are `contents: read`.
- `docker compose up` supports `--pull never` (checked: `docker compose up --help`). Job-level `env:` cannot read the
  workflow-level `env` context (GitHub context availability), so the Compose overrides are written to `$GITHUB_ENV`
  in a step (§4.2).

## 1. Decisions (summary)

| Topic | Decision | Where |
|---|---|---|
| Job | New job **`e2e-release`** in `release.yml`, `needs: [version, images]`, parallel to `sbom`/`scan`, both modes; added to `release-gate.needs` | §2, §4 |
| Reuse | Two **composite actions** — `.github/actions/e2e-playwright` (deps + Chromium cache/install) and `.github/actions/e2e-teardown` (summary, diagnostics, logs, `down -v`, upload). CI `e2e` refactored onto them, behaviour-preserving (§6). Not a reusable workflow (ADR 0015) | §3, §6 |
| Image loading | `docker load -i <archive>.oci.tar` (Engine ≥ 25 reads OCI archives) + `docker tag` to `ghcr.io/vinods21/todo-<svc>:<version>`; archive digest asserted against `images` outputs first. No rebuild, no registry, no pull | §5.1 |
| Digest equality | Store-aware chain: **classic** store → `Image.Id` = archive **config** digest; **containerd** store → `Image.Id` = archive **manifest** digest (= the pushed digest). Running container `.Image` = that `Id`, `.Config.Image` = the release ref. Checked after `up` and again after the lifecycle script | §5.2 |
| Compose | `docker compose pull postgres` then `up -d --no-build --pull never --wait --wait-timeout 240` with `TODO_BACKEND_IMAGE`/`TODO_FRONTEND_IMAGE`/`TODO_IMAGE_TAG` | §4.2 |
| Tests | **Full compose suite** (`empty-state`, `http`, `ui`) + **`@critical`** tag on 12 tests + guard `e2e-gate.mjs --tag critical --min 12` (≥ 12 executed, all passed, none skipped); plus `verify-images.sh` and `verify-lifecycle.sh` unchanged. Dev-mode smoke **not** run | §7 |
| Flakes | Existing `retries: CI ? 1 : 0`; passed-on-retry tests listed in the summary and raised as `::warning::` by `e2e-gate.mjs`; not blocking (Q-01 default) | §7.3 |
| Artifact | **`todo-release-e2e-<KEY>-<sha>-reports`** — `e2e/reports/` (HTML, JUnit, JSON, traces/screenshots/videos, compose ps + logs, `release-images.json`, lifecycle logs), always, 30 days | §8 |
| Cleanup | `docker compose down -v --remove-orphans` in the teardown composite, `if: always()` on the caller, after logs are collected | §8 |
| Timeouts | job 20 min; `up` 6 min (`--wait-timeout 240`); Playwright 10 min; lifecycle 6 min; Playwright test 30 s / expect 10 s (config, unchanged) | §4 |
| Pinning | Only SHAs already in `release.yml` (§9) | §9 |

## 2. Job graph diff

```
BEFORE (SCRUM-8)                                        AFTER (SCRUM-9)
version ─┬ tooling ─────────────────────┐               version ─┬ tooling ──────────────────────────────┐
         ├ backend ─┐                   │                        ├ backend ─┐                            │
         └ frontend ┴ images ┬ sbom ────┤                        └ frontend ┴ images ┬ sbom ─────────────┤
                             └ scan ────┤                                            ├ scan ─────────────┤
                                  └ code-scanning                                    │    └ code-scanning│
                                        ▼                                            └ e2e-release (NEW)─┤
                                   release-gate                                                          ▼
                                        ▼                                                          release-gate
                                     publish → verify                                                    ▼
                                                                                                 publish → verify
```

```diff
   release-gate:
-    needs: [version, tooling, backend, frontend, images, sbom, scan]
+    needs: [version, tooling, backend, frontend, images, sbom, scan, e2e-release]
```

`publish` (`needs: [version, images, release-gate]`) and `verify` are **not** changed: they inherit the e2e gate
through `release-gate` (AC-10, AC-15). `code-scanning` stays outside the gate (reporting only).

Critical path (dry-run, warm): `version` 0.5 → `backend` 4.5 → `images` 1 → max(`scan` 3, `e2e-release` ≈ 6) →
`release-gate` 1 ≈ **13 min** vs ≈ 10 today → +≈ 3 min (NFR-01; SCRUM-8-NFR-04 ≤ 15 min kept). Cold: `scan` ≈ 5,
`e2e-release` ≈ 8 (browser download) → ≈ 18 min worst case on a cold cache — accepted (see R5).

## 3. Files Dev creates / changes

| File | New / change | Section | IDs |
|---|---|---|---|
| `.github/actions/e2e-playwright/action.yml` | **new** composite | §6.1 | AC-02 |
| `.github/actions/e2e-teardown/action.yml` | **new** composite | §6.2 | AC-02, AC-12, AC-14 |
| `.github/workflows/release.yml` | change: job `e2e-release`; `release-gate.needs` + comment block; header comment | §4 | AC-01, AC-03..AC-15 |
| `.github/workflows/ci.yml` | change: job `e2e` uses both composites (no behaviour change) | §6.3 | AC-02, NFR-05 |
| `.github/scripts/release/e2e-images.sh` | **new** (`load`, `assert-running`) | §5 | AC-03, AC-04, AC-13 |
| `.github/scripts/release/e2e-gate.mjs` | **new** CLI (critical guard + flaky report) | §7.2 | AC-07, AC-09, AC-13 |
| `.github/scripts/release/lib/e2e-results.mjs` | **new** pure functions over Playwright JSON | §7.2 | AC-07, AC-09 |
| `.github/scripts/release/test/e2e-results.test.mjs` | **new** `node:test` (runs in `tooling` via the existing glob) | §7.4 | AC-07, AC-09, NFR-06 |
| `e2e/scripts/summarize.mjs` | change: modes from env `E2E_SUMMARY_MODES` (default `compose dev` = today's output) | §6.2 | AC-13, NFR-05 |
| `e2e/tests/empty-state.spec.ts`, `e2e/tests/ui/tasks.spec.ts`, `e2e/tests/stack.http.spec.ts` | change: add `@critical` tags only | §7.1 | AC-07 |
| `docs/release/RELEASE.md` | change: job table, artifacts table, §8 recovery row, new "pre-release e2e" subsection incl. local reproduction | §10 | AC-16, NFR-08 |
| `README.md` | change (one line): Release pipeline sentence mentions the e2e gate, if README lists the gates | §10 | AC-16 |
| `docs/traceability/SCRUM-9.md` | fill (template in this commit) | — | AC-17 |
| `docs/adr/0012`, `0013` amendment notes, `0015` | **done by Architect in this commit** | — | AC-16 |

Not changed: application code, Dockerfiles, `docker-compose.yml`, `e2e/playwright.config.ts`, `verify-images.sh`,
`verify-lifecycle.sh`, `oci-digest.sh`, `check-compose-images.sh`, the `images`/`sbom`/`scan`/`publish`/`verify`
jobs. New scripts: mode `100755`, LF, shellcheck-clean (the `tooling` glob `.github/scripts/release/*.sh` already
covers `e2e-images.sh`).

## 4. `release.yml` — job `e2e-release`

### 4.1 Sketch (Dev completes; step names keep the AC IDs)

```yaml
  # SCRUM-9 (ADR 0015, design §4): e2e against the EXACT release candidate — the OCI archives `publish` will push
  # (same digests, loaded into the local daemon; no rebuild, no pull, no registry login). Both modes. Gate input of
  # `release-gate` (SCRUM-9-AC-10): nothing is published unless this job succeeded.
  e2e-release: # SCRUM-9-AC-01..AC-15
    needs: [version, images]
    runs-on: ubuntu-latest
    timeout-minutes: 20 # NFR-01
    env:
      MODE: ${{ needs.version.outputs.mode }}
      VERSION: ${{ needs.version.outputs.version }} # stamped: X.Y.Z (release) | X.Y.Z-<id> (dry-run)
      JIRA_KEY: ${{ needs.version.outputs.jira_key }}
      SHA: ${{ needs.version.outputs.sha }}
      GIT_COMMIT: ${{ needs.version.outputs.sha }} # verify-images.sh
      BACKEND_DIGEST: ${{ needs.images.outputs.backend_digest }}
      FRONTEND_DIGEST: ${{ needs.images.outputs.frontend_digest }}
      COMPOSE_PROFILES: app
      COMPOSE_PROJECT_NAME: todo-release-e2e
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ needs.version.outputs.sha }}
          persist-credentials: false

      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: frontend/.nvmrc
          cache: npm
          cache-dependency-path: e2e/package-lock.json

      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: todo-release-images-${{ env.JIRA_KEY }}-${{ github.sha }}
          path: images

      - name: Load the release-candidate images — no rebuild, no pull (SCRUM-9-AC-03, AC-04)
        run: |
          .github/scripts/release/e2e-images.sh load images
          { echo "TODO_BACKEND_IMAGE=${IMAGE_BACKEND}"; echo "TODO_FRONTEND_IMAGE=${IMAGE_FRONTEND}"; echo "TODO_IMAGE_TAG=${VERSION}"; } >> "$GITHUB_ENV"

      - name: Pull PostgreSQL (the only image Compose may fetch)
        run: docker compose pull postgres

      - name: Start the candidate stack and wait for health (SCRUM-9-AC-03, AC-05)
        id: stack
        timeout-minutes: 6
        run: |
          docker compose config --format json | jq -r '.services | to_entries[] | "\(.key): \(.value.image)"'
          docker compose up -d --no-build --pull never --wait --wait-timeout 240

      - name: Running containers are the candidate images (SCRUM-9-AC-04)
        if: ${{ !cancelled() && steps.stack.outcome == 'success' }}
        run: .github/scripts/release/e2e-images.sh assert-running

      - name: Image runtime checks on the candidate (SCRUM-9-AC-08; SCRUM-7-AC-22, SCRUM-8-AC-04/AC-14)
        if: ${{ !cancelled() && steps.stack.outcome == 'success' }}
        env:
          EXPECTED_VERSION: ${{ env.VERSION }}
        run: .github/scripts/verify-images.sh "${IMAGE_BACKEND}:${VERSION}" "${IMAGE_FRONTEND}:${VERSION}"

      - name: Playwright and Chromium (SCRUM-9-AC-02)
        if: ${{ !cancelled() && steps.stack.outcome == 'success' }}
        uses: ./.github/actions/e2e-playwright

      - name: Playwright compose suite against the candidate (SCRUM-9-AC-06, AC-09)
        id: pw
        if: ${{ !cancelled() && steps.stack.outcome == 'success' }}
        timeout-minutes: 10
        working-directory: e2e
        env:
          E2E_EXPECT_EMPTY_DB: "1"
          E2E_JIRA_KEY: ${{ env.JIRA_KEY }}
          E2E_GIT_SHA: ${{ env.SHA }}
          E2E_VERSION: ${{ env.VERSION }}
        run: npx playwright test

      - name: Critical To-Do workflows passed; flaky tests reported (SCRUM-9-AC-07, AC-09)
        if: ${{ !cancelled() && steps.stack.outcome == 'success' }}
        run: >
          node .github/scripts/release/e2e-gate.mjs --results e2e/reports/compose/results.json
          --tag critical --min 12 --summary "$GITHUB_STEP_SUMMARY"

      - name: Lifecycle and persistence of the candidate images (SCRUM-9-AC-08; SCRUM-7-AC-03, AC-10)
        id: lifecycle
        if: ${{ !cancelled() && steps.stack.outcome == 'success' }}
        timeout-minutes: 6
        run: .github/scripts/verify-lifecycle.sh

      - name: Still the candidate images after the lifecycle restarts (SCRUM-9-AC-04)
        if: ${{ !cancelled() && steps.lifecycle.outcome == 'success' }}
        run: .github/scripts/release/e2e-images.sh assert-running

      - name: Summary, diagnostics, logs, teardown, reports (SCRUM-9-AC-12, AC-13, AC-14)
        if: always()
        uses: ./.github/actions/e2e-teardown
        with:
          artifact-name: todo-release-e2e-${{ env.JIRA_KEY }}-${{ github.sha }}-reports
          job-status: ${{ job.status }}
          summary-modes: compose
          retention-days: "30"
```

Notes:
- `IMAGE_BACKEND`/`IMAGE_FRONTEND` are the workflow-level env (`ghcr.io/vinods21/todo-*`) — the same names `images`
  built and `publish` pushes. `TODO_*` go through `$GITHUB_ENV` because job `env:` cannot read `env` (§0).
  `TODO_BACKEND_TAG`/`TODO_FRONTEND_TAG` stay unset (the per-service rollback overrides).
- `docker compose config` prints the resolved image per service into the log (evidence for AC-03); the hard check is
  `assert-running` (§5.2).
- `--pull never` is global for `up`, hence `postgres` is pulled in its own step first. `verify-lifecycle.sh` runs
  `up --no-build --wait` with the default pull policy `missing`; all three images are local by then, so nothing is
  pulled (a missing candidate image would make Compose try GHCR, where `X.Y.Z(-<id>)` does not exist yet → red).
- The lifecycle script ends with a fresh `down -v` + `up` (marker gone), so the second `assert-running` checks the
  containers that exist at teardown.
- No `permissions:` block → inherits `contents: read` (NFR-02). No `docker/login-action`, no secrets.
- Order equals the CI job (stack → image checks → Playwright → lifecycle → teardown), minus hadolint/build/dev mode.

### 4.2 `release-gate` comment block (replace the SCRUM-9 TODO)

```yaml
  # ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # RELEASE GATE — the single aggregation point (SCRUM-8-AC-07). `publish` needs only this job (plus outputs).
  # SCRUM-9 (ADR 0015): `e2e-release` ran the Playwright compose suite against the exact OCI archives `publish` will
  # push (digest chain asserted, SCRUM-9-AC-04). Any non-success input — e2e included — blocks (SCRUM-9-AC-10).
  # ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
```

The header comment (line 6, "`sbom`, `scan`, (SCRUM-9 e2e) and `publish` all use the same archives") becomes
"`sbom`, `scan`, `e2e-release` and `publish` …". The "Every gate passed" step is unchanged; its `::error::` prefix may
be extended to `SCRUM-8-AC-07, SCRUM-9-AC-10:` (message lists `e2e-release=failure`, which is the AC-11 evidence).

## 5. Image loading and the digest chain — `.github/scripts/release/e2e-images.sh`

### 5.1 `load <images-dir>` (AC-03)

Per service (`backend` → `$IMAGE_BACKEND`, `$BACKEND_DIGEST`, `todo-backend.oci.tar`; same for `frontend`):

```bash
#!/usr/bin/env bash
# SCRUM-9-AC-03, AC-04, AC-13 (design §5): load the release-candidate OCI archives into the Docker daemon without
# rebuilding or pulling, and prove that the running Compose containers are exactly those images.
# Usage: e2e-images.sh load <images-dir>     → writes $RECORD
#        e2e-images.sh assert-running        → reads $RECORD; Compose stack up (COMPOSE_* env)
# env: IMAGE_BACKEND, IMAGE_FRONTEND, VERSION, BACKEND_DIGEST, FRONTEND_DIGEST (all required — fail closed),
#      MODE (optional), RECORD (default e2e/reports/release-images.json), GITHUB_STEP_SUMMARY (optional)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
record="${RECORD:-e2e/reports/release-images.json}"

store=classic                                                     # image store decides what Image.Id means
docker info -f '{{ json .DriverStatus }}' | grep -q 'io.containerd.snapshotter' && store=containerd

# 1. The archive is the one `images` produced, scanned, SBOM'd and `publish` will push (SCRUM-8-AC-25).
m=$("$here/oci-digest.sh" "$archive" "$want_digest")             # exactly 1 manifest, == images output
mt=$(tar -xOf "$archive" index.json | jq -r '.manifests[0].mediaType')
[ "$mt" = application/vnd.oci.image.manifest.v1+json ] || die "…not a single image manifest ($mt)"
blob="blobs/sha256/${m#sha256:}"                                 # hash the bytes, never a shell variable
[ "sha256:$(tar -xOf "$archive" "$blob" | sha256sum | cut -d' ' -f1)" = "$m" ] || die "…manifest blob does not hash to $m"
c=$(tar -xOf "$archive" "$blob" | jq -r .config.digest)          # sha256:… of the image config
[[ "$c" =~ ^sha256:[0-9a-f]{64}$ ]] || die "…invalid config digest '$c'"

# 2. Load exactly these blobs (no conversion, no registry) and give them the release name.
out=$(docker load -i "$archive")                                  # Engine ≥ 25 reads OCI archives (A-01)
loaded=$(sed -nE 's/^Loaded image( ID)?: //p' <<<"$out" | tail -n1)
[ -n "$loaded" ] || die "docker load printed no image: $out"
docker tag "$loaded" "$repo:$VERSION"                             # no-op when the OCI ref annotation already named it

# 3. Image.Id must be the archive's digest of the right kind.
id=$(docker image inspect -f '{{ .Id }}' "$repo:$VERSION")
case "$store" in
  classic)    expect="$c"; kind=config ;;    # classic store: image ID = sha256 of the config blob
  containerd) expect="$m"; kind=manifest ;;  # containerd store: image ID = target (manifest) digest = pushed digest
esac
[ "$id" = "$expect" ] || die "SCRUM-9-AC-04: $svc $repo:$VERSION Id $id != archive $kind digest $expect (store $store)"
```

Record (`e2e/reports/release-images.json`, part of the artifact):

```json
{ "mode": "dry-run", "version": "0.1.1-abc1234", "store": "classic", "docker": "28.x.y",
  "images": {
    "backend":  { "ref": "ghcr.io/vinods21/todo-backend:0.1.1-abc1234", "archive": "todo-backend.oci.tar",
                  "manifest_digest": "sha256:…", "config_digest": "sha256:…", "image_id": "sha256:…", "id_kind": "config" },
    "frontend": { … } },
  "running": [] }
```

Why `docker load` and not the `images` job's `skopeo copy oci-archive:… docker-daemon:…`: `docker-daemon:` converts
to a docker-archive (`docker load` of a v2s2 tarball). With the classic store the image ID is still the config digest,
but with the **containerd** store the daemon would store a *converted* manifest whose digest is neither the archive's
manifest nor its config digest — AC-04 could not be asserted. `docker load` of the OCI archive itself keeps the
manifest verbatim in the containerd store and yields `Id = config digest` in the classic store, so one command works
for both. **Fallback** (only if `docker load` rejects the archive on the runner, R1): classic store →
`skopeo copy "oci-archive:$archive" "docker-daemon:$repo:$VERSION"` (proven in `images`), same `config` rule;
containerd store → no fallback needed (OCI load is native there).

### 5.2 `assert-running` (AC-04)

```bash
for svc in backend frontend; do
  ref=$(jq -r --arg s "$svc" '.images[$s].ref' "$record"); want=$(jq -r --arg s "$svc" '.images[$s].image_id' "$record")
  mapfile -t cids < <(docker compose ps -q "$svc")
  [ "${#cids[@]}" -eq 1 ] || die "SCRUM-9-AC-04: expected 1 $svc container, found ${#cids[@]}"
  [ "$(docker inspect -f '{{ .State.Running }}' "${cids[0]}")" = true ] || die "$svc not running"
  running=$(docker inspect -f '{{ .Image }}' "${cids[0]}")        # what the container was created from
  cfg=$(docker inspect -f '{{ .Config.Image }}' "${cids[0]}")     # the ref Compose resolved
  now=$(docker image inspect -f '{{ .Id }}' "$ref")               # the tag was not moved meanwhile
  [ "$running" = "$want" ] && [ "$now" = "$want" ] && [ "$cfg" = "$ref" ] || die "…"
done
# append {service, container, image, config_image, at} to .running in $record; write the summary table
```

The chain is then: **running container `.Image`** = **local `Image.Id`** = archive **config digest** (classic, which
the archive's manifest references by hash) or **manifest digest** (containerd) — and that **manifest digest** =
`images.outputs.*_digest` = the digest scanned (`scan`), SBOM'd (`sbom`), re-verified and pushed by `publish`
(SCRUM-8-AC-25). Equality of config digests is sufficient: the config carries `rootfs.diff_ids` (hashes of every
uncompressed layer), entrypoint, user and labels, and the manifest that names that config is the one whose digest
is published.

Summary table (AC-13), written by `assert-running` (first call; the second call appends one line):

```
### Pre-release e2e — candidate images (SCRUM-9-AC-04) — DRY RUN, version 0.1.1-abc1234, store classic, Docker 28.x
| service | ref | archive manifest digest (= published) | config digest | image ID (kind) | running container image | result |
```

## 6. Shared composite actions (AC-02)

Composite actions rather than a reusable workflow (ADR 0015): the CI job builds its images **in the same job** from
source while `e2e-release` loads archives; a reusable workflow is a whole job and would need an "image source" switch
containing both paths. The composites capture exactly the shared plumbing; each caller keeps its own image source,
stack start and Playwright invocation (different env per job).

### 6.1 `.github/actions/e2e-playwright/action.yml`

```yaml
# SCRUM-9-AC-02 (ADR 0015): e2e dependencies + Chromium, cached by Playwright version. Shared by CI `e2e` and
# Release `e2e-release`. Caller: checkout + setup-node done; working directory = repository root.
name: e2e-playwright
description: Install e2e dependencies and the Playwright Chromium headless shell (cached)
runs:
  using: composite
  steps:
    - name: Install e2e dependencies
      shell: bash
      working-directory: e2e
      run: npm ci
    - name: Playwright version
      id: pw
      shell: bash
      working-directory: e2e
      run: echo "version=$(node -p 'require("./node_modules/@playwright/test/package.json").version')" >> "$GITHUB_OUTPUT"
    - name: Cache Playwright browsers
      id: pw-cache
      uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
      with:
        path: ~/.cache/ms-playwright
        key: playwright-${{ runner.os }}-${{ steps.pw.outputs.version }}   # same key as today → shared cache
    - name: Install Chromium
      shell: bash
      working-directory: e2e
      env:
        CACHE_HIT: ${{ steps.pw-cache.outputs.cache-hit }}
      run: |
        if [ "$CACHE_HIT" = "true" ]; then
          npx playwright install-deps chromium
        else
          npx playwright install --with-deps --only-shell chromium
        fi
```

### 6.2 `.github/actions/e2e-teardown/action.yml`

```yaml
# SCRUM-9-AC-02, AC-12..AC-14 (ADR 0015): run summary, diagnostics on failure, Compose logs, `down -v`, report
# upload. Call with `if: always()`. Needs COMPOSE_* and JIRA_KEY in the job env.
name: e2e-teardown
description: E2E summary, diagnostics, Compose logs, teardown (down -v) and report upload
inputs:
  artifact-name: { description: "Artifact name (ADR 0008)", required: true }
  job-status:    { description: "Pass job.status of the caller", required: true }
  summary-modes: { description: "Playwright modes to summarize", required: false, default: "compose dev" }
  retention-days: { description: "Artifact retention; empty = repository default", required: false, default: "" }
runs:
  using: composite
  steps:
    - name: E2E summary (SCRUM-7-NFR-09)
      if: always()
      shell: bash
      env:
        E2E_SUMMARY_MODES: ${{ inputs.summary-modes }}
      run: node e2e/scripts/summarize.mjs >> "$GITHUB_STEP_SUMMARY"
    - name: Diagnostics on failure (compose ps, health, logs)
      if: always() && inputs.job-status == 'failure'      # == CI's former `if: failure()` (not on cancel)
      shell: bash
      run: |                                               # body moved verbatim from ci.yml
        docker compose ps -a || true
        for c in $(docker compose ps -aq); do
          echo "::group::health $(docker inspect -f '{{ .Name }}' "$c")"
          docker inspect -f '{{ json .State }}' "$c" || true
          echo "::endgroup::"
        done
        echo "::group::docker compose logs (last 200 lines per service)"
        docker compose logs --no-color --timestamps --tail 200 || true
        echo "::endgroup::"
    - name: Collect Compose logs and tear down
      if: always()
      shell: bash
      run: |                                               # body moved verbatim from ci.yml (+ --remove-orphans already there)
        mkdir -p e2e/reports
        docker compose ps -a > e2e/reports/compose-ps.txt 2>&1 || true
        docker compose logs --no-color --timestamps > e2e/reports/compose-logs.txt 2>&1 || true
        docker compose down -v --remove-orphans
    - name: Upload e2e reports
      if: always()
      uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
      with:
        name: ${{ inputs.artifact-name }}
        path: e2e/reports/
        if-no-files-found: warn
        retention-days: ${{ inputs.retention-days }}
```

- Status functions inside a composite refer to the composite's own steps, so the caller's status is passed in as
  `job-status` (`${{ job.status }}` evaluated by the caller step, which runs with `if: always()`). Every inner step is
  `if: always()` so a failing summary or `down` never skips the upload. A failing `down -v` fails the step (visible,
  AC-14) but the job is already red if tests failed, so it does not mask the test result.
- `retention-days: ""` → upload-artifact uses the repository default (CI behaviour unchanged). Dev verifies that the
  pinned v7.0.2 treats an empty input as "unset" (R4); if not, the input default becomes `"90"` (the current default
  of the repository — check *Settings → Actions → Artifact and log retention*).
- `e2e/scripts/summarize.mjs`: `const modes = (process.env.E2E_SUMMARY_MODES ?? 'compose dev').split(/\s+/).filter(Boolean)`
  replacing the literal `['compose', 'dev']`. Default output byte-identical to today.

### 6.3 CI `e2e` refactor (behaviour-preserving)

| CI step today | After |
|---|---|
| hadolint, setup-node@v4, image metadata, buildx, both builds, start stack, verify-images | **unchanged** |
| Install e2e dependencies · Playwright version · Cache Playwright browsers · Install Chromium (all `if: !cancelled() && steps.stack.outcome == 'success'`) | one step `uses: ./.github/actions/e2e-playwright` with the same `if:` |
| E2E against Compose, frontend `npm ci`, E2E dev mode, lifecycle | **unchanged** |
| E2E summary · Diagnostics on failure · Collect Compose logs and tear down · Upload e2e reports | one step `if: always()`, `uses: ./.github/actions/e2e-teardown` with `artifact-name: todo-e2e-${{ env.JIRA_KEY }}-${{ github.sha }}-reports`, `job-status: ${{ job.status }}` (defaults for modes/retention) |

Observable differences (accepted, listed in the PR): `actions/cache` v4 → v6.1.0 and `actions/upload-artifact`
v4 → v7.0.2, SHA-pinned (ADR 0013 §6 / SCRUM-8 Q-10 kept existing tags; these two now come from the shared action —
ADR 0015 records the amendment); the four/four steps appear nested under one step each in the log. Cache key, paths,
commands, artifact name and content, summary text and teardown are identical. Verification: CI run green; artifact
file list of `todo-e2e-SCRUM-9-<sha>-reports` compared with the last `main` run (`gh api …/artifacts` + download,
`find | sort` diff limited to path shapes) — recorded in the matrix.

## 7. Tests

### 7.1 `@critical` tags (AC-07) — 12 tests, tags only

Add `{ tag: '@critical' }` (or extend existing `tag: '@dev-smoke'` to `tag: ['@dev-smoke', '@critical']`) to:

| File | Test (title prefix unchanged) | Workflow |
|---|---|---|
| `empty-state.spec.ts` | `SCRUM-7-AC-18: on an empty database the list shows its empty states and fills once a task is created` | empty list → first task |
| `ui/tasks.spec.ts` | `…: the task list loads with the tasks from the backend` (`@dev-smoke` + `@critical`) | list |
| `ui/tasks.spec.ts` | `…: a task created via the form appears first in the list` (`@dev-smoke` + `@critical`) | create |
| `ui/tasks.spec.ts` | `SCRUM-7-AC-18: editing title, description and due date is shown in the list; …` | edit |
| `ui/tasks.spec.ts` | `…: a status changed from the list row is shown and persists after a reload` (`@dev-smoke` + `@critical`) | status change |
| `ui/tasks.spec.ts` | `SCRUM-7-AC-18: filtering by status shows only matching tasks, …` | filter |
| `ui/tasks.spec.ts` | `SCRUM-7-AC-18, SCRUM-7-AC-06: a backend validation error is shown in the form` | validation |
| `ui/tasks.spec.ts` | `SCRUM-7-AC-18: the footer shows the build identity of the build under test` | identity (UI) |
| `stack.http.spec.ts` | `SCRUM-7-AC-19, …, SCRUM-8-AC-04: / serves index.html with the build identity and no-cache` | app served, identity |
| `stack.http.spec.ts` | `SCRUM-7-AC-04, SCRUM-8-AC-04: /build-info.json carries the identity and version of the build` | identity |
| `stack.http.spec.ts` | `SCRUM-7-AC-02, SCRUM-7-AC-19, SCRUM-8-AC-04: backend /actuator/info reports the build identity and version` | backend identity |
| `stack.http.spec.ts` | `SCRUM-7-AC-06, SCRUM-7-AC-19: API round-trip through the proxy` | create → status → filter → delete → 404 |

Not tagged (still run, still gating via AC-06): client routes, asset caching, missing asset, actuator exposure,
traversal variants, error-body pass-through, security headers. `--min 12` in the workflow makes accidental
untagging visible; adding critical tests later only needs the number raised.

### 7.2 `e2e-gate.mjs` + `lib/e2e-results.mjs` (AC-07, AC-09)

```js
// lib/e2e-results.mjs — pure functions over Playwright JSON (reporter `json`, 1.65.x)
export function collectTests(results)            // walk suites → [{ project, file, title, tags, status, lastResult, retries }]
export function criticalVerdict(tests, { tag = 'critical', min = 1 })
  // passed(t) ⇔ t.status ∈ {'expected','flaky'} ∧ t.lastResult === 'passed'
  // → { ok, executed, passed, failures: [{title, project, status, lastResult}], reason }
  // ok ⇔ executed ≥ min ∧ failures.length === 0   (skipped / interrupted / timedOut / failed all count as failures)
export function flakyTests(tests)               // status === 'flaky'
export function renderMarkdown(verdict, flaky, stats)
```

CLI: `e2e-gate.mjs --results <results.json> --tag critical --min 12 [--summary $GITHUB_STEP_SUMMARY]`.
Exit **0** ok · **1** blocked (message `::error::SCRUM-9-AC-07: …` per failing critical test, or "only N < 12
@critical tests executed") · **2** error (file missing/unparsable, no `suites`, stats missing — fail closed, e.g. after
a Playwright crash). For each flaky test: `::warning::SCRUM-9-AC-09: flaky (passed on retry): [<project>] <title>`.
Summary (AC-13):

```
### Pre-release e2e — critical To-Do workflows (SCRUM-9-AC-07)
**PASS** — 12 @critical tests executed, 12 passed (min 12) · suite: 19 passed, 0 failed, 0 flaky, 0 skipped, 74.2 s
**Flaky (passed on retry):** none
```

Note: `JIRA_KEY` header and per-mode tables still come from `summarize.mjs` (teardown composite). Dependency-free
Node, same style as `vuln-gate.mjs` (`lib/gh-output.mjs` `parseArgs`, `appendSummary`).

### 7.3 Flake policy (AC-09)

`playwright.config.ts` stays: `retries: CI ? 1 : 0`, `forbidOnly: CI`, `workers: 1`, `trace/video: retain-on-failure`
(a retried test keeps the failed attempt's trace in `test-results/` → in the artifact). No workflow-level retry, no
`continue-on-error`. `e2e-images.sh`, `e2e-gate.mjs`, `verify-images.sh`, `verify-lifecycle.sh` never retry.

### 7.4 Tests for the guard (`test/e2e-results.test.mjs`, `node:test`, names start with the ID)

In-test builders produce minimal Playwright JSON objects (`{ suites: [{ title, specs: [{ title, tags, tests: [{
projectName, status, results: [{ status }] }] }], suites }], stats }`) — no fixture files needed:

| Test name | Expectation |
|---|---|
| `SCRUM-9-AC-07: all critical tests passed → ok` | 12 critical expected/passed → exit 0 |
| `SCRUM-9-AC-07: a failed critical test blocks` | one `unexpected`/`failed` → not ok, title in failures |
| `SCRUM-9-AC-07: a skipped critical test blocks` | `skipped` → not ok |
| `SCRUM-9-AC-07: an interrupted or timed-out critical test blocks` | `lastResult` `interrupted`/`timedOut` → not ok |
| `SCRUM-9-AC-07: fewer critical tests than --min blocks` | 11 executed, min 12 → not ok, reason names both numbers |
| `SCRUM-9-AC-07: no critical tests at all blocks` | 0 → not ok |
| `SCRUM-9-AC-07: tags are matched without the @ prefix as written by the JSON reporter` | tags `['critical']` match `--tag critical` and `--tag @critical` |
| `SCRUM-9-AC-07: nested describe suites are walked` | spec inside 2 nested suites counted |
| `SCRUM-9-AC-09: a critical test that passed on retry passes the guard and is reported flaky` | `flaky` + last `passed` → ok, listed in `flakyTests` |
| `SCRUM-9-AC-07: missing or unparsable results fail closed (exit 2)` | CLI via `spawnSync` on a temp dir |
| `SCRUM-9-AC-13: markdown summary lists counts and flaky names` | `renderMarkdown` contains `12 @critical`, flaky title |

## 8. Reports, logs, cleanup (AC-12..AC-14)

Artifact **`todo-release-e2e-<JIRA_KEY>-<sha>-reports`** (`e2e/reports/`, `if-no-files-found: warn`, 30 days):

| Path | Producer |
|---|---|
| `compose/html/` · `compose/junit.xml` · `compose/results.json` | Playwright reporters (config unchanged) |
| `compose/test-results/**` (trace.zip, screenshots, video) | failed / retried tests only |
| `release-images.json` | `e2e-images.sh` (AC-04 record: digests, IDs, store, Docker version, running containers) |
| `compose-logs-before-down.txt` | `verify-lifecycle.sh` (unchanged) |
| `compose-ps.txt` · `compose-logs.txt` | teardown composite (always) |

Job log on failure: Compose `ps -a`, each container's `.State` (health log), last 200 lines per service (teardown
composite, `job-status == 'failure'`). Cleanup: `docker compose down -v --remove-orphans` (project
`todo-release-e2e`: containers, network, volume `todo-release-e2e_todo-pgdata`). Runners are ephemeral; the explicit
teardown is still required (AC-14) and makes `compose-logs.txt` complete before removal.

NFR-07: compose logs contain application/PostgreSQL logs only; no `docker inspect .Config.Env` and no `env` dumps are
written (the diagnostics print `.State` only, as today).

## 9. Pinning (NFR-03) — all reused from `release.yml` (SCRUM-8 design §6.4)

| Action | SHA | Used in |
|---|---|---|
| `actions/checkout` v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` | `e2e-release` |
| `actions/setup-node` v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` | `e2e-release` |
| `actions/download-artifact` v8.0.2 | `9000827ccba6bdab643e8b6fd33ac0654aef8333` | `e2e-release` |
| `actions/cache` v6.1.0 | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` | `e2e-playwright` composite |
| `actions/upload-artifact` v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | `e2e-teardown` composite |

No new third-party action, no new CLI download (Playwright's browser download is governed by the lockfile-pinned
`@playwright/test` 1.65.1, as in CI). Local composites are referenced as `./.github/actions/<name>` (same commit as
the checkout — `ref: needs.version.outputs.sha`).

## 10. Documentation (AC-16, NFR-08) — Dev writes

`docs/release/RELEASE.md`:
- §2 job table: new row `e2e-release` — "loads the OCI archives (no rebuild/pull), asserts the digest chain, Compose
  stack, Playwright compose suite + `@critical` guard, image + lifecycle checks; report artifact" — both modes;
  `release-gate` row: "every gate incl. `e2e-release`".
- §3 artifacts table: `todo-release-e2e-<KEY>-<sha>-reports` (30 days); `todo-release-images-…` row: "consumed by
  `e2e-release`" (drop "will").
- §8 recovery: covered by the "any job before `publish`" row; add "(incl. `e2e-release`)" and "a real e2e failure is
  a product bug: fix forward; a flake: re-run the failed jobs (`gh run rerun <id> --failed`) — the same digests are
  re-tested" (re-running `e2e-release` + `release-gate` reuses the run's images artifact).
- New §3.1 "Pre-release e2e" incl. local reproduction:

```sh
RUN=<run id>; KEY=<jira key>; SHA=<sha>      # from the Release run
gh run download "$RUN" --repo vinods21/todo -n "todo-release-images-$KEY-$SHA" -D images
export IMAGE_BACKEND=ghcr.io/vinods21/todo-backend IMAGE_FRONTEND=ghcr.io/vinods21/todo-frontend
export VERSION=<stamped version> BACKEND_DIGEST=<sha256:…> FRONTEND_DIGEST=<sha256:…>   # run summary / release-images.json
.github/scripts/release/e2e-images.sh load images
export TODO_BACKEND_IMAGE=$IMAGE_BACKEND TODO_FRONTEND_IMAGE=$IMAGE_FRONTEND TODO_IMAGE_TAG=$VERSION COMPOSE_PROFILES=app
docker compose up -d --no-build --pull never --wait
(cd e2e && npm ci && npx playwright install --with-deps --only-shell chromium \
  && E2E_EXPECT_EMPTY_DB=1 E2E_VERSION=$VERSION npx playwright test)
docker compose down -v --remove-orphans
```

README: only if it enumerates the release gates — add "e2e against the release images (SCRUM-9)".

## 11. Verification plan (Dev → matrix)

1. Local: `shellcheck .github/scripts/release/e2e-images.sh`; `node --test .github/scripts/release/test/*.test.mjs`;
   `cd e2e && npx tsc --noEmit && npx playwright test --list --grep @critical` → 12 tests listed (compose mode);
   `npx playwright test --list` count unchanged vs `main`; `E2E_MODE=dev npx playwright test --list` unchanged (3).
2. Push → `CI` green (e2e artifact comparison §6.3) and `Release` dry-run green: `e2e-release` success, summary
   tables (§5.2, §7.2), artifact present, `release-gate` lists `e2e-release: success`; record store type, Docker
   version, digests, durations (job + dry-run wall-clock).
3. AC-11: temporary commit (e.g. in `e2e-release` set `E2E_VERSION: ${{ env.VERSION }}-wrong`, or tamper
   `BACKEND_DIGEST` to prove AC-04 fails) → `Release` red: `e2e-release` failure, `release-gate` failure with
   `e2e-release=failure`, `publish`/`verify` skipped; revert commit → green. Both run links in the matrix. Preferably
   do both variants (test failure **and** digest mismatch) in one temporary commit pair.
4. Fork-safety (NFR-02): job has no `permissions`/secrets/login — review.

## 12. Risks — and what only CI can verify

| # | Risk | Likelihood | Detection / mitigation |
|---|---|---|---|
| R1 | `docker load` of the BuildKit OCI archive fails or tags nothing on the runner's Engine | Low | Step fails visibly. Fallback §5.1 (classic: `skopeo copy … docker-daemon:` as in `images`; `id_kind=config`). If neither yields an ID matching a digest of the archive → escalate (ADR 0015 alternative: local registry) |
| R2 | Image-store semantics differ from §5.1 (e.g. containerd store reports the *index* or a converted manifest as `Id`) | Low–Med | `load` fails with both digests printed. Mitigation: accept `Id` ∈ {manifest, config} **only** if the daemon store is the one documented for that kind; never accept a third value. Record what the runner does in the matrix and ADR 0015 note |
| R3 | `--pull never` + `verify-lifecycle.sh` (`pull_policy` default) tries to pull a candidate ref | Very low | Would fail (tag absent in GHCR) — red, not silent |
| R4 | `actions/upload-artifact` v7.0.2 rejects `retention-days: ""` | Low | First CI run fails at upload; set the default to the repository's retention (§6.2) |
| R5 | Cold browser cache in the `Release` workflow (first run per Playwright version / cache eviction) pushes the dry-run over 15 min | Med (first run) | Cache key shared with CI (`playwright-Linux-1.65.1`, same branch scope); report timings; if chronic, move the `e2e-playwright` composite before `download-artifact`/load (it already overlaps nothing — the job starts with `images`, parallel to `scan`) |
| R6 | Composite `if: always()` / status semantics differ from expectation (diagnostics not printed or upload skipped) | Low | AC-11 red run shows whether diagnostics + artifact appear; the `job-status` input avoids composite-status ambiguity |
| R7 | Retry hides a real intermittent defect in a release | Low | Flaky tests are named + warned (AC-09); Q-01 lets the PO make flaky `@critical` blocking later (one flag in `e2e-gate.mjs`) |
| R8 | `docker compose pull postgres` rate-limited by Docker Hub | Low | Red job, re-run; same exposure as CI `e2e` today (A-05) |
| R9 | CI refactor changes CI `e2e` behaviour unnoticed | Low | §6.3 parity table + artifact listing diff; CI and Release both red/green on every PR |
| R10 | Port clash (3000/8080/5432) | None | Fresh runner per job |

## 13. Requirement → design coverage

| ID | Design |
|---|---|
| AC-01 | §2, §4.1 (`e2e-release`, `needs: [version, images]`, timeout) |
| AC-02 | §6 (composites), §6.3 (CI parity) |
| AC-03 | §4.1 (download, load, overrides, `--no-build --pull never`, no login), §5.1 |
| AC-04 | §5.1 step 3, §5.2, second `assert-running` after lifecycle |
| AC-05 | §4.1 `stack` step (`--wait --wait-timeout 240`, step timeout), later steps gated on `steps.stack.outcome` |
| AC-06 | §4.1 Playwright step (full compose projects, identity env, empty DB) |
| AC-07 | §7.1 tags, §7.2 guard, §7.4 tests |
| AC-08 | §4.1 `verify-images.sh`, `verify-lifecycle.sh` |
| AC-09 | §7.3, §7.2 flaky warnings |
| AC-10 | §2 diff, §4.2 |
| AC-11 | §11 step 3 |
| AC-12 | §8, §6.2 |
| AC-13 | §5.2 table, §7.2 summary, `summarize.mjs` |
| AC-14 | §6.2 teardown, §8 |
| AC-15 | §2 (no new path to `publish`), both modes |
| AC-16 | ADR 0015 + amendment notes (this commit), §10 |
| AC-17 | traceability template (this commit) |
| NFR-01 | §2 timing, §4.1 timeouts |
| NFR-02 | §4.1 notes (no permissions/secrets/login) |
| NFR-03 | §9 |
| NFR-04 | §4.1 fresh volume + `E2E_EXPECT_EMPTY_DB`, §7.3 |
| NFR-05 | §3 "not changed", §6.3 |
| NFR-06 | §5, §7.2, §7.4 (shellcheck + `node --test` in `tooling`) |
| NFR-07 | §8 |
| NFR-08 | §10 local reproduction |

## 14. Suggested commit sequence (Dev)

1. `SCRUM-9: [DEV] tag critical To-Do e2e tests and add the e2e gate script with tests` — spec tags,
   `lib/e2e-results.mjs`, `e2e-gate.mjs`, tests, `summarize.mjs` modes.
2. `SCRUM-9: [DEV] add shared e2e composite actions and move the CI e2e job onto them`.
3. `SCRUM-9: [DEV] add e2e-release job against the release-candidate images and gate release-gate on it` —
   `e2e-images.sh`, `release.yml`.
4. (temporary, AC-11) `SCRUM-9: [DEV] TEMP prove e2e blocks the release` → revert.
5. `SCRUM-9: [DEV] document the pre-release e2e gate` — RELEASE.md (+ README).
6. `SCRUM-9: [DEV] fill the traceability matrix`.
