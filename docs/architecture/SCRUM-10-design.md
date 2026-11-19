# SCRUM-10 — Design: frontend runtime base image nginx-unprivileged 1.30.6 → 1.30.7

| Field | Value |
|---|---|
| Jira | [SCRUM-10](https://suranagivinod.atlassian.net/browse/SCRUM-10) |
| Requirements | [`docs/requirements/SCRUM-10.md`](../requirements/SCRUM-10.md) (SCRUM-10-AC-01..AC-08, NFR-01..NFR-05) |
| ADRs | [0010](../adr/0010-container-images-and-build-identity.md) (amended by this Task, by Dev), [0011](../adr/0011-spa-hosting-nginx-reverse-proxy.md), [0014](../adr/0014-vulnerability-scanning-policy.md) / [policy §3 step 1](../release/vulnerability-policy.md) |
| Author role | Architect |
| New ADR | None — a patch bump within the decided line is "a deliberate change to the Dockerfile and this table" (ADR 0010) |

## 1. Decision: the tag

**Use `nginx/nginx-unprivileged:1.30.7-alpine3.24`**
(label `org.opencontainers.image.base.name="docker.io/nginx/nginx-unprivileged:1.30.7-alpine3.24"`).

Same naming scheme as today (`<nginx X.Y.Z>-alpine<alpine minor>`): exact nginx patch **and** Alpine minor, so an
upstream Alpine-minor move can never silently change our base (AC-01, NFR-02).

### 1.1 Evidence (upstream clone, `main` = `95b8382`, 2026-11-18)

| Fact | Source |
|---|---|
| Stable = 1.30.7 | `update.sh`: `nginx[stable]='1.30.7'` (commit `bef9cb1`); regenerated Dockerfiles `95b8382` |
| Alpine minor = 3.24 | `update.sh`: `alpine[stable]='3.24'` (8th `[stable]=` line, which `alpine-stable.yml` job `version` reads as `distro`); `stable/alpine-slim/Dockerfile`: `ARG IMAGE=alpine:3.24` / `FROM $IMAGE`; `stable/alpine/Dockerfile`: `ARG IMAGE=nginx/nginx-unprivileged:1.30.7-alpine-slim` |
| nginx package in the image = `1.30.7-r1` (≥ Trivy fixed `1.30.7-r0`) | `ENV NGINX_VERSION=1.30.7`, `ENV PKG_RELEASE=1`, `apk add … nginx=${NGINX_VERSION}-r${PKG_RELEASE}` |
| UID 101, port 8080, entrypoint unchanged | `git diff 6934f28 95b8382 -- stable/alpine stable/alpine-slim`: only `NGINX_VERSION`, pkg-oss checksum and the slim base tag changed (NFR-01) |
| Tags pushed for the core stable Alpine image | `.github/workflows/alpine-stable.yml`, job `core`, `docker/metadata-action` `tags:` (below) |
| Registries | `docker.io/nginx/nginx-unprivileged`, `ghcr.io/nginx/…`, `public.ecr.aws/nginx/…`, `quay.io/nginx/…` (same step, same manifest) |

Tags derived from the job `core` templates with major=1, minor=30, patch=7, distro=3.24:

| Template | Tag | Pinned? |
|---|---|---|
| `{major}.{minor}.{patch}-alpine{distro}` | **`1.30.7-alpine3.24`** | nginx patch + Alpine minor — **chosen** |
| `{major}.{minor}.{patch}-alpine` | `1.30.7-alpine` | nginx patch only (Alpine minor floats) |
| `{major}.{minor}-alpine{distro}` | `1.30-alpine3.24` | floating (moves to 1.30.8) — not allowed |
| `{major}.{minor}-alpine` | `1.30-alpine` | floating — not allowed |
| `stable-alpine{distro}` | `stable-alpine3.24` | floating — not allowed |
| `stable-alpine` | `stable-alpine` | floating — not allowed |

(`-slim`, `-perl`, `-otel` variants exist with the same pattern; not used.) All tags are mutable in the sense that
upstream rebuilds them weekly (cron `0 0 * * 1`) for Alpine security updates; tags-only, no digests, stays per ADR 0010
Q-04.

### 1.2 Confidence and the publication risk

- **Tag name: high confidence (~95 %)** — derived mechanically from upstream's own workflow and `update.sh` at `95b8382`.
- **Tag existence today (2026-11-19): medium.** Docker Hub, GHCR, Quay and ECR Public were not reachable from the
  architecture environment, so existence was **not** verified. `alpine-stable.yml` has **no `push` trigger**: images are
  pushed only by `merge_group`, `schedule` (Mondays 00:00 UTC — next **2026-11-23**) or `workflow_dispatch`. The bump
  landed on Wednesday 2026-11-18 16:37 UTC; unless it went through a merge queue or was dispatched manually, the tag
  appears at the next Monday cron at the latest. This is also why the SCRUM-8 attempt (`28b3bc8`, 2026-11-18 17:53 UTC,
  `nginxinc/nginx-unprivileged:1.30.7-alpine3.24`) failed: retired namespace (`nginxinc/` no longer pushed since
  upstream `5ac28c4`/`679834d`) **and** ~1 h after the upstream commit.

### 1.3 Dev verification (first step, before editing)

On a GitHub runner or any host with Docker Hub access:

```sh
docker buildx imagetools inspect docker.io/nginx/nginx-unprivileged:1.30.7-alpine3.24   # must list linux/amd64
docker run --rm --entrypoint sh nginx/nginx-unprivileged:1.30.7-alpine3.24 -c \
  'cat /etc/alpine-release; apk info -v nginx; id -u'                                   # 3.24.x, nginx-1.30.7-r1, 101
docker image inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
  nginx/nginx-unprivileged:1.30.7-alpine3.24                                            # upstream sha ≥ 95b8382
```

Record the output (manifest digest, Alpine release, nginx package, upstream revision) in the matrix (AC-03, AC-07).

### 1.4 Fallback order

All six tags of §1.1 are pushed **by one `build-push-action` step to all four registries at once**, so if
`1.30.7-alpine3.24` is missing on Docker Hub, no other 1.30.7 tag or registry has it either. Hence:

1. **`docker.io/nginx/nginx-unprivileged:1.30.7-alpine3.24`** — primary.
2. **`docker.io/nginx/nginx-unprivileged:1.30.7-alpine`** — only if upstream has moved stable to a newer Alpine minor
   (e.g. 3.25) by the time Dev works, so `…-alpine3.24` is no longer rebuilt; then pin
   **`1.30.7-alpine<new minor>`** instead (same rule: exact patch + exact Alpine minor) and record the Alpine move
   (NFR-02). Do not pin the bare `-alpine` tag.
3. **Not published yet** (`manifest unknown`): stop, do not merge; re-check after upstream publishes (latest at the
   Monday cron, 2026-11-23 00:00 UTC) and record the wait in the matrix. Releases stay blocked meanwhile — that is the
   intended gate behaviour.
4. **Not acceptable** without a new PO decision on SCRUM-10: allow-list entries (AC-04), `nginxinc/…` (retired,
   unmaintained), the official `nginx:1.30.7-alpine` (root/port 80 — breaks UID 101/8080, NFR-01), mainline `1.31.9`,
   floating tags, other registries' copies of a tag Docker Hub does not have.

## 2. Change list for Dev

### 2.1 Must change

| File | Change | IDs |
|---|---|---|
| `frontend/Dockerfile` (runtime `FROM`, l. 39) | `FROM nginx/nginx-unprivileged:1.30.7-alpine3.24` | AC-01 |
| `frontend/Dockerfile` (`LABEL`, l. 67) | `org.opencontainers.image.base.name="docker.io/nginx/nginx-unprivileged:1.30.7-alpine3.24"` — must equal what `runtime_base()` in `verify-release-images.sh` derives from the last `FROM` (`docker.io/` prepended to `nginx/…`) | AC-02 |
| `docs/adr/0010-container-images-and-build-identity.md` (table l. 69) | frontend runtime → `nginx/nginx-unprivileged:1.30.7-alpine3.24` | AC-07 |
| `docs/adr/0010-…` (after the SCRUM-8 bullet, l. 75–82) | add bullet **SCRUM-10 (2026-11-19)**: 1.30.6 → 1.30.7 (same repository, Alpine 3.24), clears HIGH CVE-2026-113425, -121810, -123007, -123633, -123634 (`nginx` 1.30.6-r1 → 1.30.7-r1; Release run 44475812645); upstream `bef9cb1`/`95b8382`; link SCRUM-10 requirements/design; also add "Amended by SCRUM-10" to the header block | AC-07 |
| `docs/adr/0011-spa-hosting-nginx-reverse-proxy.md` (l. 28) | Image → `nginx/nginx-unprivileged:1.30.7-alpine3.24` | AC-07 |
| `docs/traceability/SCRUM-10.md` | fill the template | AC-08 |

### 2.2 Checked — no change needed (do not edit)

| File | Why |
|---|---|
| `.github/scripts/release/verify-release-images.sh` | derives the expected `base.name` from the last `FROM` at run time; no literal tag |
| `.github/scripts/verify-images.sh` | only checks `base.name` is non-empty; UID/size/runtime checks are tag-independent |
| `.github/scripts/release/test/**`, `.github/workflows/*.yml` | no reference to the nginx tag (`grep -rn "1\.30\.6\|nginx-unprivileged"` → only the files in §2.1 plus the historical docs below) |
| `.github/security/vulnerability-allowlist.json` | stays empty (AC-04) |
| `docker-compose.yml` | only a comment "(nginx-unprivileged)", no tag |
| `docs/release/vulnerability-policy.md` | generic "nginx-unprivileged 1.30.x / Alpine 3.2x" — still correct |
| `docs/adr/0014-…` (l. 14), `docs/architecture/SCRUM-7-design.md`, `SCRUM-8-design.md`, `docs/traceability/SCRUM-8.md` | historical records of what was true at the time (NFR-04; requirements §2 out of scope) |

`grep -rn "1\.30\.6" --exclude-dir=node_modules .` after the change must hit only the historical files above and the
ADR 0010 SCRUM-8 amendment bullet.

## 3. Verification (maps to AC)

| ID | Evidence |
|---|---|
| AC-01, AC-02 | diff of `frontend/Dockerfile`; `verify-release-images.sh` in Release job `images` (base.name = runtime FROM) |
| AC-03 | Release dry-run job `scan`: verdict PASS, `frontend-image` 0 fixable C/H, none of the 5 CVE IDs in `verdict.json`; SBOM/scan shows `nginx` 1.30.7-r1 |
| AC-04 | `git diff main -- .github/security/` empty; `check-allowlist` in job `tooling` green |
| AC-05 | `CI` run (identity, build, frontend, e2e) and `Release` dry-run run green on head |
| AC-06 | `verify-images.sh` (CI e2e) and `verify-release-images.sh` (Release) tables: labels ok, user `101:101`, size ≤ 80 MB |
| AC-07 | ADR 0010/0011 diff |
| AC-08 | commit log; filled matrix |

If the scan shows **new** fixable findings in other Alpine packages of the 1.30.7 image, handle per policy §3 within
the same line (newest `1.30.7-alpine3.24` rebuild) and record it; no allow-list.

## 4. Risks

| # | Risk | L | Mitigation |
|---|---|---|---|
| R1 | Tag not yet published (no push trigger upstream) | Med | §1.3 check first; §1.4 step 3 (wait for Monday cron 2026-11-23) |
| R2 | Upstream moves stable Alpine to 3.25 before Dev | Low | §1.4 step 2 |
| R3 | Docker Hub anonymous pull rate limits in CI | Low | unchanged from today (same registry) |
| R4 | New CVEs published against 1.30.7 / Alpine 3.24 packages before merge | Low | gate reports them; policy §3 |
