# SCRUM-8 — Requirements Traceability Matrix

Jira: [SCRUM-8](https://suranagivinod.atlassian.net/browse/SCRUM-8) · Branch: `feature/SCRUM-8-versioning-and-release-strategy` ·
Requirements: [`docs/requirements/SCRUM-8.md`](../requirements/SCRUM-8.md) · Design: [`docs/architecture/SCRUM-8-design.md`](../architecture/SCRUM-8-design.md) ·
ADRs: [0013](../adr/0013-versioning-and-release-process.md), [0014](../adr/0014-vulnerability-scanning-policy.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md) (as amended by [0008](../adr/0008-ci-derived-build-identity.md) and 0013)

**Status: filled by Dev (2026-11-18), pre-merge.** Publication cannot run before merge (design §0, R13): the ACs
marked **pending first release** are evidenced pre-merge by the dry-run plus the tested tooling (AC-12, AC-24) and are
completed with the `v0.1.0` evidence per AC-33 (RELEASE.md §9). Later commits on the branch only touch this file; the
final head SHA and its green runs are listed in the PR.

How to read the columns:
- "Test" for release tooling = `<file> › <test name>` (relative to `.github/scripts/release/test/`), names start with
  the ID; junit in artifact `todo-release-tooling-SCRUM-8-<sha>-reports`.
- Backend/e2e tests as in the SCRUM-7 matrix (`Class#method` / `<file> › <title>`).
- "CI evidence" = workflow `CI` run and workflow `Release` (dry-run) run on `<sha>` with their job summaries and
  artifacts (`todo-release-candidate-SCRUM-8-<sha>`, `todo-release-scan-SCRUM-8-<sha>`, `todo-release-sbom-SCRUM-8-<sha>`).

Dry-run evidence: `Release` run [44364881011](https://github.com/vinods21/todo/actions/runs/44364881011) (all jobs green; `publish`, `verify` **skipped**) · `CI` run
[44364881024](https://github.com/vinods21/todo/actions/runs/44364881024) (4/4 green) · Commit SHA: `93e86f6f5a02e380c380838514b1e86a7d1610e5` · Build version: `0.1.0-93e86f6` · Would-be
release: `0.1.0` (bump patch, no previous tag) · Local image digests: backend
`sha256:5218fdcc51f78dc3d08346a50e96a458766e0f39fac9a931ddab616551f76fee`, frontend
`sha256:e8b39b178926dc4cbc7611b31b1ea5774667e53ce386542f432d412bffee3e8d` (119 MB / 23 MB uncompressed) · Gate
verdict: **PASS** (gated: backend-runtime 0/0/0/0, frontend-prod 0/0/0/0, backend-image 0 C/0 H/1 M/0 L, frontend-image
0/0/1/0, no secrets; reported: frontend-all 1 HIGH without fix — `picomatch` 4.0.7 CVE-2026-112366, dev-only;
allow-list entries: **none**) · Trivy `0.76.2`, vulnerability DB v2 UpdatedAt `2026-11-18T13:03:23Z`, Java DB UpdatedAt
`2026-11-18T00:58:01Z` · SBOM component counts: backend 93, frontend 9, backend-image 157, frontend-image 71
(CycloneDX 1.6 / 1.6 / 1.7 / 1.7, all schema-valid) · Jar reproducible: **yes** (identical SHA-256 `cc3eda99…`) ·
Tarball reproducible: **yes** (`e552950b…`) · Dry-run duration: **4.2 min** wall-clock with a warm Trivy DB cache
(cold DB download run 44362670868: scan job +4 s; NFR-04 ≤ 15 min) · Existing `CI` job deltas vs `main` run
[44257556815](https://github.com/vinods21/todo/actions/runs/44257556815): identity 2 s → 5 s (+3 s, checkout with tags), build 59 s → 62 s, frontend 40 s →
32 s, e2e 322 s → 240 s (runner variance; all within NFR-04's ~2 min)

First release (AC-33): **pending — after merge, per RELEASE.md §9.** To record: run id · tag `v0.1.0` → commit · release
URL · backend `ghcr.io/vinods21/todo-backend@sha256:…` · frontend `ghcr.io/vinods21/todo-frontend@sha256:…` · `verify`
job result (AC-28 table) · `gh attestation verify` / `sha256sum -c` output · packages public · settings applied
(environment `release`, ruleset `release-tags`, immutable releases).

| ID | Description | Design | Code / config | Test | CI / release evidence |
|---|---|---|---|---|---|
| SCRUM-8-AC-01 | SemVer, one product version, `v` prefix, first `0.1.0` | §4.1, ADR 0013 | `lib/semver.mjs`; RELEASE.md §1 | `semver.test.mjs` › `SCRUM-8-AC-01, SCRUM-8-AC-02: invalid explicit version "1.2" is rejected` (×9 inputs), `SCRUM-8-AC-01: every computed release version is plain MAJOR.MINOR.PATCH SemVer` | `tooling` junit (run 44364881011); `version` summary: would-be `0.1.0` |
| SCRUM-8-AC-02 | Next version from highest SemVer tag + bump/explicit | §4.2 | `lib/semver.mjs`, `version.mjs plan` | `semver.test.mjs` › `SCRUM-8-AC-02: no release tag → 0.1.0 for bump=patch` (+minor, major), `… v0.1.0 + patch/minor/major → 0.1.1 / 0.2.0 / 1.0.0`, `… highest tag by SemVer precedence, not lexical order (v0.10.0 > v0.9.0)`, `… non-release tags are ignored …`, `… explicit version lower than or equal … is rejected with a message`, `… shuffled tag order yields the same result`; `version-cli.test.mjs` › `SCRUM-8-AC-02: an invalid explicit version is rejected before any build work (also in dry run)` | `version` summary: "would-be release version `0.1.0` (bump patch)" |
| SCRUM-8-AC-03 | Build versions `X.Y.Z-<sha7>` (Q-07: `g` prefix only for `^0[0-9]{6}$`) | §4.3, §6.1 | `lib/semver.mjs`; `ci.yml` identity | `build-version.test.mjs` › `SCRUM-8-AC-03: after v1.2.0, commit a1b2c3d… → 1.2.1-a1b2c3d`, `… (Q-07): all-digit sha7 with a leading zero gets the g prefix (0123456… → 1.2.1-g0123456)`, `… every build version is valid SemVer 2.0.0 and a valid Docker tag`; `identity.test.mjs` (ADR 0008 parity); `version-cli.test.mjs` › `SCRUM-8-AC-03: identity outputs …` | CI `identity` summary: "Build identity: `SCRUM-8` (commit `93e86f6`) · build version `0.1.0-93e86f6`" |
| SCRUM-8-AC-04 | Same version in jar/manifest/build-info/`/actuator/info`, build-info.json/meta, labels/tags | §5, §6.1 | pom, vite.config.ts, Dockerfiles, `verify-jar.sh`, `verify-images.sh`, `verify-release-images.sh` | `TodoApplicationIntegrationTest#infoCarriesBuildVersion` (`SCRUM-8-AC-04: /actuator/info build.version equals the version the build was stamped with`); `e2e/tests/stack.http.spec.ts` › `SCRUM-7-AC-19, SCRUM-7-AC-04, SCRUM-7-AC-05, SCRUM-8-AC-04: / serves index.html …`, `SCRUM-7-AC-04, SCRUM-8-AC-04: /build-info.json carries the identity and version of the build`, `SCRUM-7-AC-02, SCRUM-7-AC-19, SCRUM-8-AC-04: backend /actuator/info reports the build identity and version` | CI run 44364881024: `build` verify-jar "version 0.1.0-93e86f6", `frontend` "version = 0.1.0-93e86f6; meta tag ok", `e2e` image table version `0.1.0-93e86f6` for both + Playwright 19/19 with `E2E_VERSION`; Release `images`: labels + payload ok |
| SCRUM-8-AC-05 | Tags are source of truth; no commits by the pipeline | §5.1–5.3 | pom `${revision}`, package.json placeholder; no push steps | workflow review: no `git commit`/`git push` step in `ci.yml`/`release.yml`; the only Git write is `create-tag.sh` (tag object + ref) | pom `<version>${revision}</version>`, `<revision>0.0.0-SNAPSHOT`; `package.json` `0.0.0-SNAPSHOT`; tags fetched in `identity`/`version` |
| SCRUM-8-AC-06 | Dispatch inputs; main-only; untagged commit; one release at a time | §4.4, §6.2 | `lib/guard.mjs`, `release.yml` concurrency/env | `guard.test.mjs` › `SCRUM-8-AC-06: a release on refs/heads/feature/x is refused`, `… checked-out commit different from the dispatched one is refused`, `… a commit that already carries v0.1.0 is refused …`; `version-cli.test.mjs` › `SCRUM-8-AC-06: release mode refuses a non-main ref and an already released commit` | **pending first release** (dry-run: mode `dry-run`, guard "ok"; concurrency + environment in workflow) |
| SCRUM-8-AC-07 | Gates before publish; `release-gate` + SCRUM-9 insertion point | §6.2, §6.5 | `release.yml` | workflow review | run 44364881011: `release-gate` needs version, tooling, backend (`mvnw verify`, 144 tests + JaCoCo), frontend (lint, typecheck, 149 tests + coverage), images, sbom, scan — all `success`; SCRUM-9 comment block above `release-gate` |
| SCRUM-8-AC-08 | Pre-existence check; never overwrite | §8.6, §9.2 | `lib/preexistence.mjs`, `preexistence.mjs` | `preexistence.test.mjs` › `SCRUM-8-AC-08: all absent → free (release)` (+ tag / published release / GHCR backend `X.Y.Z` / frontend `X.Y.Z-<id>` exists → refuse, both modes), `… draft release named v0.2.0 (release mode) → refuse`, `… GHCR denied → release refuses (fail closed), dry-run warns …`, `… (design R3) …`, `… the burnt-version message suggests the next patch` | dry-run table: tag/release absent; GHCR `unknown` (anonymous 403 for not-yet-created packages) → warn; **pending first release** (authoritative check) |
| SCRUM-8-AC-09 | Annotated tag on the built commit | §9.2 step 8 | `create-tag.sh` | — | **pending first release** |
| SCRUM-8-AC-10 | GitHub Release with assets + generated notes | §9.1, §9.4 | `assemble-candidate.sh`, `release-notes.mjs` | `notes.test.mjs` › `SCRUM-8-AC-10: commits are grouped by Jira key …`, `… images are referenced by digest and tags`, `SCRUM-8-AC-10, SCRUM-8-AC-31: migrations since the previous release are listed …`, `… vulnerability summary …` | dry-run `candidate/release-notes.md` printed in the `release-gate` log (first release wording, 2 migrations V1/V2, gate PASS); **pending first release** |
| SCRUM-8-AC-11 | Dry-run on PR/push/dispatch, read-only, candidate bundle | §6.2, §6.3 | `release.yml` | `guard.test.mjs` › `SCRUM-8-AC-11: …`; `version-cli.test.mjs` › `SCRUM-8-AC-11: plan on a push is a dry run …` | artifact `todo-release-candidate-SCRUM-8-93e86f6f5a02e380c380838514b1e86a7d1610e5` (run 44364881011); `publish`/`verify` conclusion `skipped`; workflow `permissions: contents: read` |
| SCRUM-8-AC-12 | Release tooling unit-tested | §11.3 | `.github/scripts/release/test/` | 11 suites, **130 tests** (semver 22, build-version 10, tags 3, identity 3, guard 8, version-cli 5, preexistence 17, allowlist 23, gate 24, notes 8, sbom 7), 0 failed (`node --test`, local and CI) | `tooling` summary "130 tests, 0 failed"; artifact `todo-release-tooling-SCRUM-8-<sha>-reports` |
| SCRUM-8-AC-13 | GHCR tags `X.Y.Z`, `X.Y.Z-<id>`, `X.Y`, `latest`, same digest | §4.5, §9.2 | `push-image.sh` | `tags.test.mjs` › `SCRUM-8-AC-13: imageTags('1.2.0', sha) → immutable 1.2.0-a1b2c3d, 1.2.0 first, then moving 1.2, latest` | dry-run tag plan `0.1.0-93e86f6 0.1.0 0.1 latest`; images built under `ghcr.io/vinods21/todo-*` names, not pushed; **pending first release** |
| SCRUM-8-AC-14 | OCI labels incl. version, base.name | §5.4 | Dockerfiles | `verify-images.sh`, `verify-release-images.sh` | CI `e2e` + Release `images` (run 44364881011): version/revision/source/created/jira labels ok, base.name `docker.io/library/eclipse-temurin:21.0.13_9-jre-alpine` / `docker.io/nginx/nginx-unprivileged:1.30.6-alpine3.24` |
| SCRUM-8-AC-15 | CI images versioned, not pushed; Compose runs published images | §5.5, §6.1 | docker-compose.yml, `.env.example`, `check-compose-images.sh` | `check-compose-images.sh` (defaults, CI tag, published release, pinned by digest) | `tooling` (run 44364881011) "Compose image overrides: ok"; CI `e2e` images tagged `<key>-<sha>` + `0.1.0-93e86f6`, not pushed |
| SCRUM-8-AC-16 | Provenance (+ SBOM) attestations; `gh attestation verify` | §9.2 steps 6–7, §9.3 | `release.yml` publish/verify | — | **pending first release** |
| SCRUM-8-AC-17 | Four CycloneDX SBOMs, valid, non-empty, version + commit | §7 | pom plugin, `.github/tools`, `sbom-finalize.mjs`, `validate-sboms.sh` | `sbom.test.mjs` › `SCRUM-8-AC-17: sets the root component name, version, VCS reference and commit/jira/version properties`, `… below the minimum component count → throws …`, `… image SBOMs get the GHCR name and the digest property` | `sbom` job: 4 SBOMs finalized (93 / 9 / 157 / 71 components ≥ floors 74 / 7 / 125 / 56), `cyclonedx validate` "BOM validated successfully" ×4 |
| SCRUM-8-AC-18 | SBOMs as assets + image SBOM attestations; artifacts in dry-run | §7, §9 | `assemble-candidate.sh`, publish step 6 | — | SBOMs in `todo-release-sbom-SCRUM-8-<sha>` and in the candidate `assets/` + `SHA256SUMS`; **pending first release** (assets + `actions/attest` SBOM attestations) |
| SCRUM-8-AC-19 | Maven + npm dependency scanning | §8.2 | `scan.sh` | — | `scan` job: targets backend-runtime, frontend-prod (gated), backend-all-scopes, frontend-all (reported); `todo-release-scan-SCRUM-8-<sha>`; `npm audit` kept in CI `frontend` |
| SCRUM-8-AC-20 | Image scanning incl. secrets | §8.2 | `scan.sh` | — | `scan` job: backend-image, frontend-image with `--scanners vuln,secret` from the OCI archives (0 secrets) |
| SCRUM-8-AC-21 | Gate policy, fail closed, same in dry-run | §8.3, §8.4 | `lib/gate.mjs`, `vuln-gate.mjs` | `gate.test.mjs` › `SCRUM-8-AC-24 (a), SCRUM-8-AC-21: fixable HIGH in a gated target → BLOCKED`, `… unfixed CRITICAL → PASS but listed individually`, `… fixable HIGH only in a reported (test/dev) target → PASS but reported`, `… a secret in an image → BLOCKED`, `SCRUM-8-AC-24 (d), SCRUM-8-AC-21: DB UpdatedAt 4 days old → ERROR …` | run 44362670868: **BLOCKED** (13 fixable findings, frontend-image) → fixed by base-image move → run 44364881011 **PASS** |
| SCRUM-8-AC-22 | Allow-list fields, ≤ 90 days, invalid/expired suppress nothing | §8.5 | `lib/allowlist.mjs`, `.github/security/vulnerability-allowlist.json` | `allowlist.test.mjs` (23 tests) › e.g. `SCRUM-8-AC-22: missing justification → invalid`, `… expiry more than 90 days after added → invalid`, `… expired yesterday → invalid; expires today → still valid (UTC, inclusive)`, `… wildcard package → invalid …` | `tooling` "Allow-list check: No entries (file is valid)" |
| SCRUM-8-AC-23 | Summary tables, JSON + SARIF, code scanning | §8.4, §6.2 | `vuln-gate.mjs`, `code-scanning` job | `gate.test.mjs` › `SCRUM-8-AC-23: markdown contains verdict, per-target counts, DB version and blocking rows` | `scan` job summary tables; JSON + SARIF in `todo-release-scan-…`; `code-scanning` ×4 uploaded (categories `trivy-<target>`) |
| SCRUM-8-AC-24 | Gate proven to block (a–d) | §11.3 | `test/gate.test.mjs`, `test/live-gate-selftest.mjs` | `gate.test.mjs` (a) `…fixable HIGH … → BLOCKED`, (b) `…valid allow-list entry → PASS …`, (c) `…expired entry → BLOCKED …`, (d) `…missing report → ERROR`, CLI exit codes 1/0/2; `live-gate-selftest.mjs` › `SCRUM-8-AC-24 (live): lodash 4.17.20 lockfile → trivy fs → gate BLOCKED`, `… valid allow-list entries → PASS` | `tooling` junit; `scan` self-test ✔ ✔ (suppressed CVE-2021-23337, CVE-2026-4800) |
| SCRUM-8-AC-25 | Build once; digests/checksums asserted | §6.2, §9.1, §9.2 | Dockerfile prebuilt mode, `oci-digest.sh`, `verify-release-images.sh`, `assemble-candidate.sh` | — | `images`: `oci-digest.sh` == build-push digest; `verify-release-images.sh` "app.jar = tested jar `cc3eda997146`", "html/ ⊇ tested bundle (5 files identical)"; `release-gate`: jar/tarball checksums == build outputs; **pending first release** (push-time digest assertion) |
| SCRUM-8-AC-26 | `SHA256SUMS` over all assets | §9.1 | `assemble-candidate.sh` | — | candidate `assets/SHA256SUMS` (8 assets) + `sha256sum -c` in `assemble-candidate.sh`; checksums in the `release-gate` summary |
| SCRUM-8-AC-27 | Traceability chain documented with commands | §13.1 | RELEASE.md | e2e identity tests (`stack.http.spec.ts`, `ui/tasks.spec.ts` footer) | RELEASE.md §6 (chain with commands); CI e2e green |
| SCRUM-8-AC-28 | Post-publish verification | §9.3 | `verify-release.sh` | — | **pending first release** |
| SCRUM-8-AC-29 | Tag ruleset + immutable releases | §12 | RELEASE.md | — | **pending first release** (settings record) |
| SCRUM-8-AC-30 | RELEASE.md | §13.1 | `docs/release/RELEASE.md` | — | PR review (`docs/release/RELEASE.md`) |
| SCRUM-8-AC-31 | ROLLBACK.md incl. Flyway caveat | §13.2 | `docs/release/ROLLBACK.md` | — | PR review |
| SCRUM-8-AC-32 | README Releases; ADRs; ADR amendments | §13.3 | README, ADR 0013/0014, notes in 0004/0008/0010 | — | PR review |
| SCRUM-8-AC-33 | First release `v0.1.0` + evidence | §12 | — | — | **pending first release** |
| SCRUM-8-NFR-01 | Least privilege, no PAT, no `pull_request_target` | §6.3 | `release.yml` | workflow review | — |
| SCRUM-8-NFR-02 | Actions SHA-pinned, tools pinned + checksums | §6.4 | `release.yml`, `install-tools.sh`, `.github/tools` | workflow review | — |
| SCRUM-8-NFR-03 | Reproducible jar/tarball, demonstrated | §10 | `repro-jar.sh`, `make-tarball.sh`, vite `SOURCE_DATE_EPOCH` | — | jar **yes**, tarball **yes** (run 44364881011; run 44361893163 found the jar non-reproducible because of Spring Boot's embedded SBOM → fixed in e8c6ba4) |
| SCRUM-8-NFR-04 | Dry-run ≤ 15 min; release ≤ 30 min | §14 | — | — | dry-run 4.2 min (run 44364881011), parallel to `CI`; existing jobs ≤ +3 s; release ≤ 30 min **pending first release** |
| SCRUM-8-NFR-05 | Safe publication order; re-runs refuse | §9.2 | `release.yml` publish | — | RELEASE.md recovery |
| SCRUM-8-NFR-06 | Auditable summaries | §6.6 | scripts | — | `version` (mode, versions, guard, pre-existence), `scan` (gate), `release-gate` (assets, digests, SBOMs, verdict, repro) summaries; also printed to the logs |
| SCRUM-8-NFR-07 | Logic in tested, linted scripts | §11 | `.github/scripts/release/` | shellcheck + node tests | `tooling`: shellcheck 0.11.0 clean on all scripts + stubs; 130 tests |
| SCRUM-8-NFR-08 | Deterministic apart from CVE feed | §4, §8.4 | `--today`/`--now` injection | tests | — |
| SCRUM-8-NFR-09 | No regression; local workflow unchanged | §5.6, §6.1 | — | all existing tests | CI run 44364881024 green: backend 144, frontend 149, e2e 19 + 3 (dev); changed tests listed in design §5.6 only |
| SCRUM-8-NFR-10 | Conventions, design, ADRs, matrix, PR | — | — | — | commits `SCRUM-8: [DEV]/[CI] …` with `Refs: SCRUM-8`; PR to be opened by the pipeline |
| SCRUM-8-NFR-11 | No sensitive data in outputs | §7.3, §8.4 | `sbom-finalize.mjs`, secret scan | `sbom.test.mjs` › `SCRUM-8-NFR-11: strips absolute runner and workspace paths` | image secret scan: 0 secrets in both images |

Allow-list entries added in this story (AC-22): **none** — `.github/security/vulnerability-allowlist.json` is empty.

Dependency/base-image changes made to pass the gate (design R5, step 1 — base image within its line):

| Change | Commit | Findings cleared (all `frontend-image`, Alpine packages; fixed versions per Trivy) |
|---|---|---|
| `nginxinc/nginx-unprivileged:1.30.6-alpine3.24` → `nginx/nginx-unprivileged:1.30.6-alpine3.24` (same version; upstream publishes to `nginx/` since 2026-10-20, `nginxinc/` no longer rebuilt) | 2223cb7 (a first attempt with `1.30.7-alpine3.24`, 28b3bc8, failed: tag not yet published) | CRITICAL CVE-2026-111497 (brotli-libs); HIGH CVE-2026-107891 (musl, musl-utils), CVE-2026-113351, CVE-2026-115506, CVE-2026-117610, CVE-2026-118370 (libexpat), CVE-2026-125350, CVE-2026-87636, CVE-2026-9947 (libxslt), CVE-2026-85091 (zlib), CVE-2026-92392 (curl, libcurl) |

No Spring Boot / Maven or npm bump was needed (backend-runtime and frontend-prod: 0 findings).

Deviations from the design (recorded for review):
- Trivy reads OCI **layout directories**, not OCI archive tars: `scan.sh` and the `sbom` job unpack the archives
  (same bytes) into `oci/<image>/` (run 44361893163).
- Live gate self-test uses `lodash@4.17.20` (CVE-2021-23337) instead of 4.17.15: Trivy also reports 4.17.15 as
  `NSWG-ECO-516`, which the CVE/GHSA-only allow-list cannot hold (run 44362670868).
- `pom.xml` binds spring-boot-starter-parent's CycloneDX execution `default` to phase `none` (otherwise the jar embeds
  `META-INF/sbom/application.cdx.json` and is not reproducible; run 44361893163).
- `verify-release-images.sh` accepts base-image files next to the bundle (`50x.html`) — every bundle file must be
  byte-identical (run 44361223366).
- `repro-jar.sh` removes `target/` instead of `mvn clean` (clean plugin not cached for the offline rebuild).
- `preexistence.mjs` implements the design-approved R3 fallback (GHCR denied ⇒ absent only before the first release)
  — the dry-run confirmed anonymous GHCR answers 403 for the not-yet-created packages.
- `code-scanning` uploads only SARIF files that exist (a scanner abort is reported once, by `scan`).
