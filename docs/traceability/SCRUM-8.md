# SCRUM-8 — Requirements Traceability Matrix

Jira: [SCRUM-8](https://suranagivinod.atlassian.net/browse/SCRUM-8) · Branch: `feature/SCRUM-8-versioning-and-release-strategy` ·
Requirements: [`docs/requirements/SCRUM-8.md`](../requirements/SCRUM-8.md) · Design: [`docs/architecture/SCRUM-8-design.md`](../architecture/SCRUM-8-design.md) ·
ADRs: [0013](../adr/0013-versioning-and-release-process.md), [0014](../adr/0014-vulnerability-scanning-policy.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md) (as amended by [0008](../adr/0008-ci-derived-build-identity.md) and 0013)

**Status: TEMPLATE (Architect) — Dev fills every `TODO`.** Publication cannot run before merge (design §0, R13): the
ACs marked **pending first release** are evidenced pre-merge by the dry-run plus the tested tooling (AC-12, AC-24) and
completed with the `v0.1.0` evidence per AC-33.

How to read the columns:
- "Test" for release tooling = `<file> › <test name>` (relative to `.github/scripts/release/test/`), names start with
  the ID; junit in artifact `todo-release-tooling-SCRUM-8-<sha>-reports`.
- Backend/e2e tests as in the SCRUM-7 matrix (`Class#method` / `<file> › <title>`).
- "CI evidence" = workflow `CI` run and workflow `Release` (dry-run) run on `<sha>` with their job summaries and
  artifacts (`todo-release-candidate-SCRUM-8-<sha>`, `todo-release-scan-SCRUM-8-<sha>`, `todo-release-sbom-SCRUM-8-<sha>`).

Dry-run evidence: `Release` run [TODO](https://github.com/vinods21/todo/actions/runs/TODO) · `CI` run
[TODO](https://github.com/vinods21/todo/actions/runs/TODO) · Commit SHA: `TODO` · Build version: `TODO` · Would-be
release: `0.1.0` · Local image digests: backend `sha256:TODO`, frontend `sha256:TODO` · Gate verdict: `TODO` (counts
TODO; allow-list entries: TODO/none) · Trivy `0.76.2`, DB `TODO` (UpdatedAt TODO) · SBOM component counts: backend
TODO, frontend TODO, backend-image TODO, frontend-image TODO · Jar reproducible: TODO (yes/no + cause) · Tarball
reproducible: TODO · Dry-run duration: TODO (NFR-04 ≤ 15 min) · Existing `CI` job deltas: TODO

First release (AC-33): run `TODO` · tag `v0.1.0` → `TODO` · release URL `TODO` · backend `ghcr.io/vinods21/todo-backend@sha256:TODO` ·
frontend `ghcr.io/vinods21/todo-frontend@sha256:TODO` · `verify` job: TODO · packages public: TODO · settings applied
(environment `release`, ruleset `release-tags`, immutable releases): TODO

| ID | Description | Design | Code / config | Test | CI / release evidence |
|---|---|---|---|---|---|
| SCRUM-8-AC-01 | SemVer, one product version, `v` prefix, first `0.1.0` | §4.1, ADR 0013 | `lib/semver.mjs`; RELEASE.md §1 | `semver.test.mjs` › TODO | TODO |
| SCRUM-8-AC-02 | Next version from highest SemVer tag + bump/explicit | §4.2 | `lib/semver.mjs`, `version.mjs plan` | `semver.test.mjs` › TODO | `version` summary TODO |
| SCRUM-8-AC-03 | Build versions `X.Y.Z-<sha7>` (Q-07: `g` prefix only for `^0[0-9]{6}$`) | §4.3, §6.1 | `lib/semver.mjs`; `ci.yml` identity | `build-version.test.mjs` › TODO | CI identity summary TODO |
| SCRUM-8-AC-04 | Same version in jar/manifest/build-info/`/actuator/info`, build-info.json/meta, labels/tags | §5, §6.1 | pom, vite.config.ts, Dockerfiles, `verify-jar.sh`, `verify-images.sh`, `verify-release-images.sh` | `TodoApplicationIntegrationTest#TODO`; `stack.http.spec.ts` › TODO | CI `build`/`frontend`/`e2e` + Release `images` TODO |
| SCRUM-8-AC-05 | Tags are source of truth; no commits by the pipeline | §5.1–5.3 | pom `${revision}`, package.json placeholder; no push steps | workflow review | TODO |
| SCRUM-8-AC-06 | Dispatch inputs; main-only; untagged commit; one release at a time | §4.4, §6.2 | `lib/guard.mjs`, `release.yml` concurrency/env | `guard.test.mjs` › TODO | **pending first release** (dry-run: TODO) |
| SCRUM-8-AC-07 | Gates before publish; `release-gate` + SCRUM-9 insertion point | §6.2, §6.5 | `release.yml` | workflow review | dry-run graph TODO |
| SCRUM-8-AC-08 | Pre-existence check; never overwrite | §8.6, §9.2 | `lib/preexistence.mjs`, `preexistence.mjs` | `preexistence.test.mjs` › TODO | dry-run table TODO; **pending first release** |
| SCRUM-8-AC-09 | Annotated tag on the built commit | §9.2 step 8 | `create-tag.sh` | — | **pending first release** |
| SCRUM-8-AC-10 | GitHub Release with assets + generated notes | §9.1, §9.4 | `assemble-candidate.sh`, `release-notes.mjs` | `notes.test.mjs` › TODO | dry-run `release-notes.md` TODO; **pending first release** |
| SCRUM-8-AC-11 | Dry-run on PR/push/dispatch, read-only, candidate bundle | §6.2, §6.3 | `release.yml` | — | artifact `todo-release-candidate-SCRUM-8-TODO` |
| SCRUM-8-AC-12 | Release tooling unit-tested | §11.3 | `.github/scripts/release/test/` | all suites (count TODO) | `tooling` junit TODO |
| SCRUM-8-AC-13 | GHCR tags `X.Y.Z`, `X.Y.Z-<id>`, `X.Y`, `latest`, same digest | §4.5, §9.2 | `push-image.sh` | `tags.test.mjs` › TODO | dry-run tag plan TODO; **pending first release** |
| SCRUM-8-AC-14 | OCI labels incl. version, base.name | §5.4 | Dockerfiles | `verify-images.sh`, `verify-release-images.sh` | TODO |
| SCRUM-8-AC-15 | CI images versioned, not pushed; Compose runs published images | §5.5, §6.1 | docker-compose.yml, `.env.example`, `check-compose-images.sh` | `check-compose-images.sh` | `tooling` + CI `e2e` TODO |
| SCRUM-8-AC-16 | Provenance (+ SBOM) attestations; `gh attestation verify` | §9.2 steps 6–7, §9.3 | `release.yml` publish/verify | — | **pending first release** |
| SCRUM-8-AC-17 | Four CycloneDX SBOMs, valid, non-empty, version + commit | §7 | pom plugin, `.github/tools`, `sbom-finalize.mjs`, `validate-sboms.sh` | `sbom.test.mjs` › TODO | `sbom` job TODO |
| SCRUM-8-AC-18 | SBOMs as assets + image SBOM attestations; artifacts in dry-run | §7, §9 | `assemble-candidate.sh`, publish step 6 | — | dry-run bundle TODO; **pending first release** |
| SCRUM-8-AC-19 | Maven + npm dependency scanning | §8.2 | `scan.sh` | — | `scan` reports TODO |
| SCRUM-8-AC-20 | Image scanning incl. secrets | §8.2 | `scan.sh` | — | `scan` reports TODO |
| SCRUM-8-AC-21 | Gate policy, fail closed, same in dry-run | §8.3, §8.4 | `lib/gate.mjs`, `vuln-gate.mjs` | `gate.test.mjs` › TODO | verdict TODO |
| SCRUM-8-AC-22 | Allow-list fields, ≤ 90 days, invalid/expired suppress nothing | §8.5 | `lib/allowlist.mjs`, `.github/security/vulnerability-allowlist.json` | `allowlist.test.mjs` › TODO | `check-allowlist` TODO |
| SCRUM-8-AC-23 | Summary tables, JSON + SARIF, code scanning | §8.4, §6.2 | `vuln-gate.mjs`, `code-scanning` job | `gate.test.mjs` › TODO (markdown) | Security tab TODO |
| SCRUM-8-AC-24 | Gate proven to block (a–d) | §11.3 | `test/gate.test.mjs`, `test/live-gate-selftest.mjs` | TODO | `tooling` + `scan` self-test TODO |
| SCRUM-8-AC-25 | Build once; digests/checksums asserted | §6.2, §9.1, §9.2 | Dockerfile prebuilt mode, `oci-digest.sh`, `verify-release-images.sh`, `assemble-candidate.sh` | — | dry-run TODO; **pending first release** (push-time assertion) |
| SCRUM-8-AC-26 | `SHA256SUMS` over all assets | §9.1 | `assemble-candidate.sh` | — | dry-run bundle TODO |
| SCRUM-8-AC-27 | Traceability chain documented with commands | §13.1 | RELEASE.md | e2e identity tests | TODO |
| SCRUM-8-AC-28 | Post-publish verification | §9.3 | `verify-release.sh` | — | **pending first release** |
| SCRUM-8-AC-29 | Tag ruleset + immutable releases | §12 | RELEASE.md | — | **pending first release** (settings record) |
| SCRUM-8-AC-30 | RELEASE.md | §13.1 | `docs/release/RELEASE.md` | — | PR review |
| SCRUM-8-AC-31 | ROLLBACK.md incl. Flyway caveat | §13.2 | `docs/release/ROLLBACK.md` | — | PR review |
| SCRUM-8-AC-32 | README Releases; ADRs; ADR amendments | §13.3 | README, ADR 0013/0014, notes in 0004/0008/0010 | — | PR review |
| SCRUM-8-AC-33 | First release `v0.1.0` + evidence | §12 | — | — | **pending first release** |
| SCRUM-8-NFR-01 | Least privilege, no PAT, no `pull_request_target` | §6.3 | `release.yml` | workflow review | — |
| SCRUM-8-NFR-02 | Actions SHA-pinned, tools pinned + checksums | §6.4 | `release.yml`, `install-tools.sh`, `.github/tools` | workflow review | — |
| SCRUM-8-NFR-03 | Reproducible jar/tarball, demonstrated | §10 | `repro-jar.sh`, `make-tarball.sh`, vite `SOURCE_DATE_EPOCH` | — | repro rows TODO |
| SCRUM-8-NFR-04 | Dry-run ≤ 15 min; release ≤ 30 min | §14 | — | — | timings TODO |
| SCRUM-8-NFR-05 | Safe publication order; re-runs refuse | §9.2 | `release.yml` publish | — | RELEASE.md recovery |
| SCRUM-8-NFR-06 | Auditable summaries | §6.6 | scripts | — | TODO |
| SCRUM-8-NFR-07 | Logic in tested, linted scripts | §11 | `.github/scripts/release/` | shellcheck + node tests | `tooling` TODO |
| SCRUM-8-NFR-08 | Deterministic apart from CVE feed | §4, §8.4 | `--today`/`--now` injection | tests | — |
| SCRUM-8-NFR-09 | No regression; local workflow unchanged | §5.6, §6.1 | — | all existing tests | CI green TODO |
| SCRUM-8-NFR-10 | Conventions, design, ADRs, matrix, PR | — | — | — | PR TODO |
| SCRUM-8-NFR-11 | No sensitive data in outputs | §7.3, §8.4 | `sbom-finalize.mjs`, secret scan | `sbom.test.mjs` › TODO | gate TODO |

Allow-list entries added in this story (AC-22): TODO (none / list with justification and expiry).
Dependency/base-image bumps made to pass the gate (design R5): TODO (none / list with CVE IDs).
