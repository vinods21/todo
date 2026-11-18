# SCRUM-7 — Testing and Deployment: Refined Requirements

| Field | Value |
|---|---|
| Jira key | [SCRUM-7](https://suranagivinod.atlassian.net/browse/SCRUM-7) |
| Type / Priority | Story / Medium |
| Parent epic | SCRUM-5 — Build a To-Do Application (Spring Boot, React, PostgreSQL, REST APIs) |
| Depends on | SCRUM-2 — Spring Boot Backend Setup (done, merged); SCRUM-1 — React Frontend Setup (done, merged); SCRUM-6 — Task Status Management (done, merged); CI workflow `CI` with build identity per [ADR 0008](../adr/0008-ci-derived-build-identity.md) |
| Branch | `feature/SCRUM-7-testing-and-deployment` |
| Author role | Product Manager (PM → Architect → Dev pipeline) |
| Status | Draft — ready for architecture |

**Traceability:** Every requirement in this document has a stable ID (`SCRUM-7-AC-xx`, `SCRUM-7-NFR-xx`).
Design docs, code, Dockerfiles, Compose/nginx config, tests, CI steps and commits for this story must reference
these IDs (commits also carry `Refs: SCRUM-7`), following [ADR 0004](../adr/0004-traceability-conventions.md) as
amended by [ADR 0008](../adr/0008-ci-derived-build-identity.md): backend test classes carry `@Tag("SCRUM-7")` and
`@DisplayName`s starting with the AC ID; frontend unit/component test names start with the AC ID inside a
`describe('SCRUM-7 <area>')`; end-to-end test names likewise start with the AC ID. The table in section 7 maps each
ID to its verification and is completed by Dev in `docs/traceability/SCRUM-7.md`.

---

## 1. Problem statement

The application works, and is well tested in isolation — but it has never been run, or tested, as one system:

- **No deployable artefacts.** The backend is a jar run with `java -jar`/`./mvnw spring-boot:run`; the frontend is a
  `dist/` folder or the Vite dev server. There are no container images, so "run the app" means installing JDK 21,
  Node 22 and Docker, and starting three processes by hand in the right order. `docker-compose.yml` only starts
  PostgreSQL. SCRUM-1 Q-02 ("how is the SPA hosted?") was explicitly deferred to this story.
- **The full stack has never been verified.** Backend tests run against real PostgreSQL (Testcontainers), and
  frontend tests run against MSW mocks — but nothing exercises *the real frontend against the real backend*. Two
  manual checks were never performed because the authoring workspace could not run the backend:
  - **SCRUM-1-AC-14** — dev server on `5173` working against the backend's CORS default
    ([`docs/traceability/SCRUM-1.md`](../traceability/SCRUM-1.md): "Manual smoke check: PENDING");
  - **SCRUM-6 manual check** — change status from the list, filter, edit round-trip and `PATCH` preflight in a
    browser against a running backend ([`docs/traceability/SCRUM-6.md`](../traceability/SCRUM-6.md), "Manual
    checks": "Not run").
- **Some contracts are only verified in test slices.** The standard error body (SCRUM-2-AC-13, ADR 0003) and CORS
  (SCRUM-2-AC-15, SCRUM-6-AC-04) are verified with `@WebMvcTest`/MockMvc only. In a real servlet container some
  errors (unknown route 404, 405, 415) can be rendered by Spring Boot's `/error` handling instead of the
  application's handler, and CORS runs in the real filter chain — the slice tests cannot prove the running app
  behaves the same.
- **Several UI components have no tests of their own** (`Pager`, `StatusFilter`, `TaskTable`, `ErrorPanel`,
  `Loading`, `TaskNotFound`, `Layout`, `NotFoundPage`); they are only exercised indirectly through page tests.

This story containerises the application, composes it with PostgreSQL, and closes the real test gaps — above all
with an **automated full-stack end-to-end test against the composed containers in CI**, which replaces the manual
checks that were never done.

**Guiding principle for testing ACs:** fill gaps, do not duplicate. Much is already covered (see
`docs/traceability/SCRUM-{2,1,6}.md`): CRUD round-trip, list paging, status persistence/filtering, restart
persistence and Flyway are already integration-tested over real HTTP against PostgreSQL 16; every page and the
API client have MSW-backed tests. New tests must target what is *not* covered, and the matrix must say which gap
each closes.

Jira acceptance criteria (verbatim) and where they are refined:

| Jira AC | Refined in |
|---|---|
| Write backend integration tests. | AC-13..AC-15 (real-HTTP error contract, CORS against the running app, actuator exposure) |
| Add frontend component tests. | AC-16, AC-17 (untested components; same-origin API base URL) |
| Create Dockerfiles for backend and frontend. | AC-01..AC-06 (+ NFR-01..NFR-07) |
| Configure Docker Compose with PostgreSQL. | AC-07..AC-12 |
| Document local setup and execution in README. | AC-24, AC-25 |
| *(implied by "validate the complete application")* | AC-18..AC-23 (full-stack e2e in CI, CI image build, closing the manual checks) |

## 2. Scope

### In scope
- **Backend Dockerfile** (multi-stage: build with the Maven Wrapper on JDK 21 → run on a JRE 21 image) producing
  an image that runs the Spring Boot jar, configured only via the existing env vars (`DB_URL`, `DB_USERNAME`,
  `DB_PASSWORD`, `SERVER_PORT`, `APP_CORS_ALLOWED_ORIGINS`).
- **Frontend Dockerfile** (multi-stage: `npm ci` + `npm run build` on Node 22 → serve `dist/` with nginx). nginx
  serves the SPA with history-API fallback and reverse-proxies the API to the backend (A-01).
- **Docker Compose** with `postgres`, `backend` and `frontend` services, health-gated start-up order, a named
  data volume, and a documented way to keep the existing "PostgreSQL only" local-dev workflow.
- **Backend integration tests** for the gaps listed in §1 (error contract and CORS over real HTTP, actuator
  exposure).
- **Frontend component tests** for components without their own tests, and for the same-origin API base URL.
- **Full-stack end-to-end tests** (headless browser) against the composed containers, and a dev-mode
  cross-origin check that closes SCRUM-1-AC-14; run in CI as a new job.
- **CI:** build both images on every push/PR, verify image metadata and non-root users, run the e2e job, upload
  e2e reports — following ADR 0008 naming.
- **README:** container-based setup and execution, test layers, troubleshooting.
- `.dockerignore` files so images and build contexts do not contain `target/`, `node_modules/`, `.git` secrets,
  local `.env*` files, reports, etc.
- Updating the SCRUM-1 and SCRUM-6 matrices so their pending manual checks point at the new automated evidence.

### Out of scope
- **Cloud deployment** of any kind (AWS/ECS/EKS, VMs, PaaS), **Kubernetes** manifests/Helm, Terraform.
- **Publishing images** to a registry (GHCR, Docker Hub, ECR), image signing/SBOM attestation, release
  versioning/tagging. Images are built and verified in CI but not pushed (Q-01).
- **TLS/HTTPS**, domain names, a production reverse proxy/load balancer in front of the stack.
- **Secrets management** beyond environment variables (no Vault, Docker secrets, SOPS, AWS Secrets Manager).
  Compose ships local-development defaults only, as `docker-compose.yml` already does.
- Production hardening of PostgreSQL (backups, replication, tuning), database migrations beyond what Flyway
  already does at start-up.
- Observability stacks (Prometheus/Grafana, log shipping, tracing); only container healthchecks.
- Container image vulnerability scanning as a CI gate (Q-02), performance/load testing, cross-browser matrix
  (one headless Chromium is enough).
- Any functional change to the API or UI behaviour (NFR-11). The only expected product-code change is in how the
  frontend resolves a same-origin API base URL (AC-17) and, if needed, configuration for running behind a proxy.
- Authentication/authorisation, delete-in-UI (SCRUM-1 Q-01).

## 3. Target runtime topology (summary — source of truth will be the SCRUM-7 design)

```
browser ──► frontend container (nginx, host port 3000)
              ├─ /, /tasks/new, /tasks/:id/edit, … → SPA (index.html fallback), static assets
              ├─ /api/**              → reverse proxy → backend:8080
              └─ /actuator/health     → reverse proxy → backend:8080
            backend container (Spring Boot, host port 8080, published for curl/debug and dev mode)
              └─ JDBC → postgres:5432 (container network; host port 5432 published for local dev)
            postgres container (postgres:16-alpine, named volume)
```

Because the browser talks to one origin, **no CORS is involved in the composed stack**; the backend keeps its CORS
default (`http://localhost:5173`) so the Vite dev server can still call the backend container cross-origin (dev
mode, AC-21). The frontend image is built with a same-origin API base URL and therefore does not need to be
rebuilt per environment (A-01, A-02). Host ports are defaults and must be overridable (AC-08).

## 4. Acceptance criteria

### Containers

- **SCRUM-7-AC-01** — **Backend image builds from source:** `docker build` of the backend Dockerfile from a clean
  checkout (no pre-built `target/`) produces an image that runs the Spring Boot jar. The build compiles with the
  committed Maven Wrapper on JDK 21; tests are not run inside the image build (they run in the CI `build` job).
  The jar inside the image carries the build identity (ADR 0008) when the Jira key and commit are supplied as
  build arguments, and `UNKNOWN` otherwise (Q-03).
- **SCRUM-7-AC-02** — **Backend container runs and is configurable by env:** a container from the image, given
  `DB_URL`/`DB_USERNAME`/`DB_PASSWORD` for a reachable PostgreSQL 16, starts, applies Flyway migrations, and
  answers `GET /actuator/health` → 200 `{"status":"UP"}` on `SERVER_PORT` (default 8080). All variables in the
  README env table are honoured unchanged; no value is baked into the image other than the documented
  local-development defaults of `application.yml`.
- **SCRUM-7-AC-03** — **Backend container lifecycle:** the container stops cleanly on `docker stop` (SIGTERM
  reaches the JVM as PID 1 or via a proper init; exit within the default 10 s grace period, no forced kill), and
  defines a Docker `HEALTHCHECK` that reports healthy only once `/actuator/health` is `UP`.
- **SCRUM-7-AC-04** — **Frontend image builds from source:** `docker build` of the frontend Dockerfile from a
  clean checkout runs `npm ci` and the production build (`npm run build`, i.e. type-check + Vite build) on Node 22
  and produces an nginx-based image serving `dist/`. The build embeds the build identity (`JIRA_KEY`, commit) via
  build arguments (SCRUM-1-NFR-09/ADR 0008); `dist/build-info.json` and `<meta name="build-info">` are served
  from the image.
- **SCRUM-7-AC-05** — **Frontend serving and SPA routing:** the frontend container serves `index.html` for `/`
  and for client-side routes loaded directly (deep links/refresh such as `/tasks/new`, `/tasks/42/edit`,
  `/?status=DONE&page=2`) with 200; static assets are served with correct content types; a request for a missing
  *asset* (e.g. `/assets/nope.js`) returns 404, not `index.html`. `index.html` is served with a no-cache policy
  and fingerprinted assets under `/assets/` with a long-lived cache policy. Resolves SCRUM-1 Q-02 (A-01).
- **SCRUM-7-AC-06** — **Frontend reverse proxy to the API:** requests to `/api/**` and `/actuator/health` on the
  frontend container are proxied to the backend (target host/port configurable at container start, default
  `backend:8080`), preserving method, path, query string, body, `Content-Type`, status code and the `Location`
  header semantics needed by the UI. Backend error bodies (400/404/405/415) pass through unchanged. If the
  backend is down the proxy returns a 5xx (502/503/504), which the UI already shows as its generic error.

### Compose

- **SCRUM-7-AC-07** — **One command starts the whole stack:** from a clean checkout with only Docker (Engine +
  Compose v2) installed, a single documented command (e.g. `docker compose up --build -d`, or with a profile —
  A-04) builds both images and starts `postgres`, `backend` and `frontend`; the app is usable at
  `http://localhost:3000` (list, create, edit, status change, filter) without installing JDK or Node.
- **SCRUM-7-AC-08** — **Configuration via env with safe local defaults:** database name/user/password, published
  host ports (frontend, backend, postgres) and the backend's CORS origins are set through Compose variable
  substitution with local-development defaults (e.g. `${TODO_FRONTEND_PORT:-3000}`), optionally from a
  git-ignored `.env`; a committed `.env.example` documents them. The backend receives its datasource settings
  through the existing `DB_*` variables pointing at the `postgres` service. No real secret is committed.
- **SCRUM-7-AC-09** — **Health-gated start-up order:** `backend` starts only after `postgres` is healthy, and
  `frontend` only after `backend` is healthy (`depends_on: condition: service_healthy`); every service has a
  healthcheck, so `docker compose up --wait` returns only when the whole stack is healthy and fails (non-zero) if
  a service does not become healthy.
- **SCRUM-7-AC-10** — **Data persists across restarts:** tasks created through the UI/API survive
  `docker compose down` + `docker compose up` (named volume); `docker compose down -v` removes them. Restarting
  only the `backend` container keeps data and does not re-apply migrations.
- **SCRUM-7-AC-11** — **Local-dev workflow preserved:** starting **only PostgreSQL** for the existing
  `./mvnw spring-boot:run` / `npm run dev` / `./mvnw verify` workflow remains a single documented command, on host
  port 5432 with the same `todo`/`todo`/`todo` defaults, so the existing README steps and `application.yml`
  defaults keep working (README updated if the command changes, e.g. `docker compose up -d postgres`).
- **SCRUM-7-AC-12** — **Backend reachable for dev mode:** the composed `backend` is also published on host port
  8080 (overridable) with `APP_CORS_ALLOWED_ORIGINS` defaulting to `http://localhost:5173`, so `npm run dev`
  against the containerised backend works exactly as SCRUM-1-AC-14 describes.

### Testing — backend integration (gaps only)

- **SCRUM-7-AC-13** — **Error contract over real HTTP:** a `@SpringBootTest(webEnvironment = RANDOM_PORT)`
  integration test against PostgreSQL 16 (Testcontainers) verifies that the running application returns the
  standard `ApiError` body (ADR 0003: `timestamp`, `status`, `error`, `message`, `path`, `fieldErrors` where
  applicable) — never Spring Boot's default error shape and never a stack trace or exception class name — for at
  least: validation failure (`POST` blank title → 400 with `fieldErrors`), malformed JSON → 400, unknown status
  value → 400, non-numeric id → 400, unknown id → 404, **unknown route** (e.g. `GET /api/nope`) → 404,
  **unsupported method** (e.g. `PATCH /api/tasks/{id}`) → 405, **unsupported media type** → 415, invalid paging
  (`page=-1`) → 400. Cases already proven over real HTTP by `TaskStatusIntegrationTest` (SCRUM-6-AC-03/07) are not
  repeated. If the test reveals a mismatch with the slice tests, the fix is in scope (it is a SCRUM-2-AC-13
  defect) and is called out in the PR.
- **SCRUM-7-AC-14** — **CORS against the running application:** an integration test against the running app
  (real servlet container and filter chain) verifies: a preflight `OPTIONS /api/tasks` and
  `OPTIONS /api/tasks/{id}/status` from the default origin `http://localhost:5173` for each of `GET`, `POST`,
  `PUT`, `PATCH`, `DELETE` is accepted with `Access-Control-Allow-Origin: http://localhost:5173` and the method in
  `Access-Control-Allow-Methods`; an actual (non-preflight) `GET /api/tasks` with that `Origin` carries
  `Access-Control-Allow-Origin`; a preflight from a non-allowed origin gets no `Access-Control-Allow-Origin` (and
  the status code observed, e.g. 403, is asserted so it is pinned). Complements the MockMvc-only
  `CorsConfigTest` (SCRUM-2-AC-15, SCRUM-6-AC-04).
- **SCRUM-7-AC-15** — **Actuator exposure over real HTTP:** against the running app, only `health` and `info`
  are exposed: `/actuator/health` → 200 `UP`, `/actuator/info` → 200, while e.g. `/actuator/env`,
  `/actuator/beans`, `/actuator/configprops` → 404 (no sensitive endpoints reachable — relevant now that the
  backend is published from a container).

### Testing — frontend component tests (gaps only)

- **SCRUM-7-AC-16** — **Component tests for untested components:** every component in `frontend/src/components`
  and `frontend/src/pages` that has no test file of its own — at least `Pager`, `StatusFilter`, `TaskTable`,
  `ErrorPanel`, `Loading`, `TaskNotFound`, `Layout`, `NotFoundPage` — gets a focused component test
  (Vitest + Testing Library, queries by role/label) of its own contract: rendering from props, callbacks fired
  with the right arguments (e.g. `Pager` previous/next and disabled states at the first/last page; `StatusFilter`
  options and change callback; `TaskTable` rows, labels, empty-description/due-date rendering, Edit links),
  accessible names/roles and announcements (`role="status"`/`role="alert"`). Tests must not re-test page flows
  already covered by page tests; the matrix lists each new file and what it adds.
- **SCRUM-7-AC-17** — **Same-origin API base URL:** the frontend can be built so that API calls are
  **same-origin relative** (`/api/tasks…`), which the container image uses (A-02). Today `VITE_API_BASE_URL=/`
  normalises to an empty string and `new URL('' + path)` in `src/api/client.ts` would throw, so this needs a small
  code change; unit tests cover: same-origin value → requests go to `<page origin>/api/…`; existing behaviour for
  absolute URLs, trailing slashes and the unset default (`http://localhost:8080`, SCRUM-1-AC-13) is unchanged.

### Testing — full stack end-to-end and CI

- **SCRUM-7-AC-18** — **E2E suite against the composed containers:** an automated browser-level end-to-end
  suite (headless Chromium, e.g. Playwright — tool is the Architect's choice) runs against the stack started by
  Compose (frontend container → backend container → PostgreSQL container) at the frontend origin and verifies
  through the real UI, with no mocks:
  1. the list loads (empty-state, then populated);
  2. create a task via the form → it appears first in the list;
  3. edit it (title, description, due date) → the list shows the change; reload of the edit deep link works;
  4. change its status from the list row → the row shows the new status, and after a page reload it is still
     persisted;
  5. filter by status → only matching tasks are shown, the URL carries `?status=`, refresh restores it; the
     filter-aware empty state and "Show all tasks" work;
  6. a validation error from the backend (e.g. title of only spaces bypassing client checks, or an over-long
     description, as the design decides) is shown to the user as the form error, proving the error body passes
     through the proxy;
  7. the footer shows the build identity `<JIRA_KEY> · <short sha>` of the build under test.
  Tests are independent of execution order and of pre-existing data (each creates its own data with unique
  titles), so they also pass against a non-empty database.
- **SCRUM-7-AC-19** — **HTTP-level smoke checks of the composed stack:** in addition to the browser suite, a
  scripted check (curl or the e2e tool's request API) against the running stack verifies: frontend `/` returns
  `index.html` with `<meta name="build-info" content="<JIRA_KEY> <sha>">`; deep link `/tasks/new` returns
  `index.html` (AC-05); missing asset → 404; `/actuator/health` via the frontend proxy → `UP`; backend
  `/actuator/info` `build.jira` = `JIRA_KEY`; an API round-trip via the proxy (`POST` → 201 + `Location`,
  `PATCH …/status` → 200, `GET ?status=` filtered, `DELETE` → 204, then `GET` → 404 with the `ApiError` body).
- **SCRUM-7-AC-20** — **CI job for containers and e2e:** the `CI` workflow gains a job (e.g. `e2e`, `needs:
  identity`) that, on every push to `feature/**`/`main` and on pull requests, builds both images with the
  derived `JIRA_KEY` and `github.sha` as build arguments, starts the stack with Compose and waits for health,
  runs AC-19 and AC-18, and always tears the stack down (`down -v`) and uploads e2e reports (JUnit/HTML, plus
  traces/screenshots/videos and `docker compose logs` of all services on failure) as artifact
  `todo-e2e-<JIRA_KEY>-<sha>-reports` (ADR 0008 naming). A failure in any step fails the job. Existing jobs
  `identity`, `build` and `frontend` keep their behaviour and artifact names.
- **SCRUM-7-AC-21** — **Dev-mode cross-origin check (closes SCRUM-1-AC-14):** CI also runs a smoke subset of the
  e2e suite (list loads, create, status change) against the **Vite dev server on `http://localhost:5173`**
  calling the **backend container on `http://localhost:8080`** cross-origin, relying only on the backend's CORS
  default — i.e. the exact SCRUM-1-AC-14 set-up, automated. The suite's base URL is configurable so the same tests
  can be run locally against either mode.
- **SCRUM-7-AC-22** — **Image metadata and runtime user verified in CI:** CI asserts, with `docker inspect` /
  `docker run`, that both images carry the OCI labels of NFR-05 with `org.opencontainers.image.revision` =
  `github.sha` and the Jira-key label = `JIRA_KEY`, and that each running container's process runs as a non-root
  UID (NFR-01). Results appear in the job summary.
- **SCRUM-7-AC-23** — **Pending manual checks closed:** `docs/traceability/SCRUM-1.md` (SCRUM-1-AC-14 and its
  "Open items" row) and `docs/traceability/SCRUM-6.md` ("Manual checks" — backend + UI status change, filter,
  edit round-trip, PATCH preflight) are updated to reference the automated evidence (AC-14, AC-18, AC-21 tests and
  the CI run), marking them done. Any check that still cannot be automated is listed explicitly with the reason.

### Docs

- **SCRUM-7-AC-24** — **README: run with containers:** the README gains a "Run with Docker Compose" section
  placed before the developer setup: prerequisites (Docker Engine + Compose v2, minimum versions), the one
  command to build and start, URLs (app, API, health), how to stop / reset data (`down`, `down -v`), the Compose
  env-variable table with defaults (AC-08), how to rebuild after code changes, how to view logs, how to pass the
  build identity (`JIRA_KEY`) to local image builds, how to read the image labels, and troubleshooting (ports in
  use, stack not becoming healthy, stale volume after schema change).
- **SCRUM-7-AC-25** — **README: test layers and local execution:** the README explains the test pyramid and how
  to run each layer locally: backend unit/slice/integration (`./mvnw verify`, needs Docker), frontend
  unit/component (`npm test`), e2e against Compose and against dev mode (one command each, incl. installing the
  browser), and where each layer's reports land locally and in CI artifacts. The existing "Run locally" steps are
  updated where AC-11 changes the Postgres-only command; nothing documented becomes wrong.

## 5. Non-functional requirements

- **SCRUM-7-NFR-01** — **Non-root containers:** backend and frontend processes run as a dedicated non-root
  user (fixed UID/GID, no login shell needed); nginx listens on an unprivileged container port (e.g. 8080, not
  80) so it needs no root or added capabilities. Application files are not writable by the runtime user except
  where required (nginx temp/cache dirs). The PostgreSQL image is used as provided (its own entrypoint drops
  privileges).
- **SCRUM-7-NFR-02** — **Multi-stage builds:** build tools (JDK, Maven, Maven repository cache, Node, npm,
  `node_modules`, sources) exist only in build stages; runtime images contain only the JRE + the jar, and nginx +
  `dist/` + nginx config respectively.
- **SCRUM-7-NFR-03** — **Small images:** runtime images use slim/alpine bases (JRE not JDK); targets — backend
  ≤ 300 MB, frontend ≤ 80 MB uncompressed (reported in the CI job summary; exceeding a target is flagged in the
  PR, not a hard gate). Docker layer order lets dependency layers be cached (dependency resolution / `npm ci`
  before copying sources).
- **SCRUM-7-NFR-04** — **Reproducible, pinned bases:** every `FROM` uses an exact version tag (e.g.
  `eclipse-temurin:21.x.y_z-jre-alpine`, `node:22.22.x-alpine`, `nginx:1.x.y-alpine`), optionally with a digest
  (Q-04); never `latest` or a floating major-only tag. Node matches `frontend/.nvmrc`; JDK/JRE major matches
  `pom.xml` (21). Builds use the lock files (`npm ci`, Maven Wrapper version) so the same commit yields the same
  application content. The Compose `postgres` image stays `postgres:16-alpine` (or a pinned 16.x patch tag —
  Architect's choice, aligned with Testcontainers).
- **SCRUM-7-NFR-05** — **OCI image labels / build identity (ADR 0008):** both images carry
  `org.opencontainers.image.title`, `.description`, `.version` (project version), `.revision` (git commit SHA),
  `.source` (repository URL), `.created` (build timestamp), `.licenses` if known, plus a label with the Jira key
  (e.g. `com.vinods21.todo.jira=<JIRA_KEY>`), all supplied via build arguments; local builds without arguments
  label `UNKNOWN`, never a hard-coded story key. Image tags used in CI/Compose follow
  `todo-backend:<JIRA_KEY>-<sha>` / `todo-frontend:<JIRA_KEY>-<sha>` (or as the design decides, consistent with
  artifact names).
- **SCRUM-7-NFR-06** — **No secrets in images or repo:** no credentials, `.env` files, `.git` directory, Maven
  `settings.xml` with credentials, npm tokens, test reports or local build outputs are copied into images or
  build contexts (`.dockerignore` for repo root and `frontend/`); configuration is injected at run time via
  environment variables only (the frontend's API base is same-origin, so nothing environment-specific is baked
  in — A-02). Only the already-documented local-dev defaults (`todo`/`todo`) appear in Compose, marked as such.
  `docker history` shows no secret-bearing build arguments.
- **SCRUM-7-NFR-07** — **Healthchecks without extra attack surface:** container healthchecks work with the
  tools present in the runtime image (no `curl`/shell added solely for healthchecks if avoidable — Architect's
  choice), use sensible intervals/start periods for JVM start-up, and the frontend healthcheck checks nginx
  itself (not the backend, so a backend outage is visible as `backend` unhealthy, not as a misleading frontend
  failure).
- **SCRUM-7-NFR-08** — **CI time reasonable:** the new `e2e` job runs in parallel with `build` and `frontend` and
  completes in ≤ 12 minutes on `ubuntu-latest` (target; reported in the PR); image builds use layer caching
  (e.g. Buildx with the GitHub Actions cache) and the browser download is cached where practical. Total
  wall-clock time of the workflow does not exceed the slowest job by more than the `identity` job. Existing jobs
  must not become slower by more than ~1 minute.
- **SCRUM-7-NFR-09** — **Deterministic, non-flaky tests:** e2e tests wait on UI state/network responses, never on
  fixed sleeps; Compose readiness uses healthchecks (`--wait`), not sleeps; at most one retry is allowed in CI
  and any retried test is reported as flaky in the job summary. Each test creates its own data.
- **SCRUM-7-NFR-10** — **Coverage gates still pass:** the backend JaCoCo gate (service + web ≥ 80 % lines) and the
  frontend coverage gate (80/80/80/75) still pass; new tests are tagged/named per ADR 0004 so `-Dgroups=SCRUM-7`
  and `vitest -t 'SCRUM-7-'` select them. E2E tests are not part of the coverage gates.
- **SCRUM-7-NFR-11** — **No functional regression / backward compatibility:** the API contract, UI behaviour, env
  variables and the existing developer workflow (`./mvnw spring-boot:run`, `npm run dev` on 5173, `./mvnw
  verify`, `npm test`) are unchanged except as stated in AC-11 and AC-17; all existing SCRUM-1/2/6 tests pass.
  Existing tests are only changed where this story intentionally changes behaviour, and such changes are listed
  in the design and the PR.
- **SCRUM-7-NFR-12** — **Container security basics:** runtime images run with a read-only-compatible layout
  where practical, expose only the needed port (`EXPOSE`), the backend JVM is container-aware (memory set as a
  percentage of the container limit, e.g. `-XX:MaxRAMPercentage`), nginx hides its version (`server_tokens off`)
  and sets basic security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, frame protection).
  Dockerfiles pass a linter (e.g. hadolint) in CI, or deviations are justified in the design.
- **SCRUM-7-NFR-13** — **Traceability (ADR 0004/0008):** commits `SCRUM-7: [ROLE] …` with `Refs: SCRUM-7`;
  design doc `docs/architecture/SCRUM-7-design.md`; ADR(s) for the hosting/proxy decision (A-01, resolves
  SCRUM-1 Q-02) and the e2e tooling choice (amends ADR 0007's "AC-14 not automated by design"); matrix
  `docs/traceability/SCRUM-7.md` filled by Dev with CI run evidence; PR titled `SCRUM-7: Testing and Deployment`
  linking Jira, requirements, design and matrix.

## 6. Assumptions & open questions

Decisions below are defaults taken by PM so work is not blocked; flag to PM if any should change. A-01, A-02 and
A-04 in particular are for the Architect to confirm or replace (with an ADR).

- **A-01** — **SPA hosting (resolves SCRUM-1 Q-02):** the SPA is hosted *separately* from the backend, by nginx in
  the frontend container, which also reverse-proxies `/api/**` and `/actuator/health` to the backend. Rationale:
  same-origin for the browser (no CORS in the deployed topology), independent images and lifecycles, the backend
  stays a pure API, and nginx handles SPA fallback and caching. Alternative considered: backend serves `dist/`
  as static resources (single deployable) — rejected by default because it couples frontend and backend builds
  and releases. Architect to confirm.
- **A-02** — **Frontend API base in containers is same-origin:** the frontend image is built with a same-origin
  API base (A-01), so one image works for any host/port and nothing environment-specific is inlined at build
  time. `VITE_API_BASE_URL` remains for dev mode and non-proxied hosting (default `http://localhost:8080`
  unchanged). This requires the small client change in AC-17.
- **A-03** — **Host ports:** frontend `3000`, backend `8080`, postgres `5432`, all overridable via env (AC-08).
  `3000` matches the README's existing CORS example and avoids clashing with Vite's 5173/4173.
- **A-04** — **Compose structure:** one `docker-compose.yml` at the repo root (no separate dev/prod files) in which
  the Postgres-only dev workflow is `docker compose up -d postgres` (or a Compose profile — Architect's choice);
  the README is updated accordingly (AC-11). CI uses the same file, with overrides only for image tags/build
  args.
- **A-05** — **Images are built from source inside Docker** (multi-stage), not by copying CI artefacts, so a
  developer with only Docker can build them (AC-07). CI builds them separately from the `build`/`frontend` jobs;
  the slight duplication of compile time is accepted (NFR-08 budget). Unit/integration tests are not re-run in
  image builds.
- **A-06** — **Backend integration tests stay on Testcontainers + `RANDOM_PORT`** (the pattern of
  `TodoApplicationIntegrationTest`), not against the Compose stack; Compose is exercised by the e2e job only.
- **A-07** — **E2E tooling lives in its own folder** (e.g. `e2e/` at the repo root with its own pinned
  `package.json`/lock file), separate from the frontend's dependencies so the frontend's audit, lint and coverage
  scope are unaffected. Exact tool (Playwright recommended) is the Architect's choice.
- **A-08** — **Fresh database per CI run;** locally, e2e tests must also pass against a non-empty database
  (AC-18), so no test relies on an empty list except the empty-state check, which uses a filter or a unique state
  the design defines (or runs first on a fresh volume — design decides).
- **A-09** — **No changes to backend runtime configuration** are expected for running behind the proxy (the UI
  uses relative `Location` handling / response bodies). If forwarded-header handling
  (`server.forward-headers-strategy`) turns out to be needed for correct `Location` URLs, adding it is in scope
  and documented.
- **Open question Q-01** — Should images be published to GHCR (e.g. on `main`) in this story? Default: **no** —
  out of scope; candidate follow-up story together with release tagging and deployment. (Non-blocking.)
- **Open question Q-02** — Should CI scan images for vulnerabilities (e.g. Trivy) and fail on high/critical?
  Default: not a gate in this story; the Architect may add a non-blocking report step if cheap. (Non-blocking.)
- **Open question Q-03** — The backend build uses `git-commit-id-maven-plugin`, which needs git metadata that is
  not (and should not be — NFR-06) in the Docker build context. How does the image get its commit identity?
  Options: pass `GIT_COMMIT`/`JIRA_KEY` build args and configure the plugin to tolerate a missing `.git`
  (e.g. `failOnNoGitDirectory=false`) with the manifest/`build-info` taking the commit from the argument; or bind-mount
  `.git` read-only in the build stage only. Default: Architect decides; requirement is only AC-01 + NFR-05 + NFR-06.
  (Blocking for design, not for PM.)
- **Open question Q-04** — Pin base images by digest as well as tag? Default: exact tag required, digest optional
  (Architect's choice; if digests are used, Dependabot/Renovate for Docker is a follow-up). (Non-blocking.)
- **Open question Q-05** — Should `/actuator/info` also be proxied by the frontend container? Default: no — only
  `/actuator/health` (used for readiness/diagnostics); `info` is checked on the backend port directly (AC-19).
  (Non-blocking.)

## 7. Traceability matrix

Skeleton — filled by Dev in [`docs/traceability/SCRUM-7.md`](../traceability/SCRUM-7.md) with code, test and CI
evidence (run id, commit SHA, artifacts `todo-e2e-<key>-<sha>-reports` etc.).

| ID | Description | Verification (to be filled) |
|---|---|---|
| SCRUM-7-AC-01 | Backend image builds from clean checkout via multi-stage; carries build identity | CI `e2e` job image build; AC-22 label check |
| SCRUM-7-AC-02 | Backend container starts with env config, Flyway runs, health UP | Compose `--wait`; AC-19 smoke |
| SCRUM-7-AC-03 | Backend clean SIGTERM shutdown; `HEALTHCHECK` on actuator health | CI step (stop timing) / design-defined check |
| SCRUM-7-AC-04 | Frontend image builds (`npm ci` + build) on Node 22 with build identity | CI `e2e` job image build; AC-19 meta check |
| SCRUM-7-AC-05 | nginx SPA fallback, 404 for missing assets, cache policies | AC-19 smoke; e2e deep-link reload |
| SCRUM-7-AC-06 | nginx proxies `/api/**` and `/actuator/health` to backend; errors pass through | AC-19 smoke; e2e validation-error test |
| SCRUM-7-AC-07 | One command builds and starts the full stack | CI `e2e` job; README review |
| SCRUM-7-AC-08 | Compose config via env with local defaults; `.env.example` | Compose file review; CI override |
| SCRUM-7-AC-09 | Health-gated start-up; `up --wait` | CI `e2e` job (`--wait`) |
| SCRUM-7-AC-10 | Data persists across `down`/`up`; `down -v` clears | design-defined CI step or e2e/manual check |
| SCRUM-7-AC-11 | Postgres-only dev workflow preserved | README; CI `build` job unaffected |
| SCRUM-7-AC-12 | Backend published on 8080 with CORS default for dev mode | AC-21 dev-mode run |
| SCRUM-7-AC-13 | `ApiError` contract over real HTTP (400/404/405/415, unknown route) | new `@Tag("SCRUM-7")` integration test |
| SCRUM-7-AC-14 | CORS preflight/actual requests against running app | new `@Tag("SCRUM-7")` integration test |
| SCRUM-7-AC-15 | Only `health`/`info` actuator endpoints exposed | new `@Tag("SCRUM-7")` integration test |
| SCRUM-7-AC-16 | Component tests for untested components | new `*.test.tsx` per component |
| SCRUM-7-AC-17 | Same-origin API base URL supported; existing behaviour unchanged | `config.test.ts`/`client.test.ts` additions |
| SCRUM-7-AC-18 | Browser e2e suite against composed containers | e2e suite, `todo-e2e-<key>-<sha>-reports` |
| SCRUM-7-AC-19 | HTTP smoke of composed stack (SPA, proxy, health, info, API round-trip) | CI smoke step / e2e request tests |
| SCRUM-7-AC-20 | CI job builds images, runs stack + tests, tears down, uploads reports | CI workflow `CI` job `e2e` |
| SCRUM-7-AC-21 | Dev server on 5173 → backend container cross-origin (closes SCRUM-1-AC-14) | e2e smoke subset in CI |
| SCRUM-7-AC-22 | OCI labels (revision, Jira key) and non-root verified in CI | CI step + job summary |
| SCRUM-7-AC-23 | SCRUM-1/SCRUM-6 pending manual checks closed with automated evidence | updated `docs/traceability/SCRUM-{1,6}.md` |
| SCRUM-7-AC-24 | README "Run with Docker Compose" section | README (reviewed in PR) |
| SCRUM-7-AC-25 | README test layers and local execution | README (reviewed in PR) |
| SCRUM-7-NFR-01 | Non-root containers, unprivileged nginx port | AC-22 CI check |
| SCRUM-7-NFR-02 | Multi-stage builds; no build tools in runtime images | Dockerfile review; image inspection |
| SCRUM-7-NFR-03 | Small images (backend ≤ 300 MB, frontend ≤ 80 MB target) | CI job summary sizes |
| SCRUM-7-NFR-04 | Exact-version pinned base images; lock files | Dockerfile review |
| SCRUM-7-NFR-05 | OCI labels incl. revision + Jira key via build args | AC-22 CI check |
| SCRUM-7-NFR-06 | No secrets in images/contexts; `.dockerignore`; runtime env only | `.dockerignore` review; `docker history` check |
| SCRUM-7-NFR-07 | Healthchecks with runtime-image tools; frontend checks nginx itself | Compose `--wait`; Dockerfile review |
| SCRUM-7-NFR-08 | `e2e` job ≤ 12 min, parallel, cached | CI run timings |
| SCRUM-7-NFR-09 | Deterministic e2e: no sleeps, own data, ≤ 1 retry reported | e2e code review; job summary |
| SCRUM-7-NFR-10 | Coverage gates pass; tests tagged SCRUM-7 | CI `build`/`frontend` jobs |
| SCRUM-7-NFR-11 | No functional regression; existing tests pass | all existing tests in CI |
| SCRUM-7-NFR-12 | Container security basics; Dockerfile lint | CI lint step; nginx config review |
| SCRUM-7-NFR-13 | ADR 0004/0008 conventions; design, ADRs, matrix, PR | design doc, ADRs, matrix, PR |
