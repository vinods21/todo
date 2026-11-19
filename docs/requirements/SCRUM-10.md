# SCRUM-10 — Fix nginx 1.30.6 CVEs in the frontend image (upgrade to nginx-unprivileged 1.30.7): Refined Requirements

| Field | Value |
|---|---|
| Jira key | [SCRUM-10](https://suranagivinod.atlassian.net/browse/SCRUM-10) |
| Type / Priority | Task (security) |
| Parent epic | SCRUM-5 — Build a To-Do Application (Spring Boot, React, PostgreSQL, REST APIs) |
| Depends on | SCRUM-8 (release pipeline, vulnerability gate per [ADR 0014](../adr/0014-vulnerability-scanning-policy.md)) — merged (`ca1b9e2`) |
| Branch | `feature/SCRUM-10-nginx-1-30-7-cve-fix` |
| Author role | Product Manager (PM → Architect → Dev pipeline) |
| Status | Draft — ready for architecture |

**Traceability:** Requirements carry stable IDs (`SCRUM-10-AC-xx`, `SCRUM-10-NFR-xx`). Design, Dockerfile/doc changes,
commits (`SCRUM-10: [ROLE] …` + `Refs: SCRUM-10`) and CI evidence reference them per
[ADR 0004](../adr/0004-traceability-conventions.md) (as amended by ADR 0008 / 0013). Dev fills
`docs/traceability/SCRUM-10.md`.

---

## 1. Problem statement

The first `Release` workflow run on `main` after SCRUM-8 was merged —
[run 44475812645](https://github.com/vinods21/todo/actions/runs/44475812645) (push, commit `ca1b9e2`) — failed at the
vulnerability gate (job `scan`, verdict **BLOCKED**). Target `frontend-image` (gated) contains 5 **fixable HIGH**
findings, all in the Alpine package `nginx` shipped by the runtime base image
`nginx/nginx-unprivileged:1.30.6-alpine3.24`:

| ID | Severity | Package | Installed | Fixed in |
|---|---|---|---|---|
| CVE-2026-113425 | HIGH | `nginx` | 1.30.6-r1 | 1.30.7-r0 |
| CVE-2026-121810 | HIGH | `nginx` | 1.30.6-r1 | 1.30.7-r0 |
| CVE-2026-123007 | HIGH | `nginx` | 1.30.6-r1 | 1.30.7-r0 |
| CVE-2026-123633 | HIGH | `nginx` | 1.30.6-r1 | 1.30.7-r0 |
| CVE-2026-123634 | HIGH | `nginx` | 1.30.6-r1 | 1.30.7-r0 |

Nothing can be released until the gate passes. Upstream (`nginx/docker-nginx-unprivileged`) moved its stable line to
nginx 1.30.7 on 2026-11-18 (commits `bef9cb1`, `95b8382`). Per
[vulnerability-policy.md §3](../release/vulnerability-policy.md#3-fixing-a-blocking-finding-order-of-preference)
step 1 the fix is a base-image patch bump within the same line, not an allow-list entry.

## 2. Scope

### In scope
- Bump the frontend **runtime** base image to the official `nginx/nginx-unprivileged` stable **1.30.7** Alpine image,
  pinned to an exact tag; keep the `org.opencontainers.image.base.name` label in sync.
- Update ADR 0010 (base-image table + amendment note), ADR 0011 (image line) and any other living doc that names the
  current runtime base image.
- Requirements, design, traceability matrix for SCRUM-10.

### Out of scope
- **No allow-list entries** (`.github/security/vulnerability-allowlist.json` stays empty).
- **No other dependency bumps** (backend base image, Node build image, Maven, npm) unless the gate itself requires
  it for a finding introduced by this change; any such bump must be justified in the traceability matrix.
- No change to the gate, policy, scanner version or release workflow logic.
- No switch to nginx mainline (1.31.x), Debian variants, digests (ADR 0010 Q-04) or another image family.
- Rewriting historical records (SCRUM-7/8 designs and matrices, ADR 0014 context) — they stay as written.

## 3. Acceptance criteria

| ID | Criterion (must) |
|---|---|
| SCRUM-10-AC-01 | `frontend/Dockerfile` runtime stage (`FROM`, last stage) uses the official `nginx/nginx-unprivileged` **stable 1.30.7 Alpine** image, pinned to an **exact** tag (nginx patch version in the tag; no `stable`, `latest`, `1.30-…` floating tags). |
| SCRUM-10-AC-02 | The `org.opencontainers.image.base.name` label equals the fully qualified runtime `FROM` (`docker.io/nginx/nginx-unprivileged:<tag>`); `verify-release-images.sh` (base.name vs last `FROM`) passes. |
| SCRUM-10-AC-03 | The `Release` dry-run gate verdict is **PASS**: none of CVE-2026-113425, CVE-2026-121810, CVE-2026-123007, CVE-2026-123633, CVE-2026-123634 is reported for `frontend-image`; the frontend image contains `nginx` ≥ 1.30.7-r0. |
| SCRUM-10-AC-04 | No new allow-list entries; the allow-list file is unchanged by this Task. |
| SCRUM-10-AC-05 | Existing `CI` jobs (identity, build, frontend, e2e) and the `Release` dry-run are green on the branch head. |
| SCRUM-10-AC-06 | Image verification still passes: OCI labels (version, revision, source, created, jira, title, base.name), non-root user (UID 101), runtime check, size target (`verify-images.sh`, `verify-release-images.sh`). |
| SCRUM-10-AC-07 | ADR 0010 base-image table and an amendment note record the new tag (with upstream provenance); ADR 0011 and other living docs naming the runtime base image are updated consistently. |
| SCRUM-10-AC-08 | Traceability per ADR 0004: commits `SCRUM-10: [ROLE] …` with `Refs: SCRUM-10`; `docs/traceability/SCRUM-10.md` filled with run links and evidence. |

## 4. Non-functional requirements

| ID | Requirement |
|---|---|
| SCRUM-10-NFR-01 | No functional or behavioural change: same port 8080, UID 101, entrypoint templating, routes, security headers, healthcheck; all e2e tests unchanged and green. |
| SCRUM-10-NFR-02 | Same Alpine minor line as today unless upstream builds 1.30.7 on a newer one (recorded in the design if so). |
| SCRUM-10-NFR-03 | Gate not weakened: no change to policy, gate code, thresholds or scanner pin. |
| SCRUM-10-NFR-04 | Minimal diff: only the files the design lists change. |
| SCRUM-10-NFR-05 | Frontend image size stays within the SCRUM-7 target (≤ 80 MB). |

## 5. Assumptions

| ID | Assumption |
|---|---|
| A-01 | The 1.30.7 image is (or will shortly be) published to Docker Hub `nginx/nginx-unprivileged` by upstream CI. The SCRUM-8 attempt `nginxinc/nginx-unprivileged:1.30.7-alpine3.24` (commit `28b3bc8`) failed because the tag did not exist (wrong, retired namespace and not yet published). The Architect confirms the exact tag and a fallback. |
| A-02 | The nginx package in the 1.30.7 image (`1.30.7-r<PKG_RELEASE>`) satisfies Trivy's fixed version `1.30.7-r0`. |
| A-03 | 1.30.7 is a stable patch release; config and entrypoint scripts are compatible with 1.30.6. |
| A-04 | If the 1.30.7 tag is not yet published, the Task waits for upstream publication rather than adding an allow-list entry; any change of approach requires a PO decision on SCRUM-10. |
