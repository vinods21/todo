# SCRUM-11 — Triage and remediate MEDIUM/UNKNOWN vulnerabilities in backend and frontend images: Refined Requirements

| Field | Value |
|---|---|
| Jira key | [SCRUM-11](https://suranagivinod.atlassian.net/browse/SCRUM-11) |
| Type / Priority | Task (security) |
| Parent epic | SCRUM-5 — Build a To-Do Application (Spring Boot, React, PostgreSQL, REST APIs) |
| Depends on | SCRUM-8 (gate, [ADR 0014](../adr/0014-vulnerability-scanning-policy.md)), SCRUM-10, SCRUM-9 — all merged; `main` = `0c512cd` = released **v1.0.1** |
| Branch | `feature/SCRUM-11-medium-vulns` |
| Author role | Product Manager (PM → Architect → Dev pipeline) |
| Status | Draft — ready for architecture |

**Traceability:** Requirements carry stable IDs (`SCRUM-11-AC-xx`, `SCRUM-11-NFR-xx`). Design, Dockerfile/doc/script
changes, commits (`SCRUM-11: [ROLE] …` + `Refs: SCRUM-11`) and CI evidence reference them per
[ADR 0004](../adr/0004-traceability-conventions.md) (as amended by ADR 0008 / 0013). Dev fills
`docs/traceability/SCRUM-11.md`.

**Requirement keywords:** "must" = mandatory for acceptance; "should" = expected unless the design justifies a
deviation; "may" = Architect's option.

---

## 1. Problem statement

The v1.0.1 release ([Release run 44672985089](https://github.com/vinods21/todo/actions/runs/44672985089),
`workflow_dispatch` on `main` `0c512cd`, gate evaluated 2026-11-20T04:16:46Z) **passed** the gate: nothing
CRITICAL/HIGH. Under the current policy (ADR 0014, [vulnerability-policy.md §2](../release/vulnerability-policy.md))
MEDIUM/LOW/UNKNOWN are only counted, so the released images ship with **known, fixable** findings:

| target (gated) | CRITICAL | HIGH | MEDIUM | LOW | UNKNOWN | secrets |
|---|---|---|---|---|---|---|
| `backend-image` | 0 | 0 | **16** | 0 | **3** | 0 |
| `frontend-image` | 0 | 0 | **11** | 0 | 0 | 0 |
| `backend-runtime`, `frontend-prod`, `backend-all-scopes`, `frontend-all` | 0 | 0 | 0 | 0 | 0 | 0 |

Scanner: Trivy `0.76.2`, vulnerability DB v2 `UpdatedAt 2026-11-19T13:02:29Z`, Java DB `2026-11-19T00:58:12Z`.
Source: the v1.0.1 scan reports (`backend-image.json`, `frontend-image.json`, `verdict.json`, `summary.md`).

No finding is in an application dependency; every finding is an **Alpine 3.24.4 OS package** inherited from the
runtime base images. Several have external ratings well above Trivy's MEDIUM (CVE-2026-4738: CVSS 4.0 9.4 by
bitnami/julia) or no rating yet (gnutls: UNKNOWN), so a later DB update could re-rate them to HIGH/CRITICAL and turn
every PR and the next release red without any change on our side.

## 2. Findings inventory (SCRUM-11-AC-01)

Verified against the v1.0.1 Trivy JSON (`Results[0].Vulnerabilities` and `Packages`). Both images:
`alpine 3.24.4`, all packages `x86_64`. **9 distinct CVEs, 3 source packages (openssl, zlib, gnutls), all with a fix
(`Status: fixed`)**; 0 findings without a fix.

### 2.1 Per CVE

| # | ID | Source pkg → binary pkgs | Installed → fixed | Trivy severity (source) | Other ratings | CWE | Summary |
|---|---|---|---|---|---|---|---|
| 1 | CVE-2026-107496 | openssl → `libcrypto3`, `libssl3`, `openssl` | 3.5.9-r0 → **3.5.9-r1** | MEDIUM (—) | ubuntu: medium | CWE-835 | CMS encryption to an EC certificate with group order 1 loops forever (DoS) |
| 2 | CVE-2026-88822 | openssl → same | 3.5.9-r0 → **3.5.9-r1** | MEDIUM (—) | ubuntu: medium | CWE-457 | QUIC automated peer detection may leak uninitialised stack data into the destination address |
| 3 | CVE-2026-88823 | openssl → same | 3.5.9-r0 → **3.5.9-r1** | MEDIUM (—) | ubuntu: medium | CWE-325 | AES-GCM-SIV: an empty AAD update resets earlier AAD (tag does not cover it) |
| 4 | CVE-2026-95691 | openssl → same | 3.5.9-r0 → **3.5.9-r1** | MEDIUM (—) | ubuntu: medium | CWE-416 | Retransmitted QUIC CRYPTO frame → use-after-free read in the QUIC client |
| 5 | CVE-2026-95692 | openssl → same | 3.5.9-r0 → **3.5.9-r1** | MEDIUM (—) | ubuntu: medium | CWE-125 | AES-GCM-SIV short IV → heap out-of-bounds read |
| 6 | CVE-2026-4738 | zlib → `zlib` | 1.3.2-r1 → **1.4-r0** | MEDIUM (—) | bitnami/julia: CVSS 4.0 **9.4**; ubuntu: medium | CWE-119 | Out-of-bounds in zlib `contrib/infback9` (reported against GDAL's bundled copy); Alpine lists `1.4-r0` as the fix |
| 7 | CVE-2026-127039 | gnutls → `gnutls` | 3.8.13-r0 → **3.8.14-r0** | UNKNOWN (no rating yet) | — | CWE-476 | GNUTLS-SA-2026-11-18-1: certificate list not reset after failed re-allocation (DoS under heap pressure) |
| 8 | CVE-2026-127040 | gnutls → `gnutls` | 3.8.13-r0 → **3.8.14-r0** | UNKNOWN | — | CWE-476 | GNUTLS-SA-2026-11-18-2: RSA-PSK ClientKeyExchange continues after allocation failure (DoS) |
| 9 | CVE-2026-127231 | gnutls → `gnutls` | 3.8.13-r0 → **3.8.14-r0** | UNKNOWN | — | CWE-415 | GNUTLS-SA-2026-11-18-3: double free in X.509 name-constraints handling (DoS) |

### 2.2 Per image (Trivy rows = CVE × binary package)

| Image | Package | Installed | Fixed | CVEs | Rows | Layer (introduced by) |
|---|---|---|---|---|---|---|
| backend | `libcrypto3` | 3.5.9-r0 | 3.5.9-r1 | #1–#5 | 5 M | `75f1d965…` — Alpine minirootfs 3.24.4 (2026-11-05) |
| backend | `libssl3` | 3.5.9-r0 | 3.5.9-r1 | #1–#5 | 5 M | `75f1d965…` — Alpine minirootfs |
| backend | `openssl` (CLI) | 3.5.9-r0 | 3.5.9-r1 | #1–#5 | 5 M | `84acb449…` — Temurin `apk add … openssl` (2026-11-05) |
| backend | `zlib` | 1.3.2-r1 | 1.4-r0 | #6 | 1 M | `75f1d965…` — Alpine minirootfs |
| backend | `gnutls` | 3.8.13-r0 | 3.8.14-r0 | #7–#9 | 3 U | `84acb449…` — Temurin `apk add … gnupg` (pulled in by `gnupg-dirmngr`) |
| **backend total** | | | | 9 CVEs | **16 M + 3 U = 19** | |
| frontend | `libcrypto3` | 3.5.9-r0 | 3.5.9-r1 | #1–#5 | 5 M | `75f1d965…` — Alpine minirootfs (same layer digest as backend) |
| frontend | `libssl3` | 3.5.9-r0 | 3.5.9-r1 | #1–#5 | 5 M | `75f1d965…` — Alpine minirootfs |
| frontend | `zlib` | 1.3.2-r1 | 1.4-r0 | #6 | 1 M | `75f1d965…` — Alpine minirootfs |
| **frontend total** | | | | 6 CVEs | **11 M** | (no `openssl` CLI, no `gnutls` in the frontend image) |

### 2.3 Context the Architect needs (facts from the reports, not decisions)

- **Who uses what.** `gnutls` has exactly one reverse dependency in the backend image: `gnupg-dirmngr` (part of
  `gnupg`, which the Temurin base installs "to verify the signature" of the JDK download at *its* build time). Our
  entrypoint is `java -jar`; Temurin's `__cacert_entrypoint.sh` is replaced (ADR 0010). `libssl3`/`libcrypto3` are
  used by `apk-tools`, busybox `ssl_client`, `ca-certificates`, `coreutils`, `libldap` (backend) and by **`nginx`**,
  `nginx-module-njs`, `libcurl` (frontend). `zlib` is used by `apk-tools`, `freetype`, `libpng`, `gnupg` (backend)
  and **`nginx`**, `libxml2`, `libcurl`, `libgd` (frontend).
- **Base image build dates** (image history): Temurin JRE layers 2026-11-05 19:17–19:18Z on minirootfs 3.24.4
  (2026-11-05 18:00Z); nginx-unprivileged layers 2026-11-18 16:40–17:40Z on the same minirootfs 3.24.4.
- Current runtime bases: `eclipse-temurin:21.0.13_9-jre-alpine` (backend), `nginx/nginx-unprivileged:1.30.7-alpine3.24`
  (frontend) — tags only, no digests (ADR 0010 Q-04).
- SBOM: `backend-image` SBOM had 157 components at SCRUM-8 (73 OS + 83 jar + OS component); floor
  `MIN_COMPONENTS['backend-image'] = 125` (`lib/sbom.mjs`).

## 3. Scope

### In scope
- Remediate all 9 CVEs in both runtime images, within the current lines (Temurin 21.0.13_9 JRE on Alpine 3.24,
  nginx-unprivileged 1.30.7 on Alpine 3.24).
- A recorded decision on whether fixable MEDIUM (and UNKNOWN) findings should block; ADR amendment or new ADR; any
  resulting gate/report change with tests.
- Updates to living docs that the change affects (ADR 0010 base-image section, vulnerability policy, RELEASE.md §7).
- Requirements, design, traceability matrix with before/after counts.

### Out of scope
- Major/minor upgrades: Java 25, Temurin build changes, nginx 1.31 (mainline), Alpine 3.25, Debian/Ubuntu/distroless
  variants — each needs a separate decision.
- Build-stage images (`eclipse-temurin:21.0.13_9-jdk-noble`, `node:22.23.4-alpine`): not shipped, not scanned.
- LOW findings (there are none today).
- Changes to Maven/npm dependencies (no findings there).
- Automated base-image update tooling (Renovate/Dependabot) — follow-up, together with ADR 0010 Q-04 (digests).
- Rewriting historical records (SCRUM-7/8/10 designs and matrices, ADR 0014 context).

## 4. Acceptance criteria

The Jira ACs are mapped to stable IDs; AC-02..AC-04 split the remediation AC per source package.

| ID | Criterion (must) | Jira AC |
|---|---|---|
| SCRUM-11-AC-01 | Every MEDIUM and UNKNOWN finding is listed per image with ID, package, installed and fixed version, severity (this document §2); the traceability matrix repeats it with the post-fix state. | "List every MEDIUM and UNKNOWN finding per image." |
| SCRUM-11-AC-02 | OpenSSL: in **both** images `libcrypto3` and `libssl3` (and `openssl` where present) are ≥ **3.5.9-r1**; CVE-2026-107496, -88822, -88823, -95691, -95692 are no longer reported for `backend-image` or `frontend-image`. | "Remediate every finding that has a fix available …" |
| SCRUM-11-AC-03 | zlib: in both images `zlib` ≥ **1.4-r0**; CVE-2026-4738 no longer reported. The design shows that 1.3.2 → 1.4 is ABI-compatible for nginx and the JRE (evidence, not assumption). | same |
| SCRUM-11-AC-04 | gnutls: CVE-2026-127039, -127040, -127231 no longer reported for `backend-image`, either because `gnutls` is ≥ **3.8.14-r0** or because it is no longer installed (only if the design shows nothing at runtime needs it). | same |
| SCRUM-11-AC-05 | Remediation stays within the current lines: base images by a newer build/tag of the **same** line, or OS packages by patch/pkgrel within Alpine 3.24; **no** major or minor upgrade of Java, nginx or Alpine. The `org.opencontainers.image.base.name` label still equals the runtime `FROM` (`verify-release-images.sh`); ADR 0010's base-image section records the change. | "… by bumping base images within their line or dependency patch versions; no major upgrades without a separate decision." |
| SCRUM-11-AC-06 | Any finding that cannot be fixed at implementation time is recorded in the matrix with a justification (why not fixable now, exposure in our runtime) and a **re-check date** (≤ 30 days). No allow-list entries for non-blocking findings. | "For findings with no fix, record a justification with a re-check date." |
| SCRUM-11-AC-07 | The Architect decides whether the gate should start blocking on fixable MEDIUM (and UNKNOWN) findings, with rationale against release velocity and base-image lag; the decision is recorded as an ADR 0014 amendment (or a new ADR) and in `vulnerability-policy.md`. | "Decide whether the policy should start gating fixable MEDIUM findings; record the decision …" |
| SCRUM-11-AC-08 | Whatever AC-07 decides is implemented consistently: gate code, job summary / `verdict.json` and docs say the same thing; gate unit tests cover the new behaviour; CRITICAL/HIGH/secret blocking is unchanged. | (same) |
| SCRUM-11-AC-09 | `CI` (identity, build incl. hadolint, frontend, e2e) and the `Release` dry-run (incl. `sbom`, `scan`, `e2e-release`, `release-gate`) are green on the branch head. | "CI and the Release dry-run stay green" |
| SCRUM-11-AC-10 | `docs/traceability/SCRUM-11.md` records, per gated target, the severity counts **before** (run 44672985089) and **after** (the branch's Release dry-run), the Trivy DB version of both runs, the installed versions of the remediated packages after the fix, and any finding that newly appeared. | "post-fix counts recorded in traceability per ADR 0004" |
| SCRUM-11-AC-11 | Image verification still passes: OCI labels, non-root user (10001 / 101), payload = tested jar / bundle, healthchecks, size targets (`verify-images.sh`, `verify-release-images.sh`). | (implied by "stay green") |
| SCRUM-11-AC-12 | Traceability per ADR 0004: commits `SCRUM-11: [ROLE] …` with `Refs: SCRUM-11`; matrix filled with run links. | "… per ADR 0004" |

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| SCRUM-11-NFR-01 | No functional or behavioural change: ports, users (UID 10001 / 101), entrypoints, routes, security headers, healthchecks, JVM flags unchanged; all unit, e2e and lifecycle tests unchanged and green. |
| SCRUM-11-NFR-02 | **Fail closed:** if the fixed package versions are not obtainable at build time, the image build must fail — a remediation that silently becomes a no-op is not acceptable. |
| SCRUM-11-NFR-03 | The gate is not weakened: thresholds for CRITICAL/HIGH/secrets, fail-closed rules, scanner pin and allow-list rules unchanged. |
| SCRUM-11-NFR-04 | Minimal diff: only the files the design lists change. |
| SCRUM-11-NFR-05 | Image sizes stay within the SCRUM-7 targets (backend ≤ 300 MB, frontend ≤ 80 MB). |
| SCRUM-11-NFR-06 | Jar and frontend tarball reproducibility (SCRUM-8, `repro-jar.sh`) unaffected: build stages unchanged. |
| SCRUM-11-NFR-07 | Dockerfiles stay hadolint-clean at `failure-threshold: warning` with no new entries in `.hadolint.yaml`; any inline ignore carries a reason. |
| SCRUM-11-NFR-08 | SBOMs (4 files) stay valid and above their component floors; any floor change follows the SCRUM-8 rule (~80 % of the observed count) and is justified in the matrix. |

## 6. Assumptions

| ID | Assumption |
|---|---|
| A-01 | The Alpine 3.24 `main` repository already serves (or will shortly serve) binary packages `openssl`/`libcrypto3`/`libssl3` 3.5.9-r1, `zlib` 1.4-r0 and `gnutls` 3.8.14-r0 for x86_64 (Trivy's fixed versions come from Alpine's secdb, which proves the fix is *declared*, not that the binary is published). The Architect checks aports; NFR-02 covers the gap. |
| A-02 | Upstream base images have not (yet) been rebuilt with these packages; the Architect confirms and states which upstream event would bring them (e.g. an Alpine 3.24.x point release). |
| A-03 | Nothing in our runtime path performs TLS, CMS or QUIC with OpenSSL or GnuTLS (the JVM uses JSSE; nginx listens on plain HTTP 8080 behind the edge). Exposure is therefore low — this Task is hygiene and protection against re-rating, not an incident. |
| A-04 | The Trivy DB moves daily; the after-scan may show findings that did not exist on 2026-11-20. Those are recorded (AC-10) and handled per policy, not silently absorbed into this Task. |
| A-05 | No release is blocked today; the Task does not justify bypassing the normal PR flow. |

## 7. Questions for the Architect

| ID | Question |
|---|---|
| Q-01 | Remediation vehicle per package: newer upstream base image build in the same line (preferred) vs. explicit package upgrades in our runtime stages vs. removing unused packages. |
| Q-02 | Is `gnutls` (via `gnupg`) needed at runtime in the backend image? If not, remove instead of upgrading? |
| Q-03 | Our base pins are mutable tags. Should we add digest pinning (`tag@sha256:…`) now, or record the resolved digests only? |
| Q-04 | MEDIUM/UNKNOWN gating (AC-07): block fixable MEDIUM, block after N days, or keep report-only with better visibility? |
