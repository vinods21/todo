# SCRUM-8 — Versioning and Release Strategy: Solution Design

| Field | Value |
|---|---|
| Jira key | [SCRUM-8](https://suranagivinod.atlassian.net/browse/SCRUM-8) (epic SCRUM-5) |
| Requirements | [`docs/requirements/SCRUM-8.md`](../requirements/SCRUM-8.md) — `SCRUM-8-AC-01..33`, `SCRUM-8-NFR-01..11`, assumptions `A-01..A-12`, questions `Q-01..Q-12` |
| Builds on | [SCRUM-7 design](SCRUM-7-design.md) (images, Compose, e2e), [ADR 0008](../adr/0008-ci-derived-build-identity.md), [ADR 0010](../adr/0010-container-images-and-build-identity.md) |
| Branch | `feature/SCRUM-8-versioning-and-release-strategy` |
| Author role | Architect (PM → Architect → Dev pipeline) |
| ADRs | **new** [0013](../adr/0013-versioning-and-release-process.md) versioning + release process (amends 0004, 0008, 0010), **new** [0014](../adr/0014-vulnerability-scanning-policy.md) SBOM + scanning policy + attestations (amends 0010) |
| Traceability matrix | [`docs/traceability/SCRUM-8.md`](../traceability/SCRUM-8.md) (template; Dev fills it) |
| Status | Ready for Dev |

All IDs refer to `docs/requirements/SCRUM-8.md` (prefix `SCRUM-8-` omitted where unambiguous). All assumptions
A-01..A-12 are **accepted**. Open questions are decided in §1.

## 0. Workspace constraints and what was verified (read first)

| Capability | Authoring/Dev workspace | GitHub Actions `ubuntu-latest` |
|---|---|---|
| Maven Central / backend build | **No** | Yes |
| Docker / Buildx / skopeo | **No** | Yes (runner image) |
| npm registry | Yes | Yes |
| GitHub release downloads (`github.com/<o>/<r>/releases/download/…`) | Yes — Trivy 0.76.2, cyclonedx-cli 0.33.1, shellcheck 0.11.0 downloaded and their SHA-256 computed/verified here | Yes |
| `git ls-remote` on public repos (action tag → commit SHA) | Yes — all SHAs in §6.4 resolved this way on 2026-11-18 | Yes |
| GHCR (`ghcr.io`), `mirror.gcr.io` (Trivy DB) | **No** (proxy 403) — Trivy could not download its DB here | Yes |
| `gh api repos/vinods21/todo/...` | Yes (REST; GraphQL and Actions-settings/environments paths blocked) | Yes |

Verified facts used by this design (2026-11-18):
- `vinods21/todo` is public, user-owned, default branch `main`; **no tags, no releases, no rulesets**;
  `GET /repos/vinods21/todo/immutable-releases` → `{"enabled":false,"enforced_by_owner":false}` (Q-08: available).
- Trivy 0.76.2 local spike: `trivy fs --format cyclonedx frontend/package-lock.json` works without DB, emits
  CycloneDX **1.7** with the absolute input path as root name (→ post-processing, §7); `--skip-db-update` on a first
  run exits 1 with "cannot be specified on the first run" (→ fail-closed behaviour, §8.3).
- `@cyclonedx/cyclonedx-npm@7.0.1 --omit dev --spec-version 1.6 --output-reproducible` on `frontend/` → 9 components,
  root `todo-frontend`; `cyclonedx-cli validate --input-version v1_6 --fail-on-errors` passes; cyclonedx-cli
  validates 1.7 by default.
- `node --test "<glob>"` with Node 22.23.4 works; the Q-07 rule output matches the official SemVer 2.0.0 regex for
  `a1b2c3d`, `0123456`→`g0123456`, `1234567`, `0a12345`, `0000000`→`g0000000` (spike, not committed).
- Existing `.github/scripts/*.sh` are shellcheck 0.11.0 clean.
- `actions/attest-sbom` v4 prints a deprecation warning and delegates to `actions/attest` → use `actions/attest`
  directly; `actions/attest` documents `artifact-metadata: write` only for storage records → disabled
  (`create-storage-record: false`, user-owned repo).

Consequence: Dev can implement and **locally run** all Node tooling + tests (`node --test`), shellcheck, the
frontend changes (`npm run lint/typecheck/test:coverage/build`) and the SBOM generation for the frontend. Maven,
Dockerfiles, Trivy scans, GHCR and publication are first exercised in CI (dry-run on the PR); publication only after
merge (AC-33). §15 lists what only CI / the first release can prove.

---

## 1. Decisions on open questions

| Q | Decision | Where |
|---|---|---|
| Q-01 snapshot images | **No** push of build-version images | ADR 0013 §4 |
| Q-02 environment | **Yes**: GitHub Environment `release`, deployment branch policy = `main` only, no required reviewer (single maintainer; can be added without code change). Created manually by the owner (§12) | ADR 0013 §3, §12 |
| Q-03 policy strictness | PM defaults kept: (a) unfixed CRITICAL/HIGH reported only; (b) gate failure makes the dry-run (PR) red | ADR 0014 |
| Q-04 multi-arch | No — `platforms: linux/amd64` | §6.2 |
| Q-05 cosign | No — GitHub attestations only | ADR 0014 |
| Q-06 hotfix lines | Not supported; roll forward from `main` | ADR 0013 §1 |
| Q-07 all-digit SHA | `<id> = g<sha7>` **only** when `<sha7>` matches `^0[0-9]{6}$`, else `<sha7>` (Jira shape `1.2.0-a1b2c3d` kept; always valid SemVer and Docker tag) | §4.3, ADR 0013 §1 |
| Q-08 immutable releases | Available (verified) → enable in first-release procedure; publish order tag → **draft** → upload → publish | §9, ADR 0013 §5 |
| Q-09 GHCR visibility | Packages created by the workflow start private; owner makes them public once; `verify` authenticates (`packages: read`) | §9.3, §12 |
| Q-10 pin existing actions | No (existing `ci.yml` actions stay tag-pinned); every **new** step and all of `release.yml` SHA-pinned | §6.4 |
| Q-11 licence | No LICENSE → `NOASSERTION` stays in labels and SBOM roots | ADR 0014 |
| Q-12 UI footer version | No UI change | — |

Other design choices the requirements left open:
- **Separate workflow** `.github/workflows/release.yml` (name `Release`) for dry-run and release; `ci.yml` only gains
  build versions (§6.1). AC-07: tests run **inside** the release pipeline.
- **Local fallback version** `0.0.0-SNAPSHOT` everywhere (pom `revision`, `package.json`, Vite default, Dockerfile
  `ARG VERSION`, Compose `TODO_VERSION`).
- **Meta tag format** `<meta name="build-info" content="<jira> <commit> <version>">` (third token appended).
- **CI images** keep tag `<JIRA_KEY>-<sha>` (Compose `TODO_IMAGE_TAG`, NFR-09) and get the build version as an
  **additional** tag.
- **Scripting language:** Node ≥ 20 ES modules with **no dependencies** for all logic (JSON-heavy: Trivy reports,
  SBOMs, allow-list), tested with the built-in `node:test` runner (no bats install, same command locally and in CI);
  thin bash wrappers only where the work is CLI orchestration (skopeo, trivy, tar, gh), shellcheck-clean.
- **Pre-existence of GHCR tags** is probed with `skopeo inspect`; tri-state (exists / absent / unknown) with
  fail-closed in release mode (§8.6).
- **Release notes:** rendered by our script (commits grouped by Jira key + migrations + digests + vuln summary), not
  GitHub-generated notes (need the same text in dry-run, offline-testable).

## 2. Change overview

```
ci.yml (unchanged job names)                      release.yml  "Release"   (push feature/** & main, pull_request, workflow_dispatch)
 identity ─ jira_key + build_version (NEW)          version ── mode, version/build_version, guard, read-only pre-existence (AC-02/03/06/08)
   ├ build    -Drevision=<build ver>; verify jar      │   tooling ── node --test (AC-12/24 unit), shellcheck, allow-list check, compose config check
   ├ frontend APP_VERSION; verify build-info.json     ├─ backend ── mvnw verify (tests+JaCoCo) -Drevision -outputTimestamp → jar, 2 Maven SBOMs, repro check
   └ e2e      VERSION=<build ver>; +tag; labels       ├─ frontend ─ lint/typecheck/test:coverage/build APP_VERSION SOURCE_DATE_EPOCH → tarball, npm SBOM, repro
                                                      └─ images ─── buildx (prebuilt jar/dist) → 2 OCI archives (digest) → load (skopeo) → verify labels/payload
                                                          ├─ sbom ── Trivy image SBOMs + finalize + cyclonedx-cli validate (AC-17)
                                                          └─ scan ── Trivy DB (cache, fail closed) → 6 targets → live gate self-test → GATE (AC-19..24)
                                                                └─ code-scanning (SARIF, not fork PRs; not a gate)
                                                   release-gate ◄── needs all (+ SCRUM-9 e2e here) → candidate bundle, SHA256SUMS, notes, summary
                                                   publish  (release mode only; env `release`; write perms) → push immutable tags → attest → tag → draft → publish → move X.Y/latest
                                                   verify   (release mode only) → AC-28 checks from the outside
```

No API/UI behaviour change (NFR-09). Product code changes: `pom.xml` (version + SBOM plugin + surefire property),
`vite.config.ts` (version, `builtAt` from `SOURCE_DATE_EPOCH`), `package.json` version placeholder, Dockerfiles,
Compose. Tests changed intentionally (NFR-09): e2e `stack.http.spec.ts` meta-tag string and `build-info.json` key
list (§5.6).

## 3. Files Dev creates / changes

| File | New/Change | Section | IDs |
|---|---|---|---|
| `pom.xml` | change: `${revision}`, cyclonedx plugin, surefire `build.version.expected` | §5.1, §7.1 | AC-04, AC-05, AC-17 |
| `frontend/vite.config.ts` | change: `APP_VERSION`, meta 3rd token, `builtAt` from `SOURCE_DATE_EPOCH` | §5.2 | AC-04, NFR-03 |
| `frontend/package.json` + `package-lock.json` | version `0.0.0-SNAPSHOT` (`npm version 0.0.0-SNAPSHOT --no-git-tag-version`) | §5.3 | AC-05 |
| `Dockerfile`, `frontend/Dockerfile` | change: `VERSION` into build, `prebuilt` mode, `base.name` label | §5.4 | AC-04, AC-14, AC-25 |
| `docker-compose.yml`, `.env.example` | change: `TODO_VERSION`, `TODO_BACKEND_IMAGE`/`TODO_FRONTEND_IMAGE`, per-service tag | §5.5 | AC-15, AC-31 |
| `src/test/java/com/vinods21/todo/TodoApplicationIntegrationTest.java` | add `SCRUM-8-AC-04` test (method-level `@Tag("SCRUM-8")`) | §5.6 | AC-04 |
| `e2e/tests/support/env.ts`, `fixtures.ts`, `stack.http.spec.ts` | expected version; meta string; key list | §5.6 | AC-04, AC-27 |
| `.github/workflows/ci.yml` | change: identity via script + `build_version`; stamping; verify steps | §6.1 | AC-03, AC-04, AC-15 |
| `.github/workflows/release.yml` | **new** | §6.2 | AC-02..AC-29, NFR-01..06 |
| `.github/scripts/verify-images.sh` | change: `EXPECTED_VERSION` label + `base.name` checks | §6.1 | AC-04, AC-14 |
| `.github/scripts/verify-jar.sh` | **new** (replaces inline step in `ci.yml`, reused by `release.yml`) | §6.1 | AC-04 |
| `.github/scripts/release/**` (scripts, `lib/`, `test/`) | **new** | §11 | AC-02, 03, 06, 08, 10, 12, 17, 21..28, NFR-03, 06, 07 |
| `.github/tools/package.json`, `.github/tools/package-lock.json` | **new** (pins `@cyclonedx/cyclonedx-npm` 7.0.1) | §7.2 | AC-18, NFR-02 |
| `.github/security/vulnerability-allowlist.json` | **new** (empty `entries`) | §8.5 | AC-22 |
| `docs/release/RELEASE.md`, `docs/release/ROLLBACK.md`, `docs/release/vulnerability-policy.md` | **new** | §13 | AC-29..AC-31 |
| `README.md` | change: "Releases" section; Traceability/CI paragraphs | §13.3 | AC-32 |
| `docs/traceability/SCRUM-8.md` | fill (template exists) | — | NFR-10 |
| `docs/adr/0004`, `0008`, `0010` | amendment notes (done by Architect in this commit) | — | AC-32 |

All new scripts: mode `100755`, LF, `#!/usr/bin/env bash` + `set -euo pipefail` or `#!/usr/bin/env node`.

---

## 4. Versioning (ADR 0013 §1)

### 4.1 Definitions

```
RELEASE_TAG_RE = ^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$
VERSION_RE     = ^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$          (explicit input; no "v", no whitespace)
highest(tags)  = max by (major, minor, patch) numerically over tags matching RELEASE_TAG_RE; none → null
```

### 4.2 Next release version — `nextVersion(tags, { bump, explicit })` (AC-02)

| Input | No release tag | Highest `vM.m.p` |
|---|---|---|
| `bump=patch` | `0.1.0` | `M.m.(p+1)` |
| `bump=minor` | `0.1.0` | `M.(m+1).0` |
| `bump=major` | `0.1.0` | `(M+1).0.0` |
| `explicit=X.Y.Z` | `X.Y.Z` if valid | `X.Y.Z` if valid **and** > `M.m.p`, else reject |
| `bump` ∉ {major,minor,patch} / explicit invalid (`1.2`, `v1.2.3`, `01.2.3`, `1.2.3-rc.1`, ` 1.2.3`) | reject | reject |

Rejections throw `VersionError` with a message naming the input and the highest tag; the CLI prints
`::error::` and exits 1 **before any build job** (all jobs `needs: version`). Pure function of (tag list, input) —
order of tags irrelevant (NFR-08).

### 4.3 Build version — `buildVersion(tags, sha)` (AC-03, Q-07)

```
sha must match ^[0-9a-fA-F]{40}$  → sha7 = lower(sha)[0..7)
id   = /^0[0-9]{6}$/.test(sha7) ? "g" + sha7 : sha7
base = highest ? M.m.(p+1) : 0.1.0
→ `${base}-${id}`                        e.g. after v1.2.0, a1b2c3d… → 1.2.1-a1b2c3d ; 0123456… → 1.2.1-g0123456
imageAliasTag(release, sha) = `${release}-${id}`   e.g. 0.1.0-a1b2c3d (same digest as 0.1.0)
```

For `pull_request` events the SHA is `github.sha` (the PR merge commit), consistent with ADR 0008 artefact names.

### 4.4 Mode, stamp version and guard (AC-06, AC-11)

```
mode    = (EVENT == "workflow_dispatch" && INPUT_DRY_RUN == "false") ? "release" : "dry-run"
release_version = nextVersion(tags, { bump: INPUT_BUMP || "patch", explicit: INPUT_VERSION || undefined })
build_version   = buildVersion(tags, SHA)
version (stamped into every artefact) = mode == "release" ? release_version : build_version
jira_key        = jiraKeyFromBranch(BRANCH)     # ADR 0008 regex, moved into lib/identity.mjs; release → "main"
```

`checkReleaseGuard({ mode, ref, dispatchedSha, headSha, releaseTagsAtHead })` — release mode only — refuses when:
`ref != "refs/heads/main"` ("releases are cut from main only; re-run with dry_run=true to test another ref");
`headSha != dispatchedSha` (checkout drifted); `releaseTagsAtHead` non-empty ("commit already released as v…").
`releaseTagsAtHead` = `git tag --points-at HEAD` filtered by `RELEASE_TAG_RE` (tags fetched with
`fetch-depth: 0, fetch-tags: true`). Dry-run never refuses on the guard (the summary states what a release would do).

### 4.5 Image tag plan — `imageTags(release, sha)` (AC-13)

`[X.Y.Z-<id>, X.Y.Z]` (immutable, pushed first) + `[X.Y, latest]` (moving, pushed after the release is published).

---

## 5. Stamping the version (ADR 0013 §2)

### 5.1 `pom.xml` (exact changes)

```xml
    <artifactId>todo-backend</artifactId>
    <!-- SCRUM-8 / ADR 0013: CI-friendly version. Placeholder for local builds only; CI and the Release workflow pass
         -Drevision=<X.Y.Z | X.Y.Z-<sha7>>. Releases come from Git tags vX.Y.Z — never edit this value. -->
    <version>${revision}</version>
    ...
    <properties>
        <revision>0.0.0-SNAPSHOT</revision>
        ...
        <cyclonedx-maven-plugin.version>2.9.3</cyclonedx-maven-plugin.version>
    </properties>
```

- surefire `systemPropertyVariables`: add `<build.version.expected>${project.version}</build.version.expected>`.
- **No** `project.build.outputTimestamp` in the pom (local builds keep real times); CI passes it (§10).
- cyclonedx plugin: §7.1. No flatten plugin (ADR 0013 §2).
- Effects (all from `project.version`): `target/todo-backend-<version>.jar`, manifest `Implementation-Version`
  (`addDefaultImplementationEntries` already on), `META-INF/build-info.properties` `build.version`,
  `/actuator/info` `build.version`, git-commit-id `git.build.version`.

### 5.2 `frontend/vite.config.ts`

```ts
// SCRUM-8-AC-04 (ADR 0013): product/build version from CI (APP_VERSION); local builds say 0.0.0-SNAPSHOT.
const version = firstNonEmpty(process.env.APP_VERSION) ?? '0.0.0-SNAPSHOT'
// SCRUM-8-NFR-03: reproducible bundles — the Release workflow sets SOURCE_DATE_EPOCH to the commit time.
const epoch = process.env.SOURCE_DATE_EPOCH
const builtAt = epoch && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000).toISOString() : new Date().toISOString()
...
attrs: { name: 'build-info', content: `${jira} ${commit} ${version}` },
...
source: `${JSON.stringify({ jira, commit, branch, version, builtAt }, null, 2)}\n`,
```

No `define` for the version (no UI change, Q-12). Key order in `build-info.json`: `jira, commit, branch, version,
builtAt`.

### 5.3 `frontend/package.json`

`"version": "0.0.0-SNAPSHOT"` via `npm version 0.0.0-SNAPSHOT --no-git-tag-version` (updates both root entries in
`package-lock.json`). README states it is a placeholder.

### 5.4 Dockerfiles (ADR 0010 amended)

**Backend `Dockerfile`** — only the changed/added parts:

```dockerfile
# SCRUM-8 (ADR 0013): JAR_SOURCE=source (default: build the jar here, as in SCRUM-7) | prebuilt (Release workflow:
# the tested jar is passed as BuildKit named context `backend-jar` containing app.jar — build once, AC-25).
ARG JAR_SOURCE=source

FROM eclipse-temurin:21.0.13_9-jdk-noble AS build
...                                            # unchanged up to the identity ARGs
ARG VERSION=0.0.0-SNAPSHOT
RUN ./mvnw -B -ntp -Dmaven.test.skip=true -Djacoco.skip=true -Dmaven.gitcommitid.skip=true \
        "-Drevision=${VERSION}" \
        "-Djira.issue=${JIRA_KEY}" "-Dgit.commit.id.full=${GIT_COMMIT}" "-Dgit.branch=${GIT_BRANCH}" \
        package \
 && cp "target/todo-backend-${VERSION}.jar" /workspace/app.jar

FROM scratch AS jar-source
COPY --from=build /workspace/app.jar /app.jar

FROM scratch AS jar-prebuilt
# docker buildx build --build-context backend-jar=<dir with app.jar> --build-arg JAR_SOURCE=prebuilt .
COPY --from=backend-jar app.jar /app.jar

FROM jar-${JAR_SOURCE} AS jar

# ---- runtime stage ----
FROM eclipse-temurin:21.0.13_9-jre-alpine
...
COPY --from=jar /app.jar /app/app.jar
...
ARG VERSION=0.0.0-SNAPSHOT
LABEL ... org.opencontainers.image.version="${VERSION}" ... \
      org.opencontainers.image.base.name="docker.io/library/eclipse-temurin:21.0.13_9-jre-alpine"
```

**Frontend `frontend/Dockerfile`** — analogous:

```dockerfile
ARG DIST_SOURCE=source
FROM node:22.23.4-alpine AS build
...
ARG VERSION=0.0.0-SNAPSHOT
RUN GITHUB_SHA="${GIT_COMMIT}" GITHUB_REF_NAME="${GIT_BRANCH}" APP_VERSION="${VERSION}" npm run build

FROM scratch AS dist-source
COPY --from=build /app/dist/ /dist/
FROM scratch AS dist-prebuilt
# --build-context frontend-dist=<extracted todo-frontend-<v>.tar.gz> --build-arg DIST_SOURCE=prebuilt
COPY --from=frontend-dist / /dist/
FROM dist-${DIST_SOURCE} AS dist

FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24
...
COPY --from=dist /dist/ /usr/share/nginx/html/
...
LABEL ... org.opencontainers.image.base.name="docker.io/nginxinc/nginx-unprivileged:1.30.6-alpine3.24"
```

Notes:
- `ARG VERSION` default changes from `UNKNOWN` to `0.0.0-SNAPSHOT` in both stages (a local image then says what the
  jar/bundle says). `base.name` is a literal kept in sync with `FROM` (ADR 0010 table; bump both together).
  `base.digest` is **not** set: there is no reliable source without digest-pinning the `FROM` (SCRUM-7 Q-04
  follow-up); the image SBOM records the base OS packages (AC-14 "where available").
- BuildKit builds only stages reachable from the target, so the unused `jar-prebuilt`/`dist-prebuilt` stage (and
  its undefined named context) is never resolved in `source` mode (R1 in §15 has the fallback).
- `.dockerignore` files are unchanged (named contexts are separate directories).

### 5.5 Compose (AC-15) and `.env.example`

```yaml
  backend:
    build:
      args:
        ...
        VERSION: ${TODO_VERSION:-0.0.0-SNAPSHOT}          # SCRUM-8: one product version (was TODO_BACKEND_VERSION)
    # SCRUM-8-AC-15: run a published release without building:
    #   TODO_BACKEND_IMAGE=ghcr.io/vinods21/todo-backend TODO_FRONTEND_IMAGE=ghcr.io/vinods21/todo-frontend \
    #   TODO_IMAGE_TAG=0.1.0 docker compose --profile app pull backend frontend && … up --no-build -d --wait
    # Pin by digest (rollback, ROLLBACK.md): TODO_BACKEND_TAG=0.1.0@sha256:<digest> (same for FRONTEND).
    image: ${TODO_BACKEND_IMAGE:-todo-backend}:${TODO_BACKEND_TAG:-${TODO_IMAGE_TAG:-local}}
  frontend:
    build: { args: { ..., VERSION: ${TODO_VERSION:-0.0.0-SNAPSHOT} } }
    image: ${TODO_FRONTEND_IMAGE:-todo-frontend}:${TODO_FRONTEND_TAG:-${TODO_IMAGE_TAG:-local}}
```

Defaults reproduce today's `todo-backend:local` / `todo-frontend:local` (NFR-09). `.env.example` gains commented
`TODO_VERSION`, `TODO_BACKEND_IMAGE`, `TODO_FRONTEND_IMAGE`, `TODO_BACKEND_TAG`, `TODO_FRONTEND_TAG`. Verified by
`check-compose-images.sh` (§11.4) in the `tooling` job (`docker compose config --format json`, no pull).

### 5.6 Tests that change or are added (NFR-09 list)

| Test | Change | ID |
|---|---|---|
| `TodoApplicationIntegrationTest` | **add** `@Tag("SCRUM-8")` method `@DisplayName("SCRUM-8-AC-04: /actuator/info build.version equals the version the build was stamped with")` asserting `$.build.version` == `System.getProperty("build.version.expected")` (and matches `^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$`) | AC-04 |
| `e2e/tests/support/env.ts` | add `expectedVersion: process.env.E2E_VERSION` | AC-04 |
| `e2e/tests/support/fixtures.ts` | `expectedIdentity` also returns `version` (CI env, else `/build-info.json`) | AC-27 |
| `e2e/tests/stack.http.spec.ts` | meta assertion → `content="${jira} ${commit} ${version}"`; key list → `['branch','builtAt','commit','jira','version']`; `if (env.expectedVersion) expect(info.version).toBe(env.expectedVersion)`; prefix titles with `SCRUM-8-AC-04` in addition to the SCRUM-7 IDs | AC-04 |

No frontend unit test asserts the meta content or `build-info.json`; footer tests unchanged.

---

## 6. Workflows

### 6.1 `ci.yml` changes (job names, artifact names unchanged)

1. Header comment: mention SCRUM-8 build versions.
2. **`identity`**: add (SHA-pinned, new step) `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`
   with `fetch-depth: 0`, `fetch-tags: true`, `persist-credentials: false`; replace the inline derivation with
   `node .github/scripts/release/version.mjs identity --github-output "$GITHUB_OUTPUT" --summary "$GITHUB_STEP_SUMMARY"`
   (env `BRANCH`, `SHA: ${{ github.sha }}`). Outputs: `jira_key` (unchanged semantics), **`build_version`**. Summary
   line: `### Build identity: \`<key>\` (commit \`<sha7>\`) · build version \`<build_version>\``.
3. **`build`**: env `BUILD_VERSION: ${{ needs.identity.outputs.build_version }}`; command
   `./mvnw -B -ntp verify "-Djira.issue=${JIRA_KEY}" "-Drevision=${BUILD_VERSION}"`; step "Verify build identity" →
   `.github/scripts/verify-jar.sh "target/todo-backend-${BUILD_VERSION}.jar" "$BUILD_VERSION" "$JIRA_KEY" "$GITHUB_SHA"`.
4. **`frontend`**: env `APP_VERSION: ${{ needs.identity.outputs.build_version }}`; "Verify build identity" also
   asserts `b.version === process.env.APP_VERSION` and that `dist/index.html` contains
   `<meta name="build-info" content="${JIRA_KEY} ${GITHUB_SHA} ${APP_VERSION}">`. `npm audit` step stays.
5. **`e2e`**: env `BUILD_VERSION`; remove `backend_version`/`frontend_version` from "Image metadata"; both builds
   `VERSION=${{ env.BUILD_VERSION }}` and `tags:` add `todo-backend:${{ env.BUILD_VERSION }}` (resp. frontend) as a
   second line; "Verify images" step env `EXPECTED_VERSION: ${{ env.BUILD_VERSION }}`; Playwright steps env
   `E2E_VERSION: ${{ env.BUILD_VERSION }}`.
6. **`verify-images.sh`**: if `EXPECTED_VERSION` is set, `org.opencontainers.image.version` must equal it; label
   `org.opencontainers.image.base.name` must be non-empty; table gains a `version` column. (AC-04 consistency: the
   same `BUILD_VERSION` is asserted in jar, `build-info.json` and both labels of one run.)

`verify-jar.sh <jar> <version> <jira> <sha>` (new, shellcheck-clean): file name is `todo-backend-<version>.jar`;
manifest lines `Implementation-Version: <version>`, `X-Jira-Issue: <jira>`, `X-Git-Commit: <sha>`;
`build-info.properties` (located with `unzip -Z1`, ADR 0008) lines `build.version=<version>`, `build.jira=<jira>`,
`build.git-commit=<sha>`. Prints one summary line; exit 1 with `::error::` on mismatch.

### 6.2 `.github/workflows/release.yml` (sketch — Dev completes step details; SHAs per §6.4)

```yaml
# SCRUM-8 (ADR 0013/0014, design §6.2) — one pipeline, two modes:
#   RELEASE: workflow_dispatch on main with dry_run=false → jobs publish + verify run (environment `release`).
#   DRY RUN: push (feature/**, main), pull_request, or dispatch with dry_run=true → everything up to release-gate;
#            no tag, no image push, no release, no attestation (SCRUM-8-AC-11). Read-only token everywhere.
name: Release

on:
  push:
    branches: ["feature/**", main]
  pull_request:
  workflow_dispatch:
    inputs:
      bump:
        description: "Version bump from the latest vX.Y.Z tag (ignored if 'version' is set)"
        type: choice
        options: [patch, minor, major]
        default: patch
      version:
        description: "Explicit version X.Y.Z (optional; must be greater than the latest release)"
        type: string
        default: ""
      dry_run:
        description: "Dry run: build, test, SBOM, scan and gate only — publish nothing"
        type: boolean
        default: false

permissions:
  contents: read

concurrency:
  group: ${{ (github.event_name == 'workflow_dispatch' && inputs.dry_run == false) && 'release-publish' || format('release-dry-run-{0}', github.ref) }}
  cancel-in-progress: false

env:
  IMAGE_BACKEND: ghcr.io/vinods21/todo-backend
  IMAGE_FRONTEND: ghcr.io/vinods21/todo-frontend

jobs:
  version:                                   # AC-02, AC-03, AC-06, AC-08 (read-only), NFR-06
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      mode: ${{ steps.plan.outputs.mode }}
      version: ${{ steps.plan.outputs.version }}                 # stamped everywhere
      release_version: ${{ steps.plan.outputs.release_version }} # would-be in dry-run
      build_version: ${{ steps.plan.outputs.build_version }}
      previous_tag: ${{ steps.plan.outputs.previous_tag }}       # "" before the first release
      image_tags: ${{ steps.plan.outputs.image_tags }}           # "X.Y.Z-<id> X.Y.Z X.Y latest"
      jira_key: ${{ steps.plan.outputs.jira_key }}
      branch: ${{ steps.plan.outputs.branch }}
      sha: ${{ steps.plan.outputs.sha }}
      commit_epoch: ${{ steps.plan.outputs.commit_epoch }}
    steps:
      - uses: actions/checkout@<sha> # v7.0.1
        with: { ref: "${{ github.sha }}", fetch-depth: 0, fetch-tags: true, persist-credentials: false }
      - uses: actions/setup-node@<sha> # v7.1.0
        with: { node-version-file: frontend/.nvmrc }
      - name: Plan mode and version (SCRUM-8-AC-02, AC-03, AC-06)
        id: plan
        env:                                 # untrusted inputs via env only (NFR-01)
          EVENT_NAME: ${{ github.event_name }}
          REF: ${{ github.ref }}
          BRANCH: ${{ github.head_ref || github.ref_name }}
          SHA: ${{ github.sha }}
          INPUT_BUMP: ${{ inputs.bump }}
          INPUT_VERSION: ${{ inputs.version }}
          INPUT_DRY_RUN: ${{ inputs.dry_run }}
          ACTOR: ${{ github.actor }}
        run: node .github/scripts/release/version.mjs plan --github-output "$GITHUB_OUTPUT" --summary "$GITHUB_STEP_SUMMARY"
      - name: Pre-existence check, read-only (SCRUM-8-AC-08)
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}
          MODE: dry-run                      # advisory for GHCR "unknown"; authoritative re-check in publish
          VERSION: ${{ steps.plan.outputs.release_version }}
          SHA: ${{ github.sha }}
        run: node .github/scripts/release/preexistence.mjs --summary "$GITHUB_STEP_SUMMARY"

  tooling:                                   # AC-12, AC-15 (compose), AC-22, AC-24 (unit), NFR-07
    needs: version                           # only for the ADR 0008 artifact name (jira_key)
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - checkout (ref github.sha, persist-credentials false)
      - setup-node (.nvmrc)
      - name: Install shellcheck (pinned + checksum)
        run: .github/scripts/release/install-tools.sh shellcheck
      - name: Lint shell scripts (SCRUM-8-NFR-07)
        run: shellcheck .github/scripts/*.sh .github/scripts/release/*.sh .github/scripts/release/test/stubs/*
      - name: Release tooling tests (SCRUM-8-AC-12, AC-24)
        run: >
          node --test --test-reporter=spec --test-reporter-destination=stdout
          --test-reporter=junit --test-reporter-destination=reports/release-tooling-junit.xml
          ".github/scripts/release/test/*.test.mjs"
      - name: Allow-list check (SCRUM-8-AC-22)
        run: node .github/scripts/release/vuln-gate.mjs check-allowlist --allowlist .github/security/vulnerability-allowlist.json --today "$(date -u +%F)" --summary "$GITHUB_STEP_SUMMARY"
      - name: Compose image overrides (SCRUM-8-AC-15)
        run: .github/scripts/release/check-compose-images.sh
      - name: AC summary
        if: always()
        run: { grep -oE 'SCRUM-[0-9]+-AC-[0-9]+' reports/release-tooling-junit.xml || true; } | sort -uV | ... >> "$GITHUB_STEP_SUMMARY"
      - upload-artifact (if: always()) name: todo-release-tooling-${{ needs.version.outputs.jira_key }}-${{ github.sha }}-reports

  backend:                                   # AC-04, AC-07, AC-17 (app), NFR-03
    needs: version
    runs-on: ubuntu-latest
    timeout-minutes: 15
    outputs:
      jar_sha256: ${{ steps.stage.outputs.jar_sha256 }}
    env:
      VERSION: ${{ needs.version.outputs.version }}
      JIRA_KEY: ${{ needs.version.outputs.jira_key }}
      SHA: ${{ needs.version.outputs.sha }}
      COMMIT_EPOCH: ${{ needs.version.outputs.commit_epoch }}
    steps:
      - checkout (ref: ${{ needs.version.outputs.sha }}, fetch-depth: 0, persist-credentials: false)
      - setup-java@<sha> # v6.3.0  { distribution: temurin, java-version: "21", cache: maven }
      - name: Build, test, coverage gate (SCRUM-8-AC-07)
        run: ./mvnw -B -ntp verify "-Drevision=${VERSION}" "-Djira.issue=${JIRA_KEY}" "-Dproject.build.outputTimestamp=${COMMIT_EPOCH}"
      - name: Verify version and identity in the jar (SCRUM-8-AC-04)
        run: .github/scripts/verify-jar.sh "target/todo-backend-${VERSION}.jar" "$VERSION" "$JIRA_KEY" "$SHA"
      - name: Backend SBOMs (SCRUM-8-AC-17)
        run: ./mvnw -B -ntp "-Drevision=${VERSION}" "-Dproject.build.outputTimestamp=${COMMIT_EPOCH}" org.cyclonedx:cyclonedx-maven-plugin:makeBom@runtime org.cyclonedx:cyclonedx-maven-plugin:makeBom@all-scopes
      - name: Stage outputs
        id: stage
        run: |  # out/: todo-backend-$VERSION.jar, todo-backend-$VERSION.cdx.json, todo-backend-all-scopes-$VERSION.cdx.json
          ...; echo "jar_sha256=$(sha256sum out/todo-backend-${VERSION}.jar | cut -d' ' -f1)" >> "$GITHUB_OUTPUT"
      - upload reports (if: always()) → todo-release-backend-${JIRA_KEY}-${SHA}-reports (surefire + jacoco)
      - name: Reproducibility check — report only (SCRUM-8-NFR-03)
        run: .github/scripts/release/repro-jar.sh "out/todo-backend-${VERSION}.jar"
      - upload out/ → todo-release-backend-${JIRA_KEY}-${SHA}  (retention-days: 7)

  frontend:                                  # AC-04, AC-07, AC-17 (app), NFR-03
    needs: version
    runs-on: ubuntu-latest
    timeout-minutes: 10
    outputs:
      tarball_sha256: ${{ steps.stage.outputs.tarball_sha256 }}
    env:
      VERSION / JIRA_KEY / SHA as above
      APP_VERSION: ${{ needs.version.outputs.version }}
      SOURCE_DATE_EPOCH: ${{ needs.version.outputs.commit_epoch }}
      # vite reads GITHUB_SHA (runner default) == github.sha == needs.version.outputs.sha — no override needed
    defaults: { run: { working-directory: frontend } }
    steps:
      - checkout (ref sha); setup-node (.nvmrc, cache npm, cache-dependency-path: frontend/package-lock.json + .github/tools/package-lock.json)
      - npm ci; npm run lint; npm run typecheck; npm run test:coverage          # SCRUM-8-AC-07
      - npm run build
      - name: Verify version and identity (SCRUM-8-AC-04)   # build-info.json version/jira/commit/builtAt==epoch ISO; meta tag
      - name: Tarball (SCRUM-8-AC-10, NFR-03)
        run: ../.github/scripts/release/make-tarball.sh dist "../out/todo-frontend-${VERSION}.tar.gz"
      - name: Reproducibility check — report only (NFR-03): rebuild → tarball → compare sha256 → summary row
      - name: Frontend SBOM (SCRUM-8-AC-17)
        run: |
          npm ci --prefix ../.github/tools --no-audit --no-fund
          ../.github/tools/node_modules/.bin/cyclonedx-npm --omit dev --spec-version 1.6 --output-reproducible \
            --output-format JSON --output-file "../out/todo-frontend-${VERSION}.cdx.json"
      - stage (tarball_sha256 output); upload reports (junit, coverage) and out/ → todo-release-frontend-${JIRA_KEY}-${SHA}

  images:                                    # AC-04, AC-13 (local), AC-14, AC-25
    needs: [version, backend, frontend]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    outputs:
      backend_digest: ${{ steps.digests.outputs.backend }}
      frontend_digest: ${{ steps.digests.outputs.frontend }}
    env: VERSION, JIRA_KEY, SHA, BRANCH (needs.version.outputs.branch)
    steps:
      - checkout (ref sha)
      - download-artifact todo-release-backend-… → in/backend ; todo-release-frontend-… → in/frontend
      - name: Prebuilt contexts (build once, SCRUM-8-AC-25)
        run: |
          mkdir -p ctx/backend-jar ctx/frontend-dist
          cp "in/backend/todo-backend-${VERSION}.jar" ctx/backend-jar/app.jar
          tar -xzf "in/frontend/todo-frontend-${VERSION}.tar.gz" -C ctx/frontend-dist
          echo "BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_ENV"
      - uses: docker/setup-buildx-action@<sha> # v4.4.1
      - name: Build backend image once → OCI archive (SCRUM-8-AC-13, AC-25)
        id: backend
        uses: docker/build-push-action@<sha> # v7.4.0
        with:
          context: .
          file: Dockerfile
          platforms: linux/amd64
          push: false
          provenance: false
          sbom: false
          build-contexts: backend-jar=ctx/backend-jar
          outputs: type=oci,dest=images/todo-backend.oci.tar
          tags: ${{ env.IMAGE_BACKEND }}:${{ env.VERSION }}
          build-args: |
            JAR_SOURCE=prebuilt
            VERSION=${{ env.VERSION }}
            JIRA_KEY=${{ env.JIRA_KEY }}
            GIT_COMMIT=${{ env.SHA }}
            GIT_BRANCH=${{ env.BRANCH }}
            BUILD_DATE=${{ env.BUILD_DATE }}
          cache-from: type=gha,scope=release-backend
          cache-to: type=gha,scope=release-backend,mode=max
      - name: Build frontend image once → OCI archive  (context: frontend, build-contexts: frontend-dist=ctx/frontend-dist, DIST_SOURCE=prebuilt, tag ${IMAGE_FRONTEND}:${VERSION})
      - name: Digests (SCRUM-8-AC-25)
        id: digests
        env: { BACKEND_ACTION_DIGEST: "${{ steps.backend.outputs.digest }}", FRONTEND_ACTION_DIGEST: "${{ steps.frontend.outputs.digest }}" }
        run: |  # oci-digest.sh reads index.json (exactly 1 manifest) and asserts == action output
          echo "backend=$(.github/scripts/release/oci-digest.sh images/todo-backend.oci.tar "$BACKEND_ACTION_DIGEST")" >> "$GITHUB_OUTPUT"
          echo "frontend=$(.github/scripts/release/oci-digest.sh images/todo-frontend.oci.tar "$FRONTEND_ACTION_DIGEST")" >> "$GITHUB_OUTPUT"
      - name: Load for verification
        run: |
          skopeo copy "oci-archive:images/todo-backend.oci.tar" "docker-daemon:${IMAGE_BACKEND}:${VERSION}"
          skopeo copy "oci-archive:images/todo-frontend.oci.tar" "docker-daemon:${IMAGE_FRONTEND}:${VERSION}"
      - name: Verify labels and payload (SCRUM-8-AC-04, AC-14, AC-25)
        run: .github/scripts/release/verify-release-images.sh "${IMAGE_BACKEND}:${VERSION}" "${IMAGE_FRONTEND}:${VERSION}" in/backend in/frontend
      - upload images/ → todo-release-images-${JIRA_KEY}-${SHA}  (compression-level: 0, retention-days: 7)

  sbom:                                      # AC-17, AC-18
    needs: [version, backend, frontend, images]
    steps: checkout; download backend/frontend/images; install-tools.sh trivy cyclonedx-cli;
      trivy image --input images/todo-backend.oci.tar --format cyclonedx --output sbom/todo-backend-image-$V.cdx.json  (+ frontend)
      copy app SBOMs (runtime + npm) into sbom/
      node .github/scripts/release/sbom-finalize.mjs --version "$V" --sha "$SHA" --jira "$JIRA_KEY" sbom/*.cdx.json   # §7.3
      .github/scripts/release/validate-sboms.sh sbom/*.cdx.json                                                       # cyclonedx-cli per specVersion
      upload sbom/ → todo-release-sbom-${JIRA_KEY}-${SHA}

  scan:                                      # AC-19..AC-24
    needs: [version, backend, frontend, images]
    timeout-minutes: 15
    steps:
      - checkout (ref sha) ; download backend/frontend/images ; install-tools.sh trivy
      - id: day ; run: echo "day=$(date -u +%F)" >> "$GITHUB_OUTPUT"
      - uses: actions/cache@<sha> # v6.1.0
        with: { path: ~/.cache/trivy, key: "trivy-db-${{ steps.day.outputs.day }}", restore-keys: "trivy-db-" }
      - name: Update vulnerability DBs — fails closed (SCRUM-8-AC-21)
        run: |
          trivy image --download-db-only --cache-dir ~/.cache/trivy
          trivy image --download-java-db-only --cache-dir ~/.cache/trivy
          trivy version --cache-dir ~/.cache/trivy --format json > scan/trivy-version.json
      - name: Scan dependencies and images (SCRUM-8-AC-19, AC-20)
        run: .github/scripts/release/scan.sh "$VERSION"      # §8.2; every trivy call --skip-db-update --skip-java-db-update
      - name: Gate self-test against the live scanner (SCRUM-8-AC-24)
        run: node .github/scripts/release/test/live-gate-selftest.mjs --cache-dir ~/.cache/trivy --db scan/trivy-version.json
      - name: Vulnerability gate (SCRUM-8-AC-21, AC-22, AC-23)
        run: >
          node .github/scripts/release/vuln-gate.mjs gate
          --allowlist .github/security/vulnerability-allowlist.json --db scan/trivy-version.json --today "$(date -u +%F)"
          --gated backend-runtime=scan/backend-runtime.json --gated frontend-prod=scan/frontend-prod.json
          --gated backend-image=scan/backend-image.json --gated frontend-image=scan/frontend-image.json
          --reported backend-all-scopes=scan/backend-all-scopes.json --reported frontend-all=scan/frontend-all.json
          --out scan/verdict.json --markdown scan/summary.md --summary "$GITHUB_STEP_SUMMARY"
      - upload scan/ (if: always()) → todo-release-scan-${JIRA_KEY}-${SHA}

  code-scanning:                             # AC-23 (SARIF → Security tab); reporting only, not a gate
    needs: [version, scan]
    if: ${{ !cancelled() && needs.scan.result != 'skipped' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository) }}
    permissions: { contents: read, security-events: write }
    strategy: { matrix: { target: [backend-runtime, frontend-prod, backend-image, frontend-image] } }
    steps:
      - download todo-release-scan-… → scan/
      - uses: github/codeql-action/upload-sarif@<sha> # v4.39.3
        with: { sarif_file: "scan/${{ matrix.target }}.sarif", category: "trivy-${{ matrix.target }}" }

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # RELEASE GATE — the single aggregation point (SCRUM-8-AC-07). `publish` needs only this job (plus outputs).
  # SCRUM-9: add the pre-release e2e job to `needs` below. It must consume the SAME images: download artifact
  # todo-release-images-<JIRA_KEY>-<sha>, `skopeo copy oci-archive:… docker-daemon:<IMAGE>:<version>`, then
  # TODO_BACKEND_IMAGE=$IMAGE_BACKEND TODO_FRONTEND_IMAGE=$IMAGE_FRONTEND TODO_IMAGE_TAG=<version>
  # docker compose --profile app up --no-build -d --wait  (design §6.5).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  release-gate:
    needs: [version, tooling, backend, frontend, images, sbom, scan]
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Every gate passed
        env: { NEEDS: "${{ toJSON(needs) }}" }
        run: node -e 'const n=JSON.parse(process.env.NEEDS);const bad=Object.entries(n).filter(([,v])=>v.result!=="success");if(bad.length){console.error("::error::gate inputs not successful: "+bad.map(([k,v])=>k+"="+v.result).join(", "));process.exit(1)}'
      - checkout (ref sha, fetch-depth 0, fetch-tags true)   # notes need history
      - download backend, frontend, sbom, scan artifacts
      - name: Assemble release-candidate bundle (SCRUM-8-AC-10, AC-11, AC-26)
        env: version outputs, digests (needs.images.outputs.*), JAR_SHA256 / TARBALL_SHA256 (needs.backend/frontend outputs), MODE, RUN_URL
        run: .github/scripts/release/assemble-candidate.sh     # §9.1 — asserts AC-25 checksums, writes SHA256SUMS, notes, images.json, summary
      - upload candidate/ → todo-release-candidate-${JIRA_KEY}-${SHA}   (retention-days: 30)

  publish:                                   # AC-08..AC-10, AC-13, AC-16, AC-18, AC-25, NFR-05
    needs: [version, images, release-gate]
    if: ${{ needs.version.outputs.mode == 'release' && github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' }}
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment:
      name: release
      url: ${{ steps.release.outputs.url }}
    permissions:
      contents: write        # tag + release
      packages: write        # GHCR push
      id-token: write        # Sigstore OIDC (attestations)
      attestations: write
    env: VERSION, SHA, IMAGE_TAGS, BACKEND_DIGEST, FRONTEND_DIGEST, PREVIOUS_TAG, GH_TOKEN: ${{ github.token }}, REPO: ${{ github.repository }}
    steps: §9.2 (each a separate named step; scripts under .github/scripts/release/)

  verify:                                    # AC-16, AC-28
    needs: [version, images, publish]
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: read, attestations: read }
    steps: checkout; docker/login-action (ghcr, github.actor, github.token); verify-release.sh  (§9.3)
```

### 6.3 Permissions and safety matrix (NFR-01, AC-11)

| Job | Token permissions | Runs in dry-run | Notes |
|---|---|---|---|
| all except below | `contents: read` | yes | fork PRs: GitHub forces read-only anyway |
| `code-scanning` | `contents: read`, `security-events: write` | yes, not for fork PRs | reporting only |
| `publish` | `contents/packages/id-token/attestations: write` | **never** (`if`) | + environment `release` (main only) → a non-`main` ref cannot run it even if the `if` were wrong |
| `verify` | `contents: read`, `packages: read`, `attestations: read` | never | |

No `pull_request_target`; no PAT; no secrets beyond `GITHUB_TOKEN`/OIDC. All `${{ }}` that carry untrusted data
(branch, dispatch inputs) go through `env:`; scripts validate (`VERSION_RE`, choice) before use. `persist-credentials:
false` on every checkout. Dispatch inputs are only read by `version.mjs`.

### 6.4 Pinned actions (all resolved with `git ls-remote` on 2026-11-18; lightweight tags → commit SHA, annotated → peeled `^{}`)

| Action | Version | Commit SHA |
|---|---|---|
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `actions/setup-java` | v6.3.0 | `d1374f8ac74474200d16ef8ecee22c7ae7a51880` |
| `actions/upload-artifact` | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| `actions/download-artifact` | v8.0.2 | `9000827ccba6bdab643e8b6fd33ac0654aef8333` |
| `actions/cache` | v6.1.0 | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` |
| `docker/setup-buildx-action` | v4.4.1 | `f87e5991a6d7451dcb8d9637bfbc97413f497069` |
| `docker/build-push-action` | v7.4.0 | `c3c9e263c25d99ce0380d002d59b67737d91b0dc` |
| `docker/login-action` | v4.8.0 | `8aa5831fb8d48d8f76594c7ddde61ae58019f550` |
| `actions/attest` | v4.2.2 | `1e69f48acb82d1966a394da916b4c1698aa569d6` |
| `github/codeql-action/upload-sarif` | v4.39.3 | `33d7b85da1a04171e211befe2c739303b9a4c066` (peeled; tag object `f3bbb056…`) |

Written as `uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`. Not used: `trivy-action`,
`setup-trivy` (March 2026 tag hijack, ADR 0014), `actions/attest-sbom`, `actions/attest-build-provenance` (both
wrap `actions/attest`). CLI tools: ADR 0014 table (Trivy 0.76.2, cyclonedx-cli 0.33.1, shellcheck 0.11.0 with
SHA-256; cyclonedx-npm 7.0.1 via lockfile; cyclonedx-maven-plugin 2.9.3). Runner-provided and recorded in the
summary (not pinnable without own images): Docker, Buildx (installed by setup-buildx), skopeo, `gh`, `jq`.

### 6.5 SCRUM-9 insertion point (AC-07)

`release-gate.needs` gets one more entry (`e2e-release`). That job `needs: [version, images]`, downloads
`todo-release-images-<KEY>-<sha>`, loads both archives with `skopeo copy oci-archive:… docker-daemon:<IMAGE>:<version>`,
and runs the existing Playwright suite against `docker compose --profile app up --no-build -d --wait` with
`TODO_BACKEND_IMAGE/TODO_FRONTEND_IMAGE/TODO_IMAGE_TAG` (AC-15) and `E2E_VERSION=<version>` — i.e. against the
exact digests that will be published. Nothing else changes.

### 6.6 Run summary (NFR-06)

`version` writes: mode (**RELEASE** / **DRY RUN**), event, actor, ref, full SHA, previous tag, release version (or
"would be"), build version, stamped version, image tag plan, guard result, pre-existence table. `release-gate` writes:
artefact table (file, size, SHA-256), image refs + digests (local in dry-run), SBOM list with component counts, gate
verdict + counts (link to scan summary), allow-list entries in effect (id, package, expiry), repro results, link to
the candidate artifact. `publish`/`verify`: pushed refs + digests, tag/release URL, attestation IDs, AC-28 table,
recovery instructions on failure.

---

## 7. SBOMs (AC-17, AC-18, ADR 0014)

### 7.1 Maven (`pom.xml`)

```xml
<plugin>
    <groupId>org.cyclonedx</groupId>
    <artifactId>cyclonedx-maven-plugin</artifactId>
    <version>${cyclonedx-maven-plugin.version}</version>
    <configuration>
        <projectType>application</projectType>
        <schemaVersion>1.6</schemaVersion>
        <outputFormat>json</outputFormat>
        <includeLicenseText>false</includeLicenseText>
    </configuration>
    <executions>
        <!-- SCRUM-8-AC-17: not bound to a phase; the Release workflow calls makeBom@runtime / makeBom@all-scopes -->
        <execution>
            <id>runtime</id>
            <phase>none</phase>
            <configuration>
                <outputName>todo-backend-${project.version}.cdx</outputName>
                <includeTestScope>false</includeTestScope>
            </configuration>
        </execution>
        <execution>
            <id>all-scopes</id>
            <phase>none</phase>
            <configuration>
                <outputName>todo-backend-all-scopes-${project.version}.cdx</outputName>
                <includeTestScope>true</includeTestScope>
            </configuration>
        </execution>
    </executions>
</plugin>
```

Output `target/<outputName>.json`. Hashes are included by default; licences "where known".

### 7.2 npm (`.github/tools/`)

`.github/tools/package.json`: `{ "name": "todo-release-tools", "private": true, "devDependencies": {
"@cyclonedx/cyclonedx-npm": "7.0.1" } }` + lockfile from `npm install` (commit both; `node_modules` git-ignored).
Command in §6.2 (`--omit dev` = production deps of `frontend/package-lock.json`).

### 7.3 `sbom-finalize.mjs` (applies to all four; then validated)

- `metadata.component`: `name` = `todo-backend` / `todo-frontend` / `ghcr.io/vinods21/todo-backend` /
  `ghcr.io/vinods21/todo-frontend` (by file name pattern), `version` = `<version>`; add `externalReferences`
  `{type: "vcs", url: "https://github.com/vinods21/todo"}` (if missing); `properties` += `com.vinods21.todo:commit=<sha>`,
  `com.vinods21.todo:jira=<key>`, `com.vinods21.todo:version=<version>`; image SBOMs also
  `com.vinods21.todo:image-digest=<digest>` (passed via `--digest name=…`).
- Replace any string value starting with `/home/runner/` or `$GITHUB_WORKSPACE` by a repo-relative path (NFR-11).
- Minimum `components.length` (fail with `::error::` if lower): backend 40, frontend 3, backend-image 40,
  frontend-image 15 (constants in the script; Dev records actual counts from the first dry-run in the matrix; raise
  floors to ~80 % of the observed counts).
- Keeps `serialNumber`; writes 2-space JSON + newline.
- `validate-sboms.sh`: for each file `v=$(jq -r .specVersion)`; require `v` ≥ 1.5; `cyclonedx validate --input-file
  f --input-format json --input-version "v${v/./_}" --fail-on-errors`.

---

## 8. Scanning and the gate (AC-19..AC-24, ADR 0014)

### 8.1 Trivy installation (`install-tools.sh`)

One script holds every downloaded tool's version + SHA-256 (ADR 0014 table). Usage `install-tools.sh trivy
cyclonedx-cli shellcheck` → downloads from `https://github.com/<owner>/<repo>/releases/download/…` into
`$RUNNER_TEMP/tools/bin` (or `./.tools/bin` locally), `sha256sum -c` (fail on mismatch), adds to `$GITHUB_PATH`,
prints `<tool> <version>`. Bumping a tool = edit version + checksum in one place.

### 8.2 `scan.sh <version>` — targets (all `--format json --cache-dir ~/.cache/trivy --skip-db-update --skip-java-db-update --exit-code 0 --quiet`)

| Target | Command | Class |
|---|---|---|
| `backend-runtime` | `trivy sbom in/backend/todo-backend-$v.cdx.json` | gated |
| `backend-all-scopes` | `trivy sbom in/backend/todo-backend-all-scopes-$v.cdx.json` | reported |
| `frontend-prod` | `trivy sbom in/frontend/todo-frontend-$v.cdx.json` | gated |
| `frontend-all` | `trivy fs --include-dev-deps frontend/package-lock.json` | reported |
| `backend-image` | `trivy image --input images/todo-backend.oci.tar --scanners vuln,secret` | gated |
| `frontend-image` | `trivy image --input images/todo-frontend.oci.tar --scanners vuln,secret` | gated |

Then `trivy convert --format sarif --output scan/<t>.sarif scan/<t>.json` for each. `set -euo pipefail`: any
non-zero Trivy exit fails the step (scanner error ⇒ gate never reached ⇒ `release-gate` fails). Trivy's exit code is
not used as the policy (`--exit-code 0`); the policy is ours.

### 8.3 DB handling (AC-21 fail-closed, NFR-04, R4)

- Cache `~/.cache/trivy` per UTC day (`actions/cache`, restore-keys `trivy-db-`), then explicit
  `--download-db-only` / `--download-java-db-only`: Trivy refreshes when the cached DB is past its `NextUpdate`; a
  failed download exits non-zero ⇒ job fails. Default repositories (`mirror.gcr.io/aquasec/trivy-db:2`, then
  `ghcr.io/aquasecurity/trivy-db:2`; same for java-db) — the mirror avoids GHCR rate limits.
- `scan/trivy-version.json` (`trivy version --format json`) records `Version`, `VulnerabilityDB.{Version,UpdatedAt,
  NextUpdate,DownloadedAt}`, `JavaDB.{…}`; the gate requires it and requires `VulnerabilityDB.UpdatedAt` ≤ 72 h old.

### 8.4 Gate — `vuln-gate.mjs gate` (exit 0 PASS, 1 BLOCKED, 2 ERROR)

```
load db meta            → error if missing/unparsable/UpdatedAt > 72h before --now (default: Date.now())
for each --gated/--reported name=path:
  report = parse(path)  → error if missing, unparsable, SchemaVersion != 2, no ArtifactName
  for r of report.Results ?? []:
    for v of r.Vulnerabilities ?? []: finding{target:name, class, kind:"vulnerability", id:v.VulnerabilityID,
         pkg:v.PkgName, installed:v.InstalledVersion, fixed:v.FixedVersion ?? "", status:v.Status ?? "",
         severity:v.Severity ?? "UNKNOWN", source:v.SeveritySource ?? "", title:v.Title ?? "", url:v.PrimaryURL ?? "",
         location:r.Target}
    for s of r.Secrets ?? []:        finding{kind:"secret", id:`secret:${s.RuleID}`, pkg:r.Target, severity:s.Severity, title:s.Title}
allowlist = validateAllowlist(file, today)   → {valid, invalid:[{entry, reasons}]}; unparsable file → error
fixable(f)  = f.status === "fixed" || f.fixed.trim() !== ""
blocking(f) = f.class === "gated" && (
                 (f.kind === "vulnerability" && ["CRITICAL","HIGH"].includes(f.severity) && fixable(f)) ||
                 (f.kind === "secret" && /image$/.test(f.target)) )
suppressed(f) = valid.find(e => e.id === f.id && e.targets.includes(f.target) && e.package === f.pkg
                                 && (e.type === "secret") === (f.kind === "secret"))
verdict = errors ? ERROR : blocking∖suppressed non-empty ? BLOCKED : PASS
outputs: verdict.json {verdict, generatedAt, today, trivy:{version, db}, targets:{name:{class, counts:{CRITICAL,HIGH,MEDIUM,LOW,UNKNOWN}, secrets}},
         blocking[], suppressed[{finding, entry}], unfixedCriticalHigh[], reportedOnly[], allowlist:{valid, invalid, unused}, errors[]}
         summary markdown (§6.6 / AC-23), `::error::` annotation per blocking finding
```

Dedup key for display: `(id, pkg, installed)` across targets (the jar deps appear in `backend-runtime` and
`backend-image`); counts stay per target. "Reported only" = findings in reported targets whose key is not in any
gated target. Subcommand `check-allowlist` runs only the validation and prints the same allow-list tables (exit 2 only
if the file is unparsable / `version != 1`).

### 8.5 Allow-list file and validation rules (AC-22)

`.github/security/vulnerability-allowlist.json` — initial content:

```json
{
  "$comment": "SCRUM-8-AC-22 / ADR 0014 / docs/release/vulnerability-policy.md. Required per entry: id, type, package, targets, justification, owner, added, expires (<= added + 90 days). Invalid or expired entries suppress nothing.",
  "version": 1,
  "entries": []
}
```

`validateAllowlist(doc, today)` reasons (each entry may collect several): `missing <field>`; `id not CVE-/GHSA-`
(regexes `^CVE-\d{4}-\d{4,}$`, `^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$`, or `^secret:[A-Za-z0-9._-]+$` iff
`type: "secret"`); `type not vulnerability|secret`; `targets empty`; `unknown target <t>` (allowed: the four gated
names); `wildcard in package`; `justification shorter than 20 characters`; `owner not a Jira key or GitHub login`
(`^SCRUM-\d+$|^@?[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`); `added/expires not YYYY-MM-DD`; `added in the future`;
`expires before added`; `expiry more than 90 days after added`; `expired on <date>` (today > expires; UTC; the
expiry day itself is still valid). Unknown extra fields → warning only.

### 8.6 Pre-existence — `preexistence.mjs` (AC-08)

Probes (each returns `exists | absent | unknown` + detail); commands injectable via env `GIT_BIN`, `GH_BIN`,
`SKOPEO_BIN` for tests:

| Probe | Command | exists | absent | unknown |
|---|---|---|---|---|
| tag `vX.Y.Z` | `git ls-remote --tags https://github.com/$REPO refs/tags/vX.Y.Z` | non-empty | empty, exit 0 | exit ≠ 0 |
| release `vX.Y.Z` | `gh api repos/$REPO/releases/tags/vX.Y.Z` (+ in release mode: `gh api --paginate repos/$REPO/releases --jq '.[]|select(.tag_name=="vX.Y.Z" or .name=="vX.Y.Z")'` to see drafts) | 200 / match | 404 / no match | other |
| GHCR `X.Y.Z`, `X.Y.Z-<id>` × 2 images | `skopeo inspect --raw docker://<image>:<tag>` (release mode: after `docker/login-action`) | exit 0 | stderr matches `manifest unknown\|MANIFEST_UNKNOWN\|NAME_UNKNOWN\|name unknown` | anything else (401/403/denied/network) |

Decision (`decidePreexistence(results, mode)` — pure, unit-tested): any `exists` → **refuse** (message names each
existing item and: "version X.Y.Z is burnt — dispatch with version=X.Y.(Z+1)"); any `unknown` → release mode
**refuse** (fail closed), dry-run **warn** (summary row "unknown — re-checked authoritatively at publish"); else free.
Tag/release probes are authoritative in both modes (public repository). Exit 1 on refuse.

---

## 9. Release candidate and publication

### 9.1 `assemble-candidate.sh` (release-gate job; same in both modes)

```
candidate/assets/
  todo-backend-<v>.jar                     (from backend artifact)
  todo-frontend-<v>.tar.gz                 (from frontend artifact)
  todo-backend-<v>.cdx.json  todo-frontend-<v>.cdx.json  todo-backend-image-<v>.cdx.json  todo-frontend-image-<v>.cdx.json   (finalized)
  todo-scan-reports-<v>.tar.gz             (scan/*.json, scan/*.sarif, verdict.json, summary.md, trivy-version.json; deterministic tar)
  todo-images-<v>.json                     ({version, commit, images:[{name, digest, tags:[…]}]})
  SHA256SUMS                               (sha256sum of every other file in assets/, sorted by name, "<hex>  <name>")
candidate/release-notes.md                 (release-notes.mjs, §9.4)
candidate/plan.json                        (version job outputs + mode)
```

Asserts (exit 1): jar and tarball SHA-256 in `SHA256SUMS` equal `needs.backend.outputs.jar_sha256` /
`needs.frontend.outputs.tarball_sha256` (AC-25); `(cd assets && sha256sum -c SHA256SUMS)`; four SBOMs present.
Writes the §6.6 summary with a **DRY RUN** / **RELEASE CANDIDATE** banner.

### 9.2 `publish` steps (order = ADR 0013 §5; every step's failure stops the job)

| # | Step | Command / action | Fails if |
|---|---|---|---|
| 1 | Download candidate + images | `actions/download-artifact` | — |
| 2 | Re-verify bundle (AC-25) | `sha256sum -c`; `oci-digest.sh` == `needs.images.outputs.*_digest` | mismatch |
| 3 | Log in to GHCR | `docker/login-action@<sha> # v4.8.0` (`ghcr.io`, `${{ github.actor }}`, `${{ github.token }}`) — skopeo reads `~/.docker/config.json` | — |
| 4 | Authoritative pre-existence (AC-08) | `MODE=release node …/preexistence.mjs` | exists or unknown |
| 5 | Push immutable tags (AC-13) | `push-image.sh images/<x>.oci.tar <image> <X.Y.Z-id> <X.Y.Z>`: `skopeo copy --preserve-digests oci-archive:<tar> docker://<image>:<tag>` then `skopeo inspect --raw docker://<image>:<tag> \| sha256sum` == digest | digest differs |
| 6 | Attest images (AC-16, AC-18) | `actions/attest@<sha> # v4.2.2` ×4: provenance (`subject-name: ${{ env.IMAGE_BACKEND }}`, `subject-digest`, `push-to-registry: true`, `create-storage-record: false`) and SBOM (`sbom-path: candidate/assets/todo-backend-image-<v>.cdx.json`, same subject) — same for frontend | API error |
| 7 | Attest files (AC-16) | `actions/attest` with `subject-path: candidate/assets/*` (provenance for all assets incl. `SHA256SUMS`) | API error |
| 8 | Annotated tag (AC-09) | `create-tag.sh vX.Y.Z <sha>`: `gh api repos/$REPO/git/tags -f tag=vX.Y.Z -f message="todo X.Y.Z\n\nCommit: <sha>\nRun: <url>" -f object=<sha> -f type=commit` → `gh api repos/$REPO/git/refs -f ref=refs/tags/vX.Y.Z -f sha=<tag-object-sha>`; then `git ls-remote` shows `refs/tags/vX.Y.Z^{}` = `<sha>` | ref exists (422) / mismatch |
| 9 | Draft release + assets (AC-10, AC-18) | `gh release create vX.Y.Z --verify-tag --draft --title vX.Y.Z --notes-file candidate/release-notes.md candidate/assets/*` | any upload fails |
| 10 | Publish (AC-10, AC-29) | `gh release edit vX.Y.Z --draft=false --prerelease=false --latest`; `id: release` → output `url` | — |
| 11 | Move convenience tags (AC-13) | `push-image.sh … <X.Y> latest` (same digest assertion) | digest differs |
| 12 | Summary | refs, digests, release URL, attestation IDs | — |

Partial-state table for `RELEASE.md` (NFR-05): fail at 1–4 → nothing published, re-run allowed; 5–7 → immutable
image tags (+ attestations) exist, no tag/release → version burnt, next patch; 8 → tag may exist, no release → burnt
(do not delete the tag); 9 → tag + draft exist → owner deletes the **draft** only (drafts are not public), version
burnt; 10–11 → release public, convenience tags may lag → run `push-image.sh` for `X.Y`/`latest` manually per runbook
(only moving tags may ever be (re)pointed) or release the next patch. **Re-running `publish` never resumes**: step 4
refuses because the immutable tags exist.

### 9.3 `verify` — `verify-release.sh` (AC-28; also AC-16)

Checks (each a table row; any failure → exit 1 + "Recovery" section pointing to `RELEASE.md#failure-recovery`):
1. For each image: `skopeo inspect --raw docker://<image>:<t> | sha256sum` == expected digest for `t` ∈ {`X.Y.Z`,
   `X.Y.Z-<id>`, `X.Y`, `latest`}.
2. Labels via `skopeo inspect --config docker://<image>@<digest>`: `version == X.Y.Z`, `revision == <sha>`,
   `source == https://github.com/vinods21/todo`, jira `main`.
3. `gh attestation verify oci://<image>@<digest> --repo vinods21/todo --signer-workflow vinods21/todo/.github/workflows/release.yml`
   (provenance) and `… --predicate-type https://cyclonedx.org/bom` (SBOM).
4. `gh release download vX.Y.Z -D dl` → `(cd dl && sha256sum -c SHA256SUMS)`; `gh attestation verify dl/todo-backend-X.Y.Z.jar --repo vinods21/todo`
   and the tarball.
5. `git ls-remote https://github.com/$REPO refs/tags/vX.Y.Z refs/tags/vX.Y.Z^{}` → two lines (annotated), peeled
   == `<sha>`.
6. `gh api repos/$REPO/releases/latest --jq .tag_name` == `vX.Y.Z`; release not draft/prerelease.
7. If `gh api repos/$REPO/immutable-releases --jq .enabled` is `true`: `gh release verify vX.Y.Z` (informational row
   if the installed `gh` lacks the command).

### 9.4 `release-notes.mjs` (AC-10, AC-31)

Inputs: `--version --sha --previous-tag --digests backend=…,frontend=… --verdict scan/verdict.json --repo --run-url`.
Git data via `git log --no-merges --format=%H%x09%s <prev>..<sha>` (all history if no previous tag) and
`git diff --name-only --diff-filter=A <prev> <sha> -- src/main/resources/db/migration` (no prev → `git ls-tree`
listing). Pure renderer `renderNotes(data)` (unit-tested) produces:

```
## todo vX.Y.Z                       (dry-run: "## todo vX.Y.Z — DRY RUN (would-be release)")
Commit `<sha>` · previous release `vA.B.C` (or "first release") · built by <run-url>
### Images  (deploy and roll back by digest)
| image | digest reference | tags |   ghcr.io/vinods21/todo-backend@sha256:… | X.Y.Z, X.Y.Z-<id>, X.Y, latest
### Verify
sha256sum -c SHA256SUMS · gh attestation verify … (files and oci://…) · see docs/release/RELEASE.md#verify
### Changes since vA.B.C — Jira: [SCRUM-7](…), [SCRUM-8](…)
#### SCRUM-8 — - <subject> (<sha7>)          … grouped by ^(SCRUM-\d+): ; "Other" last; max 50 lines per group (+ "… and N more")
### Database migrations since vA.B.C (rollback: docs/release/ROLLBACK.md)
- V3__…sql   | "None — application-only rollback is safe."   If any: "⚠ Review backward compatibility before rolling back past this release."
### Vulnerability summary
gate PASS · per-target counts · unfixed CRITICAL/HIGH list · allow-list entries in effect (id, package, owner, expires)
```

---

## 10. Reproducibility (NFR-03)

| Artefact | Bit-for-bit? | Mechanism | Demonstrated |
|---|---|---|---|
| jar | **yes (target)** | `-Dproject.build.outputTimestamp=<commit epoch>` (jar entries, Boot repackage, `build-info` `build.time`; git-commit-id uses it for `git.build.time`), pinned wrapper/deps, same JDK | `repro-jar.sh`: offline `./mvnw -o -B -ntp clean package -Dmaven.test.skip=true -Djacoco.skip=true` with identical `-D`s → SHA-256 compare; on difference list differing entries (`unzip -lv` CRC diff). Report-only (summary row), never fails |
| frontend tarball | **yes (target)** | Vite content hashes; `builtAt` from `SOURCE_DATE_EPOCH`; `make-tarball.sh`: `tar --sort=name --mtime=@$SOURCE_DATE_EPOCH --owner=0 --group=0 --numeric-owner --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime -cf - -C dist . \| gzip -n -9` | second `npm run build` + tarball → compare; report-only |
| SBOMs | mostly | `--output-reproducible` (npm), outputTimestamp (Maven); Trivy adds timestamps/serials | not claimed |
| images | **no** | `org.opencontainers.image.created` = build time (AC-14), base layers by tag | digests recorded; not claimed |

If the jar is not reproducible on the first dry-run, Dev investigates (likely `git.properties` `git.build.time` or
`build-info` time) and either fixes it within scope (e.g. drop `time` from `includeOnlyProperties`) or records the
cause in the matrix — it is not a gate.

---

## 11. Scripts and tests

### 11.1 Layout

```
.github/scripts/
  verify-images.sh            (change)         verify-jar.sh (new)          verify-lifecycle.sh (unchanged)
  release/
    lib/semver.mjs            parse/compare, RELEASE_TAG_RE, VERSION_RE, highestRelease, nextVersion, buildVersion, shaId, imageTags
    lib/identity.mjs          jiraKeyFromBranch (ADR 0008 regex)
    lib/guard.mjs             checkReleaseGuard, deriveMode
    lib/preexistence.mjs      probe parsers + decidePreexistence
    lib/allowlist.mjs         validateAllowlist
    lib/gate.mjs              normalizeReport, evaluateGate, renderGateMarkdown
    lib/notes.mjs             groupCommits, renderNotes
    lib/sbom.mjs              finalizeSbom, countComponents
    lib/gh-output.mjs         appendOutput(file, key, value) with multiline-safe delimiter
    version.mjs               CLI: identity | plan
    preexistence.mjs          CLI
    vuln-gate.mjs             CLI: gate | check-allowlist
    release-notes.mjs         CLI
    sbom-finalize.mjs         CLI
    install-tools.sh  scan.sh  validate-sboms.sh  oci-digest.sh  push-image.sh  create-tag.sh
    make-tarball.sh   repro-jar.sh  verify-release-images.sh  assemble-candidate.sh  verify-release.sh  check-compose-images.sh
    test/*.test.mjs           node:test suites (names start with the AC ID)
    test/fixtures/            trivy-*.json (synthetic reports), trivy-version-*.json, allowlist-*.json, sbom-*.json, git-log.txt
    test/stubs/               fake `gh`, `git`, `skopeo` (bash; behaviour from env, e.g. STUB_GHCR_BACKEND_0_1_0=absent)
    test/live-gate-selftest.mjs   (run only in the scan job; needs trivy + DB)
```

Local run (README + RELEASE.md): `node --test ".github/scripts/release/test/*.test.mjs"`; shellcheck via
`.github/scripts/release/install-tools.sh shellcheck`. Node ≥ 20 APIs only (runner default node and `.nvmrc` 22).

### 11.2 CLI contracts (env in, `$GITHUB_OUTPUT` / summary out)

- `version.mjs identity` — env `BRANCH`, `SHA`; reads tags via `git tag --list 'v*'`; outputs `jira_key`,
  `build_version`.
- `version.mjs plan` — env as §6.2; outputs `mode, version, release_version, build_version, previous_tag,
  image_tags, jira_key (release → main), branch, sha, commit_epoch (git log -1 --format=%ct)`; runs the guard in
  release mode; exit 1 + `::error::` on any rejection.
- `preexistence.mjs` — env `MODE, VERSION, SHA, REPO`; exit 1 on refuse.
- `vuln-gate.mjs gate|check-allowlist` — flags as §6.2; `--now <ISO>` for tests.
- `release-notes.mjs`, `sbom-finalize.mjs` — flags as §9.4 / §7.3.

### 11.3 Test catalogue (`node:test`; test name = first string arg, starts with the ID)

| File | Tests (minimum) | IDs |
|---|---|---|
| `semver.test.mjs` | no tags → `0.1.0` for patch/minor/major; `v0.1.0` + patch/minor/major → `0.1.1`/`0.2.0`/`1.0.0`; `v0.9.0`,`v0.10.0` → highest `0.10.0`; ignores `v1.0.0-rc.1`, `foo`, `1.0.0`, `v01.0.0`, `v1.0`; explicit greater → accepted; explicit lower/equal/invalid (`1.2`, `v1.2.3`, `1.02.0`, `1.2.3-rc.1`, `" 1.2.3"`) → rejected with message; explicit with no tags honoured; invalid bump rejected; shuffled tag order → same result | AC-02, AC-01 |
| `build-version.test.mjs` | after `v1.2.0`: `a1b2c3d…` → `1.2.1-a1b2c3d`; no tags → `0.1.0-<sha7>`; upper-case SHA lower-cased; `0123456…` → `1.2.1-g0123456`; `1234567…` → `1.2.1-1234567`; `0a12345…` → `1.2.1-0a12345`; `0000000…` → `g0000000`; invalid SHA rejected; every output matches the official SemVer 2.0.0 regex and Docker tag regex `^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$` | AC-03 |
| `tags.test.mjs` | `imageTags('1.2.0', sha)` → `['1.2.0-a1b2c3d','1.2.0','1.2','latest']`, immutable first | AC-13 |
| `identity.test.mjs` | `feature/SCRUM-8-x` → `SCRUM-8`; `feature/SCRUM-12` → `SCRUM-12`; `main` → `main`; `feature/scrum-8` / `bugfix/SCRUM-8-x` → `NONE` (parity with ADR 0008) | AC-03 (identity), NFR-09 |
| `guard.test.mjs` | push/PR/dispatch dry_run=true → dry-run; dispatch false → release; release on `refs/heads/feature/x` refused; headSha ≠ dispatched refused; commit with `v0.1.0` refused; dry-run never refused | AC-06, AC-11 |
| `preexistence.test.mjs` | via stubs: all absent → free; tag exists → refuse; published release exists → refuse; draft (release mode) → refuse; GHCR backend `X.Y.Z` exists → refuse; frontend `X.Y.Z-<id>` exists → refuse; GHCR denied: release → refuse, dry-run → warn+free; burnt message suggests next patch | AC-08 |
| `allowlist.test.mjs` | valid entry; each missing field; bad id; wildcard package; unknown target; justification too short; bad owner; expiry > 90 days; expires < added; added in future; expired yesterday → invalid; expires today → valid; unparsable file → error | AC-22 |
| `gate.test.mjs` | (a) fixable HIGH in gated → BLOCKED; fixable CRITICAL → BLOCKED; (b) + valid entry → PASS (+ suppressed listed); (c) + expired entry → BLOCKED and entry reported invalid; entry for other target/package → BLOCKED; (d) missing report → ERROR; bad JSON → ERROR; SchemaVersion 1 → ERROR; missing DB meta → ERROR; DB `UpdatedAt` 4 days old → ERROR; unfixed CRITICAL → PASS but listed; MEDIUM fixable → PASS; fixable HIGH only in `reported` target → PASS but reported; secret in image → BLOCKED; secret allow-listed by exact path → PASS; unused entry reported stale; markdown contains verdict, counts, DB version | AC-21, AC-24, AC-23 |
| `notes.test.mjs` | groups by Jira key; "Other"; migrations listed / "None"; first release wording; digests by `@sha256:`; vuln summary with allow-list expiry; DRY RUN banner | AC-10, AC-31 |
| `sbom.test.mjs` | sets root name/version/commit property; strips runner paths; below minimum → throws; keeps serialNumber | AC-17, NFR-11 |
| `live-gate-selftest.mjs` (scan job only) | `SCRUM-8-AC-24 (live): lodash 4.17.15 lockfile → trivy fs → gate BLOCKED`; `… with a valid allow-list entry → PASS` (entry built at test time with today's date) | AC-24 |

Shell scripts are tested indirectly by the dry-run (and `shellcheck` in `tooling`); `check-compose-images.sh`
asserts (AC-15): defaults → `todo-backend:local`/`todo-frontend:local`; `TODO_BACKEND_IMAGE=ghcr.io/vinods21/todo-backend
TODO_FRONTEND_IMAGE=… TODO_IMAGE_TAG=0.1.0` → `ghcr.io/vinods21/todo-backend:0.1.0` (+frontend); `TODO_BACKEND_TAG=0.1.0@sha256:<64 hex>`
→ digest form, both via `docker compose --profile app config --format json | jq -r .services.<svc>.image`.

### 11.4 Fixtures (no pollution)

- Synthetic Trivy JSON reports and SBOMs only under `.github/scripts/release/test/fixtures/` — never named
  `package-lock.json`/`pom.xml`, so neither the real scan (explicit inputs, §8.2) nor GitHub's dependency graph sees
  them.
- The live self-test writes its lockfile into `$RUNNER_TEMP/gate-selftest/` at run time.

---

## 12. Repository settings and first release (AC-29, AC-33, Q-02, Q-08, Q-09)

Owner actions, documented in `RELEASE.md` → "First release" (Dev may run the `gh api` calls with owner approval; the
environment endpoints are blocked in the agent workspace, so the owner may need the UI):

1. **Environment `release`** — Settings → Environments → New `release` → Deployment branches and tags: *Selected* →
   `main`. API: `gh api -X PUT repos/vinods21/todo/environments/release -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'`
   then `gh api -X POST repos/vinods21/todo/environments/release/deployment-branch-policies -f name=main -f type=branch`.
2. **Tag ruleset** `release-tags`: target tags, include `refs/tags/v*`, rules *Restrict updates* + *Restrict
   deletions*, enforcement active, no bypass. API: `gh api -X POST repos/vinods21/todo/rulesets --input ruleset.json`
   (`{"name":"release-tags","target":"tag","enforcement":"active","conditions":{"ref_name":{"include":["refs/tags/v*"],"exclude":[]}},"rules":[{"type":"update"},{"type":"deletion"}]}`).
   *Restrict creations* is not enabled (would need a bypass for the workflow; creation is guarded by the pipeline +
   environment).
3. **Immutable releases**: Settings → General → Releases → enable; API `gh api -X PUT repos/vinods21/todo/immutable-releases`;
   check `gh api repos/vinods21/todo/immutable-releases` → `{"enabled":true,…}`.
4. Merge the PR; `gh workflow run release.yml --ref main -f dry_run=true` (sanity) then
   `gh workflow run release.yml --ref main -f bump=patch -f dry_run=false` → `v0.1.0`.
5. After success: GHCR packages `todo-backend`, `todo-frontend` → Package settings → *Change visibility* → Public;
   confirm "Connected to repository vinods21/todo" (via the `source` label). Then anonymous check:
   `docker logout ghcr.io; docker pull ghcr.io/vinods21/todo-backend:0.1.0`.
6. Evidence into `docs/traceability/SCRUM-8.md` (run id, SHA, tag, digests, `gh attestation verify` and
   `sha256sum -c` output) in a follow-up commit (or Jira comment if direct commits to `main` are not allowed).

---

## 13. Documentation outlines (Dev writes)

### 13.1 `docs/release/RELEASE.md` (AC-30)

1. Versioning (AC-01..AC-03): scheme, MAJOR/MINOR/PATCH meaning (MAJOR = breaking REST API change **or** a
   migration that is not backward compatible with the previous release; MINOR = backward-compatible feature;
   PATCH = fixes, dependency/base-image bumps), next-version table (§4.2), build versions + Q-07 rule, placeholder
   `0.0.0-SNAPSHOT`, "tags are the source of truth, never edit pom/package.json versions".
2. Cutting a release: Actions UI (Run workflow on `main`, inputs) and `gh workflow run release.yml --ref main
   -f bump=minor` / `-f version=1.0.0` / `-f dry_run=true`; what each job does (§6.2 table); concurrency.
3. Dry-run: when it runs, what it produces (`todo-release-candidate-<KEY>-<sha>`), how to read the summary.
4. What is produced: assets list (§9.1), image tags (immutable vs moving), notes.
5. Verify a release: `sha256sum -c SHA256SUMS`; `gh attestation verify todo-backend-X.Y.Z.jar --repo vinods21/todo`;
   `gh attestation verify oci://ghcr.io/vinods21/todo-backend:X.Y.Z --repo vinods21/todo` (+ `--predicate-type
   https://cyclonedx.org/bom`); `gh release verify vX.Y.Z`; labels via `docker inspect`/`skopeo inspect --config`;
   `jq '.components|length'` on SBOMs; `/actuator/info` and `/build-info.json`.
6. Traceability chain (AC-27) with commands: running app → version + commit → tag → release notes → Jira.
7. Vulnerability policy summary + link to `vulnerability-policy.md` (ADR 0014 rules, allow-list how-to with an example
   entry and the PR process, Q-03 consequences).
8. Failure recovery: partial-state table (§9.2), "burnt version" rule, how to dispatch the next patch, how to fix
   lagging `X.Y`/`latest` (`push-image.sh`), never delete/move `v*` tags or immutable image tags.
9. First-release procedure + repository settings (§12).

### 13.2 `docs/release/ROLLBACK.md` (AC-31)

1. Principle: redeploy a previous immutable version (digest from that release's notes, or `X.Y.Z`); never re-tag,
   rebuild or move `X.Y.Z`.
2. Find the previous good version: `gh release list`, release notes "Images" table.
3. Compose procedure: `TODO_BACKEND_IMAGE=… TODO_FRONTEND_IMAGE=… TODO_BACKEND_TAG=0.1.0@sha256:… TODO_FRONTEND_TAG=…
   docker compose --profile app pull backend frontend && docker compose --profile app up --no-build -d --wait`;
   verify `curl -s localhost:8080/actuator/info | jq .build.version`, `curl -s localhost:3000/build-info.json`,
   `<meta name="build-info">`, footer.
4. **Database caveat** — Flyway is forward-only; rolling back the app does not roll back the schema. Facts to state:
   Flyway's default `ignoreMigrationPatterns` is `*:future`, so an older app (fewer migrations) **starts** against a
   newer schema (`validateOnMigrate` does not fail on applied-but-unknown *future* migrations; the project does not
   override `spring.flyway.*` beyond `enabled`/`locations`); Hibernate `ddl-auto: validate` then fails only if the
   older entities need a column/table the newer schema removed/renamed. Rule: every migration must be backward
   compatible with the previous release (expand/contract: add nullable/defaulted columns; drop/rename only in a later
   release once no deployed version uses them); a non-compatible migration is a MAJOR release and is flagged in the
   notes' migrations section. Data restore from backup is outside this project's tooling.
5. Roll forward: `git revert` on `main` → PR → patch release.
6. Withdrawing a bad release: edit the notes with a warning (title/notes stay editable under immutable releases),
   release a fix so `latest`/`X.Y` move; never delete tags, assets or images.

### 13.3 README (AC-32)

New section **Releases** (after "Run with Docker Compose"): where releases/images are, one-paragraph scheme, run a
release with Compose (AC-15 commands), links to RELEASE/ROLLBACK/policy. Update **Traceability**: build versions,
jar name `todo-backend-<version>.jar` (example with `0.0.0-SNAPSHOT` locally), `/actuator/info build.version`,
`build-info.json version`, image tags incl. build version, `Release` workflow artifacts, placeholder versions.

---

## 14. Time budget (NFR-04; estimate — confirm in the PR)

| Job | Cold | Warm |
|---|---|---|
| version, tooling | 0.5 min each (parallel) | 0.5 |
| backend (verify ≈ ci `build` + SBOM 0.5 + repro 1) | 6 | 4.5 |
| frontend (∥ backend; + repro build + SBOM) | 3 | 2 |
| images (prebuilt: copy jar/dist onto runtime base) | 2 | 1 |
| sbom ∥ scan (DB download ≈ 1–2 cold, scans ≈ 2, self-test 0.3) | 5 | 3 |
| release-gate | 1 | 1 |
| **critical path dry-run** | **≈ 15** | **≈ 10** |
| publish + verify (release only) | +4 | |

Runs in parallel to `CI`. Existing `CI` jobs: `identity` +~10 s (checkout); `build`/`frontend`/`e2e` +< 10 s. If the
cold dry-run exceeds 15 min: drop the frontend repro rebuild first, then run `sbom` inside `scan`.

## 15. Risks — and what only CI / the first release can verify

| # | Risk | Likelihood | Detection / mitigation |
|---|---|---|---|
| R1 | BuildKit resolves the unused named context (`backend-jar`/`frontend-dist`) in `source` mode, or hadolint flags `FROM jar-${JAR_SOURCE}` (DL3006) | Low / Med | CI `e2e` (source) and Release `images` (prebuilt) both fail visibly. Fallbacks: hadolint inline `# hadolint ignore=DL3006` with reason (or `.hadolint.yaml` entry with reason); for BuildKit: replace the named context by a context path `COPY .release/app.jar` with `!.release/` added to `.dockerignore` (empty in local use) |
| R2 | `skopeo copy --preserve-digests` from `oci-archive:` changes nothing but GHCR rejects/reformats a media type | Low | Digest assertion after every push fails before tag/release (state: burnt version). Fallback: `oras cp --from-oci-layout` (pinned) or `crane push` |
| R3 | GHCR answers `denied` (not `NAME_UNKNOWN`) for a not-yet-existing package even when logged in → first release refused (fail-closed) | Med | Dry-run summary shows the anonymous result; publish step 4 message is explicit. Fallback (design-approved): in release mode treat `denied` as `absent` **only if** `gh api repos/$REPO/tags` has no `v*` tag and no release exists (i.e. before the first release), recorded in the summary |
| R4 | Trivy DB/java-DB download rate limits or size (~1 GB java-db) | Med | Daily cache + `mirror.gcr.io` first; fail closed; re-run job. If chronic: `TRIVY_DB_REPOSITORY`/`TRIVY_JAVA_DB_REPOSITORY` set explicitly to the mirror; document |
| R5 | **Real fixable HIGH/CRITICAL findings today** in Boot 4.1.2 deps, `eclipse-temurin:21.0.13_9-jre-alpine` or `nginx-unprivileged:1.30.6-alpine3.24` → the first dry-run is red | **High** | Dev procedure (in scope, PR lists every item): 1) base images → newest patch tag of the same line (Temurin 21.0.x JRE alpine, nginx 1.30.x/alpine3.2x) — update ADR 0010 table + `base.name` labels; 2) Maven → Spring Boot patch (`4.1.x`) or a managed version property override (`<tomcat.version>` etc.) with a comment; 3) npm prod deps → patch bump; 4) only if no fix is shippable without functional risk → allow-list entry (justification, owner `SCRUM-8`, expiry ≤ 90 d) listed in the PR. Never weaken the policy. Build-stage images are not scanned (not shipped) |
| R6 | Trivy secret scan false positive in a base image | Low–Med | Allow-list `type: secret` entry with exact path + justification; or base bump |
| R7 | `cyclonedx-maven-plugin` 2.9.3 coordinates/params (`outputName`, `includeTestScope`, execution-id CLI syntax `makeBom@runtime`) not as expected — Maven Central unreachable here | Low | First dry-run; fallback: one execution + `-Dcyclonedx.*` properties per invocation |
| R8 | git-commit-id 9.0.1 does not take `git.build.time` from `outputTimestamp` → jar not reproducible | Med | Report-only (NFR-03); fix by excluding `git.build.time` (§10) |
| R9 | Nested Compose interpolation `${A:-${B:-local}}` unsupported by the runner's Compose | Low | `check-compose-images.sh` fails in `tooling`; fallback: per-service `TODO_BACKEND_TAG` default `local` and document both vars |
| R10 | `actions/attest` on a user-owned public repo: SBOM/provenance push to GHCR needs `packages: write` (present) | Low | First release; attestation failure happens before tag/release (burnt version, no public release) |
| R11 | `gh release create --verify-tag --draft` with assets, or `gh release edit --latest`, behaves differently on the runner's `gh` | Low | First release; fallback REST: `POST /releases {draft:true}`, upload to `upload_url`, `PATCH {draft:false, make_latest:"true"}` |
| R12 | Duplicate PR + push runs of `Release` (as for `CI`) double runner time | Certain | Accepted (same as `CI`); concurrency group per ref, dry-runs only |
| R13 | `workflow_dispatch` cannot be tried before merge (file must be on the default branch) | Certain | By design: dry-run via push/PR proves everything but publication (AC-11/AC-33) |
| R14 | GitHub code-scanning rejects multiple SARIF runs per category | Low | One category per target (matrix) |
| R15 | Backend test suite runs twice per PR (`CI` + `Release`) — Testcontainers flakiness doubles | Low | Same suite, already stable; acceptable for self-contained release evidence |

## 16. Requirement → design coverage

| ID | Design | Verification (matrix) |
|---|---|---|
| AC-01 | §4.1, ADR 0013 | `semver.test` ; RELEASE.md |
| AC-02 | §4.2 | `semver.test` ; `version` summary |
| AC-03 | §4.3, §6.1 | `build-version.test` ; CI identity summary + verify steps |
| AC-04 | §5, §6.1 | `verify-jar.sh`, frontend verify, `verify-images.sh`, `verify-release-images.sh`, `TodoApplicationIntegrationTest` AC-04, e2e |
| AC-05 | §5.1–5.3 | workflow review (no `git push`/commit steps); pom/package.json placeholders |
| AC-06 | §4.4, §6.2 | `guard.test` ; workflow review |
| AC-07 | §6.2 release-gate, §6.5 | dry-run graph |
| AC-08 | §8.6, §9.2 step 4 | `preexistence.test` ; dry-run table |
| AC-09 | §9.2 step 8 | first release (AC-28 row 5) |
| AC-10 | §9.1, §9.4 | `notes.test` ; dry-run `release-notes.md` ; first release |
| AC-11 | §6.2, §6.3 | dry-run run + `todo-release-candidate-<KEY>-<sha>` |
| AC-12 | §11.3 | `tooling` junit |
| AC-13 | §4.5, §9.2 steps 5/11 | `tags.test` ; dry-run plan ; first release |
| AC-14 | §5.4 | `verify-images.sh`, `verify-release-images.sh` |
| AC-15 | §5.5, §6.1 | `check-compose-images.sh` ; CI `e2e` |
| AC-16 | §9.2 steps 6–7, §9.3 | first release `verify` |
| AC-17 | §7 | `sbom.test`, `validate-sboms.sh` in dry-run |
| AC-18 | §7, §9.1, §9.2 | dry-run bundle ; first release |
| AC-19, AC-20 | §8.2 | dry-run `scan` reports |
| AC-21 | §8.4, ADR 0014 | `gate.test` ; dry-run verdict |
| AC-22 | §8.5 | `allowlist.test` ; `check-allowlist` |
| AC-23 | §8.4 outputs, `code-scanning` | dry-run summary + artifacts + Security tab |
| AC-24 | §11.3 gate tests + live self-test | `tooling` junit ; `scan` step |
| AC-25 | §6.2 images, §9.1, §9.2 step 2/5 | `oci-digest.sh`, `verify-release-images.sh`, assemble assertions |
| AC-26 | §9.1 | dry-run `SHA256SUMS` + `sha256sum -c` |
| AC-27 | §5, §9.4, §13.1 item 6 | RELEASE.md ; e2e identity |
| AC-28 | §9.3 | first release `verify` job |
| AC-29 | §12 | first-release record |
| AC-30..AC-32 | §13 | PR review |
| AC-33 | §12 | post-merge matrix update |
| NFR-01 | §6.3 | workflow review |
| NFR-02 | §6.4, ADR 0014 | workflow review ; `install-tools.sh` |
| NFR-03 | §10 | dry-run repro rows |
| NFR-04 | §14 | run timings |
| NFR-05 | §9.2 partial-state table | RELEASE.md review |
| NFR-06 | §6.6 | dry-run summaries |
| NFR-07 | §11 | shellcheck + node tests |
| NFR-08 | §4 (pure), §8.4 (`--today`) | tests |
| NFR-09 | §5.6, §6.1 | `CI` green ; local commands unchanged |
| NFR-10 | this doc, ADRs, matrix | PR |
| NFR-11 | §7.3 path stripping; secret scan | `sbom.test` ; gate |

## 17. Suggested commit sequence (Dev)

1. `SCRUM-8: [DEV] add release tooling library with tests (version, guard, pre-existence, allow-list, gate, notes, SBOM)` — §11 (`lib/`, CLIs, tests, fixtures, stubs), `.github/tools/`, empty allow-list.
2. `SCRUM-8: [DEV] stamp the product version into jar, frontend bundle and images` — §5 (pom, vite, package.json, Dockerfiles, Compose, `.env.example`, AC-04 tests, e2e changes).
3. `SCRUM-8: [CI] derive build versions in CI and verify them in every artefact` — §6.1, `verify-jar.sh`, `verify-images.sh`.
4. `SCRUM-8: [CI] add Release workflow with dry-run, SBOMs, scanning and gate` — §6.2 (up to `release-gate`), shell scripts.
5. `SCRUM-8: [CI] add publication and post-publish verification jobs` — `publish`, `verify`.
6. (if needed) `SCRUM-8: [DEV] bump <base image/dependency> to fix <CVE>` — R5, one commit per fix.
7. `SCRUM-8: [DEV] document releases, rollback and vulnerability policy; fill traceability matrix` — §13.

Each with `Refs: SCRUM-8`. Definition of done (pre-merge): `node --test …` and shellcheck green locally; frontend
`npm run lint && npm run typecheck && npm run test:coverage && npm run build` green; `CI` (4 jobs) and `Release`
dry-run (all jobs up to `release-gate`, plus `code-scanning`) green on the PR with artifact
`todo-release-candidate-SCRUM-8-<sha>`; matrix filled with run ids; publish ACs marked "pending first release".
