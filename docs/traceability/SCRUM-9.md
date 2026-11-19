# SCRUM-9 — Requirements Traceability Matrix

Jira: [SCRUM-9](https://suranagivinod.atlassian.net/browse/SCRUM-9) · Branch: `feature/SCRUM-9-pre-release-e2e` ·
Requirements: [`docs/requirements/SCRUM-9.md`](../requirements/SCRUM-9.md) · Design: [`docs/architecture/SCRUM-9-design.md`](../architecture/SCRUM-9-design.md) ·
ADRs: [0015](../adr/0015-pre-release-e2e-gate.md) (amends [0012](../adr/0012-end-to-end-testing-playwright.md), [0013](../adr/0013-versioning-and-release-process.md)) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md)

**Status: template (Architect).** Dev replaces every `<…>` placeholder with evidence.

How to read the columns:
- "Test" for release tooling = `<file> › <test name>` (relative to `.github/scripts/release/test/`), names start with
  the ID; junit in artifact `todo-release-tooling-SCRUM-9-<sha>-reports`.
- E2E tests = `<spec file> › <title>`; reports in artifact `todo-release-e2e-SCRUM-9-<sha>-reports`.
- "CI evidence" = `Release` (dry-run) and `CI` runs on `<sha>` with job summaries and artifacts.

Green evidence: `Release` dry-run run [<id>](https://github.com/vinods21/todo/actions/runs/<id>) (all jobs green incl. `e2e-release`; `publish`, `verify` skipped) ·
`CI` run [<id>](https://github.com/vinods21/todo/actions/runs/<id>) (4/4 green) · Commit SHA `<sha>` · Stamped version `<0.1.x-xxxxxxx>` ·
Runner Docker `<version>`, image store `<classic|containerd>` (`id_kind` `<config|manifest>`) ·
Backend: archive/published digest `<sha256:…>`, config digest `<sha256:…>`, running image `<sha256:…>` ·
Frontend: archive/published digest `<sha256:…>`, config digest `<sha256:…>`, running image `<sha256:…>` ·
E2E: `<n>` passed / `<n>` failed / `<n>` flaky / `<n>` skipped in `<s>` s; `@critical` `<n>`/`<min 12>` passed ·
Durations: `e2e-release` `<m>` min, dry-run wall-clock `<m>` min (main baseline `<m>` min) ·
Artifact `todo-release-e2e-SCRUM-9-<sha>-reports` (`<size>`).

Blocking evidence (AC-11): red run [<id>](https://github.com/vinods21/todo/actions/runs/<id>) on temporary commit `<sha>`
(`<what was broken>`): `e2e-release` failure (`<failing step / test>`), `release-gate` failure
"`<…e2e-release=failure…>`", `publish`/`verify` skipped · revert `<sha>` → green run [<id>](https://github.com/vinods21/todo/actions/runs/<id>).

| ID | Requirement | Design | Code / doc | Test / check | CI evidence |
|---|---|---|---|---|---|
| SCRUM-9-AC-01 | Pre-release e2e job in `Release`, both modes, after `images`, parallel to `sbom`/`scan`, timeout | §2, §4.1 | `.github/workflows/release.yml` job `e2e-release` | workflow review | `<run>`: graph, start times vs `scan` |
| SCRUM-9-AC-02 | Shared e2e plumbing; CI `e2e` behaviour unchanged | §6 | `.github/actions/e2e-playwright/action.yml`, `.github/actions/e2e-teardown/action.yml`, `ci.yml` job `e2e` | artifact listing diff vs `main` run `<id>` | `<CI run>` |
| SCRUM-9-AC-03 | Candidate archives loaded (digest asserted), `--no-build --pull never`, no login | §4.1, §5.1 | `.github/scripts/release/e2e-images.sh load` | shellcheck (`tooling`) | `<run>` log: "Loaded image …", compose config refs |
| SCRUM-9-AC-04 | Running container ↔ image ID ↔ archive ↔ published digest chain | §5.2 | `e2e-images.sh assert-running` | — | summary table; `release-images.json` |
| SCRUM-9-AC-05 | `--wait --wait-timeout 240`; start failure → diagnostics, job red | §4.1 | `release.yml` step `stack` | AC-11 run (if start-up variant) | `<run>` |
| SCRUM-9-AC-06 | Full compose suite with candidate identity, fresh DB | §4.1 | `release.yml` Playwright step | `e2e/tests/**` (unchanged content) | junit `<n>` tests |
| SCRUM-9-AC-07 | `@critical` tags (12) + guard, unit-tested | §7.1, §7.2 | spec tags; `.github/scripts/release/e2e-gate.mjs`, `lib/e2e-results.mjs` | `e2e-results.test.mjs` › `SCRUM-9-AC-07: …` (`<n>` tests); `playwright test --list --grep @critical` = 12 | summary "PASS — 12 @critical …" |
| SCRUM-9-AC-08 | `verify-images.sh` + `verify-lifecycle.sh` on the candidate | §4.1 | `release.yml` steps | scripts unchanged | `<run>`: "All image checks passed", "Lifecycle checks passed" |
| SCRUM-9-AC-09 | Max 1 retry; flaky named + warning | §7.3 | `playwright.config.ts` (unchanged), `e2e-gate.mjs` | `e2e-results.test.mjs` › `SCRUM-9-AC-09: …` | summary "Flaky: …" |
| SCRUM-9-AC-10 | `release-gate.needs` ⊇ `e2e-release`; non-success blocks | §2, §4.2 | `release.yml` `release-gate` | AC-11 | `<red run>` |
| SCRUM-9-AC-11 | Recorded red run + green after revert | §11 | temporary commit `<sha>` / revert `<sha>` | — | see "Blocking evidence" |
| SCRUM-9-AC-12 | `todo-release-e2e-<KEY>-<sha>-reports` always, reports + logs, 30 days | §8 | `e2e-teardown` composite | artifact listing (green and red run) | `<run>` |
| SCRUM-9-AC-13 | Job summary (mode, version, digest table, counts, critical, flaky, IDs, artifact) | §5.2, §7.2 | `e2e-images.sh`, `e2e-gate.mjs`, `e2e/scripts/summarize.mjs` | `SCRUM-9-AC-13: …` test | `<run>` summary |
| SCRUM-9-AC-14 | `down -v --remove-orphans` always | §6.2, §8 | `e2e-teardown` composite | — | `<run>` log (green + red) |
| SCRUM-9-AC-15 | Publish only after e2e success; dry-run parity | §2 | `release.yml` (`publish` unchanged) | workflow review | dry-run runs on PR/push |
| SCRUM-9-AC-16 | ADR 0015 + 0012/0013 amendment notes; RELEASE.md; workflow comments | §10 | `docs/adr/0015…`, `docs/release/RELEASE.md` | review | — |
| SCRUM-9-AC-17 | Commits + this matrix | — | commits `<shas>` | review | — |
| SCRUM-9-NFR-01 | Job ≤ 12 min, dry-run +≤ 3 min, step timeouts | §2, §4.1 | — | — | `<durations>` |
| SCRUM-9-NFR-02 | Read-only token, no secrets/login, fork-safe | §4.1 | `release.yml` | review | — |
| SCRUM-9-NFR-03 | SHAs reused from `release.yml` only | §9 | composites, `e2e-release` | review (`grep -n 'uses:'`) | — |
| SCRUM-9-NFR-04 | Deterministic (fresh volume, `E2E_EXPECT_EMPTY_DB=1`, ADR 0012 rules) | §4.1, §7.3 | — | — | — |
| SCRUM-9-NFR-05 | No regression (app, CI, Release) | §3, §6.3 | — | `CI` + `Release` green; `playwright test --list` counts unchanged | `<runs>` |
| SCRUM-9-NFR-06 | Logic in tested, linted scripts | §5, §7 | `e2e-images.sh`, `e2e-gate.mjs`, `lib/e2e-results.mjs` | shellcheck + `node --test` (`tooling`) | `<run>` |
| SCRUM-9-NFR-07 | No sensitive data in artifacts | §8 | — | artifact review | — |
| SCRUM-9-NFR-08 | Local reproduction documented | §10 | `docs/release/RELEASE.md` §3.1 | review | — |

Deviations from the design: `<none | list>`. CI iterations: `<n>`.
