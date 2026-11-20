# ADR 0016 — MEDIUM/UNKNOWN findings stay non-blocking but are itemised with a triage deadline; OS-package floors in runtime stages bridge base-image lag

- Status: Accepted
- Date: 2026-11-20
- Jira: [SCRUM-11](https://suranagivinod.atlassian.net/browse/SCRUM-11) — SCRUM-11-AC-05..AC-08, NFR-02, NFR-03;
  questions Q-01..Q-04
- **Amends:**
  - [ADR 0014](0014-vulnerability-scanning-policy.md) — "Reported, not blocking: … MEDIUM/LOW/UNKNOWN (counts)": the
    blocking rule is **unchanged**; fixable MEDIUM and UNKNOWN findings in gated targets are now also **listed
    individually** (job summary, `verdict.json`, `::warning::` annotations) and carry a triage deadline (below).
  - [ADR 0010](0010-container-images-and-build-identity.md) — "Bumping a base image is a deliberate change": a runtime
    stage may additionally raise individual Alpine packages to a **version floor** when the base image of the same
    line has not been rebuilt with a fix yet, and may remove base-image packages that are provably unused at runtime.
    Q-04 (digests) stays deferred; the Temurin runtime tag gains its explicit Alpine suffix.
- Design: [SCRUM-11 design](../architecture/SCRUM-11-design.md)

## Context

The v1.0.1 release passed the gate with 16 MEDIUM + 3 UNKNOWN findings in `backend-image` and 11 MEDIUM in
`frontend-image` — 9 CVEs in three Alpine 3.24 packages (OpenSSL, zlib, GnuTLS), **all fixable** in the Alpine 3.24
repository ([SCRUM-11 requirements §2](../requirements/SCRUM-11.md#2-findings-inventory-scrum-11-ac-01)). Two
questions follow:

1. **How do we ship OS-package fixes when upstream images lag?** Our runtime bases (`eclipse-temurin`,
   `nginx/nginx-unprivileged`) are built on the `alpine:3.24` image, whose packages only change with an Alpine point
   release (3.24.1 2026-06-15, 3.24.2 09-17, 3.24.3 10-21, 3.24.4 11-05: gaps of 2–13 weeks). Neither upstream runs
   `apk upgrade`; nginx-unprivileged's weekly rebuild on an unchanged `alpine:3.24` does not pick up fixed packages.
   Alpine fixed zlib on 2026-11-06, OpenSSL on 2026-11-18 and GnuTLS on 2026-11-19; as of 2026-11-20 there is no
   3.24.5 and no rebuilt base image (evidence: design §2).
2. **Should fixable MEDIUM block?** The gate (ADR 0014) blocks fixable CRITICAL/HIGH and secrets only. The dry-run
   runs on every PR and push, so any new blocking class turns *all* PRs red the day a CVE is published.

## Decision

### 1. MEDIUM/UNKNOWN: report-only, itemised, with a triage deadline (Q-04)

- **The gate verdict does not change.** Fixable MEDIUM/UNKNOWN do not block releases or PRs.
- `vuln-gate.mjs` additionally lists every **fixable MEDIUM or UNKNOWN vulnerability in a gated target**
  (deduplicated like the other lists) in `verdict.json` (`fixableMediumUnknown`), in the job summary / `summary.md`
  (table "MEDIUM/UNKNOWN with a fix — reported, not blocking") and as `::warning::` annotations on the `scan` job
  (at most 10 individual annotations plus one summary line), so they are visible on every PR without opening the
  artifact.
- **Triage deadline (process):** a fixable MEDIUM/UNKNOWN that appears in a scan of `main` gets a Jira task within
  **5 working days**; within **30 days** it is either remediated by the fix order of
  [vulnerability-policy.md §3](../release/vulnerability-policy.md#3-fixing-a-blocking-finding-order-of-preference)
  or recorded in that task's traceability matrix with a justification and a re-check date (≤ 30 days). No allow-list
  entries for non-blocking findings (the allow-list remains an exception mechanism for *blocking* findings).
- LOW stays counts-only. Unfixed MEDIUM/UNKNOWN stay counts-only.

**Why not block fixable MEDIUM (immediately or after N days):**

| Option | Rejected because |
|---|---|
| Block fixable MEDIUM immediately | Every PR goes red whenever Alpine/npm/Maven publishes a MEDIUM fix — several times a month — for issues that, here, are mostly unreachable (e.g. QUIC/CMS/AES-GCM-SIV in OpenSSL while nginx serves plain HTTP behind the edge and the JVM uses JSSE). Release velocity would depend on upstream rebuild cadence (weeks), and the only quick escape would be allow-list churn, which devalues the allow-list. |
| Block fixable MEDIUM older than N days | Trivy's data has no "fix available since" date: `PublishedDate`/`LastModifiedDate` are CVE dates. CVE-2026-4738 was published 2026-03-24 but fixed in Alpine 3.24 only on 2026-11-06, so any N < 240 would have blocked on the first day. A correct age needs our own first-seen state across runs — a stateful gate, contrary to ADR 0014's "deterministic apart from the CVE feed" (SCRUM-8-NFR-08). |
| Keep counts only (status quo) | The v1.0.1 situation: nine fixable CVEs shipped unnoticed because counts carry no IDs and nobody owns them. |

Escalation is automatic where it matters: a finding re-rated to HIGH/CRITICAL (an UNKNOWN that gets its first
rating, or a MEDIUM re-rated from vendor data such as CVE-2026-4738's CVSS 9.4) **blocks** under the unchanged rule.

### 2. Remediation tool: OS-package floors in the runtime stage (Q-01)

Fix order for OS packages in a shipped image (extends policy §3 step 1):

1. **A newer upstream build of the same line** (new patch tag, or the same tag rebuilt) that contains the fixed
   packages — preferred; no package lines in our Dockerfile.
2. Otherwise a **floor** in our runtime stage, as root, before `USER`:
   `apk add --no-cache '<pkg>>=<fixed version>' …` — only packages already in the image, only the versions Trivy
   names as fixed, only from the image's own Alpine branch. A floor (`>=`) rather than an exact pin (`=`): Alpine's
   stable repositories serve only the latest build of a package, so an exact pin breaks the build as soon as the next
   `-rN` is published, while a floor fails the build only if the fix is **not** available (fail closed,
   SCRUM-11-NFR-02). `apk upgrade <pkg>` is not used: it succeeds silently when nothing newer exists.
3. **Removing** a base-image package instead, when it is provably unused at runtime and removal is a single
   `apk del` of a top-level package (e.g. `gnupg`, which Temurin installs only to verify its own JDK download).
4. Only then an allow-list entry (blocking findings) or a recorded justification with re-check date (non-blocking).

Floors are temporary: the base-image bump whose image already contains versions ≥ every floor removes the
corresponding lines (checked at every base-image bump and at the re-check dates in the SCRUM-11 matrix). The
`org.opencontainers.image.base.name` label is unaffected (it names the `FROM`); SBOMs and scans describe the
resulting image, so they show the upgraded versions.

### 3. Tags, digests (Q-03)

- **No digest pinning now** (ADR 0010 Q-04 stays deferred). A digest would freeze exactly the image that lacks the
  fixes and stop upstream rebuilds — the normal vehicle for OS fixes — from reaching us unless bump automation
  (Renovate/Dependabot `docker`) exists; `verify-release-images.sh` would also need to treat `@sha256:` (or a
  separate `org.opencontainers.image.base.digest` label). Follow-up story: automation + digests + `base.digest`.
- Instead: the backend runtime tag names its Alpine minor, **`eclipse-temurin:21.0.13_9-jre-alpine-3.24`** — today
  the same image as `21.0.13_9-jre-alpine` (same official-images entry `21/jre/alpine/3.24`, same index digest), but
  it cannot silently move to Alpine 3.25 when Adoptium adds it (the frontend tag already pins `alpine3.24`).
- The resolved base digests are recorded in each security Task's matrix (BuildKit log `resolve …@sha256:`).

## Consequences

- PRs and releases are not blocked by MEDIUM findings; they are visible as warnings and owned via Jira within a week.
- Dockerfiles may carry short-lived `apk add` floor lines; each has a comment naming the Task/ADR, and base-image bumps
  must check whether they are still needed.
- Image builds need the Alpine CDN at build time (already true for pulls); if the CDN or the fixed package is
  unavailable the build fails (intended).
- Images are still not bit-for-bit reproducible (unchanged); jar/tarball reproducibility is unaffected (build stages
  untouched).
- The gate's verdict logic and tests for CRITICAL/HIGH/secrets are unchanged; one more report list is tested.
