# SCRUM-11 — Design: remediate the MEDIUM/UNKNOWN Alpine findings in both runtime images; MEDIUM policy

| Field | Value |
|---|---|
| Jira | [SCRUM-11](https://suranagivinod.atlassian.net/browse/SCRUM-11) |
| Requirements | [`docs/requirements/SCRUM-11.md`](../requirements/SCRUM-11.md) (SCRUM-11-AC-01..AC-12, NFR-01..NFR-08, Q-01..Q-04) |
| ADRs | **new [ADR 0016](../adr/0016-medium-findings-and-os-package-floors.md)** (amends 0014 and 0010); [0010](../adr/0010-container-images-and-build-identity.md), [0014](../adr/0014-vulnerability-scanning-policy.md), [policy](../release/vulnerability-policy.md) |
| Author role | Architect |
| Inputs | v1.0.1 scan reports ([Release run 44672985089](https://github.com/vinods21/todo/actions/runs/44672985089)); upstream clones (2026-11-20): `alpinelinux/aports` `3.24-stable` @ `2790617`, `alpinelinux/docker-alpine` `v3.24` @ `0c9af76`, `docker-library/official-images` @ `df4e0c3`, `docker-library/repo-info` @ `f3920aa`, `adoptium/containers` @ `4341da9`, `nginx/docker-nginx-unprivileged` @ `95b8382`. Docker Hub / GHCR / gitlab.alpinelinux.org were not reachable. |

## 1. Decisions at a glance

| Package (CVEs) | Images | Remediation | Floor / action | Why not the preferred option |
|---|---|---|---|---|
| OpenSSL `libcrypto3`, `libssl3`, `openssl` (CVE-2026-107496, -88822, -88823, -95691, -95692) | backend, frontend (`openssl` CLI: backend only) | **Floor** in the runtime stage | `'libcrypto3>=3.5.9-r1' 'libssl3>=3.5.9-r1'` (+ `'openssl>=3.5.9-r1'` backend) | No rebuilt base image exists (§2.2); fix is `pkgrel` only (same 3.5.9 source + 5 patches) |
| zlib (CVE-2026-4738) | backend, frontend | **Floor** | `'zlib>=1.4-r0'` | Same; 1.4 is Alpine's own security upgrade in the stable branch, ABI-compatible (§3.2) |
| gnutls (CVE-2026-127039, -127040, -127231) | backend | **Remove** `gnupg` (pulls `gnutls`) | `apk del --no-cache gnupg` + assert `gnutls` absent | Not used at runtime (§3.3); removal also drops 28 other packages with their future CVEs |
| MEDIUM policy (Q-04) | — | **Report-only, itemised, triage deadline** | ADR 0016 §1; gate lists fixable MEDIUM/UNKNOWN + `::warning::` | Gating rejected (ADR 0016 table) |
| Digests (Q-03) | — | **Not now**; Temurin tag gains `-3.24` suffix | `eclipse-temurin:21.0.13_9-jre-alpine-3.24` | ADR 0016 §3 |

No major/minor upgrade (AC-05): Java 21.0.13+9, nginx 1.30.7, Alpine 3.24 stay. No allow-list entries.

## 2. Evidence

### 2.1 What the images contain (v1.0.1 Trivy JSON)

| Fact | Evidence |
|---|---|
| Both images are Alpine **3.24.4**, minirootfs layer `sha256:75f1d965…` (identical in both) | `Metadata.OS`, `DiffIDs[0]`; history `ADD alpine-minirootfs-3.24.4-x86_64.tar.gz` 2026-11-05T18:00Z |
| `libcrypto3`, `libssl3`, `zlib` come from the minirootfs layer | `Packages[].Layer.DiffID` = `75f1d965…` |
| Backend `openssl`, `gnutls` come from Temurin's package layer `84acb449…` | history 2026-11-05T19:17Z: `apk add --no-cache fontconfig ttf-dejavu gnupg ca-certificates p11-kit-trust musl-locales musl-locales-lang tzdata coreutils openssl` |
| `gnutls`'s only reverse dependency is `gnupg-dirmngr` | `Packages[].DependsOn` (73 packages) |
| Frontend has no `openssl` CLI / `gnutls` | nginx-unprivileged installs `openssl` only as virtual `.checksum-deps` and deletes it |
| Temurin base built 2026-11-05T19:18:47Z; nginx-unprivileged base 2026-11-18T16:40–17:40Z | image history |

### 2.2 Upstream timeline — why option 1 (rebuilt base image) is not available

| Time (UTC) | Event | Source |
|---|---|---|
| 2026-11-05 09:17 | Alpine **3.24.4** released | aports `105b835` "===== release 3.24.4 =====" |
| 2026-11-05 | `alpine:3.24` = 3.24.4 | docker-alpine `v3.24` `0c9af76`; official-images `7d75455` |
| 2026-11-05 19:18 | `eclipse-temurin:21.0.13_9-jre-alpine` (= `…-jre-alpine-3.24`) built; image ID `fe627b25…`, index digest `sha256:ac05c3c42b7c2f1a52c9bd52f01041fa1958231b15ebeae7420429cbc5baf474` (amd64 `sha256:b6ea71e6…`) | repo-info `repos/eclipse-temurin/{local,remote}/21.0.13_9-jre-alpine{,-3.24}.md` (same ID/digest for both tags; packages: `libcrypto3-3.5.9-r0`, `openssl-3.5.9-r0`, `zlib-1.3.2-r1`, `gnutls-3.8.13-r0`) |
| 2026-11-06 18:22 | zlib **1.4-r0** in `3.24-stable` (secfixes: CVE-2026-4738) | aports `bdf501c` |
| 2026-11-18 16:40 | `nginx/nginx-unprivileged:1.30.7-alpine3.24` built on `alpine:3.24` (3.24.4) — still `3.5.9-r0`/`1.3.2-r1`: its Dockerfile never runs `apk upgrade`, so minirootfs packages are kept | upstream `95b8382` `stable/alpine-slim/Dockerfile`; our image history |
| 2026-11-18 23:31 | openssl **3.5.9-r1** (pkgrel bump, 5 patches, secadv 20261110) | aports `0f4c7e8` |
| 2026-11-19 03:26 / 18:51 | gnutls **3.8.14-r0**; follow-up test skip for x86 (no pkgrel change) | aports `2ddf7f7`, `0e00b35` |
| 2026-11-20 | **No Alpine 3.24.5**; `alpine:3.24` unchanged; official-images Temurin 21 entry still `GitCommit a240a79` (2026-10-29); repo-info Temurin 21 JRE Alpine remote digest last changed 2026-11-05 (`49aecd3`) | clones above |

Upstream will only ship the fixes after an **Alpine 3.24.x point release** (Temurin is rebuilt by Docker official
images when `alpine:3.24` changes; nginx-unprivileged at its next Monday cron after that). 2026 cadence: 2–13 weeks,
no announced date. Hence option 2 (floors) for OpenSSL/zlib and option 3 (removal) for gnutls.

## 3. Remediation per package

### 3.1 OpenSSL — floor `3.5.9-r1` (both images)

Same upstream version 3.5.9, `pkgrel` 0 → 1 with backported patches; `_abiver=3` unchanged → `libcrypto.so.3`,
`libssl.so.3` unchanged. Consumers (`nginx`, `nginx-module-njs`, `libcurl`, `apk-tools`, busybox `ssl_client`) need
no rebuild. Exposure today is low (A-03), the fix is still cheap. Upgrading `libcrypto3`/`libssl3` requires the
backend's `openssl` CLI (which depends on `libcrypto3=…` of the same build) to move too, so the backend floor lists
all three; the frontend must **not** list `openssl` (that would install the CLI).

### 3.2 zlib — floor `1.4-r0` (both images); ABI evidence

- Alpine took 1.4 into the **stable** branch as a security upgrade (`bdf501c`); the `APKBUILD` build is unchanged
  (`./configure --shared`), no `provides`/soname change, patch for CVE-2026-85091 dropped because upstream contains it.
- No "rebuild against zlib" commit exists in `3.24-stable` after `bdf501c` (all 171 commits since 2026-11-04
  checked); Alpine does rebuild reverse dependencies on ABI changes even in stable branches (e.g. `f2efe50`
  "community/nginx-mod-http-acme: rebuild against nginx 1.30.7-r0" on 2026-11-19). zlib has kept the soname
  `libz.so.1` (symbol-versioned, additive) since 1.2.x.
- Mechanical safety net: `nginx`, `libpng`, `libxml2`, `libcurl`, `freetype`, `apk-tools` depend on `so:libz.so.1`;
  if 1.4 did not provide it, `apk add 'zlib>=1.4-r0'` would be unsatisfiable and the **build fails** (NFR-02).
- Runtime proof: the backend reads the Spring Boot fat jar (a zip) at every start; the frontend nginx serves gzip-able
  content and loads `libz` at start; CI `e2e`, Release `e2e-release` and the lifecycle checks exercise both.
- CVE-2026-4738's description targets zlib's `contrib/infback9` (as bundled by GDAL), which `libz.so` does not build;
  we upgrade anyway because Alpine marks 1.4-r0 as the fix and vendor ratings (CVSS 4.0 9.4) could re-rate it.

### 3.3 gnutls — remove `gnupg` (backend)

- Temurin installs `gnupg` "required to verify the signature" of the JDK tarball in **its own** next `RUN`
  (adoptium/containers `21/jre/alpine/3.24/Dockerfile`); nothing in our runtime calls `gpg`/`dirmngr`: entrypoint
  `java -jar`, healthcheck busybox `wget` over HTTP, no `__cacert_entrypoint.sh` (replaced, ADR 0010).
- `gnutls` is required only by `gnupg-dirmngr`. `apk del gnupg` removes `gnupg` from `/etc/apk/world`; apk then
  removes the orphaned closure — computed from the v1.0.1 `DependsOn` graph against the remaining world
  (`alpine-baselayout`, `apk-tools`, `busybox`, `musl-utils`, `fontconfig`, `ttf-dejavu`, `ca-certificates`,
  `p11-kit-trust`, `musl-locales(-lang)`, `tzdata`, `coreutils`, `openssl`): **29 packages** — `gnupg`, `gnupg-dirmngr`,
  `gnupg-gpgconf`, `gnupg-keyboxd`, `gnupg-utils`, `gnupg-wks-client`, `gpg`, `gpg-agent`, `gpg-wks-server`, `gpgsm`,
  `gpgv`, `gnutls`, `libassuan`, `libgcrypt`, `libgpg-error`, `libksba`, `libldap`, `libsasl`, `npth`, `pinentry`,
  `sqlite-libs`, `nettle`, `gmp`, `libidn2`, `libunistring`, `libncursesw`, `ncurses-terminfo-base`, `gdbm`,
  `zstd-libs`. None is a JRE dependency (`fontconfig`/`freetype`, `libpng`, `p11-kit`, `ca-certificates`, `musl`
  stay).
- Simple: one `apk del` of a top-level package plus an assertion. Removal does **not** shrink the image (the files
  stay in Temurin's layer; our layer adds whiteouts), but it removes them from the filesystem, the apk database, the
  SBOM and every future scan.
- SBOM consequence: `backend-image` SBOM ≈ 157 − 29 = **128** components (73 → 44 OS packages + 83 jars + OS
  component), still ≥ the floor 125 but with a 3-component margin. Per the SCRUM-8 rule ("~80 % of the observed
  count") the floor moves to **102** (= ⌊0.8 × 128⌋; Dev uses the observed count, NFR-08).
- Fallback if removal causes any failure: floor `'gnutls>=3.8.14-r0'` instead (§6).

### 3.4 Not chosen

- **`apk upgrade --no-cache` (everything):** picks up unrelated changes, and `apk upgrade <pkg>` is a silent no-op
  when the repository has nothing newer (violates NFR-02).
- **Exact pins** (`libcrypto3=3.5.9-r1`): Alpine stable repositories keep only the latest build; the build would break
  at the next `-r2` (see ADR 0016 §2).
- **Removing `openssl` CLI (backend):** possible (used only by Temurin's replaced CA entrypoint) but `libcrypto3`/
  `libssl3` must be upgraded anyway; not worth the extra deviation from the base.
- **Other base families** (distroless, Debian/Ubuntu `-jre-noble`, nginx Debian): line changes → out of scope (AC-05).

## 4. Exact changes for Dev

### 4.1 `Dockerfile` (backend runtime stage, l. 46–49 and l. 77)

```dockerfile
# ---- runtime stage: JRE only (NFR-02, NFR-03) ----
# SCRUM-11 / ADR 0016: Alpine minor pinned in the tag (same image as 21.0.13_9-jre-alpine on 2026-11-20).
FROM eclipse-temurin:21.0.13_9-jre-alpine-3.24
# SCRUM-11 / ADR 0016 §2: OS-package floors until the base image ships them (Alpine 3.24 fixes of 2026-11-06/18;
# no rebuilt base yet). The build fails if the repository does not provide them (NFR-02). Remove each floor in the
# base-image bump that already contains it. gnupg (+ gnutls and 27 more) is only needed by the base image's own JDK
# signature check, never at runtime: removed (SCRUM-11-AC-04).
RUN apk add --no-cache 'libcrypto3>=3.5.9-r1' 'libssl3>=3.5.9-r1' 'openssl>=3.5.9-r1' 'zlib>=1.4-r0' \
 && apk del --no-cache gnupg \
 && ! apk info -e gnutls \
 && apk list --installed libcrypto3 libssl3 openssl zlib
RUN addgroup -S -g 10001 todo \
 && adduser -S -D -H -u 10001 -G todo -s /sbin/nologin todo
```

and the label (l. 77):

```dockerfile
      org.opencontainers.image.base.name="docker.io/library/eclipse-temurin:21.0.13_9-jre-alpine-3.24" \
```

Notes: the stage runs as root until `USER 10001:10001` (Temurin sets no `USER`). `! apk info -e gnutls` fails the
`RUN` if `gnutls` survived. The last command only prints the versions into the build log (absent when the layer is a
cache hit — the scan JSON is the authoritative evidence, §5). A separate `RUN` (not merged into `addgroup`) keeps
the floor diff self-contained; hadolint DL3059 is info-level (below `failure-threshold: warning`).

### 4.2 `frontend/Dockerfile` (runtime stage, after l. 39)

```dockerfile
FROM nginx/nginx-unprivileged:1.30.7-alpine3.24
# SCRUM-11 / ADR 0016 §2: OS-package floors until the base image ships them; build fails if unavailable (NFR-02).
# Root only for apk; the image switches back to 101 below. No `openssl` here (would install the CLI).
USER root
RUN apk add --no-cache 'libcrypto3>=3.5.9-r1' 'libssl3>=3.5.9-r1' 'zlib>=1.4-r0' \
 && apk list --installed libcrypto3 libssl3 zlib
COPY nginx/security-headers.conf nginx/proxy.conf /etc/nginx/snippets/
```

The existing `USER 101:101` (l. 47) stays and remains the last `USER` (hadolint DL3002 satisfied). `FROM` and
`base.name` unchanged.

### 4.3 Gate reporting (ADR 0016 §1, SCRUM-11-AC-08)

| File | Change |
|---|---|
| `.github/scripts/release/lib/gate.mjs` | In `evaluateGate`: `fixableMediumUnknown = dedup(all.filter((f) => f.class === 'gated' && f.kind === 'vulnerability' && (f.severity === 'MEDIUM' \|\| f.severity === 'UNKNOWN') && fixable(f)))`; add it to the returned object (after `unfixedCriticalHigh`). In `renderGateMarkdown`: `table(\`MEDIUM/UNKNOWN with a fix — reported, not blocking; triage per ADR 0016 (${n})\`, result.fixableMediumUnknown)` after the "without a fix" table. Verdict computation untouched. Comment header: `SCRUM-11-AC-08 (ADR 0016)`. |
| `.github/scripts/release/vuln-gate.mjs` | After the `::error::` loop: up to 10 × `::warning::SCRUM-11 (ADR 0016) fixable ${severity} ${id} in ${pkg} ${installed} → ${fixed} [${targets}]`, then, if any, one `::warning::SCRUM-11: ${n} fixable MEDIUM/UNKNOWN finding(s) in shipped components — not blocking; triage within 5 working days (ADR 0016)`. |
| `.github/scripts/release/test/gate.test.mjs` | New tests (names start with `SCRUM-11-AC-08:`): (a) fixable MEDIUM in a gated target → verdict PASS, listed in `fixableMediumUnknown` and in the markdown table; (b) same for UNKNOWN; (c) MEDIUM **without** fix → not listed; (d) fixable MEDIUM only in a `reported` target → not listed; (e) fixable HIGH still BLOCKED and not in the new list. Use `withSeverity()` on `trivy-fixable-high.json` (clear `FixedVersion`/`Status` for (c)). |
| `.github/scripts/release/lib/sbom.mjs` | `MIN_COMPONENTS['backend-image']`: 125 → **⌊0.8 × observed⌋** (expected 102 for 128); comment `SCRUM-11: gnupg removed (−29 OS packages)`. |

`notes.mjs` (release notes) is unchanged: it already prints the per-target counts.

### 4.4 Documentation (Dev)

| File | Change |
|---|---|
| `docs/adr/0010-container-images-and-build-identity.md` | Header: "Amended by ADR 0016 (SCRUM-11)". Table: backend runtime → `eclipse-temurin:21.0.13_9-jre-alpine-3.24`. New bullet **SCRUM-11 (2026-11-2x)** after the SCRUM-10 bullet: tag suffix (same image), floors (packages, versions, CVEs), `gnupg` removal, link ADR 0016/design/matrix. |
| `docs/release/vulnerability-policy.md` | §2: after "MEDIUM / LOW / UNKNOWN — counts per target;" add "fixable MEDIUM/UNKNOWN in gated targets are also listed individually and annotated (`::warning::`), with a triage deadline — §2.1". New **§2.1 MEDIUM/UNKNOWN triage (ADR 0016)**: 5 working days → Jira task; 30 days → fixed or justified with re-check date in the Task's matrix; no allow-list entries for non-blocking findings. §3 step 1: add sub-steps "1a floor `apk add --no-cache 'pkg>=fixed'` in the runtime stage (as root, before `USER`) when no rebuilt base exists; removed by the bump that makes it redundant" and "1b remove a provably unused base-image package (`apk del`)". §5: add the new table to the job-summary list. Header row "Decision": add ADR 0016. |
| `docs/release/RELEASE.md` §7 | Append one sentence: "Fixable MEDIUM/UNKNOWN are listed and annotated, not blocking; triage within 5 working days, remediation or justification within 30 days ([ADR 0016](../adr/0016-medium-findings-and-os-package-floors.md))." |
| `docs/traceability/SCRUM-11.md` | Fill the template. |

### 4.5 Checked — no change needed (do not edit)

| File | Why |
|---|---|
| `.github/scripts/release/verify-release-images.sh` | derives `base.name` from the last `FROM` (`docker.io/library/` + `eclipse-temurin:21.0.13_9-jre-alpine-3.24`); label updated in step 4.1 |
| `.github/scripts/verify-images.sh` | labels/UID/payload/size/history checks are tag-independent; the new `RUN` text has no secret pattern |
| `.github/workflows/ci.yml`, `release.yml` | build/scan/gate steps unchanged; hadolint step lints the new lines |
| `.hadolint.yaml` | no new ignores: DL3018 treats a package containing `=` as pinned (`>=` qualifies); DL3019 satisfied (`--no-cache`); DL3002 last `USER` non-root |
| `.github/security/vulnerability-allowlist.json` | stays empty |
| build stages (`…-jdk-noble`, `node:22.23.4-alpine`), `pom.xml`, `package*.json` | untouched (NFR-06) |
| `docker-compose.yml` | builds from the Dockerfiles; names no base tag |
| `docs/adr/0014-…` | header pointer to ADR 0016 added by the Architect; body is the SCRUM-8 record |

## 5. Verification (where Dev finds the evidence)

| ID | Evidence |
|---|---|
| AC-01, AC-10 | Before: requirements §2 / run 44672985089. After: Release dry-run job `scan`, step "Vulnerability gate" summary table (per-target counts), artifact `todo-release-scan-<KEY>-<sha>` (`verdict.json`, `backend-image.json`, `frontend-image.json`). Expected (same DB): `backend-image` 0/0/0/0/0, `frontend-image` 0/0/0/0/0; anything else is a *new* finding → record it (A-04). |
| AC-02..AC-04 | Scan JSON `Results[0].Packages[]` (`jq -r '.Results[0].Packages[] \| select(.Name\|test("^(libcrypto3\|libssl3\|openssl\|zlib\|gnutls)$")) \| "\(.Name) \(.Version)"'`) → `libcrypto3/libssl3/openssl 3.5.9-r1+`, `zlib 1.4-r0+`, no `gnutls` (backend); build log of Release job `images` (`apk add` output "Upgrading libcrypto3 (3.5.9-r0 -> 3.5.9-r1)" … , `apk del` "Purging gnupg …", `apk list` lines) unless CACHED; image SBOM `todo-backend-image-<v>.cdx.json` without `gnutls`/`gnupg`. |
| AC-05 | Dockerfile diff; Release job `images` "release image checks passed" (`base.name` = `docker.io/library/eclipse-temurin:21.0.13_9-jre-alpine-3.24`); BuildKit log `resolve docker.io/library/eclipse-temurin:21.0.13_9-jre-alpine-3.24@sha256:…` — expected `ac05c3c4…` (same as the old tag; record it and the nginx digest, expected `0c53a1f2…` per SCRUM-10) |
| AC-06 | Matrix section "Findings without a fix" (expected: none) |
| AC-07, AC-08 | ADR 0016; `gate.test.mjs` `SCRUM-11-AC-08:` tests in CI/Release `tooling`; job summary shows the new table (expected "None." after the fix); before the fix (if Dev runs the gate on the v1.0.1 reports locally: `node .github/scripts/release/vuln-gate.mjs gate --db /…/trivy-version.json --now 2026-11-20T04:16:46Z …`) the table lists 9 IDs × packages |
| AC-09 | `CI` run and `Release` dry-run run on head: all jobs green (publish/verify skipped) |
| AC-11 | `verify-images.sh` (CI `e2e`) and `verify-release-images.sh` (Release `images`) tables: users `10001:10001` / `101:101`, payload identical, sizes. Expected size change: backend +~7 MB (new libcrypto3 ≈ 5.0 MiB, libssl3, openssl ≈ 0.8 MiB, zlib ≈ 0.1 MiB; removal frees nothing), frontend +~6 MB — within 300 / 80 MB (NFR-05) |
| NFR-01 | CI `e2e` Playwright + lifecycle, Release `e2e-release` green; no test/config change |
| NFR-06 | Release `backend`/`frontend` jobs: `repro-jar.sh` / tarball checks green (build stages untouched) |
| NFR-07 | CI `build` hadolint step green with `.hadolint.yaml` unchanged |
| NFR-08 | Release `sbom` job: 4 SBOMs finalized, counts (backend-image ≈ 128 ≥ new floor), "BOM validated successfully" ×4 |

## 6. Fallbacks

| Situation | Action |
|---|---|
| `apk add` floor unsatisfiable ("unable to select packages … >=…") because the CDN has not published the binary yet (A-01) | Re-run after a few hours (Alpine builders publish within hours of the commit; gnutls x86_64 was committed 2026-11-19). Still missing after **3 days**: drop only that floor, record the finding in the matrix with justification and re-check date (AC-06), keep the others. Never weaken to `apk upgrade`. |
| Frontend `apk add` refuses because the world's `nginx=1.30.7-r1` packages (installed from nginx.org with `-X`) are not in any configured repository | Expected to work (installed packages remain solver candidates; adding packages on `nginx:alpine`-style images is common). If not: `apk upgrade --no-cache libcrypto3 libssl3 zlib` followed by an explicit post-condition: `for p in libcrypto3:3.5.9-r1 libssl3:3.5.9-r1 zlib:1.4-r0; do n=${p%%:*}; m=${p#*:}; v=$(awk -v n="$n" '$0=="P:"n{f=1;next} f&&/^V:/{print substr($0,3);exit}' /lib/apk/db/installed); [ "$(apk version -t "$v" "$m")" != "<" ] \|\| { echo "$n $v < $m"; exit 1; }; done` (keeps NFR-02). |
| `apk del gnupg` breaks anything (build, startup, e2e) | Replace by floor `'gnutls>=3.8.14-r0'`; keep `MIN_COMPONENTS` at 125. |
| hadolint flags DL3018 on `>=` | Inline `# hadolint ignore=DL3018` above the `RUN` with the reason "version floors (ADR 0016): Alpine serves only the latest build, exact pins break" — no global ignore (NFR-07). |
| `eclipse-temurin:21.0.13_9-jre-alpine-3.24` not resolvable | Keep `21.0.13_9-jre-alpine` (+ label), record why; the floors still apply. |
| Upstream publishes rebuilt bases (Alpine 3.24.5) before merge | Floors become no-ops (layer still valid). Keep them in this Task; the next base bump removes them (ADR 0016 §2). |
| Scan shows **new** findings (DB moved) | Fixable CRITICAL/HIGH → fix in this Task by the same means; fixable MEDIUM/UNKNOWN in the same Alpine packages family → add a floor only if cheap, otherwise record with re-check date (A-04). |

## 7. Risks

| # | Risk | L | Mitigation |
|---|---|---|---|
| R1 | Fixed binaries not yet on the CDN for x86_64 | Low–Med | build fails (NFR-02); §6 row 1 |
| R2 | Build-time dependency on `dl-cdn.alpinelinux.org` (new for our runtime stages) | Low | same class as Docker Hub pulls; fails closed |
| R3 | GHA layer cache keeps the floor layer forever (no newer `-rN` picked up automatically) | Low | intended determinism; floors change only with a reviewed Dockerfile edit; base bump removes them |
| R4 | Image content now depends on CDN state at build time (beyond the floor) | Low | images were never bit-for-bit reproducible; scan + SBOM record exact versions per release |
| R5 | SBOM floor margin after removing 29 packages | Low | floor reset to ~80 % of observed (§4.3) |
| R6 | Mutable base tags change content under us | Low | Alpine minor now pinned in both tags; digests recorded per Task; digest pinning + automation as follow-up (ADR 0016 §3) |
| R7 | Floors forgotten after upstream catches up | Low | comment in Dockerfile; ADR 0010 bullet; ADR 0016 rule "remove in the bump that makes them redundant"; matrix re-check date |
