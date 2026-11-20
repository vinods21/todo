# SCRUM-9 — Requirements Traceability Matrix

Jira: [SCRUM-9](https://suranagivinod.atlassian.net/browse/SCRUM-9) · Branch: `feature/SCRUM-9-pre-release-e2e` ·
Requirements: [`docs/requirements/SCRUM-9.md`](../requirements/SCRUM-9.md) · Design: [`docs/architecture/SCRUM-9-design.md`](../architecture/SCRUM-9-design.md) ·
ADRs: [0015](../adr/0015-pre-release-e2e-gate.md) (amends [0012](../adr/0012-end-to-end-testing-playwright.md), [0013](../adr/0013-versioning-and-release-process.md)) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md)

**Status: filled (Dev).** Evidence from GitHub Actions logs and job summaries (artifacts listed via the REST API).

How to read the columns:
- "Test" for release tooling = `<file> › <test name>` (relative to `.github/scripts/release/test/`), names start with
  the ID; junit in artifact `todo-release-tooling-SCRUM-9-<sha>-reports`.
- E2E tests = `<spec file> › <title>`; reports in artifact `todo-release-e2e-SCRUM-9-<sha>-reports`.
- "CI evidence" = `Release` (dry-run) and `CI` runs on `<sha>` with job summaries and artifacts.

Green evidence: `Release` dry-run run [44599282389](https://github.com/vinods21/todo/actions/runs/44599282389) (all jobs green incl. `e2e-release` job 135828035139; `publish`, `verify` skipped) ·
`CI` run [44599282368](https://github.com/vinods21/todo/actions/runs/44599282368) (4/4 green) · Commit SHA `e36933a00f0c4d7f08204e6c9391e983deb12b90` (code identical to `613c1d1`, green in Release [44596477403](https://github.com/vinods21/todo/actions/runs/44596477403) / CI [44596477421](https://github.com/vinods21/todo/actions/runs/44596477421)) · Stamped version `1.0.1-e36933a` ·
Runner Docker `29.4.2` (storage driver `overlayfs`), image store **`containerd`** (`id_kind` `manifest`) ·
Backend: archive/published digest `sha256:b71745c6897ee0f950fcd8a0df6408602ddd3f9469d144765353347bb53266ec`, config digest `sha256:d4bd1788c89fa275ab59b8038de9cdd470552070501a46fb4023ddb81a0927a2`, running image `sha256:b71745c6897ee0f950fcd8a0df6408602ddd3f9469d144765353347bb53266ec` (after `up` and after the lifecycle restarts) ·
Frontend: archive/published digest `sha256:16b0a74c2da4be1a4b3a0eedf3eefa6d135ba7024f960dbfccfb1927b2c773d1`, config digest `sha256:332d455f80f4be5602c11d6c9d8b1254fe0b76570696807ded621d37378cb2b2`, running image `sha256:16b0a74c2da4be1a4b3a0eedf3eefa6d135ba7024f960dbfccfb1927b2c773d1` (after `up` and after the lifecycle restarts) ·
E2E: `19` passed / `0` failed / `0` flaky / `0` skipped in `7.4` s; `@critical` `12`/`min 12` passed ·
Durations: `e2e-release` `1.9` min (1.5 min in 44596477403), dry-run wall-clock to `release-gate` `5.9` min (4.8 min in 44596477403; main baseline [44589784309](https://github.com/vinods21/todo/actions/runs/44589784309) `3.3` min); on the critical path `e2e-release` finished 1.2 min after `scan` ·
Artifact `todo-release-e2e-SCRUM-9-e36933a00f0c4d7f08204e6c9391e983deb12b90-reports` (233 179 B, expires after 30 days).

Blocking evidence (AC-11): red run [44597881578](https://github.com/vinods21/todo/actions/runs/44597881578) on temporary commit `816ad53`
(`E2E_AC11_FAIL=1` in `e2e-release` makes the `@critical` test "API round-trip through the proxy" fail): `e2e-release` failure
(job 135822668800: Playwright "1 failed, 18 passed" incl. retry #1; guard "**BLOCKED** — 12 @critical tests executed, 11 passed"),
`release-gate` failure "`SCRUM-8-AC-07, SCRUM-9-AC-10: gate inputs not successful: e2e-release=failure`", `publish`/`verify` skipped;
diagnostics (health per container) printed, `down -v` ran (0 containers / 0 volumes left), artifact
`todo-release-e2e-SCRUM-9-816ad53…-reports` (706 169 B, with traces) uploaded · revert `e36933a` → green run [44599282389](https://github.com/vinods21/todo/actions/runs/44599282389).
Unplanned earlier red run [44595056165](https://github.com/vinods21/todo/actions/runs/44595056165) (commit `4f07d15`) is a second, organic proof: the gate found a real
packaging defect (see Deviations) and blocked with `e2e-release=failure`.

| ID | Requirement | Design | Code / doc | Test / check | CI evidence |
|---|---|---|---|---|---|
| SCRUM-9-AC-01 | Pre-release e2e job in `Release`, both modes, after `images`, parallel to `sbom`/`scan`, timeout | §2, §4.1 | `.github/workflows/release.yml` job `e2e-release` (`needs: [version, images]`, `timeout-minutes: 20`, comment with AC IDs) | workflow review | [44599282389](https://github.com/vinods21/todo/actions/runs/44599282389): `e2e-release`, `sbom`, `scan` all started 19:35:23Z after `images` |
| SCRUM-9-AC-02 | Shared e2e plumbing; CI `e2e` behaviour unchanged | §6 | `.github/actions/e2e-playwright/action.yml`, `.github/actions/e2e-teardown/action.yml`, `ci.yml` job `e2e` | CI `e2e` vs `main` run [44589784251](https://github.com/vinods21/todo/actions/runs/44589784251): 19 compose + 3 dev passed in both, "All image checks passed", "Lifecycle checks passed", `down -v`; artifact `todo-e2e-<KEY>-<sha>-reports` same name pattern, 432 175 B vs 430 784 B, same 90-day retention (empty `retention-days` = repository default, R4 not hit) | [44599282368](https://github.com/vinods21/todo/actions/runs/44599282368), [44596477421](https://github.com/vinods21/todo/actions/runs/44596477421) |
| SCRUM-9-AC-03 | Candidate archives loaded (digest asserted), `--no-build --pull never`, no login | §4.1, §5.1 | `.github/scripts/release/e2e-images.sh load` | shellcheck (`tooling`) | log: "manifest sha256:b717… (== images output)", "Loaded image: ghcr.io/vinods21/todo-backend:1.0.1-e36933a"; `compose config`: backend/frontend = release refs, only `postgres:16-alpine` pulled; no login step |
| SCRUM-9-AC-04 | Running container ↔ image ID ↔ archive ↔ published digest chain | §5.2 | `e2e-images.sh assert-running` | local stub test classic + containerd + mismatch (not committed) | summary table twice ("after up", "after lifecycle"); `release-images.json`; containerd store: `.Image` = `Image.Id` = manifest digest = `images` output |
| SCRUM-9-AC-05 | `--wait --wait-timeout 240`; start failure → diagnostics, job red | §4.1 | `release.yml` step `stack` (`timeout-minutes: 6`), later steps gated on `steps.stack.outcome` | workflow review | diagnostics path proven in [44597881578](https://github.com/vinods21/todo/actions/runs/44597881578) (test-failure variant; start-up failure not provoked) |
| SCRUM-9-AC-06 | Full compose suite with candidate identity, fresh DB | §4.1 | `release.yml` Playwright step (`E2E_EXPECT_EMPTY_DB=1`, `E2E_VERSION=<stamped>`) | `e2e/tests/**` (content unchanged, tags only) | 19 tests (empty-state, http, ui) passed; caught the frontend API-base defect in [44595056165](https://github.com/vinods21/todo/actions/runs/44595056165) |
| SCRUM-9-AC-07 | `@critical` tags (12) + guard, unit-tested | §7.1, §7.2 | spec tags; `.github/scripts/release/e2e-gate.mjs`, `lib/e2e-results.mjs` | `e2e-results.test.mjs` › `SCRUM-9-AC-07: …` (11 tests); `playwright test --list --grep @critical` = 12 | summary "**PASS** — 12 @critical tests executed, 12 passed (min 12)"; red run "BLOCKED — … 11 passed" |
| SCRUM-9-AC-08 | `verify-images.sh` + `verify-lifecycle.sh` on the candidate | §4.1 | `release.yml` steps | scripts unchanged | "All image checks passed", "Lifecycle checks passed" (job 135828035139) |
| SCRUM-9-AC-09 | Max 1 retry; flaky named + warning | §7.3 | `playwright.config.ts` (unchanged, `retries: CI ? 1 : 0`), `e2e-gate.mjs` | `e2e-results.test.mjs` › `SCRUM-9-AC-09: …` | summary "Flaky (passed on retry, SCRUM-9-AC-09): none"; red run shows exactly one retry (`retry #1`) |
| SCRUM-9-AC-10 | `release-gate.needs` ⊇ `e2e-release`; non-success blocks | §2, §4.2 | `release.yml` `release-gate` (needs + comment block + error prefix) | AC-11 | [44597881578](https://github.com/vinods21/todo/actions/runs/44597881578), [44595056165](https://github.com/vinods21/todo/actions/runs/44595056165) |
| SCRUM-9-AC-11 | Recorded red run + green after revert | §11 | temporary commit `816ad53` / revert `e36933a` | — | see "Blocking evidence" |
| SCRUM-9-AC-12 | `todo-release-e2e-<KEY>-<sha>-reports` always, reports + logs, 30 days | §8 | `e2e-teardown` composite, `retention-days: "30"` | artifact listing (REST) green + red; file list printed by step "Report contents and cleanup check" (compose/html, junit.xml, results.json, release-images.json, compose-ps.txt, compose-logs.txt, compose-logs-before-down.txt; test-results/ on failure) | green 233 179 B, red 706 169 B, `expires_at` = created + 30 d |
| SCRUM-9-AC-13 | Job summary (mode, version, digest table, counts, critical, flaky, IDs, artifact) | §5.2, §7.2 | `e2e-images.sh`, `e2e-gate.mjs`, `e2e/scripts/summarize.mjs` (`E2E_SUMMARY_MODES`) | `SCRUM-9-AC-13: markdown summary lists counts and flaky names` | job summary of 135828035139 |
| SCRUM-9-AC-14 | `down -v --remove-orphans` always | §6.2, §8 | `e2e-teardown` composite | — | "Volume todo-release-e2e_todo-pgdata Removed", "containers left … 0", "volumes left … 0" (green + red) |
| SCRUM-9-AC-15 | Publish only after e2e success; dry-run parity | §2 | `release.yml` (`publish`/`verify` unchanged, no new path) | workflow review | every push of the branch ran `e2e-release` in dry-run; `publish`/`verify` skipped in all runs |
| SCRUM-9-AC-16 | ADR 0015 + 0012/0013 amendment notes; RELEASE.md; workflow comments | §10 | `docs/adr/0015…` (+ implementation notes), `docs/release/RELEASE.md` §2, §3, §3.1, §8, `README.md` | review | — |
| SCRUM-9-AC-17 | Commits + this matrix | — | `3a2aa25`, `b626848`, `4f07d15`, `69180b4`, `613c1d1`, `816ad53` (TEMP), `e36933a` (revert), this commit | review | — |
| SCRUM-9-NFR-01 | Job ≤ 12 min, dry-run +≤ 3 min, step timeouts | §2, §4.1 | step timeouts 6 / 10 / 6 min, job 20 min | — | `e2e-release` 1.5–1.9 min; release-gate waited 1.2 min longer than for `scan`; dry-run to gate 4.8–5.9 min (≤ 15) |
| SCRUM-9-NFR-02 | Read-only token, no secrets/login, fork-safe | §4.1 | `release.yml` (no `permissions:` → `contents: read`, no secrets, no login) | review | — |
| SCRUM-9-NFR-03 | SHAs reused from `release.yml` only | §9 | composites, `e2e-release` | review (`grep -n 'uses:'`: checkout v7.0.1, setup-node v7.1.0, download-artifact v8.0.2, cache v6.1.0, upload-artifact v7.0.2) | — |
| SCRUM-9-NFR-04 | Deterministic (fresh volume, `E2E_EXPECT_EMPTY_DB=1`, ADR 0012 rules) | §4.1, §7.3 | — | — | 3 green runs on identical code, 0 flaky |
| SCRUM-9-NFR-05 | No regression (app, CI, Release) | §3, §6.3 | — | `CI` + `Release` green; `playwright test --list` 19 compose / 3 dev unchanged; frontend source untouched | [44599282368](https://github.com/vinods21/todo/actions/runs/44599282368), [44599282389](https://github.com/vinods21/todo/actions/runs/44599282389) |
| SCRUM-9-NFR-06 | Logic in tested, linted scripts | §5, §7 | `e2e-images.sh`, `e2e-gate.mjs`, `lib/e2e-results.mjs` | shellcheck 0.11.0 clean + `node --test` 143/143 (`tooling`, 13 new) | `tooling` job 135826070099 |
| SCRUM-9-NFR-07 | No sensitive data in artifacts | §8 | no env dumps; diagnostics print `.State` only | artifact contents list (names only) | — |
| SCRUM-9-NFR-08 | Local reproduction documented | §10 | `docs/release/RELEASE.md` §3.1 | review | — |

Deviations from the design:
1. **Release `frontend` job now builds with `VITE_API_BASE_URL=/`** (Build and reproducibility steps; `69180b4`). The first
   `e2e-release` run ([44595056165](https://github.com/vinods21/todo/actions/runs/44595056165)) showed the prebuilt bundle calling `http://localhost:8080/api/…`,
   blocked by the image CSP (`connect-src 'self'`): since SCRUM-8 the `Release` bundle was built without the same-origin
   base that the Dockerfile `source` stage sets (ADR 0011). Workflow-only fix; no application or Dockerfile change.
   **Consequence:** the frontend image of the already published `v1.0.0` (SCRUM-8) carries this defect — follow-up needed
   (warn in release notes / ship `v1.0.1`, ROLLBACK.md §6). Review correction: `v1.0.0` is a manual GitHub pre-release
   (lightweight tag on `8beb5aa`, no assets, no `Release` `workflow_dispatch` run) — the pipeline never pushed `1.0.0`
   images; every pipeline-built `v1.0.0` frontend image would carry the defect. Known issue + remedy:
   [RELEASE.md §10](../release/RELEASE.md#10-known-issues).
2. Store: the runner uses the **containerd** image store, so the chain is `Image.Id` = manifest digest = published digest
   (design §5.1 rule for containerd); the classic-store path (config digest) and the `skopeo` fallback were exercised only
   with a local stub.
3. Extra step "Report contents and cleanup check" in `e2e-release` (file list, leftover containers/volumes) — evidence
   in the log, since artifacts cannot be downloaded in the agent environment.
4. `e2e-images.sh` additionally verifies that the config blob hashes to its digest and uses `inherit_errexit`.

CI iterations: 4 pushes (1 red finding → fix, 1 green, 1 deliberate red, 1 green revert) + this commit.
