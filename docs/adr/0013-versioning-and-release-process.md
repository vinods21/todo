# ADR 0013 — One SemVer product version from Git tags; build-time stamping; one `Release` workflow with dry-run parity and draft-first, immutable publication

- Status: Accepted
- Date: 2026-11-18
- Jira: [SCRUM-8](https://suranagivinod.atlassian.net/browse/SCRUM-8) — SCRUM-8-AC-01..AC-16, AC-25..AC-29, AC-33,
  NFR-01, NFR-02, NFR-03, NFR-05; assumptions A-01..A-05, A-08, A-10..A-12; open questions Q-01, Q-02, Q-04, Q-06,
  Q-07, Q-08, Q-09, Q-10 (decided here)
- **Amends:** [ADR 0004](0004-traceability-conventions.md) — "Maven `<version>` stays semantic (`0.1.0-SNAPSHOT`)"
  is replaced by §2 below (`${revision}`, placeholder `0.0.0-SNAPSHOT`). [ADR 0008](0008-ci-derived-build-identity.md)
  — the Jira-key derivation moves from inline YAML into `.github/scripts/release/version.mjs identity` (same regex,
  same outputs) and job `identity` additionally outputs `build_version`. [ADR 0010](0010-container-images-and-build-identity.md)
  — `VERSION` build argument now carries the product/build version (not the pom/package.json value), both Dockerfiles
  gain a `prebuilt` artefact mode, images gain `org.opencontainers.image.base.name`, and CI images are additionally
  tagged with the build version.
- Related: [ADR 0014](0014-vulnerability-scanning-policy.md) (SBOM, scanning, gate, attestations)
- Design: [SCRUM-8 design](../architecture/SCRUM-8-design.md)

## Context

Nothing is ever released (SCRUM-8 §1): no versions (`pom.xml` `0.1.0-SNAPSHOT` vs `package.json` `0.1.0`, never
changed), no tags, no registry, no runbooks. The repository is public, single-maintainer, with a protected `main` and
a PM → Architect → Dev pipeline that can only run a real release *after* merge, so the pipeline must be provable in a
dry-run on PRs. Verified on 2026-11-18 through the REST API: no tags, no releases, no rulesets;
`GET /repos/vinods21/todo/immutable-releases` → `{"enabled":false,"enforced_by_owner":false}` (feature available,
not enabled).

## Decision

### 1. Versioning scheme (A-01..A-04, Q-06, Q-07)

- **One product version** `MAJOR.MINOR.PATCH` (SemVer 2.0.0) for jar, frontend bundle and both images. Git tag
  `vX.Y.Z` (annotated) is the **only** source of truth; the version without `v` is used everywhere else. First
  release `0.1.0`. MAJOR = breaking REST API change or non-backward-compatible DB migration; MINOR = new
  backward-compatible feature; PATCH = fixes, dependency/base-image updates (written down in `RELEASE.md`).
- **Release tag pattern:** `^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`; every other tag is ignored. Highest tag by
  SemVer precedence.
- **Next version:** bump `major|minor|patch` of the highest release tag, or an explicit `X.Y.Z` that is valid and
  strictly greater; no release tag → `0.1.0` for any bump. Releases are cut from `main` only, rolling forward
  (no maintenance branches, Q-06).
- **Build version** (every non-release build — CI `build`/`frontend`/`e2e`, dry-run): `X.Y.Z-<id>` where `X.Y.Z` is
  the next **patch** after the highest release tag (`0.1.0` before the first release) and `<id>` is derived from the
  first 7 lower-case hex characters of the commit SHA (`<sha7>`):
  - `<id> = <sha7>` — the Jira shape `1.2.0-a1b2c3d` — **unless** `<sha7>` matches `^0[0-9]{6}$` (all digits with a
    leading zero, which SemVer §9 forbids as a numeric pre-release identifier);
  - then `<id> = g<sha7>` (e.g. `1.2.1-g0123456`), the `git describe` convention.
  This is deterministic, always valid SemVer and a valid Docker tag, and keeps the Jira form in ≈ 99.6 % of commits
  (P(all-digit with leading zero) = 1/16 · (10/16)⁶ ≈ 0.37 %). Rejected: `+<sha7>` build metadata (Docker tags
  forbid `+`; contradicts the Jira example); always prefixing `g` (contradicts the Jira example for every build);
  a longer SHA (reduces but does not remove the case); keeping the invalid form (breaks SemVer tooling).
  All-digit SHAs *without* a leading zero (e.g. `1234567`) are valid numeric identifiers and stay unprefixed;
  ordering *between* build versions of the same `X.Y.Z` is meaningless by design (commit hashes are not ordered).
- **Release image alias tag** `X.Y.Z-<id>` uses the same `<id>` rule with the *release* `X.Y.Z` (an alias of the
  same digest as `X.Y.Z`, so the commit is visible in the tag list).
- **Local builds** (no CI, no tags): `0.0.0-SNAPSHOT` — valid SemVer, sorts below every release, obviously not a
  release, needs no Git metadata (NFR-09).

### 2. Stamping without commits (AC-04, AC-05)

- **Maven CI-friendly version:** `<version>${revision}</version>` with `<revision>0.0.0-SNAPSHOT</revision>`; CI and
  the release pipeline pass `-Drevision=<version>`. `project.version` then drives the jar name
  (`todo-backend-<version>.jar`), manifest `Implementation-Version` and `build-info` `build.version`
  (→ `/actuator/info`). No flatten plugin: the project is never `install`ed/`deploy`ed as a Maven artefact (release
  assets are files on GitHub Releases, A-10/out of scope Maven Central); `${revision}` is native since Maven 3.5.
  Rejected: `versions:set` (rewrites `pom.xml` in the workspace, extra plugin, easy to commit by accident); a second
  property only for the manifest (three places would disagree).
- **Frontend:** `vite.config.ts` reads `APP_VERSION` (default `0.0.0-SNAPSHOT`) into `dist/build-info.json`
  (`version` field) and `<meta name="build-info" content="<jira> <commit> <version>">` (third token added; the first
  two unchanged). `package.json` `version` becomes the placeholder `0.0.0-SNAPSHOT` (lockfile root updated by npm).
- **Images:** `--build-arg VERSION=<version>` (default `0.0.0-SNAPSHOT`) feeds `-Drevision`/`APP_VERSION` in the
  build stage and the `org.opencontainers.image.version` label. Compose passes `${TODO_VERSION:-0.0.0-SNAPSHOT}` to
  both (replacing `TODO_BACKEND_VERSION`/`TODO_FRONTEND_VERSION`, A-01).
- **Commit time** (`git log -1 --format=%ct`) is passed as `-Dproject.build.outputTimestamp=<epoch>` and
  `SOURCE_DATE_EPOCH` in the release pipeline (NFR-03).
- The pipeline **never commits or pushes a branch**; the only write to Git is creating the tag object + ref.

### 3. One workflow `Release` (`.github/workflows/release.yml`), two modes (AC-06, AC-07, AC-11)

- Triggers: `push` (`feature/**`, `main`), `pull_request`, `workflow_dispatch` (`bump`, `version`, `dry_run`).
  Mode `release` ⇔ `workflow_dispatch` ∧ `dry_run == false`; everything else is `dry-run`. A release dispatched on a
  ref other than `refs/heads/main` is **refused** by the `version` job (not silently downgraded).
- Same job graph in both modes: `version` → `backend` ∥ `frontend` → `images` → `sbom` ∥ `scan` → **`release-gate`**
  (+ `tooling` tests) → `publish` → `verify`. `publish`/`verify` run only in `release` mode. `ci.yml` keeps its jobs
  and names (NFR-09); it only gains build versions.
- **Tests run inside the release pipeline** (`./mvnw verify`, frontend lint/typecheck/`test:coverage`) on the exact
  commit, rather than trusting a separate `CI` run (AC-07 option 1): self-contained, no cross-workflow API lookups,
  and the jar that is tested is the jar that ships.
- **Build once** (AC-25): the `backend` job's tested jar and the `frontend` job's tarball are the artefacts; the
  images are built **from those bytes** (Dockerfile `prebuilt` mode via BuildKit named contexts), exported once as
  OCI archives, scanned/SBOM'd from the archives, and pushed from the same archives with `skopeo copy
  --preserve-digests`. The default Dockerfile mode (`source`) is unchanged for local use and the CI `e2e` job.
- `release-gate` is the single aggregation point that `publish` needs; SCRUM-9 adds its e2e job (consuming the OCI
  archive artifact) to its `needs`.
- Concurrency: one group `release-publish` for real releases (`cancel-in-progress: false`); dry-runs per ref.
- Least privilege (NFR-01): workflow `contents: read`; `publish` alone has `contents/packages/id-token/attestations:
  write` and runs in GitHub Environment **`release`** restricted to `main` (Q-02: yes, branch policy; no required
  reviewer — single maintainer; can be added later without code change). A SARIF-upload job has
  `security-events: write` and does not run for fork PRs.

### 4. Registry and tags (A-05, A-10, A-11, Q-01, Q-04, Q-09)

- GHCR `ghcr.io/vinods21/todo-backend`, `ghcr.io/vinods21/todo-frontend`, linux/amd64 only. Release tags: `X.Y.Z`,
  `X.Y.Z-<id>` (immutable — enforced by the pre-existence check, never re-pushed), `X.Y`, `latest` (moving; not for
  deployment/rollback). Only releases push (Q-01: no snapshot images). Packages start private when first pushed by a
  workflow; the owner makes them public once (AC-33); post-publish verification authenticates with `GITHUB_TOKEN`
  (`packages: read`) so it does not depend on anonymous pulls.

### 5. Publication order, immutability, re-runs (AC-08..AC-10, AC-16, AC-28, AC-29, Q-08, NFR-05)

1. Re-check pre-existence authoritatively (tag, release incl. drafts, all four GHCR immutable tags) — fail closed.
2. Re-verify the candidate bundle (`sha256sum -c`) and OCI digests against the gate's outputs.
3. Push immutable image tags by digest; assert each pushed manifest digest.
4. Attest images (SLSA provenance + CycloneDX SBOM, pushed to GHCR) and release files (provenance).
5. Create the **annotated** tag `vX.Y.Z` via the Git Data API (tag object + ref) on the built commit.
6. Create the GitHub Release as a **draft** with all assets (`--verify-tag`), then **publish** it (`latest`).
7. Move `X.Y` and `latest`.
8. Job `verify` re-checks everything from the outside (AC-28).

Immutable releases (Q-08) are **available and will be enabled** in the first-release procedure: once published, the
tag and assets are locked and GitHub generates a release attestation; the draft → upload → publish order above is
exactly what the feature requires. A `v*` tag ruleset (block update + deletion) is added too (AC-29). **Re-runs never
resume:** any published artefact "burns" the version — the pre-existence check refuses, and the operator dispatches
the next patch explicitly (`version=X.Y.(Z+1)`); `RELEASE.md` lists the possible partial states per step.

### 6. Pinning (NFR-02, Q-10, Q-05)

All actions in `release.yml` and every new step in `ci.yml` are pinned to full commit SHAs (version in a comment);
existing tag-pinned actions in `ci.yml` stay (Q-10). Downloaded CLIs are pinned by version **and** SHA-256 in one
script. No cosign (Q-05): GitHub artifact attestations are Sigstore-signed and verifiable with `gh attestation verify`.

## Alternatives considered

- **Extend `ci.yml` with release jobs** instead of a new workflow: one file, but `workflow_dispatch` inputs, the
  `release` environment and write permissions would live next to every existing job and every story's CI edits;
  rejected for blast radius. Cost of the separate workflow: the backend test suite runs twice per PR (in parallel).
- **semantic-release / release-please** (version from commit messages, version-bump PRs): needs a commit convention
  we do not have (A-04) and commits/PRs to `main` (contradicts AC-05).
- **Build images from source in Docker and extract the jar from the image as the release asset**: one build, but
  tests would run against a different build of the jar; rejected for the `prebuilt` mode.
- **Push images first to a staging tag then retag**: leaves per-run garbage in GHCR (Q-01) and needs cleanup.
- **Release without draft** (create tag → release with assets in one call): incompatible with immutable releases if
  any upload fails mid-way; rejected.
- **Per-component versions** (`backend/v…`, `frontend/v…`): needs a compatibility matrix; rejected (A-01).

## Consequences

- Every artefact of every build carries a version; release `X.Y.Z` and build `X.Y.Z-<id>` are visible in
  `/actuator/info`, `/build-info.json`, the meta tag, jar name/manifest and image labels/tags.
- `pom.xml`/`package.json` versions are inert placeholders (`0.0.0-SNAPSHOT`) — documented in place and in README.
- First real release only after merge (workflow must exist on the default branch for `workflow_dispatch`); until then
  evidence is the dry-run plus unit-tested tooling.
- A failed publication burns a version number; this is deliberate (no overwrite, ever).
- Dockerfiles gain a second (prebuilt) path that only the release pipeline uses; the CI `e2e` job keeps exercising
  the source path, the release dry-run the prebuilt path — both on every PR.
