# SCRUM-10 — Requirements Traceability Matrix

Jira: [SCRUM-10](https://suranagivinod.atlassian.net/browse/SCRUM-10) · Branch: `feature/SCRUM-10-nginx-1-30-7-cve-fix` ·
Requirements: [`docs/requirements/SCRUM-10.md`](../requirements/SCRUM-10.md) · Design: [`docs/architecture/SCRUM-10-design.md`](../architecture/SCRUM-10-design.md) ·
ADRs: [0010](../adr/0010-container-images-and-build-identity.md), [0011](../adr/0011-spa-hosting-nginx-reverse-proxy.md), [0014](../adr/0014-vulnerability-scanning-policy.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md)

**Status: filled (Dev).** Evidence below is from the CI runs on the fix commit `59ccda5`. The final head (this matrix commit) has its own green runs, recorded in the commit message and the PR.

Failing run that triggered this Task: `Release` [44475812645](https://github.com/vinods21/todo/actions/runs/44475812645)
(push to `main`, `ca1b9e2`) — gate BLOCKED, 5 HIGH in `nginx` 1.30.6-r1 (`frontend-image`).

Evidence on the fix commit: `CI` run [44586863472](https://github.com/vinods21/todo/actions/runs/44586863472) (success) · `Release` dry-run run [44586863528](https://github.com/vinods21/todo/actions/runs/44586863528) (success; `publish`/`verify` skipped) ·
Commit SHA `59ccda57c80f3cb0c2ee6cf7f5993e9062d1c2f7` · Gate verdict **PASS** ·
Trivy `0.76.2`, DB UpdatedAt `2026-11-19T13:02:29.533007734Z` · frontend image size 23 MB (uncompressed).

Base image check (design §1.3): `docker.io/nginx/nginx-unprivileged:1.30.7-alpine3.24` — **published**; resolved by BuildKit in
Release job `images` as `@sha256:0c53a1f2890c3526bfd201440f0fd3970e5b78f80630f58284aad0d34b5ec7bd` (no `manifest unknown`) ·
`/etc/alpine-release`, `apk info -v nginx` and upstream `org.opencontainers.image.revision`: **not recorded** — the Dev environment
has no Docker and cannot reach Docker Hub or the Actions artifact storage (scan JSON / SBOM), so these could not be read directly;
indirect evidence: the gate reports none of the 5 CVEs (Trivy fixed version `1.30.7-r0`), i.e. the image's `nginx` package is
≥ 1.30.7-r0, and the Alpine minor is pinned by the tag (`alpine3.24`) ·
`id -u` 101 (`verify-images.sh` runtime UID, `verify-release-images.sh` user `101:101`) · fallback used (design §1.4): **none**

| ID | Requirement | Design | Code / doc | Verification | CI evidence |
|---|---|---|---|---|---|
| SCRUM-10-AC-01 | Exact-tag `nginx/nginx-unprivileged` stable 1.30.7 Alpine runtime base | §1, §2.1 | `frontend/Dockerfile` (`FROM`) | Dockerfile diff; hadolint (CI) | `59ccda5`; CI [44586863472](https://github.com/vinods21/todo/actions/runs/44586863472) `build` (hadolint) green; Release `images` pulled `nginx/nginx-unprivileged:1.30.7-alpine3.24` |
| SCRUM-10-AC-02 | `base.name` = runtime FROM | §2.1 | `frontend/Dockerfile` (`LABEL`) | Release [44586863528](https://github.com/vinods21/todo/actions/runs/44586863528) job `images`: base `docker.io/nginx/nginx-unprivileged:1.30.7-alpine3.24`, "release image checks passed" |
| SCRUM-10-AC-03 | 5 CVEs gone, gate PASS | §3 | — | Release [44586863528](https://github.com/vinods21/todo/actions/runs/44586863528) job `scan`: Verdict PASS; `frontend-image` 0 C / 0 H / 11 M; none of the 5 CVE IDs in the scan log; `release-gate` PASS |
| SCRUM-10-AC-04 | No new allow-list entries | §2.2 | `.github/security/vulnerability-allowlist.json` unchanged | `git diff origin/main -- .github/` empty; Release [44586863528](https://github.com/vinods21/todo/actions/runs/44586863528) job `tooling` green; gate: "allow-list entries in effect: none" |
| SCRUM-10-AC-05 | CI + Release dry-run green | §3 | — | CI [44586863472](https://github.com/vinods21/todo/actions/runs/44586863472): identity, build, frontend, e2e success · Release [44586863528](https://github.com/vinods21/todo/actions/runs/44586863528): version, tooling, backend, frontend, images, sbom, scan, code-scanning ×4, release-gate success; publish, verify skipped |
| SCRUM-10-AC-06 | Image verification (labels, base.name, non-root, size) | §3 | — | CI `e2e`: "All image checks passed" (frontend `101:101`, UID 101, 23 MB ≤ 80 MB, labels ok) · Release `images`: version `0.1.0-59ccda5`, base.name, `101:101`, 23 MB, payload ⊇ tested bundle, ok |
| SCRUM-10-AC-07 | ADR 0010 / docs updated | §2.1 | ADR 0010 table + SCRUM-10 amendment, ADR 0011 | review | `59ccda5`: ADR 0010 table row, header "Amended by SCRUM-10", SCRUM-10 (2026-11-19) bullet; ADR 0011 image line. README names no tag (unchanged) |
| SCRUM-10-AC-08 | Traceability per ADR 0004 | — | commits `SCRUM-10: [ROLE] …`, `Refs: SCRUM-10`; this file | review | `5e2a4cd` [PM], `2292a44` [ARCH], `59ccda5` [DEV] fix, this [DEV] matrix commit |
| SCRUM-10-NFR-01 | No behavioural change (8080, UID 101, routes, headers, healthcheck) | §1.1 | — | CI [44586863472](https://github.com/vinods21/todo/actions/runs/44586863472) `e2e`: Playwright 19 + 3 passed, lifecycle checks passed; no e2e/config change |
| SCRUM-10-NFR-02 | Alpine minor unchanged (3.24) or recorded | §1.4 | — | tag pinned to `alpine3.24` (unchanged); `/etc/alpine-release` not read (see above) |
| SCRUM-10-NFR-03 | Gate not weakened | §2.2 | — | `git diff origin/main -- .github/` empty; Trivy `0.76.2` unchanged |
| SCRUM-10-NFR-04 | Minimal diff | §2 | — | `git diff --stat origin/main`: `frontend/Dockerfile`, ADR 0010, ADR 0011, SCRUM-10 requirements/design/traceability only |
| SCRUM-10-NFR-05 | Frontend image ≤ 80 MB | §3 | — | 23 MB (CI `e2e` and Release `images`) |

CVEs cleared (all `frontend-image`, package `nginx`, 1.30.6-r1 → ≥ 1.30.7-r0 per the gate; upstream `PKG_RELEASE=1` ⇒ 1.30.7-r1, design §1.1):

| ID | Before (run 44475812645) | After (run 44586863528) |
|---|---|---|
| CVE-2026-113425 | HIGH, fixable | not reported (gone) |
| CVE-2026-121810 | HIGH, fixable | not reported (gone) |
| CVE-2026-123007 | HIGH, fixable | not reported (gone) |
| CVE-2026-123633 | HIGH, fixable | not reported (gone) |
| CVE-2026-123634 | HIGH, fixable | not reported (gone) |

Gate counts for `frontend-image` (gated): before (run 44475812645, DB `2026-11-19T01:05:40Z`) 0 CRITICAL / **5 HIGH** / 5 MEDIUM →
after (run 44586863528, DB `2026-11-19T13:02:29Z`) 0 CRITICAL / **0 HIGH** / 11 MEDIUM. The MEDIUM increase (and `backend-image`
1 → 16 MEDIUM, 3 UNKNOWN) comes with the newer Trivy DB; MEDIUM/UNKNOWN do not block under the policy and need no action here.

Allow-list entries added: **none** (AC-04). Other dependency changes: **none**. CI iterations: 1 (the first push was green).
Deviations from the design: design §1.3 was run in CI instead of locally (no Docker in the Dev environment). Alpine release, nginx package
version and upstream image revision were not read directly because Docker Hub and Actions artifact storage are unreachable from the Dev
environment (see "Base image check" above); the manifest digest and the gate result are recorded instead.
