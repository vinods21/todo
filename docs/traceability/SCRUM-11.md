# SCRUM-11 — Requirements Traceability Matrix

Jira: [SCRUM-11](https://suranagivinod.atlassian.net/browse/SCRUM-11) · Branch: `feature/SCRUM-11-medium-vulns` ·
Requirements: [`docs/requirements/SCRUM-11.md`](../requirements/SCRUM-11.md) · Design: [`docs/architecture/SCRUM-11-design.md`](../architecture/SCRUM-11-design.md) ·
ADRs: [0016](../adr/0016-medium-findings-and-os-package-floors.md) (new), [0010](../adr/0010-container-images-and-build-identity.md), [0014](../adr/0014-vulnerability-scanning-policy.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md)

**Status: template (Architect) — Dev fills every `<…>`.**

Baseline (before): `Release` [44672985089](https://github.com/vinods21/todo/actions/runs/44672985089) (v1.0.1,
`workflow_dispatch` on `main` `0c512cd`) · gate PASS · Trivy `0.76.2`, DB UpdatedAt `2026-11-19T13:02:29Z`, Java DB
`2026-11-19T00:58:12Z`.

Evidence on the fix commit: `CI` run `<id>` (`<result>`) · `Release` dry-run run `<id>` (`<result>`; `publish`/`verify`
skipped) · commit `<sha>` · gate verdict `<PASS>` · Trivy `0.76.2`, DB UpdatedAt `<…>`, Java DB `<…>`.

Resolved base images (BuildKit log, Release job `images`): backend `docker.io/library/eclipse-temurin:21.0.13_9-jre-alpine-3.24@sha256:<…>`
(expected `ac05c3c4…`) · frontend `docker.io/nginx/nginx-unprivileged:1.30.7-alpine3.24@sha256:<…>` · fallbacks used (design §6): `<none | …>`.

## 1. Requirements

| ID | Requirement | Design | Code / doc | Verification | CI evidence |
|---|---|---|---|---|---|
| SCRUM-11-AC-01 | Inventory of every MEDIUM/UNKNOWN per image | req. §2, §2 below | `docs/requirements/SCRUM-11.md` | review against v1.0.1 JSON | §2 below |
| SCRUM-11-AC-02 | OpenSSL ≥ 3.5.9-r1 both images; 5 CVEs gone | §3.1, §4.1, §4.2 | `Dockerfile`, `frontend/Dockerfile` (floors) | scan JSON `Packages`; gate | `<run>` job `scan`: `<…>` |
| SCRUM-11-AC-03 | zlib ≥ 1.4-r0 both images; CVE-2026-4738 gone; ABI ok | §3.2 | same | scan JSON; `e2e`, `e2e-release`, lifecycle green | `<…>` |
| SCRUM-11-AC-04 | gnutls gone or ≥ 3.8.14-r0; 3 CVEs gone | §3.3, §4.1 | `Dockerfile` (`apk del gnupg`, assertion) | scan JSON (no `gnutls`); image SBOM | `<…>` |
| SCRUM-11-AC-05 | Same lines; base.name = FROM; ADR 0010 recorded | §1, §4.1, §4.4 | `Dockerfile` FROM + label; ADR 0010 | `verify-release-images.sh` | `<run>` job `images`: base `<…>`, "release image checks passed" |
| SCRUM-11-AC-06 | No-fix findings justified with re-check date | ADR 0016 §1 | §3 below | review | `<none>` |
| SCRUM-11-AC-07 | MEDIUM gating decision recorded | ADR 0016 §1 | ADR 0016; ADR 0014 header; `vulnerability-policy.md` §2.1 | review | — |
| SCRUM-11-AC-08 | Decision implemented + tested; C/H/secret blocking unchanged | §4.3 | `lib/gate.mjs`, `vuln-gate.mjs`, `test/gate.test.mjs` | `gate.test.mjs` › `SCRUM-11-AC-08: …` (5 tests: `<names>`) | `<run>` job `tooling`: `<n> pass`; job `scan` summary table "MEDIUM/UNKNOWN with a fix" = `<None.>` |
| SCRUM-11-AC-09 | CI + Release dry-run green | §5 | — | — | CI `<id>`: identity, build, frontend, e2e `<…>` · Release `<id>`: version, tooling, backend, frontend, images, sbom, scan, e2e-release, code-scanning ×4, release-gate `<…>` |
| SCRUM-11-AC-10 | Before/after counts, DB versions, installed versions | §5 | §2 below | — | §2 below |
| SCRUM-11-AC-11 | Image verification (labels, users, payload, size) | §5 | — | `verify-images.sh`, `verify-release-images.sh` | CI `e2e`: `<…>` · Release `images`: backend `<…> MB`, frontend `<…> MB`, users `10001:10001` / `101:101` |
| SCRUM-11-AC-12 | Traceability per ADR 0004 | — | commits; this file | review | `2fec6aa` [PM], `<sha>` [ARCH], `<sha>` [DEV] … |
| SCRUM-11-NFR-01 | No behavioural change | §5 | — | e2e, lifecycle | `<…>` |
| SCRUM-11-NFR-02 | Build fails if fixes unavailable | §4.1, §4.2, §6 | floors `>=`, `! apk info -e gnutls` | design review (no negative CI run required) | — |
| SCRUM-11-NFR-03 | Gate not weakened | §4.3 | verdict code untouched | existing `gate.test.mjs` tests green; `git diff origin/main -- .github/security/` empty | `<…>` |
| SCRUM-11-NFR-04 | Minimal diff | §4 | — | `git diff --stat origin/main` | `<files>` |
| SCRUM-11-NFR-05 | Sizes ≤ 300 / 80 MB | §5 | — | image tables | before `<…>` / `<…>` → after `<…>` / `<…>` |
| SCRUM-11-NFR-06 | Jar/tarball reproducibility unaffected | §4.5 | build stages untouched | Release `backend`/`frontend` | `<…>` |
| SCRUM-11-NFR-07 | hadolint clean, no new global ignores | §4.5 | `.hadolint.yaml` unchanged | CI `build` hadolint | `<…>` (inline ignore used: `<no>`) |
| SCRUM-11-NFR-08 | SBOMs valid, above floors | §3.3, §4.3 | `lib/sbom.mjs` floor `<125 → n>` | Release `sbom` | counts `<backend / frontend / backend-image / frontend-image>` ≥ floors `74 / 7 / <n> / 56` |

## 2. Findings before → after (AC-01, AC-10)

Gate counts (C / H / M / L / U / secrets):

| Target | Before (run 44672985089, DB 2026-11-19T13:02Z) | After (run `<id>`, DB `<…>`) |
|---|---|---|
| backend-runtime | 0 / 0 / 0 / 0 / 0 / 0 | `<…>` |
| frontend-prod | 0 / 0 / 0 / 0 / 0 / 0 | `<…>` |
| backend-image | 0 / 0 / **16** / 0 / **3** / 0 | `<…>` (expected 0 / 0 / 0 / 0 / 0 / 0) |
| frontend-image | 0 / 0 / **11** / 0 / 0 / 0 | `<…>` (expected 0 / 0 / 0 / 0 / 0 / 0) |
| backend-all-scopes (reported) | 0 / 0 / 0 / 0 / 0 / 0 | `<…>` |
| frontend-all (reported) | 0 / 0 / 0 / 0 / 0 / 0 | `<…>` |

Per finding:

| ID | Severity | Image(s) | Package(s) | Before | After (installed, from scan JSON `Packages`) | Status |
|---|---|---|---|---|---|---|
| CVE-2026-107496 | MEDIUM | backend, frontend | libcrypto3, libssl3 (+ openssl backend) | 3.5.9-r0 | `<…>` | `<gone>` |
| CVE-2026-88822 | MEDIUM | backend, frontend | same | 3.5.9-r0 | `<…>` | `<gone>` |
| CVE-2026-88823 | MEDIUM | backend, frontend | same | 3.5.9-r0 | `<…>` | `<gone>` |
| CVE-2026-95691 | MEDIUM | backend, frontend | same | 3.5.9-r0 | `<…>` | `<gone>` |
| CVE-2026-95692 | MEDIUM | backend, frontend | same | 3.5.9-r0 | `<…>` | `<gone>` |
| CVE-2026-4738 | MEDIUM | backend, frontend | zlib | 1.3.2-r1 | `<…>` | `<gone>` |
| CVE-2026-127039 | UNKNOWN | backend | gnutls | 3.8.13-r0 | `<not installed>` | `<gone>` |
| CVE-2026-127040 | UNKNOWN | backend | gnutls | 3.8.13-r0 | `<not installed>` | `<gone>` |
| CVE-2026-127231 | UNKNOWN | backend | gnutls | 3.8.13-r0 | `<not installed>` | `<gone>` |

Newly appeared findings in the after-scan (A-04): `<none | ID, severity, package, installed → fixed, action>`.

Backend packages removed with `gnupg` (expected 29, design §3.3): `<count; list if different>`.

## 3. Findings without a fix (AC-06)

| ID | Image | Package | Why not fixed now | Exposure in our runtime | Re-check date (≤ 30 days) | Owner |
|---|---|---|---|---|---|---|
| `<none>` | | | | | | |

## 4. Remediation records

| Item | Value |
|---|---|
| Floors in `Dockerfile` | `libcrypto3>=3.5.9-r1`, `libssl3>=3.5.9-r1`, `openssl>=3.5.9-r1`, `zlib>=1.4-r0`; `apk del gnupg` |
| Floors in `frontend/Dockerfile` | `libcrypto3>=3.5.9-r1`, `libssl3>=3.5.9-r1`, `zlib>=1.4-r0` |
| Floor removal trigger | first base-image build containing ≥ these versions (Alpine 3.24.5 or later rebuild); re-check at every base bump and on `<date, ≤ 2026-12-20>` |
| Allow-list entries added | `<none>` |
| Other dependency changes | `<none>` |
| CI iterations | `<n>` |
| Deviations from the design | `<none | …>` |
