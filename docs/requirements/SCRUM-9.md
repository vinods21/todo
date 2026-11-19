# SCRUM-9 — Implement Pre-Release E2E Tests in GitHub Actions: Refined Requirements

| Field | Value |
|---|---|
| Jira key | [SCRUM-9](https://suranagivinod.atlassian.net/browse/SCRUM-9) |
| Type / Priority | Story |
| Parent epic | SCRUM-5 — Build a To-Do Application (Spring Boot, React, PostgreSQL, REST APIs) |
| Depends on | SCRUM-7 (images, Compose, Playwright e2e — [ADR 0010](../adr/0010-container-images-and-build-identity.md)–[0012](../adr/0012-end-to-end-testing-playwright.md)), SCRUM-8 (workflow `Release`, `release-gate` insertion point — [ADR 0013](../adr/0013-versioning-and-release-process.md)), SCRUM-10 — all merged (`main` = `8beb5aa`, `CI` and `Release` dry-run green) |
| Branch | `feature/SCRUM-9-pre-release-e2e` |
| Author role | Product Manager (PM → Architect → Dev pipeline) |
| Status | Draft — ready for architecture |

**Traceability:** Every requirement has a stable ID (`SCRUM-9-AC-xx`, `SCRUM-9-NFR-xx`). Design, workflow steps,
scripts, test tags, commits (`SCRUM-9: [ROLE] …` + `Refs: SCRUM-9`) and CI evidence reference them per
[ADR 0004](../adr/0004-traceability-conventions.md) (as amended by ADR 0008 / 0013). Dev fills
`docs/traceability/SCRUM-9.md`.

**Requirement keywords:** "must" = mandatory for acceptance; "should" = expected unless the design justifies a
deviation; "may" = Architect's option.

---

## 1. Problem statement

Most of the machinery exists already:

- **SCRUM-7** added the CI job `e2e` (workflow `CI`): it builds both images **from source** (Dockerfile `source` mode),
  starts the Compose stack (PostgreSQL + backend + frontend), runs the Playwright suite (compose mode + dev-mode
  smoke), the image checks and the lifecycle/persistence script, uploads `todo-e2e-<KEY>-<sha>-reports` and tears
  down with `down -v`.
- **SCRUM-8** added the workflow `Release`: `version` → `backend` ∥ `frontend` (tested jar / bundle) → `images`
  (built **once** from those bytes into OCI archives, artifact `todo-release-images-<KEY>-<sha>`) → `sbom` ∥ `scan`
  → **`release-gate`** → `publish` → `verify`. `release-gate` is the single aggregation point and carries an explicit
  "SCRUM-9 adds its e2e job here" marker (SCRUM-8-AC-07, design §6.5).

What is missing — and what this story delivers:

1. **The images that get published are never e2e-tested.** The CI `e2e` job tests *different* images (built from
   source in another workflow, different digests, different Dockerfile path). Nothing proves that the release
   candidate — the exact OCI archives `publish` pushes to GHCR — boots in Compose and serves the To-Do workflows.
2. **E2E is not a release gate.** A red CI `e2e` job does not stop `Release`; `release-gate` does not depend on any
   e2e result (SCRUM-8 deliberately left this to SCRUM-9).

SCRUM-9 adds a pre-release e2e job **inside** the `Release` workflow that runs against the **exact release-candidate
images (same digests, no rebuild, no pull)** and makes it a required input of `release-gate`, so that nothing is
published unless e2e passed — in release mode and, identically, in every dry-run on PRs and pushes.

Jira acceptance criteria (verbatim) and where they are refined:

| Jira AC | Refined in |
|---|---|
| Configure an E2E testing job in GitHub Actions. | AC-01, AC-02 |
| Start backend, frontend, and PostgreSQL using Docker Compose. | AC-03, AC-04, AC-05 |
| Execute Playwright tests for critical To-Do workflows. | AC-06, AC-07, AC-08, AC-09 |
| Block the release if E2E tests fail. | AC-10, AC-11 |
| Publish test reports and failure logs as workflow artifacts. | AC-12, AC-13 |
| Clean up containers after execution. | AC-14 |
| Trigger release jobs only after successful E2E validation. | AC-10, AC-15 |

## 2. Scope

### In scope
- A new job in `.github/workflows/release.yml` that loads the release-candidate OCI archives into the runner's Docker
  daemon, starts the Compose stack on them, proves the running containers are those images, runs the Playwright
  compose suite plus the existing image and lifecycle checks, publishes reports and logs, and always cleans up.
- Wiring that job into `release-gate.needs` (and thereby before `publish` / `verify`).
- Reuse of the CI `e2e` steps (Playwright install/caching, summary, diagnostics, log collection, teardown, report
  upload) through a shared mechanism instead of a copy; the CI `e2e` job may be refactored onto it **without
  behaviour change**.
- Tagging the specs that cover the critical To-Do workflows (`@critical`) and a guard that the pre-release run
  executed and passed all of them.
- Small, tested helper scripts under `.github/scripts/` (image loading, digest assertion, critical-test guard).
- Docs: `docs/release/RELEASE.md` (job table, artifacts, failure recovery, local reproduction), ADR(s), amendment
  notes on ADR 0012 / 0013, this story's design and traceability matrix.

### Out of scope
- **Changing what the tests test** — no new functional scenarios, no rewritten specs; only tags (and, if needed, a
  test-data/env tweak the design justifies). New e2e scenarios are separate stories.
- **Post-publish e2e** against images pulled from GHCR (the `verify` job stays as in SCRUM-8) — candidate follow-up.
- Deployment to any environment, staging smoke tests, Kubernetes/Helm/ArgoCD.
- Cross-browser (Firefox/WebKit), mobile viewports, visual regression, accessibility audits, performance/load tests.
- Running the **dev-mode** smoke (Vite dev server → backend, SCRUM-7-AC-21) pre-release: it exercises the developer
  set-up, not a shipped artefact. It stays in CI.
- Adding e2e results to the GitHub Release assets or release notes (Q-03).
- Making the CI `e2e` job a release gate or removing it (Q-02).
- A flaky-test quarantine mechanism, Playwright/Node upgrades, multi-arch images.
- Any API/UI behaviour change (NFR-05).

## 3. Target flow (summary — the design is the source of truth)

```
version ─┬─ tooling ───────────────────────────────────────────────────────────────┐
         ├─ backend ─┐                                                              │
         └─ frontend ┴─ images ─┬─ sbom ─────────────────────────────────────────────┤
                                ├─ scan ─── code-scanning (report only)             ├─► release-gate ─► publish ─► verify
                                └─ e2e-release (NEW): load OCI archives → compose    │      (both modes)  (release mode only)
                                   up --no-build (no pull) → assert digests →        │
                                   Playwright compose suite + @critical guard →      │
                                   image + lifecycle checks → reports → down -v ─────┘
```

## 4. Acceptance criteria

### Job

- **SCRUM-9-AC-01** — **Pre-release e2e job in `Release`:** `.github/workflows/release.yml` has a dedicated job
  (name chosen by the Architect; SCRUM-8 design §6.5 proposes `e2e-release`) that `needs` the job producing the OCI
  archives (`images`) and the version plan (`version`), runs in **both** modes (dry-run and release) with the same
  steps, and runs in parallel with `sbom` / `scan` (it must not wait for them). It has a job-level
  `timeout-minutes` (NFR-01) and a comment naming SCRUM-9 and the AC IDs it implements.
- **SCRUM-9-AC-02** — **No duplicated e2e plumbing:** the steps the new job shares with the CI `e2e` job
  (Playwright dependency install, browser cache/install, run summary, diagnostics on failure, Compose log collection,
  teardown, report upload) live in **one** shared definition (composite action or reusable workflow — Architect's
  choice, justified in an ADR). If the CI `e2e` job is moved onto it, its observable behaviour stays the same:
  same tests and checks in the same order, same environment, same artifact name
  (`todo-e2e-<KEY>-<sha>-reports`) and content layout, same summary sections, same `down -v` cleanup (NFR-05).

### Stack on the exact release candidate

- **SCRUM-9-AC-03** — **Exact candidate images, no rebuild, no pull:** the job downloads the artifact
  `todo-release-images-<KEY>-<sha>` from the same run and loads `todo-backend.oci.tar` and `todo-frontend.oci.tar`
  into the runner's Docker daemon under their release names (`ghcr.io/vinods21/todo-backend:<version>`,
  `ghcr.io/vinods21/todo-frontend:<version>`). Before loading, each archive's manifest digest is asserted to equal the
  digest output of `images` (the digest that was scanned, SBOM'd and will be pushed — SCRUM-8-AC-25). The stack is
  started from `docker-compose.yml` with the SCRUM-8-AC-15 overrides (`TODO_BACKEND_IMAGE`, `TODO_FRONTEND_IMAGE`,
  `TODO_IMAGE_TAG` = stamped version); **no image is built** (`--no-build`) and **no backend/frontend image is
  pulled** from any registry. PostgreSQL is the same `postgres:16-alpine` service as everywhere else. No registry
  login takes place in this job.
- **SCRUM-9-AC-04** — **Digest identity of the running containers:** after the stack is up (and again after any
  step that recreates containers), the job asserts for `backend` and `frontend` that the image of the **running
  container** is exactly the image loaded from the candidate archive whose manifest digest equals the `images`
  digest output — i.e. running container → local image ID → archive (config / manifest digest) → scanned/published
  digest form one checked chain. The comparison rule must be correct for the runner's Docker image store (classic
  or containerd) and the store type is recorded. Any mismatch fails the job. The checked values (digests, image
  IDs, store, Docker version) are written to the job summary and to the report artifact.
- **SCRUM-9-AC-05** — **Health-gated start with bounded waits:** the stack is started detached with Compose
  `--wait` and an explicit wait timeout; all three services must report healthy (existing Compose healthchecks).
  If start-up fails or times out, the Playwright steps are skipped, diagnostics are collected (AC-12) and the job
  fails.

### Tests

- **SCRUM-9-AC-06** — **Playwright suite against the candidate:** the job runs the **full compose-mode Playwright
  suite** (all compose projects: `empty-state`, `http`, `ui` — not a subset) against the candidate stack with the
  expected build identity of the release candidate (`E2E_JIRA_KEY`, `E2E_GIT_SHA`, `E2E_VERSION` = the stamped
  version, i.e. `X.Y.Z` in release mode, `X.Y.Z-<id>` in dry-run) and `E2E_EXPECT_EMPTY_DB=1` on a fresh volume.
  Any failed test fails the job. Rationale for the full suite: it takes minutes, and "critical" is enforced
  additionally by AC-07, not used to cut coverage.
- **SCRUM-9-AC-07** — **Critical To-Do workflows are tagged and must pass:** the specs that cover the critical To-Do
  workflows carry the Playwright tag `@critical` (titles unchanged, so AC IDs in titles and existing `grep`s keep
  working). At minimum: empty list → first task; task list loads; create via the form; edit (title, description,
  due date); status change persists; filter by status; server validation error shown in the form; API create →
  read → update → delete round-trip through the proxy; build identity of the build under test (index meta tag,
  `/actuator/info`). After the Playwright run, a guard fails the job if **no** `@critical` test was executed, or if
  **any** `@critical` test did not pass (failed, timed out, interrupted **or skipped**). The guard's logic is
  unit-tested (NFR-06).
- **SCRUM-9-AC-08** — **Image runtime checks on the candidate:** the job also runs, against the running candidate
  stack, the existing SCRUM-7 checks that are properties of the shipped images: `verify-images.sh` (labels incl.
  version = stamped version and revision = commit, non-root runtime UID, no build tools, no secrets in history,
  size report) and `verify-lifecycle.sh` (clean SIGTERM shutdown, persistence across restart and `down`/`up`,
  fresh database after `down -v`) — unchanged scripts.
- **SCRUM-9-AC-09** — **Flake policy:** at most **one** retry per test (the existing CI setting, SCRUM-7-NFR-09); no
  other retry mechanism (no job re-run loops, no `continue-on-error`). A test that passed only on retry counts as
  passed but is **reported**: listed by name in the job summary and raised as a workflow `::warning::`. Retries
  never apply to the AC-04 digest assertion, the AC-07 guard or the AC-08 checks.

### Gate

- **SCRUM-9-AC-10** — **E2E blocks the release:** the new job is in `release-gate.needs`; `release-gate`'s existing
  "every gate passed" check treats any result other than `success` (failure, cancelled, **skipped**) as a block, so
  `release-gate` fails and `publish` / `verify` (which need `release-gate`) cannot run. No `continue-on-error`, no
  `if: always()` path that lets `publish` run without a successful e2e result. The comment block above
  `release-gate` is updated (the SCRUM-9 slot is filled, not left as a TODO).
- **SCRUM-9-AC-11** — **Blocking is demonstrated:** Dev provides one recorded `Release` dry-run in which the e2e job
  fails on purpose (temporary commit on the branch, reverted afterwards — e.g. a wrong expected version) and shows
  `release-gate` failing with the e2e job named in its error, plus the green run after the revert. Run links go into
  the traceability matrix.

### Reports and cleanup

- **SCRUM-9-AC-12** — **Reports and failure logs as artifacts:** the job **always** (success, failure, cancellation
  after start) uploads one artifact named **`todo-release-e2e-<KEY>-<sha>-reports`** (ADR 0008 naming) containing
  at least: Playwright HTML report, JUnit XML and JSON results; traces, screenshots and videos of failed/retried
  tests; `docker compose ps -a` and full `docker compose logs` (timestamps) of all services; the AC-04 digest record;
  lifecycle-script logs. On failure the job log additionally shows Compose status, container health state and the
  last log lines per service (as the CI job does). Retention: at least as long as the release-candidate artifact
  (30 days). The artifact contains no secrets beyond the documented local-development Compose defaults (NFR-07).
- **SCRUM-9-AC-13** — **Job summary:** the job writes a summary with: mode, stamped version, commit, the AC-04 table
  (service, ref, archive digest, image ID, running container image, store, result), e2e counts (passed / failed /
  flaky / skipped, duration), the `@critical` result (N executed, all passed), flaky test names, AC IDs exercised,
  and the artifact name.
- **SCRUM-9-AC-14** — **Cleanup always runs:** the job ends with `docker compose down -v --remove-orphans` (containers,
  network **and** the volume) in a step that runs on success, failure and cancellation, after logs are collected; a
  failing cleanup is visible (not silently swallowed) but does not mask the real test result.

### Ordering and dry-run parity

- **SCRUM-9-AC-15** — **Release jobs only after successful e2e; dry-run proves it:** in release mode no publishing
  action (image push, attestation, tag, release) can start before the e2e job has succeeded for the same run and
  commit (via `release-gate` → `publish` → `verify`; no new path to `publish`). In dry-run (every `pull_request`,
  pushes to `feature/**` and `main`, `workflow_dispatch` with `dry_run=true`) the e2e job runs identically, so every
  PR proves the gate before merge; a dry-run with a failing e2e job is red.

### Documentation and traceability

- **SCRUM-9-AC-16** — **Docs:** an ADR records the pre-release e2e gate (amending ADR 0012 — e2e is also a release
  gate, against release images — and ADR 0013 — job graph / `release-gate` inputs), with amendment notes in 0012 and
  0013; `docs/release/RELEASE.md` is updated (job table, artifacts table incl. the new artifact, failure-recovery row
  "e2e failed → nothing published, fix and re-run", how to reproduce a failing pre-release e2e run locally against
  the candidate archives); comments in `release.yml` reference SCRUM-9.
- **SCRUM-9-AC-17** — **Traceability per ADR 0004:** commits `SCRUM-9: [ROLE] …` with `Refs: SCRUM-9`;
  `docs/traceability/SCRUM-9.md` filled with code locations, run links (green dry-run, AC-11 red run), artifact
  names, digests and durations.

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| SCRUM-9-NFR-01 | **Time:** the e2e job typically ≤ 12 min (timeout ≤ 20 min, same as CI `e2e`); running in parallel with `sbom`/`scan`, it adds ≤ 3 min to the dry-run wall-clock time, keeping SCRUM-8-NFR-04 (dry-run ≤ 15 min, release ≤ 30 min). Step-level timeouts on the Playwright and lifecycle steps. |
| SCRUM-9-NFR-02 | **Least privilege, fork-safe:** the job runs with the workflow's read-only token (`contents: read`), no secrets, no registry login, no `pull_request_target`; it works for fork PRs. |
| SCRUM-9-NFR-03 | **Pinning:** every action used is pinned to a full commit SHA, reusing the SHAs already pinned in `release.yml` (SCRUM-8-NFR-02); no new third-party actions or downloaded CLIs. |
| SCRUM-9-NFR-04 | **Determinism:** fresh runner and volume, `E2E_EXPECT_EMPTY_DB=1`, existing ADR 0012 rules (no sleeps, unique data, `workers: 1`, `forbidOnly`); the same commit gives the same result apart from genuine flakiness (reported per AC-09). |
| SCRUM-9-NFR-05 | **No regression:** no application, Dockerfile, Compose-semantics or test-behaviour change; the CI `e2e` job's behaviour is unchanged (AC-02); existing `CI` and `Release` jobs stay green; `check-compose-images.sh` unchanged and green. |
| SCRUM-9-NFR-06 | **Logic in tested scripts:** non-trivial logic (digest chain, critical guard) lives in scripts under `.github/scripts/` (shellcheck-clean bash or dependency-free Node with `node:test` tests in the `tooling` job), not inline YAML (SCRUM-8-NFR-07). |
| SCRUM-9-NFR-07 | **No sensitive data:** artifacts and summaries contain no tokens or environment dumps; only the documented local-development Compose defaults may appear. |
| SCRUM-9-NFR-08 | **Reproducible locally:** RELEASE.md gives the commands to run the same suite against a downloaded `todo-release-images-<KEY>-<sha>` artifact on a developer machine. |

## 6. Assumptions

| ID | Assumption |
|---|---|
| A-01 | GitHub-hosted `ubuntu-latest` provides Docker Engine ≥ 25 (loads OCI archives) and Compose v2 with `--wait` and `--pull never`; the image store (classic vs containerd) is not guaranteed — the design must handle both (AC-04). |
| A-02 | The images artifact (`todo-release-images-<KEY>-<sha>`, 7-day retention, uncompressed upload) is always available within the same run. |
| A-03 | The compose suite runs in about 2 minutes (SCRUM-7 evidence: 19 compose tests); running the full suite is cheaper than maintaining a separate critical-only suite. |
| A-04 | `docker-compose.yml` is the reference runtime for release images (SCRUM-8 A-12); running it with the AC-15 overrides is representative of how a release is run. |
| A-05 | `postgres:16-alpine` is pulled from Docker Hub as today (not a release artefact); a Docker Hub outage fails the job (and so blocks the release) — acceptable, fixed by a re-run. |
| A-06 | A test that passes on its single retry is acceptable for release (SCRUM-7-NFR-09 policy), provided it is reported (AC-09). PO may tighten this (Q-01). |
| A-07 | Release-mode behaviour can only be fully observed after merge (first real release); pre-merge evidence is the dry-run, which runs the identical job. |

## 7. Open questions

- **Q-01** — Should a flaky (passed-on-retry) `@critical` test block a **real** release? Default: **no**, reported and
  warned (A-06). (Non-blocking.)
- **Q-02** — Is the CI `e2e` job redundant now? Default: **keep it** — it covers the Dockerfile `source` path used by
  developers, hadolint and the dev-mode smoke, and gives fast feedback independent of `Release`. (Non-blocking.)
- **Q-03** — Include an e2e summary (counts, digests tested) in the release notes / candidate bundle? Default: **no**
  in this story; follow-up. (Non-blocking.)
- **Q-04** — Add a post-publish e2e run against the images pulled from GHCR by digest? Default: follow-up story.
  (Non-blocking.)

## 8. Traceability matrix (skeleton — filled by Dev in [`docs/traceability/SCRUM-9.md`](../traceability/SCRUM-9.md))

| ID | Description | Verification (to be filled) |
|---|---|---|
| SCRUM-9-AC-01 | Pre-release e2e job in `Release`, both modes, after `images`, parallel to `sbom`/`scan` | workflow review; dry-run graph |
| SCRUM-9-AC-02 | Shared e2e plumbing, CI `e2e` behaviour unchanged | workflow review; CI run + artifact comparison |
| SCRUM-9-AC-03 | Candidate OCI archives loaded, digest checked, Compose `--no-build`, no pull, no login | dry-run log + summary |
| SCRUM-9-AC-04 | Running containers ↔ image ID ↔ archive ↔ published digest chain asserted | digest table in summary + artifact |
| SCRUM-9-AC-05 | `--wait` with timeout; failure → diagnostics, tests skipped, job red | workflow review; AC-11 run |
| SCRUM-9-AC-06 | Full compose Playwright suite with candidate identity, fresh DB | JUnit/HTML in artifact |
| SCRUM-9-AC-07 | `@critical` tags + guard (≥ 1 executed, all passed, none skipped), unit-tested | spec review; tooling tests; summary |
| SCRUM-9-AC-08 | `verify-images.sh` + `verify-lifecycle.sh` on the candidate | job log + summary |
| SCRUM-9-AC-09 | Max 1 retry; flaky listed + warning | config review; summary |
| SCRUM-9-AC-10 | `release-gate.needs` includes the e2e job; non-success blocks | workflow review; AC-11 run |
| SCRUM-9-AC-11 | Recorded red dry-run (e2e fails → gate fails) and green run after revert | run links |
| SCRUM-9-AC-12 | `todo-release-e2e-<KEY>-<sha>-reports` always uploaded with reports + logs | artifact listing |
| SCRUM-9-AC-13 | Job summary contents | dry-run summary |
| SCRUM-9-AC-14 | `down -v --remove-orphans` always | job log |
| SCRUM-9-AC-15 | Publish only after e2e success; dry-run parity | workflow review; dry-run runs |
| SCRUM-9-AC-16 | ADR + amendments, RELEASE.md, workflow comments | PR review |
| SCRUM-9-AC-17 | Commits + filled matrix | PR review |
| SCRUM-9-NFR-01 | Job ≤ 12 min, dry-run +≤ 3 min | run timings |
| SCRUM-9-NFR-02 | Read-only token, no secrets/login, fork-safe | workflow review |
| SCRUM-9-NFR-03 | SHA-pinned actions reused from `release.yml` | workflow review |
| SCRUM-9-NFR-04 | Deterministic runs | design review; runs |
| SCRUM-9-NFR-05 | No regression (CI, Release, app) | CI + Release green |
| SCRUM-9-NFR-06 | Logic in tested, linted scripts | shellcheck + `node --test` in `tooling` |
| SCRUM-9-NFR-07 | No sensitive data in artifacts | artifact review |
| SCRUM-9-NFR-08 | Local reproduction documented | RELEASE.md review |
