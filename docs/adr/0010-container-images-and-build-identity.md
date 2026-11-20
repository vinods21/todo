# ADR 0010 — Container images: multi-stage, pinned, non-root; build identity via build arguments (no `.git` in the context)

- Status: Accepted
- Date: 2026-11-18
- Jira: [SCRUM-7](https://suranagivinod.atlassian.net/browse/SCRUM-7) — SCRUM-7-AC-01..AC-04, AC-22, NFR-01..NFR-07, NFR-12; open questions Q-03 (decided), Q-04 (decided), Q-01/Q-02 (deferred)
- Extends: [ADR 0008](0008-ci-derived-build-identity.md) (build identity) and [ADR 0004](0004-traceability-conventions.md) (manifest/`build-info` entries) to container images
- **Amended by [ADR 0013](0013-versioning-and-release-process.md)** (SCRUM-8): `VERSION` (default `0.0.0-SNAPSHOT`)
  is the product/build version and also feeds `-Drevision` / `APP_VERSION` in the build stage; both Dockerfiles gain a
  `prebuilt` mode (`JAR_SOURCE` / `DIST_SOURCE` + BuildKit named contexts) used by the `Release` workflow; label
  `org.opencontainers.image.base.name` added; CI images also tagged with the build version. **Amended by
  [ADR 0014](0014-vulnerability-scanning-policy.md)**: vulnerability scanning (SCRUM-7 Q-02) is done there.
  **Amended by [SCRUM-10](https://suranagivinod.atlassian.net/browse/SCRUM-10)**: frontend runtime base image
  bumped to nginx-unprivileged 1.30.7 (see the SCRUM-10 note under "Base images"). **Amended by
  [ADR 0016](0016-medium-findings-and-os-package-floors.md) (SCRUM-11)**: runtime stages may raise Alpine packages to
  a version floor and remove provably unused base-image packages; backend runtime tag gains `-3.24` (see the SCRUM-11
  note under "Base images").
- Design: [SCRUM-7 design §3–§4](../architecture/SCRUM-7-design.md)

## Context

SCRUM-7 adds a backend and a frontend image, built from source inside Docker (A-05) so a developer with only
Docker can run the stack. Constraints:

- The backend build uses `git-commit-id-maven-plugin` 9.0.1 to fill `X-Git-Commit` / `X-Git-Branch` (manifest)
  and `build.git-commit` (`build-info` → `/actuator/info`). NFR-06 forbids copying `.git` into images or build
  contexts. Q-03 asks how the image then gets its commit identity.
- The frontend's `vite.config.ts` already takes the identity from env (`JIRA_KEY`, `GITHUB_SHA`,
  `GITHUB_HEAD_REF`/`GITHUB_REF_NAME`) and falls back to `git rev-parse` (absent in the image → `unknown`).
- NFR-04 requires exact base-image tags; NFR-01 non-root; NFR-03 small images and cacheable layers; NFR-07
  healthchecks without adding tools; NFR-05 OCI labels incl. revision and Jira key.
- Base-image tags cannot be resolved in the authoring workspace (no Docker, Docker Hub blocked); they were checked
  against public tag listings on 2026-11-18 and are validated by the first CI image build.

## Decision

### Build identity (Q-03): build arguments, plugin skipped, Maven user properties

- Both Dockerfiles declare `ARG JIRA_KEY=UNKNOWN`, `ARG GIT_COMMIT=UNKNOWN`, `ARG GIT_BRANCH=UNKNOWN` (build
  stage) and `ARG VERSION=UNKNOWN`, `ARG BUILD_DATE=UNKNOWN`, `ARG SOURCE_URL=https://github.com/vinods21/todo`
  plus the three identity args again (runtime stage, for labels only). CI passes the `identity` job's
  `JIRA_KEY`, `github.sha` and the branch; Compose passes `${JIRA_KEY:-UNKNOWN}` etc. so local builds say
  `UNKNOWN`, never a hard-coded story key.
- **Backend:** the build stage runs

  ```
  ./mvnw -B -ntp -Dmaven.test.skip=true -Djacoco.skip=true -Dmaven.gitcommitid.skip=true \
      "-Djira.issue=${JIRA_KEY}" "-Dgit.commit.id.full=${GIT_COMMIT}" "-Dgit.branch=${GIT_BRANCH}" package
  ```

  Why this is deterministic: `-D` values are Maven **user properties**, which take precedence over model and
  plugin-set project properties both during POM model interpolation (the `${git.commit.id.full}` /
  `${git.branch}` / `${jira.issue}` placeholders in the `maven-jar-plugin` manifest entries and the
  `spring-boot-maven-plugin` `build-info` `additionalProperties` are replaced when the model is built) and in
  the plugin-parameter evaluator. `maven.gitcommitid.skip=true` (the plugin's `skip` parameter) makes the
  plugin a no-op instead of relying on `failOnNoGitDirectory=false` and its log-and-continue path, so no
  `git.properties` is generated in images (the `/actuator/info` `git` section is absent there; `build.*`
  carries the identity). Result: manifest `X-Jira-Issue`/`X-Git-Commit`/`X-Git-Branch`,
  `META-INF/build-info.properties` `build.jira`/`build.git-commit`, and `/actuator/info` `build.jira` /
  `build.git-commit` all equal the build arguments. **Nothing changes in `pom.xml`**; outside Docker (CI `build`
  job, local `./mvnw`) the plugin still reads `.git` as before.
- **Frontend:** the build stage runs `JIRA_KEY=… GITHUB_SHA="$GIT_COMMIT" GITHUB_REF_NAME="$GIT_BRANCH" npm run build`
  — the existing ADR 0008 mechanism; no `vite.config.ts` change.
- Rejected: bind-mounting `.git` read-only into the build stage (`RUN --mount=type=bind,source=.git`) — needs
  `.git` in the build context (contradicts NFR-06 and the `.dockerignore` allow-list), breaks for shallow or
  worktree checkouts, and invalidates the Maven layer on every commit anyway; relying on
  `failOnNoGitDirectory=false` alone — leaves `${git.commit.id.full}` unresolved (literal placeholder in the
  manifest) unless a `-D` is also given, i.e. the `-D` is the real mechanism and the skip makes it explicit.

### Base images (exact tags; NFR-04, Q-04)

| Image | Build stage | Runtime stage |
|---|---|---|
| backend | `eclipse-temurin:21.0.13_9-jdk-noble` (glibc; has `curl`/`wget`, which the only-script Maven Wrapper needs to download Maven 3.9.11) | `eclipse-temurin:21.0.13_9-jre-alpine-3.24` (JRE only; busybox `wget` for the healthcheck) |
| frontend | `node:22.23.4-alpine` (Node major = `frontend/.nvmrc`; satisfies `engines` `>=22.22.2 <23`) | `nginx/nginx-unprivileged:1.30.7-alpine3.24` (stable line; runs as UID 101, listens on 8080) |
| postgres (Compose) | — | `postgres:16-alpine` — unchanged, deliberately the **same tag as Testcontainers** in the backend tests so the e2e and integration databases match; bump both together |

- Tags only, **no digests** (Q-04): digests without automated update tooling (Dependabot/Renovate `docker`
  ecosystem) rot silently; follow-up story together with Q-01/Q-02.
- Bumping a base image is a deliberate change to the Dockerfile and this table.
- **SCRUM-8 (2026-11-18):** frontend runtime moved from `nginxinc/nginx-unprivileged:1.30.6-alpine3.24` to
  `nginx/nginx-unprivileged:1.30.6-alpine3.24` — same nginx version and Alpine line, the Docker Hub repository
  upstream (GitHub `nginx/docker-nginx-unprivileged`, formerly `nginxinc/`) publishes to since stable 1.30.6 /
  mainline 1.31.7 (upstream commits `5ac28c4` "CI: log in to Docker Hub via OIDC connection … pushed to
  hub.docker.com/r/nginx/nginx-unprivileged" and `c6a0f96` README, 2026-10-13; Docker Hub credentials for
  `nginxinc/` removed in `679834d`, 2026-10-22). `nginxinc/` is no longer rebuilt; its Alpine packages had fixable
  CRITICAL/HIGH CVEs found by the new release gate (ADR 0014, Release run 44362670868). Keep
  `org.opencontainers.image.base.name` in the Dockerfile in sync with every bump (asserted by
  `verify-release-images.sh`).
- **SCRUM-10 (2026-11-19):** frontend runtime bumped from `nginx/nginx-unprivileged:1.30.6-alpine3.24` to
  `nginx/nginx-unprivileged:1.30.7-alpine3.24` — same repository and Alpine line (3.24), nginx stable patch release.
  Clears the fixable HIGH CVE-2026-113425, CVE-2026-121810, CVE-2026-123007, CVE-2026-123633 and CVE-2026-123634
  (Alpine package `nginx` 1.30.6-r1 → 1.30.7-r1) that blocked the release gate in Release run 44475812645. Upstream
  provenance: `nginx/docker-nginx-unprivileged` commits `bef9cb1` (`update.sh`: stable → 1.30.7) and `95b8382`
  (regenerated Dockerfiles), 2026-11-18. See [SCRUM-10 requirements](../requirements/SCRUM-10.md) and
  [design](../architecture/SCRUM-10-design.md); evidence in [the SCRUM-10 matrix](../traceability/SCRUM-10.md).
- **SCRUM-11 (2026-11-20):** backend runtime tag `eclipse-temurin:21.0.13_9-jre-alpine` →
  `eclipse-temurin:21.0.13_9-jre-alpine-3.24` (same image and index digest today; the Alpine minor can no longer move
  silently). Both runtime stages add OS-package **floors** ([ADR 0016](0016-medium-findings-and-os-package-floors.md)
  §2) because no rebuilt base exists yet: `libcrypto3`/`libssl3` `>=3.5.9-r1` (+ `openssl>=3.5.9-r1` backend) for
  CVE-2026-107496, CVE-2026-88822, CVE-2026-88823, CVE-2026-95691, CVE-2026-95692, and `zlib>=1.4-r0` for
  CVE-2026-4738. The backend removes `gnupg` (only used by Temurin's own JDK signature check; pulls `gnutls`):
  CVE-2026-127039, CVE-2026-127040, CVE-2026-127231; the build asserts `gnutls` is absent. The frontend stage switches
  to `root` for `apk` and back to `101:101`. Remove each floor in the base-image bump that already contains it. See
  [ADR 0016](0016-medium-findings-and-os-package-floors.md), [SCRUM-11 design](../architecture/SCRUM-11-design.md),
  [the SCRUM-11 matrix](../traceability/SCRUM-11.md).

### Image structure

- **Multi-stage** (NFR-02): runtime images contain only JRE + one jar, or nginx + `dist/` + nginx config.
- **Layer order for caching** (NFR-03): backend — wrapper + `pom.xml` → `./mvnw dependency:go-offline` in a
  **regular layer** (not a `RUN --mount=type=cache`, because BuildKit cache mounts are not exported to the GitHub
  Actions cache and would be empty on every fresh runner) → `src/` → package. Frontend — `package*.json` →
  `npm ci` → sources → build. Build arguments are declared *after* the dependency layers so a new commit never
  invalidates them.
- **Non-root** (NFR-01): backend `USER 10001:10001` (user `todo` created with busybox `adduser -S -D -H`);
  frontend `USER 101:101` (the base image's `nginx` user). Numeric IDs so `runAsNonRoot`-style checks can
  verify them. Application files are `COPY`'d root-owned (not writable by the runtime user).
- **PID 1 / shutdown** (AC-03): exec-form `ENTRYPOINT ["java", …, "-jar", "/app/app.jar"]` — the JVM is PID 1,
  receives `SIGTERM` directly and runs Spring Boot's graceful shutdown (default since Boot 3.4); no shell
  wrapper, no init needed. The Temurin `__cacert_entrypoint.sh` is intentionally replaced. JVM options:
  `-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError`; operators add more via `JAVA_TOOL_OPTIONS`.
- **Healthchecks without extra tools** (NFR-07): busybox `wget` that the Alpine bases already ship — backend
  `wget -q -O /dev/null http://127.0.0.1:${SERVER_PORT:-8080}/actuator/health` (non-2xx → unhealthy, so
  `DOWN`/503 is unhealthy); frontend `wget … http://127.0.0.1:8080/healthz`, a static nginx location (checks
  nginx itself, not the backend). Rejected: installing `curl`; a Java-based probe (a JVM start every interval);
  Spring Boot's lack of a built-in CLI probe makes `wget` the cheapest correct option.
- **OCI labels** (NFR-05), set in the runtime stage from build arguments:
  `org.opencontainers.image.title|description|version|revision|source|created|licenses` and
  `com.vinods21.todo.jira`, `com.vinods21.todo.branch`. `licenses` is `NOASSERTION` (the repo has no licence
  file). Tags: `todo-backend:<JIRA_KEY>-<sha>` / `todo-frontend:<JIRA_KEY>-<sha>` in CI, `…:local` by default.
- **Build contexts** (NFR-06): backend context = repo root with an **allow-list** `.dockerignore` (`*` then
  `!pom.xml`, `!mvnw`, `!.mvn/`, `!src/`); frontend context = `frontend/` with an allow-list `.dockerignore`
  (`package*.json`, `index.html`, `tsconfig*.json`, `vite.config.ts`, `src/`, `nginx/`). `.git`, `.env*`,
  `node_modules`, `target/`, reports and local outputs can never enter a context.
- **Lint** (NFR-12): hadolint `v2.15.1` (Docker image `hadolint/hadolint:v2.15.1`) in the CI `e2e` job with
  `.hadolint.yaml` (`failure-threshold: warning`); any ignored rule must be listed there with a reason.
- **Not done here:** registry publishing (Q-01), vulnerability scanning (Q-02), digests (Q-04), layered-jar
  extraction / CDS (useful once images are pushed; no benefit for local/CI-only images).

## Consequences

- A clean checkout + Docker is enough to build both images; images built in CI carry the same identity as the
  CI jar/dist artefacts (ADR 0008), visible in labels, `/actuator/info` and the UI footer.
- The Docker build does not run tests (CI `build`/`frontend` jobs do) and does not need `.git`.
- The backend Docker build re-resolves dependencies when `pom.xml` changes (~1 min from Maven Central, cached
  afterwards in the GitHub Actions layer cache).
- Base-image tags need manual bumps; a non-existent tag fails the first CI image build (the only place they can
  be validated — see design §12).
- Images built from a context without identity arguments say `UNKNOWN` everywhere — by design.
