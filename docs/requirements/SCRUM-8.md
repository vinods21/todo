# SCRUM-8 — Implement Versioning and Release Strategy: Refined Requirements

| Field | Value |
|---|---|
| Jira key | [SCRUM-8](https://suranagivinod.atlassian.net/browse/SCRUM-8) |
| Type / Priority | Story / Medium |
| Parent epic | SCRUM-5 — Build a To-Do Application (Spring Boot, React, PostgreSQL, REST APIs) |
| Depends on | SCRUM-2 (backend), SCRUM-1 (frontend), SCRUM-6, SCRUM-7 (container images, Compose, e2e) — all done and merged; CI workflow `CI` with build identity per [ADR 0008](../adr/0008-ci-derived-build-identity.md) and images per [ADR 0010](../adr/0010-container-images-and-build-identity.md) |
| Related | SCRUM-9 — Implement Pre-Release E2E Tests in GitHub Actions (not started; **separate story**, see §2 and AC-07) |
| Branch | `feature/SCRUM-8-versioning-and-release-strategy` |
| Author role | Product Manager (PM → Architect → Dev pipeline) |
| Status | Draft — ready for architecture |

**Traceability:** Every requirement in this document has a stable ID (`SCRUM-8-AC-xx`, `SCRUM-8-NFR-xx`).
Design docs, workflows, scripts, Dockerfile/Compose changes, tests, CI steps and commits for this story must
reference these IDs (commits also carry `Refs: SCRUM-8`), following [ADR 0004](../adr/0004-traceability-conventions.md)
as amended by [ADR 0008](../adr/0008-ci-derived-build-identity.md). Tests of release tooling (version computation,
policy evaluation, etc.) have names starting with the AC ID they verify. The table in section 8 maps each ID to its
verification and is completed by Dev in `docs/traceability/SCRUM-8.md`.

**Requirement keywords:** "must" = mandatory for acceptance; "should" = expected unless the design justifies a
deviation; "may" = Architect's option.

---

## 1. Problem statement

The application is built, tested and containerised on every push (SCRUM-7), but **nothing is ever released**:

- **No versions.** `pom.xml` says `0.1.0-SNAPSHOT`, `frontend/package.json` says `0.1.0`, and neither ever changes.
  CI artefacts are identified only by `<JIRA_KEY>-<sha>` (ADR 0008), so there is no answer to "which version is
  running?" — and the backend and frontend images are labelled with *different* versions
  (`org.opencontainers.image.version` = `0.1.0-SNAPSHOT` vs `0.1.0`) for the same commit. The frontend's
  `build-info.json` carries no version at all.
- **No tags, no releases, no registry.** The public repository `vinods21/todo` has no Git tags and no GitHub
  Releases. Images are built in the CI `e2e` job and discarded; workflow artifacts expire. There is nothing
  immutable that could be deployed, compared or rolled back to. (SCRUM-7 Q-01 deferred registry publishing here.)
- **No supply-chain transparency.** There is no SBOM for the jar, the frontend bundle or the images.
- **Almost no vulnerability scanning.** The only check is `npm audit --omit=dev --audit-level=high` in the
  `frontend` job. Maven dependencies and the container images (Temurin JRE/Alpine, nginx/Alpine) are never
  scanned, and there is no policy saying what blocks a release (SCRUM-7 Q-02 deferred this here).
- **No documented release or rollback process**, and no statement of how a rollback interacts with the
  forward-only Flyway migrations (`V1__…`, `V2__…`).

This story establishes **one standard, automated, auditable release process** for the product (backend + frontend):
SemVer versions derived from Git tags, versioned and immutable artefacts (jar, frontend bundle, two images) traceable
to their commit, SBOMs, dependency and container scanning with a release-blocking policy, and documented release and
rollback runbooks.

**Testability constraint (drives several ACs):** a real release (tag + GHCR push + GitHub Release) can only run
from `main` after this story is merged. Therefore the release pipeline must have a **dry-run mode** that runs on this
feature branch and on every PR, exercising everything except publication (AC-11), so that CI proves the pipeline
before merge; the **first real release** is a documented post-merge step (AC-33).

Jira acceptance criteria (verbatim) and where they are refined:

| Jira AC | Refined in |
|---|---|
| Implement Semantic Versioning (SemVer) using MAJOR.MINOR.PATCH. | AC-01, AC-02, AC-05 |
| Include short Git SHA in build versions (e.g., 1.2.0-a1b2c3d). | AC-03, AC-04, AC-13 |
| Automatically create Git tags for releases (e.g., v1.2.0). | AC-06, AC-08, AC-09 |
| Generate and publish SBOM for release artifacts. | AC-17, AC-18 |
| Integrate dependency and container vulnerability scanning. | AC-19, AC-20, AC-23 |
| Fail release pipelines for critical/high vulnerabilities based on defined policies. | AC-21, AC-22, AC-24 |
| Build and publish versioned Docker images. | AC-13, AC-14, AC-15 |
| Ensure release artifacts are immutable and traceable to Git commits. | AC-08, AC-16, AC-25..AC-29 |
| Document the release and rollback process. | AC-30..AC-33 |
| *(implied: "reproducible builds", "security" in the description)* | NFR-01..NFR-03, NFR-11 |

## 2. Scope

### In scope
- A **versioning scheme** (SemVer, one product version for backend + frontend) with Git tags `vX.Y.Z` as the single
  source of truth, and **build versions** `X.Y.Z-<sha7>` for every non-release build.
- Stamping that version into every artefact: jar (file name, manifest, `build-info` → `/actuator/info`), frontend
  `build-info.json`/`<meta name="build-info">`, image tags and OCI labels — in CI, in the release pipeline and
  (with a fallback) in local builds.
- A **release workflow** (GitHub Actions, manual trigger from `main`) that computes the next version, builds the
  artefacts once, runs the tests, generates SBOMs, scans, enforces the vulnerability policy, then creates the tag,
  pushes the images to GHCR and publishes a GitHub Release with assets, checksums and attestations.
- A **dry-run mode** of the same pipeline on PRs and pushes (no tag, no push, no release).
- **Dependency and container vulnerability scanning** on every PR/push (reported) and on release (gating), with a
  written policy and an expiring, justified allow-list.
- **Build provenance attestations** (GitHub artifact attestations) for release artefacts and images (A-09).
- Small changes to existing files where needed: `ci.yml` (build versions, scanning, dry-run), Dockerfiles/Compose
  (version/label args; Compose able to run published images by registry name and tag — AC-15), `pom.xml` /
  `vite.config.ts` (version injection), README.
- **Docs:** `docs/release/RELEASE.md`, `docs/release/ROLLBACK.md`, vulnerability policy, README "Releases"
  section, ADR(s).
- Tests for the release tooling (version computation, pre-existence checks, policy/allow-list evaluation).

### Out of scope
- **SCRUM-9:** running the e2e suite inside the release pipeline and blocking the release on it. This story must
  only provide the **insertion point** (AC-07). Note that the existing CI `e2e` job already runs on every PR and
  push, including `main`, but is **not** a release gate in this story.
- **Deployment** to any environment (dev/staging/prod), Kubernetes manifests/Helm/ArgoCD, Terraform, cloud
  registries (ECR). "Rollback" here means redeploying a previous immutable version wherever the product runs
  (documented with Compose as the reference runtime).
- **Changelog automation beyond generated release notes:** no committed `CHANGELOG.md`, no Conventional-Commits
  enforcement, no semantic-release-style automatic bump from commit messages (A-04).
- **Pre-releases** (`-rc.N`, `-beta`), maintenance/hotfix branches and back-ports — releases are cut from `main`
  only (Q-06).
- **Multi-architecture images** (linux/arm64) — linux/amd64 only (Q-04).
- Key-based image signing (cosign with managed keys) — keyless Sigstore-backed GitHub attestations cover provenance
  (A-09, Q-05).
- Automated dependency update tooling (Dependabot/Renovate), base-image digest pinning (SCRUM-7 Q-04 follow-up).
- SAST/DAST (CodeQL, ZAP), licence-compliance gating, IaC/misconfiguration scanning beyond the existing hadolint.
- Publishing to Maven Central / npm registry. Release artefacts are GitHub Release assets and GHCR images only.
- Database backup/restore tooling (only documented as a rollback caveat).
- Any functional change to the API or UI (NFR-09).

## 3. Target release flow (summary — source of truth will be the SCRUM-8 design)

```
workflow_dispatch on main (bump = major|minor|patch, or explicit version; dry_run=false)
  │
  ├─ version      compute X.Y.Z from latest v* tag; refuse if ref ≠ main, version invalid/not greater,
  │               or tag / GitHub Release / GHCR X.Y.Z already exists                       (AC-02, AC-06, AC-08)
  ├─ build        tests + coverage gates; jar todo-backend-X.Y.Z.jar; frontend dist tarball;
  │               both images built ONCE (not pushed yet), all stamped X.Y.Z + commit       (AC-04, AC-07, AC-25)
  ├─ sbom         CycloneDX: backend app, frontend app, backend image, frontend image          (AC-17)
  ├─ scan         Maven + npm deps, both images; evaluate policy + allow-list                  (AC-19..AC-22)
  ├─ release-gate aggregation job — publication `needs:` only this.   ◄── SCRUM-9 adds its e2e job here (AC-07)
  └─ publish      push images (X.Y.Z, X.Y.Z-<sha7>, X.Y, latest) → annotated tag vX.Y.Z →
                  GitHub Release (assets, SHA256SUMS, SBOMs, scan reports, notes) → attestations
                  → post-publish verification                                      (AC-09, AC-10, AC-13, AC-16, AC-28)

pull_request / push (feature/**, main) → same pipeline in DRY-RUN: everything up to release-gate,
  no tag, no push, no release; release-candidate bundle uploaded as workflow artifact      (AC-11)
```

Job names, the split into jobs vs. steps, and whether dry-run lives in `ci.yml` or a separate `release.yml` are the
Architect's choice; the **properties** (single build, gate before publication, dedicated insertion point, dry-run
parity) are requirements.

## 4. Acceptance criteria

### Versioning

- **SCRUM-8-AC-01** — **SemVer scheme, one product version:** releases are numbered `MAJOR.MINOR.PATCH` per
  SemVer 2.0.0 (no leading zeros, no pre-release or build metadata on release versions). Backend and frontend
  (jar, frontend bundle, both images) share **one product version** per release (A-01). The Git tag is
  `v` + version (e.g. `v1.2.0`); the version without `v` is used everywhere else (artefacts, image tags, labels).
  **The first release is `0.1.0`** (A-03). The meaning of MAJOR/MINOR/PATCH for this product (e.g. MAJOR = breaking
  REST API or DB change not backward compatible; MINOR = new backward-compatible feature; PATCH = fixes,
  dependency/base-image updates) is written down in `RELEASE.md` (AC-30).
- **SCRUM-8-AC-02** — **Deterministic next-version computation:** the release version is computed from the
  **highest existing tag matching `^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`** (SemVer precedence, not
  lexical or date order; all other tags ignored) and an input that is either a bump type
  (`major` → `(M+1).0.0`, `minor` → `M.(m+1).0`, `patch` → `M.m.(p+1)`) or an explicit version. Rules:
  if no release tag exists, the result is `0.1.0` for any bump type (an explicit version is honoured if valid);
  an explicit version must be valid per AC-01 and **strictly greater** than the highest existing release;
  anything else is rejected with a clear message before any build work. The same tags + same input always yield
  the same version. Implemented as a script (not inline YAML) that is unit-tested (AC-12).
- **SCRUM-8-AC-03** — **Build versions for non-release builds:** every build that is not a release gets the build
  version **`X.Y.Z-<sha7>`**, where `<sha7>` is the first 7 hex characters of the commit SHA (lower case) and
  `X.Y.Z` is the **next patch version after the highest release tag** (`0.1.0` before the first release; e.g.
  after `v1.2.0` a build of commit `a1b2c3d…` is `1.2.1-a1b2c3d`). This makes build versions valid SemVer
  pre-releases that sort above the last release and below the next one, and valid Docker tags (Docker tags do not
  allow `+`, so SemVer build metadata is not used). Applies to the CI `build`, `frontend` and `e2e` jobs and to
  dry-run (AC-11). The corner case of an all-digit `<sha7>` with a leading zero (invalid SemVer numeric
  identifier) must be handled deterministically and documented (Q-07). Local builds without Git metadata or tags
  fall back to a clearly non-release version (e.g. the repository placeholder version or `0.0.0-UNKNOWN` —
  Architect's choice) — never to a real release number.
- **SCRUM-8-AC-04** — **Version stamped consistently into every artefact:** for a given build the same version
  string (release `X.Y.Z` or build `X.Y.Z-<sha7>`) appears in:
  - backend jar file name (`todo-backend-<version>.jar`), manifest `Implementation-Version`,
    `META-INF/build-info.properties` `build.version`, and therefore `GET /actuator/info` `build.version`;
  - frontend `dist/build-info.json` (new field `version`) and the `<meta name="build-info">` content (version
    added; existing `jira`/`commit` fields unchanged so SCRUM-7 checks keep working — Architect defines the exact
    format);
  - both images' `org.opencontainers.image.version` label and image tags (AC-13/AC-15).
  Existing identity (Jira key, full commit SHA, branch) stays as today (ADR 0008/0010). CI asserts the
  consistency, extending the existing "Verify build identity" steps and `verify-images.sh` (one version across jar,
  `build-info.json` and both image labels for the same run).
- **SCRUM-8-AC-05** — **Tags are the source of truth; no version commits:** the version is **not** maintained by
  editing `pom.xml`/`package.json`, and the pipeline **never commits or pushes to `main`** (no bot commits, no
  version-bump PRs). The version is injected at build time (mechanism — e.g. Maven CI-friendly `${revision}`,
  `versions:set` in the runner workspace, `-D` properties; Vite env — is the Architect's choice). The committed
  version fields become documented placeholders for local builds (A-02). CI checks out tags (full history) wherever
  the version is computed.

### Tagging & Release

- **SCRUM-8-AC-06** — **Release trigger and guard rails:** releases are started manually via `workflow_dispatch`
  with inputs `bump` (`major|minor|patch`, default `patch`), optional `version` (explicit, overrides `bump`) and
  `dry_run` (boolean, default `false`). A non-dry-run release **must refuse** to run unless: the ref is `main`
  (`refs/heads/main`); the commit built is exactly the dispatched `github.sha` (all jobs check out that SHA, not a
  moving `main`, and the run summary records it); and that commit has no existing release tag (no second version for the same commit). Only
  one release runs at a time (concurrency group, no cancel-in-progress). Who may trigger is governed by repository
  write access (optionally a protected GitHub Environment — Q-02).
- **SCRUM-8-AC-07** — **Quality gates before publication, with a SCRUM-9 insertion point:** nothing is published
  unless, for the exact release commit: backend `./mvnw verify` (all tests + JaCoCo gate) and frontend lint,
  typecheck and `test:coverage` passed (either run inside the release pipeline, or proven by a successful `CI`
  run for that SHA — Architect's choice, documented), SBOM generation succeeded (AC-17) and the vulnerability
  gate passed (AC-21). All gates converge in **one clearly marked aggregation point** (e.g. job `release-gate`)
  that the publication job `needs:`; a comment/doc names it as the place where **SCRUM-9 adds its e2e job** (which
  must be able to consume the *same* built images — AC-25). The existing CI `e2e` job is not a release gate in
  this story.
- **SCRUM-8-AC-08** — **No overwrite, ever (pre-existence check):** before any publication step the pipeline
  verifies that none of the following exists: Git tag `vX.Y.Z` (remote), a GitHub Release `vX.Y.Z`, or GHCR tag
  `X.Y.Z` / `X.Y.Z-<sha7>` for either image; if any exists it fails with a clear message and publishes nothing.
  The pipeline never force-pushes, deletes or moves a `v*` tag, never deletes or edits assets of an existing
  release, and never re-pushes an immutable image tag (GHCR has no native tag immutability, so this check is the
  enforcement; repository settings add protection — AC-29).
- **SCRUM-8-AC-09** — **Automatic Git tag:** a successful release creates an **annotated** tag `vX.Y.Z` pointing at
  the exact commit that was built and scanned, created by the pipeline with `GITHUB_TOKEN` (no PAT, no bot
  commit). The tag message contains at least the version and the full commit SHA.
- **SCRUM-8-AC-10** — **GitHub Release:** a successful release publishes a GitHub Release named `vX.Y.Z` for that
  tag (not draft, not pre-release, marked latest) with:
  - **assets:** `todo-backend-X.Y.Z.jar`; `todo-frontend-X.Y.Z.tar.gz` (the `dist/` bundle incl.
    `build-info.json`); the four SBOMs (AC-17); vulnerability scan reports (AC-23); `SHA256SUMS` (AC-26);
  - **notes** (generated, no hand editing required): version, full commit SHA, both image references **by
    digest** (`ghcr.io/vinods21/todo-backend@sha256:…`) and by tag; changes since the previous release (commit
    subjects grouped by Jira key `SCRUM-<n>`, or GitHub-generated notes — Architect's choice) with the list of
    Jira keys; **database migrations added since the previous release** (new files under
    `src/main/resources/db/migration`, or "none") as rollback information (AC-31); vulnerability summary
    (counts by severity, gate verdict, allow-list entries in effect with expiry); how to verify (checksums,
    attestations — AC-16/AC-30).
- **SCRUM-8-AC-11** — **Dry-run mode (pre-merge testability):** the same pipeline runs in dry-run mode on every
  `pull_request` and on pushes to `feature/**` and `main`, and on `workflow_dispatch` with `dry_run=true`. Dry-run
  performs **everything up to and including the gate** — version computation (would-be release version for the
  default bump, plus the build version), build, tests (or CI reuse per AC-07), images built under their final GHCR
  names, SBOMs, scans, policy evaluation, checksums, rendered release notes, pre-existence checks (AC-08, read-only)
  — but **creates no tag, pushes no image, creates no release and no attestation**. Dry-run runs with read-only
  token permissions (NFR-01) so publication is impossible, not merely skipped, and is safe for fork PRs. It
  uploads a **release-candidate bundle** (the would-be release assets, SBOMs, scan reports, notes) as a workflow
  artifact (ADR 0008 naming, e.g. `todo-release-candidate-<JIRA_KEY>-<sha>`) and writes a job summary stating
  "DRY RUN" with the would-be version, tags, digests (local), checksums and gate verdict. A gate failure fails the
  dry-run (Q-03).
- **SCRUM-8-AC-12** — **Release tooling is tested:** the logic of AC-02 (next version), AC-03 (build version incl.
  the Q-07 corner case), AC-08 (pre-existence decision) and AC-22 (allow-list validation/expiry) lives in scripts
  with automated tests run in CI on every PR. Minimum cases: no tags → `0.1.0`; `v0.1.0` + patch/minor/major →
  `0.1.1`/`0.2.0`/`1.0.0`; highest tag chosen by SemVer (`v0.10.0` > `v0.9.0`); non-release tags
  (`v1.0.0-rc.1`, `foo`, `1.0.0`) ignored; explicit version lower/equal/invalid → rejected; build version after
  `v1.2.0` = `1.2.1-<sha7>`; existing tag → refuse. Test names start with the AC ID (ADR 0004).

### Images & Registry

- **SCRUM-8-AC-13** — **Versioned images published to GHCR:** a release pushes `ghcr.io/vinods21/todo-backend`
  and `ghcr.io/vinods21/todo-frontend` (linux/amd64 — Q-04) with tags:
  - `X.Y.Z` and `X.Y.Z-<sha7>` — **immutable** (never re-pushed, AC-08);
  - `X.Y` and `latest` — **moving** convenience tags, updated to the new release (documented as not for
    deployments/rollback, which use `X.Y.Z` or the digest).
  All tags of one image in one release point to the **same digest**, which equals the digest that was scanned and
  SBOM'd (AC-25). Authentication uses `GITHUB_TOKEN` with `packages: write` only in the publication job.
- **SCRUM-8-AC-14** — **Image metadata for traceability:** published images carry the SCRUM-7 OCI labels
  (NFR-05 there) with `org.opencontainers.image.version` = `X.Y.Z`, `.revision` = full commit SHA, `.source` =
  `https://github.com/vinods21/todo` (links the GHCR package to the repository), `.created` = build time, plus the
  Jira-key label; and should carry `org.opencontainers.image.base.name` (and base digest where available) so the
  base image is traceable. CI verifies the labels of the images it builds (extending `verify-images.sh`).
- **SCRUM-8-AC-15** — **Non-release images and running published images:** CI (`e2e` job) and dry-run build images
  tagged/labelled with the build version `X.Y.Z-<sha7>` (in addition to, or replacing, today's
  `<JIRA_KEY>-<sha>` tag — Architect's choice, consistent with ADR 0008 naming); they are **not pushed** (Q-01).
  `docker-compose.yml` must be able to run **published** images without building, by overriding the image
  repository and tag via env (e.g. `TODO_BACKEND_IMAGE=ghcr.io/vinods21/todo-backend`, `TODO_IMAGE_TAG=0.1.0`,
  `docker compose --profile app up --no-build -d --wait`), while the default local workflow
  (`docker compose --profile app up --build`) is unchanged (NFR-09). This is the reference way to run and roll
  back a release (AC-31).
- **SCRUM-8-AC-16** — **Provenance attestations:** a release creates GitHub artifact attestations (SLSA build
  provenance, Sigstore keyless via OIDC) for the jar, the frontend tarball and both image digests (image
  attestations pushed to GHCR). `gh attestation verify` succeeds for each against `vinods21/todo`, and the
  command lines are documented (AC-30) and executed in post-publish verification (AC-28). SBOM attestations for
  the images (`attest-sbom` or equivalent) should also be created.

### SBOM

- **SCRUM-8-AC-17** — **SBOMs for every release artefact:** the pipeline generates **CycloneDX JSON** SBOMs (spec
  1.5 or newer; A-07) for:
  1. backend application — Maven runtime (compile + runtime scope) dependency graph with versions, package URLs
     (`purl`), hashes and licences where known;
  2. frontend application — npm **production** dependencies from `package-lock.json` (what ships in the bundle);
  3. backend image and 4. frontend image — OS packages and language packages found in the image.
  Each SBOM's root component identifies the product component, the version (AC-04) and the commit SHA (e.g. as
  a property/external reference). File names: `todo-backend-X.Y.Z.cdx.json`, `todo-frontend-X.Y.Z.cdx.json`,
  `todo-backend-image-X.Y.Z.cdx.json`, `todo-frontend-image-X.Y.Z.cdx.json` (dry-run/CI: build version). SBOMs
  are validated against the CycloneDX schema in CI and must not be empty (a minimum component count per SBOM is
  asserted, so a silently broken generator fails the pipeline).
- **SCRUM-8-AC-18** — **SBOMs published:** on release the four SBOMs are GitHub Release assets covered by
  `SHA256SUMS` and the provenance attestation; image SBOMs should additionally be attached to the image digests as
  attestations (AC-16). In dry-run and on every PR/push they are uploaded as workflow artifacts (part of the
  release-candidate bundle, AC-11). SBOM generation tools are version-pinned (NFR-02).

### Scanning & Policy

- **SCRUM-8-AC-19** — **Dependency scanning:** Maven dependencies (all scopes scanned; compile/runtime scope
  subject to the gate, test/build-only reported) and npm dependencies (`dependencies` subject to the gate,
  `devDependencies` reported) are scanned for known vulnerabilities on **every PR and push** and on **every
  release**. The existing `npm audit --omit=dev --audit-level=high` step is either kept or replaced by the new
  scanner with at least equivalent coverage (Architect's choice; stated in the design).
- **SCRUM-8-AC-20** — **Container scanning:** both images (as built in that run) are scanned on every PR/push and on
  release for vulnerabilities in OS packages and language packages (incl. the jar's dependencies inside the
  backend image and anything nginx/Alpine ships), and for **embedded secrets**. One scanner for dependencies and
  images (e.g. Trivy, or Grype using the AC-17 SBOMs) is preferred; tool and version are pinned (NFR-02).
- **SCRUM-8-AC-21** — **Release-blocking policy (precise):** the vulnerability gate **fails** when, after applying
  valid allow-list entries (AC-22), any of the following is found in a **shipped** component (backend runtime Maven
  dependencies, npm production dependencies, either image's OS or language packages):
  1. a vulnerability of severity **CRITICAL or HIGH** for which a **fixed version is available**;
  2. any **secret** detected in an image.
  Not blocking, but **reported** in the job summary and release notes: CRITICAL/HIGH without an available fix
  (listed individually — Q-03 may tighten this), MEDIUM/LOW/UNKNOWN (counts), and findings in test/dev-only
  dependencies. The scanner's severity is used (vendor/distribution severity where the scanner prefers it, else
  CVSS/NVD — documented). The gate **fails closed**: if the vulnerability database cannot be downloaded/updated or
  a scan errors, the gate fails (never a silent pass). The policy is identical in release and dry-run mode; on PRs
  it is evaluated by the dry-run (AC-11). The policy text lives in the repository (AC-30) and the database
  version/timestamp used is recorded in the reports.
- **SCRUM-8-AC-22** — **Allow-list with justification and expiry:** exceptions are declared in **one versioned
  file** in the repository (e.g. `.trivyignore.yaml`, or an OpenVEX document — Architect's choice). Every entry
  must have: vulnerability ID (CVE/GHSA), scope (package and/or image/target it applies to — no global wildcards),
  justification (e.g. "not reachable: …"), owner or Jira key, and an **expiry date at most 90 days** after it was
  added. Entries without these fields, or with an expiry in the past, are **invalid**: they do not suppress the
  finding (so the gate fails again when an exception expires) and the pipeline reports them. Changes to the file
  go through PRs like code. The file starts empty unless the first scan requires justified entries, which are
  then listed in the PR.
- **SCRUM-8-AC-23** — **Scan reporting:** every scan run writes a job-summary table (per target: counts by
  severity, blocking findings with ID/package/installed/fixed version, gate verdict, allow-list entries applied,
  invalid/expired entries) and uploads full machine-readable reports (JSON, and SARIF) as workflow artifacts; on
  release the reports are Release assets (AC-10). SARIF should be uploaded to GitHub code scanning (Security tab;
  public repo) for push/PR runs where permissions allow (not from fork PRs).
- **SCRUM-8-AC-24** — **The gate is proven to block:** CI contains an automated negative test showing that the
  policy evaluation **fails** for (a) a fixture with a known fixable CRITICAL/HIGH vulnerability (e.g. a scan
  result fixture, or a pinned old vulnerable package/lockfile — no network-flaky dependence on a specific live
  image is preferred), (b) the same finding with a **valid** allow-list entry → passes, (c) with an **expired**
  entry → fails, (d) scanner/DB error → fails. Test names start with the AC ID.

### Immutability & Traceability

- **SCRUM-8-AC-25** — **Build once, publish what was verified:** within one release run, the jar, the frontend
  tarball and each image are built **exactly once**; scanning, SBOM generation, the (future SCRUM-9) e2e gate and
  publication all use those same bytes (e.g. images passed between jobs as OCI archives or pushed by digest only
  after the gate). The pipeline asserts that the pushed image digests equal the scanned/SBOM'd digests and that
  the uploaded jar/tarball checksums equal those computed at build time. No artefact is rebuilt in the publication
  job.
- **SCRUM-8-AC-26** — **Checksums:** the release has a `SHA256SUMS` asset (format compatible with
  `sha256sum -c`) covering every other release asset; the job summary lists the same checksums and the image
  digests. Dry-run produces the same file in the release-candidate bundle.
- **SCRUM-8-AC-27** — **End-to-end traceability chain:** from any released artefact one can reach the commit and
  from the commit the Jira stories, without external records:
  - running backend → `/actuator/info` `build.version` + `build.git-commit`; jar → manifest/`build-info`;
  - running frontend → `/build-info.json` `version` + `commit`; tarball → the same file;
  - image → tag `X.Y.Z-<sha7>`, labels `version`/`revision`, provenance attestation;
  - version → tag `vX.Y.Z` → commit; GitHub Release notes → Jira keys and commits since the previous release.
  `RELEASE.md` documents this chain with commands.
- **SCRUM-8-AC-28** — **Post-publish verification:** after publication the pipeline verifies, and fails loudly
  (with recovery instructions in the summary, AC-30) if any check fails: both images pulled by `X.Y.Z` resolve to
  the expected digests and carry the expected labels; `X.Y.Z-<sha7>`, `X.Y` and `latest` resolve to the same
  digests; `gh attestation verify` succeeds for the images and the downloaded jar/tarball; the downloaded release
  assets pass `sha256sum -c SHA256SUMS`; the remote tag `vX.Y.Z` points to the built commit.
- **SCRUM-8-AC-29** — **Repository-level protection documented and applied:** `RELEASE.md` specifies the
  repository settings that make releases tamper-resistant beyond the pipeline's own checks — at least a tag
  ruleset protecting `v*` tags from update and deletion, and GitHub's immutable-releases setting if available for
  the repository (Q-08; the Architect must check whether it requires creating the release as a draft and publishing
  after asset upload, and design the publish order accordingly). These are applied by the repository owner as part
  of the first-release procedure (AC-33) and recorded in the traceability matrix.

### Docs

- **SCRUM-8-AC-30** — **Release runbook `docs/release/RELEASE.md`:** covers: versioning rules (AC-01, incl. what
  counts as MAJOR/MINOR/PATCH here) and how versions and build versions are computed (AC-02/AC-03); how to cut a
  release (Actions UI and `gh workflow run …` with each input), how to do a dry-run, and what each job does;
  what is produced (assets, image tags, which tags are immutable vs moving); how to **verify** a release
  (`sha256sum -c`, `gh attestation verify` for files and images, reading the SBOMs, inspecting labels,
  `/actuator/info`, `/build-info.json`); the vulnerability policy (AC-21) and the allow-list process (AC-22) — or a
  link to a separate `docs/release/vulnerability-policy.md`; **failure recovery** (failure before publication →
  fix and re-run; failure after partial publication → what state may exist, the rule that a version number with
  any published artefact is "burnt" and the fix is the next patch version, never an overwrite); the **first-release
  procedure** (AC-33); and repository settings (AC-29).
- **SCRUM-8-AC-31** — **Rollback runbook `docs/release/ROLLBACK.md`:** rollback = **redeploy a previous immutable
  version** (`X.Y.Z` tag or, preferably, digest from that release's notes), never re-tagging or rebuilding;
  step-by-step with Compose (AC-15) incl. how to find the previous good version and verify the rollback
  (`/actuator/info` `build.version`, `/build-info.json`, UI footer/meta); **database caveat:** Flyway migrations are
  forward-only — rolling the application back does not roll back the schema; the runbook states the compatibility
  rule this implies (migrations must stay backward compatible with the previous release, expand/contract; a release
  with a non-backward-compatible migration is a MAJOR change and is flagged in its notes, AC-10), what happens when an
  older app starts against a newer schema (Flyway `validateOnMigrate`/future-migration behaviour — Architect to
  confirm and document), and that data restore from backup is outside this project's tooling; **roll forward:**
  `git revert` on `main` + new PATCH release; **withdrawing a bad release:** edit the release notes with a warning
  and move `latest`/`X.Y` forward by releasing a fix — never delete the tag, assets or images.
- **SCRUM-8-AC-32** — **README and ADRs:** the README gains a "Releases" section (where releases and images are,
  how to run a released version with Compose, link to the runbooks, the version scheme in one paragraph) and its
  Traceability/CI paragraphs are updated (build versions, new jobs/artifacts). ADR(s) record the versioning/release
  decision (A-01..A-05, A-08) and the vulnerability policy/tool choice (A-06, A-07, A-09), and amend ADR 0008/0010
  where they change (e.g. image tags, `VERSION` build arg source).
- **SCRUM-8-AC-33** — **First release after merge (post-merge acceptance):** after the PR is merged, the repository
  owner (or the Dev agent with owner approval) follows `RELEASE.md` to cut **`v0.1.0`** from `main`: dispatch the
  workflow, then verify per AC-28; set both GHCR packages to **public** and confirm they are linked to the repository
  (Q-09); apply the AC-29 settings. Evidence — run id, commit SHA, tag, image digests, `gh attestation verify`
  output, `sha256sum -c` output — is added to `docs/traceability/SCRUM-8.md` in a follow-up commit on `main` (or
  recorded in Jira if direct commits to `main` are not allowed). Until then, AC-06..AC-10, AC-13, AC-16, AC-28 are
  evidenced by dry-run plus the tested tooling (AC-12, AC-24) and marked "pending first release" in the matrix.

## 5. Non-functional requirements

- **SCRUM-8-NFR-01** — **Least privilege, no long-lived secrets:** workflow-level `permissions: contents: read`;
  only the publication job gets `contents: write`, `packages: write`, `id-token: write`, `attestations: write`
  (plus `security-events: write` only where SARIF is uploaded). Only `GITHUB_TOKEN` and OIDC are used (no PATs, no
  registry passwords). No `pull_request_target`; untrusted inputs (branch names, PR titles, dispatch inputs) are
  passed via `env` and validated, never interpolated into scripts (as ADR 0008 already does).
- **SCRUM-8-NFR-02** — **Pinned toolchain / supply chain of the pipeline:** in the release pipeline and all new
  steps, third-party actions are pinned to a full commit SHA (with the version in a comment); scanner, SBOM
  generator and other CLI tools are pinned to exact versions (and verified checksums where downloaded). The
  vulnerability database is the only intentionally floating input, and its version/timestamp is recorded (AC-21).
  Existing tag-pinned actions in `ci.yml` may stay tag-pinned (Q-10).
- **SCRUM-8-NFR-03** — **Reproducible builds:** release builds use only locked/pinned inputs (Maven Wrapper and
  dependency versions, `npm ci` with the lockfile, exact base-image tags per ADR 0010, pinned tools), so the same
  commit and version produce functionally identical artefacts. Timestamps embedded in artefacts should derive from
  the commit time (e.g. Maven `project.build.outputTimestamp`, `SOURCE_DATE_EPOCH` for the tarball/images) so the
  jar and tarball are **bit-for-bit reproducible**; the design states which artefacts achieve this, and dry-run
  should demonstrate it for the jar (two builds → same SHA-256, reported, not a hard gate). Base-image digests used
  are recorded (SBOM/labels/provenance).
- **SCRUM-8-NFR-04** — **Pipeline duration:** dry-run adds ≤ 15 minutes wall-clock to a PR's checks and runs in
  parallel with the existing jobs; a full release completes in ≤ 30 minutes (targets, reported in the PR/matrix).
  Existing jobs `identity`, `build`, `frontend`, `e2e` become no more than ~2 minutes slower each. Caches (Maven,
  npm, Buildx GHA cache, scanner DB) are used where they do not compromise AC-25.
- **SCRUM-8-NFR-05** — **Failure safety and ordering:** any failure before the publication job leaves **no** tag,
  image or release. The publication order is chosen to minimise and make obvious any partial state (e.g. push
  images by digest → create tag → create release → attest → verify, or draft-release-first if AC-29 requires);
  re-running a failed release never overwrites anything (AC-08) — it either completes missing steps for the same
  version and same commit if the design supports that safely, or refuses, and `RELEASE.md` says which.
- **SCRUM-8-NFR-06** — **Auditability:** every release and dry-run run writes a job summary with: mode
  (RELEASE / DRY RUN), trigger and actor, version and build version, full commit SHA, image tags and digests,
  checksums, SBOM file list, scan verdict with counts, allow-list entries applied, links to the release/artifacts.
  Release-candidate artifacts use ADR 0008 naming; release assets are permanent.
- **SCRUM-8-NFR-07** — **Maintainability:** non-trivial logic (version computation, pre-existence checks, policy
  evaluation, notes rendering, verification) lives in scripts under `.github/scripts/` that can be run locally,
  are linted (e.g. `shellcheck` for shell) in CI and tested per AC-12/AC-24 — not in long inline YAML blocks.
- **SCRUM-8-NFR-08** — **Determinism of CI results:** scans on PRs may change verdict when new CVEs are published
  (expected; the allow-list and fixes handle it), but nothing else in the pipeline depends on time, ordering or
  network races; version computation is pure given the tag set and input.
- **SCRUM-8-NFR-09** — **No functional regression / backward compatibility:** API and UI behaviour are unchanged;
  existing CI jobs keep their names, ADR 0008 Jira-key identity and artifact names (only the version inside changes
  per AC-03/AC-04); the developer workflow (`./mvnw spring-boot:run`, `./mvnw verify`, `npm run dev`, `npm test`,
  `docker compose up -d`, `docker compose --profile app up --build`) works unchanged **without network access to
  GHCR and without any Git tags**; all existing tests and coverage gates pass. Tests that assert version strings are
  only changed where this story intentionally changes them, listed in the design and PR.
- **SCRUM-8-NFR-10** — **Traceability (ADR 0004/0008):** commits `SCRUM-8: [ROLE] …` with `Refs: SCRUM-8`; design
  doc `docs/architecture/SCRUM-8-design.md`; ADR(s) per AC-32; matrix `docs/traceability/SCRUM-8.md` filled by Dev
  with dry-run CI evidence (and first-release evidence per AC-33); PR titled
  `SCRUM-8: Implement Versioning and Release Strategy` linking Jira, requirements, design, ADRs and matrix.
- **SCRUM-8-NFR-11** — **No sensitive data in release outputs:** release assets, SBOMs, notes, logs and summaries
  contain no tokens, credentials, environment dumps or internal paths beyond the repository; the only credentials in
  artefacts remain the documented local-development defaults of SCRUM-7 (Compose), which are not part of release
  assets. The image secret scan (AC-21) is the automated check.

## 6. Assumptions

Decisions below are defaults taken by PM so work is not blocked; the Architect confirms or replaces them (with an
ADR where marked).

- **A-01** — **One product version for backend + frontend** (ADR). They are one product, built and tested together
  (Compose e2e), shipped together, and SCRUM-7 already produced inconsistent per-component versions. Separate
  versioning would need per-component tags (`backend/v…`) and a compatibility matrix — not justified yet.
- **A-02** — **Git tags are the source of truth, stamped at build time, no commits back** (ADR). Rationale: simple,
  deterministic, no bot commits/PR loops on `main`, no branch-protection bypass. Consequence: `pom.xml`/`package.json`
  versions are placeholders for local builds only (documented in place); `package.json` `version` may be left as is
  or aligned to a placeholder — Architect's choice.
- **A-03** — **First release `0.1.0`**, matching the existing `0.1.0` placeholders and signalling "initial
  development" per SemVer §4 (public API not yet declared stable). `1.0.0` is a deliberate later decision (MAJOR
  bump input).
- **A-04** — **Manual trigger with explicit bump** instead of Conventional-Commits-derived versions: the existing
  commit convention (`SCRUM-<n>: [ROLE] …`, ADR 0004) carries no change-type semantics, and deriving bumps would
  require a new convention and enforcement. Revisit if the commit convention changes.
- **A-05** — **Registry: GHCR** (`ghcr.io/vinods21/todo-backend`, `ghcr.io/vinods21/todo-frontend`) — free for
  public repositories, authenticates with `GITHUB_TOKEN`, supports OCI attestations.
- **A-06** — **Scanner: Trivy recommended** (one tool for filesystem/lockfile, jar and image scanning, secret
  scanning, SARIF output, `.trivyignore.yaml` with per-entry `expired_at`/statement). Grype + Syft is an acceptable
  alternative. Architect decides (ADR).
- **A-07** — **SBOM format: CycloneDX JSON** — vulnerability-oriented, native Maven (`cyclonedx-maven-plugin`) and npm
  (`@cyclonedx/cyclonedx-npm`) generators, supported by Trivy/Syft for images and by GitHub `attest-sbom`. SPDX is not
  produced additionally.
- **A-08** — **Release build identity:** releases run on `main`, so the ADR 0008 Jira key in release artefacts is
  `main`; story traceability for a release comes from the release notes (Jira keys since the previous tag), not from
  the build identity. ADR 0008 is otherwise unchanged.
- **A-09** — **Provenance and signing via GitHub artifact attestations** (Sigstore keyless, verifiable with
  `gh attestation verify`), free for public repositories. No separate cosign signing with managed keys (Q-05).
- **A-10** — **Non-release images are not pushed** (only release images reach GHCR), to keep the registry free of
  per-commit images and avoid a retention policy (Q-01).
- **A-11** — **linux/amd64 only** — matches the CI runners and the SCRUM-7 images; multi-arch would double image
  build/scan time (Q-04).
- **A-12** — **Reference runtime is Docker Compose** (SCRUM-7); there is no deployed environment, so rollback is
  documented and exercisable with Compose (AC-15, AC-31).

## 7. Open questions

- **Q-01** — Publish build-version images (`X.Y.Z-<sha7>`) from `main` pushes to GHCR as "snapshot" images? Default:
  **no** (A-10); candidate follow-up with a retention policy. (Non-blocking.)
- **Q-02** — Protect releases with a GitHub Environment `release` (required reviewer, branch restriction `main`)?
  Default: environment **should** be used for branch restriction; required reviewer optional (single-maintainer repo).
  Architect decides. (Non-blocking.)
- **Q-03** — Policy strictness: (a) should **unfixed** CRITICAL vulnerabilities also block (requiring allow-list
  entries)? Default: **no**, reported only (AC-21), because they cannot be fixed by the project and would block all
  releases until upstream ships a fix. (b) Should a gate failure fail the **PR dry-run** (making unrelated PRs red when a
  new CVE appears in a base image)? Default: **yes** — it is a real release blocker, best seen early; the allow-list
  is the escape hatch. Product owner to confirm both. (Non-blocking.)
- **Q-04** — Multi-arch images (linux/arm64 for Apple-silicon developers)? Default: **no** (A-11). (Non-blocking.)
- **Q-05** — Additional cosign signatures (keyless) on images beyond GitHub attestations? Default: **no** — attestations
  are Sigstore-signed and verifiable; revisit if a consumer requires `cosign verify`. (Non-blocking.)
- **Q-06** — Hotfix releases for an older line (e.g. `0.1.1` after `0.2.0`)? Default: **not supported**; releases are
  cut from `main` only and fixes roll forward. Requires maintenance branches — follow-up if needed. (Non-blocking.)
- **Q-07** — Build version when `<sha7>` is all digits with a leading zero (e.g. `0123456`, invalid as a SemVer numeric
  identifier): keep as is (still a valid Docker tag, documented exception), lengthen the SHA, or prefix (e.g.
  `X.Y.Z-g0123456`)? Default: Architect's choice, applied identically everywhere and tested (AC-12). The Jira example
  form `1.2.0-a1b2c3d` must hold for the normal case. (Blocking for design, not for PM.)
- **Q-08** — Enable GitHub **immutable releases** on the repository? Default: **yes, if available** (AC-29); the
  Architect checks its interaction with the publish order (draft → upload → publish) and with re-runs (NFR-05).
  (Blocking for design.)
- **Q-09** — GHCR package visibility: packages first pushed by a workflow may start **private** even for a public
  repository. Default: owner makes them public once after the first release (AC-33); the post-publish verification in
  that first run must not depend on anonymous pulls. Architect to confirm the actual behaviour. (Non-blocking.)
- **Q-10** — Pin all existing actions in `ci.yml` by SHA as well (NFR-02 only requires it for the release pipeline and
  new steps)? Default: **no** in this story, to keep the diff focused; follow-up together with Dependabot for actions.
  (Non-blocking.)
- **Q-11** — The repository has no `LICENSE` file, so images use `org.opencontainers.image.licenses=NOASSERTION` and
  SBOMs cannot state the product licence. Add one? Default: out of scope — product owner decision. (Non-blocking.)
- **Q-12** — Should the UI footer also show the version (today `<JIRA_KEY> · <short sha>`)? Default: **no** UI change
  (NFR-09); the version is available in `/build-info.json`, the meta tag and `/actuator/info`. (Non-blocking.)

## 8. Traceability matrix

Skeleton — filled by Dev in [`docs/traceability/SCRUM-8.md`](../traceability/SCRUM-8.md) with code, test and CI
evidence (dry-run run id, commit SHA, release-candidate and scan-report artifacts; after merge, first-release evidence
per AC-33).

| ID | Description | Verification (to be filled) |
|---|---|---|
| SCRUM-8-AC-01 | SemVer `MAJOR.MINOR.PATCH`, one product version, `v` tag prefix, first release `0.1.0` | AC-12 tests; RELEASE.md review |
| SCRUM-8-AC-02 | Next version from highest SemVer `v*` tag + bump/explicit input; rejections | version-script unit tests (AC-12); dry-run summary |
| SCRUM-8-AC-03 | Build versions `X.Y.Z-<sha7>` (next patch after last release) for non-release builds | unit tests; CI `build`/`frontend`/`e2e` identity checks |
| SCRUM-8-AC-04 | Same version in jar name/manifest/build-info/`/actuator/info`, `build-info.json`/meta, image labels/tags | CI verify steps; `verify-images.sh`; e2e/http check |
| SCRUM-8-AC-05 | Tags are source of truth; no commits to `main` by the pipeline | workflow review; design |
| SCRUM-8-AC-06 | `workflow_dispatch` inputs; main-only, untagged commit, one release at a time | workflow review; guard tests / dry-run on non-main ref |
| SCRUM-8-AC-07 | Tests, SBOM, scan gates before publish; `release-gate` insertion point for SCRUM-9 | workflow review; dry-run run |
| SCRUM-8-AC-08 | Refuse if tag / release / GHCR tag exists; never overwrite | AC-12 tests; dry-run read-only check |
| SCRUM-8-AC-09 | Annotated tag `vX.Y.Z` on the built commit, no bot commit | first release (AC-33) |
| SCRUM-8-AC-10 | GitHub Release with assets and generated notes (digests, Jira keys, migrations, scan summary) | dry-run rendered notes; first release |
| SCRUM-8-AC-11 | Dry-run on PR/push/dispatch: everything but publication, read-only, candidate bundle | dry-run CI run + artifact `todo-release-candidate-<key>-<sha>` |
| SCRUM-8-AC-12 | Release tooling unit-tested (version, build version, pre-existence, allow-list) | test reports in CI |
| SCRUM-8-AC-13 | GHCR images, tags `X.Y.Z`, `X.Y.Z-<sha7>` (immutable), `X.Y`, `latest` (moving), same digest | dry-run tag plan; first release + AC-28 |
| SCRUM-8-AC-14 | OCI labels version/revision/source/created/jira (+ base name) | `verify-images.sh` |
| SCRUM-8-AC-15 | Non-release images versioned, not pushed; Compose runs published images by repo/tag override | CI `e2e`; Compose config check |
| SCRUM-8-AC-16 | Provenance attestations for jar, tarball, image digests; `gh attestation verify` | first release + AC-28 |
| SCRUM-8-AC-17 | Four CycloneDX SBOMs, schema-valid, non-empty, carry version + commit | dry-run artifacts; validation step |
| SCRUM-8-AC-18 | SBOMs as release assets (+ image SBOM attestations); workflow artifacts in dry-run | dry-run bundle; first release |
| SCRUM-8-AC-19 | Maven + npm dependency scanning on PR/push/release | dry-run scan step + reports |
| SCRUM-8-AC-20 | Container scanning (OS, language packages, secrets) for both images | dry-run scan step + reports |
| SCRUM-8-AC-21 | Gate: fixable CRITICAL/HIGH or any image secret fails; fail closed; same in dry-run | AC-24 tests; dry-run verdict |
| SCRUM-8-AC-22 | Allow-list file: ID, scope, justification, owner, expiry ≤ 90 days; invalid/expired → no suppression | AC-12/AC-24 tests |
| SCRUM-8-AC-23 | Scan job summary, JSON + SARIF artifacts, SARIF to code scanning | dry-run summary + artifacts |
| SCRUM-8-AC-24 | Negative tests: vulnerable fixture fails, allow-listed passes, expired fails, scanner error fails | CI test step |
| SCRUM-8-AC-25 | Build once; pushed digests and asset checksums equal the verified ones | workflow review; digest assertion step |
| SCRUM-8-AC-26 | `SHA256SUMS` over all assets; checksums in summary | dry-run bundle; first release |
| SCRUM-8-AC-27 | Traceability chain artefact ↔ commit ↔ Jira documented with commands | RELEASE.md; e2e/http identity checks |
| SCRUM-8-AC-28 | Post-publish verification (digests, tags, attestations, checksums, tag → commit) | first release run |
| SCRUM-8-AC-29 | `v*` tag ruleset and immutable releases documented and applied | RELEASE.md; first-release record |
| SCRUM-8-AC-30 | `docs/release/RELEASE.md` (versioning, cut, dry-run, verify, policy, recovery, first release) | PR review |
| SCRUM-8-AC-31 | `docs/release/ROLLBACK.md` (redeploy previous immutable version, Flyway caveat, roll forward, withdraw) | PR review |
| SCRUM-8-AC-32 | README "Releases" section; ADR(s); ADR 0008/0010 amendments | PR review |
| SCRUM-8-AC-33 | First release `v0.1.0` after merge; packages public; settings applied; evidence recorded | post-merge matrix update |
| SCRUM-8-NFR-01 | Least-privilege permissions; GITHUB_TOKEN/OIDC only; no `pull_request_target` | workflow review |
| SCRUM-8-NFR-02 | Actions pinned by SHA, tools by exact version; DB version recorded | workflow review |
| SCRUM-8-NFR-03 | Reproducible inputs; commit-time timestamps; jar reproducibility demonstrated | dry-run double-build report |
| SCRUM-8-NFR-04 | Dry-run ≤ 15 min; release ≤ 30 min; existing jobs ≤ ~2 min slower | CI run timings |
| SCRUM-8-NFR-05 | No partial state before publish; safe ordering; safe re-runs | design; RELEASE.md recovery section |
| SCRUM-8-NFR-06 | Job summary with mode, version, SHA, digests, checksums, verdict | dry-run summary |
| SCRUM-8-NFR-07 | Logic in tested, linted scripts under `.github/scripts/` | shellcheck step; AC-12 tests |
| SCRUM-8-NFR-08 | Deterministic pipeline apart from CVE feed | design review |
| SCRUM-8-NFR-09 | No functional regression; local workflow works without tags/GHCR | existing CI jobs green |
| SCRUM-8-NFR-10 | ADR 0004/0008 conventions; design, ADRs, matrix, PR | design doc, ADRs, matrix, PR |
| SCRUM-8-NFR-11 | No sensitive data in release outputs | image secret scan; asset review |
