# ADR 0015 — Pre-release e2e gate: Playwright against the exact release-candidate images inside `Release`, shared through composite actions

- Status: Accepted
- Date: 2026-11-20
- Jira: [SCRUM-9](https://suranagivinod.atlassian.net/browse/SCRUM-9) — SCRUM-9-AC-01..AC-16, NFR-01..NFR-06;
  assumptions A-01..A-07; open questions Q-01..Q-04 (defaults confirmed here)
- **Amends:**
  - [ADR 0012](0012-end-to-end-testing-playwright.md) — "CI: new job `e2e` in workflow `CI`" is no longer the only
    place e2e runs: the compose suite also runs in workflow `Release` (job `e2e-release`) against the release images
    and is a **release gate**. Specs covering the critical To-Do workflows carry the tag `@critical`, guarded in
    `e2e-release`. The CI job's Playwright install and teardown/report steps move into shared composite actions
    (same commands, same artifact).
  - [ADR 0013](0013-versioning-and-release-process.md) — §3 job graph: `images` → `sbom` ∥ `scan` ∥ **`e2e-release`**
    → `release-gate`; the SCRUM-9 insertion point is filled. §6 (Q-10 "existing `ci.yml` actions stay tag-pinned"):
    the `actions/cache` and `actions/upload-artifact` steps of CI job `e2e` are now SHA-pinned via the shared
    composites; the other `ci.yml` actions stay as they are.
- Design: [SCRUM-9 design](../architecture/SCRUM-9-design.md)

## Context

`Release` builds the jar and bundle once, packages them once into two OCI archives, scans and SBOMs those archives and
pushes exactly them (SCRUM-8-AC-25). The e2e suite (ADR 0012) runs only in `CI`, against images built **from source**
in another workflow — different bytes, different digests, a different Dockerfile path (`source` vs `prebuilt`). So the
artefact that is published has never been exercised end to end, and an e2e failure does not stop a release. SCRUM-8
left a marked slot in `release-gate` for this story.

Forces: the gate must test **the same digests** that are published; must not rebuild or pull (that would test
something else); must run identically in dry-run (every PR) and release mode; must be fork-safe with a read-only
token; must not duplicate the CI e2e plumbing; must work whichever image store (classic or containerd) the hosted
runner's Docker Engine uses.

## Decision

1. **Job `e2e-release` in `release.yml`**, `needs: [version, images]`, parallel to `sbom`/`scan`, both modes, read-only
   token, no registry login; **`release-gate.needs` includes it**. `publish`/`verify` are unchanged and therefore can
   only run after a successful e2e result for the same run (any non-`success` result, `skipped` included, fails
   `release-gate`).
2. **Load, don't rebuild:** download `todo-release-images-<KEY>-<sha>`; assert each archive's manifest digest equals
   the `images` output (= scanned, SBOM'd, to-be-pushed digest); `docker load -i <archive>.oci.tar` and tag it as
   `ghcr.io/vinods21/todo-<svc>:<version>`; start Compose with the SCRUM-8-AC-15 overrides via
   `docker compose up -d --no-build --pull never --wait` (PostgreSQL pulled explicitly before).
3. **Digest chain, store-aware:** the running container's `.Image` must equal the local `Image.Id`, which must equal
   the archive's **config** digest on the classic store or its **manifest** digest on the containerd store; the
   archive's manifest digest is the published one. The store is detected (`docker info` `DriverStatus`) and recorded.
   Checked after `up` and again after the lifecycle restarts. Implemented in `.github/scripts/release/e2e-images.sh`.
4. **What runs:** the **full** compose Playwright suite (not a subset — it takes minutes) with the candidate's
   identity (`E2E_VERSION` = stamped version) on a fresh volume, then a guard (`e2e-gate.mjs`, unit-tested) that at
   least 12 `@critical` tests ran and all passed (skipped = fail); plus the unchanged `verify-images.sh` and
   `verify-lifecycle.sh`, which test properties of the shipped images. The dev-mode smoke does not run pre-release
   (it tests the Vite developer set-up, not an artefact).
5. **Flakes:** the existing single retry in CI (`retries: 1`) applies; passed-on-retry tests do not block but are
   named in the summary and raised as warnings (SCRUM-9 Q-01 default). No other retries.
6. **Reuse via two composite actions** — `.github/actions/e2e-playwright` (deps + cached Chromium) and
   `.github/actions/e2e-teardown` (summary, failure diagnostics, Compose logs, `down -v --remove-orphans`, artifact
   upload; caller passes `job.status`). Both CI `e2e` and `e2e-release` use them; each job keeps its own image source,
   stack start and Playwright invocation.
7. **Artifact** `todo-release-e2e-<KEY>-<sha>-reports` (ADR 0008 naming): Playwright HTML/JUnit/JSON, failure traces,
   Compose ps/logs, digest record — always uploaded, 30 days (same as the release candidate).
8. **Pinning:** only action SHAs already pinned in `release.yml`; no new actions or CLIs.

## Alternatives considered

- **Reusable workflow (`workflow_call`) for all e2e:** one job definition, but the CI job builds its images from source
  in the same job while `e2e-release` loads archives — the reusable workflow would need an image-source switch with
  both paths (build actions included) and its summary/artifact nesting differs. Composites share exactly the common
  part. Rejected.
- **Copy the CI steps into `release.yml`:** simplest, but two copies of browser caching, diagnostics and teardown
  drift. Rejected.
- **Rebuild images in the e2e job (or reuse the CI `e2e` result via `workflow_run`/API):** tests different bytes;
  defeats the purpose. Rejected.
- **`skopeo copy oci-archive:… docker-daemon:…`** (as the `images` job does): converts to a docker-archive; on the
  containerd store the stored manifest is a converted one whose digest matches nothing in the archive, so the chain
  cannot be asserted. Kept only as a classic-store fallback.
- **Local registry (`registry:2` service) + `skopeo copy --preserve-digests` + Compose by `TODO_*_TAG=<v>@sha256:<digest>`:**
  gives manifest-digest equality on any store, but adds a third-party service image, insecure-registry plumbing and a
  pull path into the gate. The config-digest chain is equally binding (the config hashes every layer's content).
  Rejected for now; the fallback if R1/R2 of the design materialise.
- **Run e2e inside the `images` job:** no artifact round-trip, but lengthens the critical path before `sbom`/`scan` and
  merges two gate signals into one job. Rejected.
- **Critical-only subset pre-release:** faster by ~1 min at the cost of coverage; the tag is used as a *guard*, not a
  filter. Rejected.
- **Post-publish e2e against GHCR:** valuable but cannot block publication; follow-up (SCRUM-9 Q-04).

## Consequences

- Every PR's `Release` dry-run proves the gate end to end; a release cannot publish images that failed e2e.
- Dry-run wall-clock grows by about 3 minutes (e2e is longer than `scan`); still within SCRUM-8-NFR-04.
- The CI e2e job and `e2e-release` share caches (same key) and plumbing; a change to teardown/report handling is made
  once.
- The digest check depends on the runner's image-store semantics; the store type is recorded per run so a runner
  image change is visible, and the check fails closed rather than accepting an unexplained ID.
- `@critical` is part of the test contract: removing the tag from a test, or adding critical tests, requires updating
  `--min` in `release.yml` (deliberate, reviewed).
- The CI `e2e` job stays (source-mode Dockerfile path, hadolint, dev-mode smoke, fast feedback — SCRUM-9 Q-02).
