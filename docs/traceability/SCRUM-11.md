# SCRUM-11 — Requirements Traceability Matrix

Jira: [SCRUM-11](https://suranagivinod.atlassian.net/browse/SCRUM-11) · Branch: `feature/SCRUM-11-medium-vulns` ·
Requirements: [`docs/requirements/SCRUM-11.md`](../requirements/SCRUM-11.md) · Design: [`docs/architecture/SCRUM-11-design.md`](../architecture/SCRUM-11-design.md) ·
ADRs: [0016](../adr/0016-medium-findings-and-os-package-floors.md) (new), [0010](../adr/0010-container-images-and-build-identity.md), [0014](../adr/0014-vulnerability-scanning-policy.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md)

**Status: filled (Dev), 2026-11-20.**

Baseline (before): `Release` [44672985089](https://github.com/vinods21/todo/actions/runs/44672985089) (v1.0.1,
`workflow_dispatch` on `main` `0c512cd`) · gate PASS · Trivy `0.76.2`, DB UpdatedAt `2026-11-19T13:02:29Z`, Java DB
`2026-11-19T00:58:12Z`.

Evidence on the fix commit: `CI` run [44676402295](https://github.com/vinods21/todo/actions/runs/44676402295) (success on attempt 2; attempt 1 job `build` failed before compiling:
`wget: Failed to fetch …/apache-maven-3.9.11-bin.zip` — transient Maven Central download, re-run unchanged) · `Release`
dry-run run [44676402376](https://github.com/vinods21/todo/actions/runs/44676402376) (success; `publish`/`verify` skipped) · commit `c02302e` · gate verdict **PASS** · Trivy `0.76.2`,
DB UpdatedAt `2026-11-19T13:02:29Z` (15.7 h old), Java DB `2026-11-19T00:58:12Z` — **the same DB as the baseline**, so
before/after differ only by the image change.

Resolved base images (BuildKit log, Release job `images`): backend `docker.io/library/eclipse-temurin:21.0.13_9-jre-alpine-3.24@sha256:ac05c3c42b7c2f1a52c9bd52f01041fa1958231b15ebeae7420429cbc5baf474`
(= expected, same index digest as `21.0.13_9-jre-alpine`) · frontend `docker.io/nginx/nginx-unprivileged:1.30.7-alpine3.24@sha256:0c53a1f2890c3526bfd201440f0fd3970e5b78f80630f58284aad0d34b5ec7bd`
(= SCRUM-10) · fallbacks used (design §6): none.

## 1. Requirements

| ID | Requirement | Design | Code / doc | Verification | CI evidence |
|---|---|---|---|---|---|
| SCRUM-11-AC-01 | Inventory of every MEDIUM/UNKNOWN per image | req. §2, §2 below | `docs/requirements/SCRUM-11.md` | review against v1.0.1 JSON | §2 below |
| SCRUM-11-AC-02 | OpenSSL ≥ 3.5.9-r1 both images; 5 CVEs gone | §3.1, §4.1, §4.2 | `Dockerfile`, `frontend/Dockerfile` (floors) | build log; gate | [44676402376](https://github.com/vinods21/todo/actions/runs/44676402376) job `images`: `Upgrading libcrypto3 (3.5.9-r0 -> 3.5.9-r1)`, `libssl3` idem (both images), `openssl (3.5.9-r0 -> 3.5.9-r1)` (backend); `apk list`: `libcrypto3-3.5.9-r1`, `libssl3-3.5.9-r1`, `openssl-3.5.9-r1`; job `scan`: 0 MEDIUM in `backend-image`/`frontend-image` |
| SCRUM-11-AC-03 | zlib ≥ 1.4-r0 both images; CVE-2026-4738 gone; ABI ok | §3.2 | same | build log; scan; `e2e`, `e2e-release`, lifecycle green | [44676402376](https://github.com/vinods21/todo/actions/runs/44676402376) `images`: `Upgrading zlib (1.3.2-r1 -> 1.4-r0)` both images, `zlib-1.4-r0`; `scan` 0 MEDIUM; CI [44676402295](https://github.com/vinods21/todo/actions/runs/44676402295) `e2e` 19 + 3 passed; `e2e-release` 19/19 |
| SCRUM-11-AC-04 | gnutls gone or ≥ 3.8.14-r0; 3 CVEs gone | §3.3, §4.1 | `Dockerfile` (`apk del gnupg`, assertion) | build log; scan | [44676402376](https://github.com/vinods21/todo/actions/runs/44676402376) `images`: `Purging gnupg (2.4.9-r1)` … `(13/29) Purging gnutls (3.8.13-r0)` … 29 packages, `OK: 26.1 MiB in 44 packages`; `! apk info -e gnutls` passed (RUN succeeded); `scan` 0 UNKNOWN; SBOM 157 → 128 components |
| SCRUM-11-AC-05 | Same lines; base.name = FROM; ADR 0010 recorded | §1, §4.1, §4.4 | `Dockerfile` FROM + label; ADR 0010 | `verify-release-images.sh` | [44676402376](https://github.com/vinods21/todo/actions/runs/44676402376) job `images`: base.name `docker.io/library/eclipse-temurin:21.0.13_9-jre-alpine-3.24` / `docker.io/nginx/nginx-unprivileged:1.30.7-alpine3.24`, "release image checks passed" |
| SCRUM-11-AC-06 | No-fix findings justified with re-check date | ADR 0016 §1 | §3 below | review | none (§3) |
| SCRUM-11-AC-07 | MEDIUM gating decision recorded | ADR 0016 §1 | ADR 0016; ADR 0014 header; `vulnerability-policy.md` §2.1 | review | — |
| SCRUM-11-AC-08 | Decision implemented + tested; C/H/secret blocking unchanged | §4.3 | `lib/gate.mjs`, `vuln-gate.mjs`, `test/gate.test.mjs` | `gate.test.mjs` › `SCRUM-11-AC-08: …` (5 tests: fixable MEDIUM → PASS, listed, markdown + `::warning::`; fixable UNKNOWN → PASS, listed; MEDIUM without fix → not listed; MEDIUM only in reported target → not listed; fixable HIGH still BLOCKED, not listed) | [44676402376](https://github.com/vinods21/todo/actions/runs/44676402376) job `tooling`: 148 tests, 148 pass; job `scan` table "MEDIUM/UNKNOWN with a fix — reported, not blocking; triage per ADR 0016 (0)" = None. Locally on the v1.0.1 reports: 19 rows (9 IDs × packages), 10 + 1 `::warning::` |
| SCRUM-11-AC-09 | CI + Release dry-run green | §5 | — | — | CI [44676402295](https://github.com/vinods21/todo/actions/runs/44676402295): identity, build, frontend, e2e success · Release [44676402376](https://github.com/vinods21/todo/actions/runs/44676402376): version, tooling, backend, frontend, images, sbom, scan, e2e-release, code-scanning ×4, release-gate success; publish/verify skipped |
| SCRUM-11-AC-10 | Before/after counts, DB versions, installed versions | §5 | §2 below | — | §2 below |
| SCRUM-11-AC-11 | Image verification (labels, users, payload, size) | §5 | — | `verify-images.sh`, `verify-release-images.sh` | CI [44676402295](https://github.com/vinods21/todo/actions/runs/44676402295) `e2e`: "All image checks passed" (122 MB ≤ 300, 25 MB ≤ 80, labels, UIDs) · Release `images`: backend 122 MB, frontend 25 MB, users `10001:10001` / `101:101`, payload = tested jar `48aa9cea3444` / bundle |
| SCRUM-11-AC-12 | Traceability per ADR 0004 | — | commits; this file | review | `2fec6aa` [PM], `b3def50` [ARCH], `c02302e` [DEV] (fix), this commit [DEV] (matrix) |
| SCRUM-11-NFR-01 | No behavioural change | §5 | — | e2e, lifecycle | CI [44676402295](https://github.com/vinods21/todo/actions/runs/44676402295) `e2e` (Playwright 19 passed, lifecycle 3 passed); Release `e2e-release` 19/19, @critical 12/12 (min 12) |
| SCRUM-11-NFR-02 | Build fails if fixes unavailable | §4.1, §4.2, §6 | floors `>=`, `! apk info -e gnutls` | design review (no negative CI run required) | — |
| SCRUM-11-NFR-03 | Gate not weakened | §4.3 | verdict code untouched | existing `gate.test.mjs` tests green; `git diff origin/main -- .github/security/` empty | empty; existing gate tests green (148/148) |
| SCRUM-11-NFR-04 | Minimal diff | §4 | — | `git diff --stat origin/main` | `Dockerfile`, `frontend/Dockerfile`, `lib/gate.mjs`, `vuln-gate.mjs`, `test/gate.test.mjs`, `lib/sbom.mjs`, ADR 0010, `vulnerability-policy.md`, `RELEASE.md`, this matrix (+ PM/ARCH docs) |
| SCRUM-11-NFR-05 | Sizes ≤ 300 / 80 MB | §5 | — | image tables | before 119 MB / 23 MB (SCRUM-8 / SCRUM-10 matrices) → after 122 MB / 25 MB |
| SCRUM-11-NFR-06 | Jar/tarball reproducibility unaffected | §4.5 | build stages untouched | Release `backend`/`frontend` | [44676402376](https://github.com/vinods21/todo/actions/runs/44676402376): `repro-jar.sh` identical SHA-256 `48aa9cea…`; frontend job green |
| SCRUM-11-NFR-07 | hadolint clean, no new global ignores | §4.5 | `.hadolint.yaml` unchanged | CI `build` hadolint | CI [44676402295](https://github.com/vinods21/todo/actions/runs/44676402295): hadolint v2.15.1 clean (only info DL3066 on `USER root`, below `warning`); inline ignore used: no |
| SCRUM-11-NFR-08 | SBOMs valid, above floors | §3.3, §4.3 | `lib/sbom.mjs` floor `125 → 102` (⌊0.8 × 128⌋) | Release `sbom` | [44676402376](https://github.com/vinods21/todo/actions/runs/44676402376): counts `93 / 9 / 128 / 71` ≥ floors `74 / 7 / 102 / 56`; "BOM validated successfully" ×4 |

## 2. Findings before → after (AC-01, AC-10)

Gate counts (C / H / M / L / U / secrets):

| Target | Before (run 44672985089, DB 2026-11-19T13:02Z) | After (run [44676402376](https://github.com/vinods21/todo/actions/runs/44676402376), DB 2026-11-19T13:02Z) |
|---|---|---|
| backend-runtime | 0 / 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 |
| frontend-prod | 0 / 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 |
| backend-image | 0 / 0 / **16** / 0 / **3** / 0 | **0 / 0 / 0 / 0 / 0 / 0** |
| frontend-image | 0 / 0 / **11** / 0 / 0 / 0 | **0 / 0 / 0 / 0 / 0 / 0** |
| backend-all-scopes (reported) | 0 / 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 |
| frontend-all (reported) | 0 / 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 |

Per finding:

| ID | Severity | Image(s) | Package(s) | Before | After (installed, from scan JSON `Packages`) | Status |
|---|---|---|---|---|---|---|
| CVE-2026-107496 | MEDIUM | backend, frontend | libcrypto3, libssl3 (+ openssl backend) | 3.5.9-r0 | 3.5.9-r1 (libcrypto3, libssl3; openssl backend) | gone |
| CVE-2026-88822 | MEDIUM | backend, frontend | same | 3.5.9-r0 | 3.5.9-r1 (libcrypto3, libssl3; openssl backend) | gone |
| CVE-2026-88823 | MEDIUM | backend, frontend | same | 3.5.9-r0 | 3.5.9-r1 (libcrypto3, libssl3; openssl backend) | gone |
| CVE-2026-95691 | MEDIUM | backend, frontend | same | 3.5.9-r0 | 3.5.9-r1 (libcrypto3, libssl3; openssl backend) | gone |
| CVE-2026-95692 | MEDIUM | backend, frontend | same | 3.5.9-r0 | 3.5.9-r1 (libcrypto3, libssl3; openssl backend) | gone |
| CVE-2026-4738 | MEDIUM | backend, frontend | zlib | 1.3.2-r1 | 1.4-r0 | gone |
| CVE-2026-127039 | UNKNOWN | backend | gnutls | 3.8.13-r0 | not installed (purged with `gnupg`) | gone |
| CVE-2026-127040 | UNKNOWN | backend | gnutls | 3.8.13-r0 | not installed (purged with `gnupg`) | gone |
| CVE-2026-127231 | UNKNOWN | backend | gnutls | 3.8.13-r0 | not installed (purged with `gnupg`) | gone |

Newly appeared findings in the after-scan (A-04): none (same DB as the baseline; all six targets 0 / 0 / 0 / 0 / 0 / 0).

Backend packages removed with `gnupg` (expected 29, design §3.3): **29**, exactly the design's list (73 → 44 OS packages).

Note: installed versions come from the BuildKit `apk` output of the Release job `images` (scan reports are a workflow
artifact); the scan counts (0) confirm them. On later runs the floor layer may be a cache hit and the `apk` lines absent.

## 3. Findings without a fix (AC-06)

| ID | Image | Package | Why not fixed now | Exposure in our runtime | Re-check date (≤ 30 days) | Owner |
|---|---|---|---|---|---|---|
| none — all 9 CVEs were fixable and are remediated | | | | | | |

## 4. Remediation records

| Item | Value |
|---|---|
| Floors in `Dockerfile` | `libcrypto3>=3.5.9-r1`, `libssl3>=3.5.9-r1`, `openssl>=3.5.9-r1`, `zlib>=1.4-r0`; `apk del gnupg` |
| Floors in `frontend/Dockerfile` | `libcrypto3>=3.5.9-r1`, `libssl3>=3.5.9-r1`, `zlib>=1.4-r0` |
| Floor removal trigger | first base-image build containing ≥ these versions (Alpine 3.24.5 or later rebuild); re-check at every base bump and on 2026-12-18 |
| Allow-list entries added | none |
| Other dependency changes | none |
| CI iterations | 1 push of the fix (`c02302e`); CI [44676402295](https://github.com/vinods21/todo/actions/runs/44676402295) needed one job re-run (transient Maven Central download failure, no change); Release green first time |
| Deviations from the design | none. Observed backend size growth +3 MB (119 → 122 MB) vs. design estimate +~7 MB; frontend +2 MB (23 → 25 MB). hadolint reports info-level DL3066 on `USER root` (below threshold, no ignore). |
