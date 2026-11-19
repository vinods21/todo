# SCRUM-10 — Requirements Traceability Matrix

Jira: [SCRUM-10](https://suranagivinod.atlassian.net/browse/SCRUM-10) · Branch: `feature/SCRUM-10-nginx-1-30-7-cve-fix` ·
Requirements: [`docs/requirements/SCRUM-10.md`](../requirements/SCRUM-10.md) · Design: [`docs/architecture/SCRUM-10-design.md`](../architecture/SCRUM-10-design.md) ·
ADRs: [0010](../adr/0010-container-images-and-build-identity.md), [0011](../adr/0011-spa-hosting-nginx-reverse-proxy.md), [0014](../adr/0014-vulnerability-scanning-policy.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md)

**Status: template (Architect). Dev fills every `TODO`.**

Failing run that triggered this Task: `Release` [44475812645](https://github.com/vinods21/todo/actions/runs/44475812645)
(push to `main`, `ca1b9e2`) — gate BLOCKED, 5 HIGH in `nginx` 1.30.6-r1 (`frontend-image`).

Evidence on branch head: `CI` run TODO · `Release` dry-run run TODO · Commit SHA TODO · Gate verdict TODO ·
Trivy `0.76.2`, DB UpdatedAt TODO · frontend image size TODO MB.

Base image check (design §1.3): `docker.io/nginx/nginx-unprivileged:1.30.7-alpine3.24` — manifest digest TODO ·
`/etc/alpine-release` TODO · `apk info -v nginx` TODO · upstream `org.opencontainers.image.revision` TODO ·
`id -u` TODO · fallback used (design §1.4): TODO (none / which)

| ID | Requirement | Design | Code / doc | Verification | CI evidence |
|---|---|---|---|---|---|
| SCRUM-10-AC-01 | Exact-tag `nginx/nginx-unprivileged` stable 1.30.7 Alpine runtime base | §1, §2.1 | `frontend/Dockerfile` (`FROM`) | Dockerfile diff; hadolint (CI) | TODO |
| SCRUM-10-AC-02 | `base.name` = runtime FROM | §2.1 | `frontend/Dockerfile` (`LABEL`) | `verify-release-images.sh` | TODO |
| SCRUM-10-AC-03 | 5 CVEs gone, gate PASS | §3 | — | Release job `scan` (`verdict.json`) | TODO |
| SCRUM-10-AC-04 | No new allow-list entries | §2.2 | `.github/security/vulnerability-allowlist.json` unchanged | `vuln-gate.mjs check-allowlist` (job `tooling`) | TODO |
| SCRUM-10-AC-05 | CI + Release dry-run green | §3 | — | all existing jobs | TODO |
| SCRUM-10-AC-06 | Image verification (labels, base.name, non-root, size) | §3 | — | `verify-images.sh`, `verify-release-images.sh` | TODO |
| SCRUM-10-AC-07 | ADR 0010 / docs updated | §2.1 | ADR 0010 table + SCRUM-10 amendment, ADR 0011 | review | TODO |
| SCRUM-10-AC-08 | Traceability per ADR 0004 | — | commits `SCRUM-10: [ROLE] …`, `Refs: SCRUM-10`; this file | review | TODO |
| SCRUM-10-NFR-01 | No behavioural change (8080, UID 101, routes, headers, healthcheck) | §1.1 | — | e2e suite unchanged | TODO |
| SCRUM-10-NFR-02 | Alpine minor unchanged (3.24) or recorded | §1.4 | — | `/etc/alpine-release` | TODO |
| SCRUM-10-NFR-03 | Gate not weakened | §2.2 | — | `git diff main -- .github/` empty | TODO |
| SCRUM-10-NFR-04 | Minimal diff | §2 | — | `git diff --stat main` = files of design §2.1 | TODO |
| SCRUM-10-NFR-05 | Frontend image ≤ 80 MB | §3 | — | `verify-images.sh` size column | TODO |

CVEs cleared (all `frontend-image`, package `nginx`, 1.30.6-r1 → TODO):

| ID | Before (run 44475812645) | After (run TODO) |
|---|---|---|
| CVE-2026-113425 | HIGH, fixable | TODO |
| CVE-2026-121810 | HIGH, fixable | TODO |
| CVE-2026-123007 | HIGH, fixable | TODO |
| CVE-2026-123633 | HIGH, fixable | TODO |
| CVE-2026-123634 | HIGH, fixable | TODO |

Allow-list entries added: **none** (AC-04). Other dependency changes: TODO (expected: none). Deviations from the design: TODO.
