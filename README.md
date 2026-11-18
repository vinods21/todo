# todo

To-Do application (epic SCRUM-5):

- **Backend** (repo root) — a Spring Boot 4.1.2 / Java 21 REST service backed by PostgreSQL 16, delivered by Jira
  story [SCRUM-2](https://suranagivinod.atlassian.net/browse/SCRUM-2).
  Requirements: [`docs/requirements/SCRUM-2.md`](docs/requirements/SCRUM-2.md) · Design:
  [`docs/architecture/SCRUM-2-design.md`](docs/architecture/SCRUM-2-design.md) · Matrix:
  [`docs/traceability/SCRUM-2.md`](docs/traceability/SCRUM-2.md)
- **Frontend** ([`frontend/`](frontend)) — a React 19 + TypeScript + Vite single-page app that lists, creates and
  edits tasks, delivered by Jira story [SCRUM-1](https://suranagivinod.atlassian.net/browse/SCRUM-1). See
  [Frontend (SCRUM-1)](#frontend-scrum-1) below.
  Requirements: [`docs/requirements/SCRUM-1.md`](docs/requirements/SCRUM-1.md) · Design:
  [`docs/architecture/SCRUM-1-design.md`](docs/architecture/SCRUM-1-design.md) · Matrix:
  [`docs/traceability/SCRUM-1.md`](docs/traceability/SCRUM-1.md)
- **Task status management** (backend + frontend) — change a task's status from the list and filter the list by
  status, delivered by Jira story [SCRUM-6](https://suranagivinod.atlassian.net/browse/SCRUM-6).
  Requirements: [`docs/requirements/SCRUM-6.md`](docs/requirements/SCRUM-6.md) · Design:
  [`docs/architecture/SCRUM-6-design.md`](docs/architecture/SCRUM-6-design.md) · Matrix:
  [`docs/traceability/SCRUM-6.md`](docs/traceability/SCRUM-6.md)

- **Testing and deployment** — container images for backend and frontend, a Docker Compose stack with PostgreSQL,
  real-HTTP backend integration tests, component tests and a Playwright end-to-end suite run in CI, delivered by
  Jira story [SCRUM-7](https://suranagivinod.atlassian.net/browse/SCRUM-7). See
  [Run with Docker Compose](#run-with-docker-compose-scrum-7) and [Test layers](#test-layers-scrum-7).
  Requirements: [`docs/requirements/SCRUM-7.md`](docs/requirements/SCRUM-7.md) · Design:
  [`docs/architecture/SCRUM-7-design.md`](docs/architecture/SCRUM-7-design.md) · Matrix:
  [`docs/traceability/SCRUM-7.md`](docs/traceability/SCRUM-7.md)

Architecture decisions for all parts are in [`docs/adr/`](docs/adr).

## Run with Docker Compose (SCRUM-7)

The whole application — PostgreSQL, the backend and the frontend — runs from source with only Docker installed; no
JDK or Node.js is needed (SCRUM-7-AC-07, ADRs [0010](docs/adr/0010-container-images-and-build-identity.md),
[0011](docs/adr/0011-spa-hosting-nginx-reverse-proxy.md)).

**Prerequisites:** Docker Engine **≥ 25.0** and Docker Compose v2 **≥ 2.24** (`docker compose version`; needed for
healthcheck `start_interval` and `up --wait`).

**Build and start** (the backend and frontend services sit behind the Compose profile `app`):

```bash
docker compose --profile app up --build -d --wait
```

`--wait` returns once every service is healthy (PostgreSQL → backend → frontend start in that order, each gated on
the previous one's healthcheck) and fails if one does not become healthy. The first build downloads the Maven and npm
dependencies and takes a few minutes; later builds reuse the cached layers.

| URL | What |
|---|---|
| <http://localhost:3000> | the app (nginx serves the SPA and proxies `/api/**` and `/actuator/health` to the backend — same origin, no CORS) |
| <http://localhost:3000/actuator/health> | backend health through the proxy |
| <http://localhost:8080/api/tasks> | the API directly on the published backend port (curl, debugging, Vite dev mode) |
| <http://localhost:8080/actuator/info> | build identity of the backend (not proxied by the frontend) |

**Stop / reset:**

```bash
docker compose --profile app down        # stop and remove the containers; data is kept in volume todo-pgdata
docker compose --profile app down -v     # … and delete the data volume (fresh database on the next start)
```

Always pass `--profile app` (or set `COMPOSE_PROFILES=app`) when the app services may be running, so `down` also
removes them.

**Configuration** (SCRUM-7-AC-08): every value has a local-development default; override it in the shell or in a
git-ignored `.env` next to `docker-compose.yml` (copy [`.env.example`](.env.example)). The defaults are **not
secrets** — do not reuse them anywhere else.

| Variable | Default | Purpose |
|---|---|---|
| `TODO_DB_NAME`, `TODO_DB_USER`, `TODO_DB_PASSWORD` | `todo`, `todo`, `todo` | PostgreSQL database and credentials (also passed to the backend as `DB_URL`/`DB_USERNAME`/`DB_PASSWORD`) |
| `TODO_DB_PORT` | `5432` | host port of PostgreSQL |
| `TODO_BACKEND_PORT` | `8080` | host port of the backend |
| `TODO_FRONTEND_PORT` | `3000` | host port of the frontend (the app) |
| `TODO_CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | backend `APP_CORS_ALLOWED_ORIGINS` (the Vite dev server, see below) |
| `TODO_IMAGE_TAG` | `local` | tag of the images `todo-backend` / `todo-frontend` (CI: `<JIRA_KEY>-<sha>`) |
| `JIRA_KEY`, `GIT_COMMIT`, `GIT_BRANCH` | `UNKNOWN` | build identity baked into the images (labels, jar, `/actuator/info`, UI footer) |
| `COMPOSE_PROFILES` | — | `app` makes a plain `docker compose up -d` start the whole stack |

**Rebuild after code changes:** run the start command again (`docker compose --profile app up --build -d --wait`),
or rebuild one image with `docker compose build backend` / `docker compose build frontend`.

**Logs:** `docker compose logs -f backend` (or `frontend`, `postgres`); `docker compose --profile app ps` shows the
health of each service.

**Build identity for local images** (ADR 0008/0010) — without it labels and `/actuator/info` say `UNKNOWN`:

```bash
JIRA_KEY=SCRUM-7 GIT_COMMIT=$(git rev-parse HEAD) GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) \
  docker compose --profile app build
docker image inspect -f '{{json .Config.Labels}}' todo-backend:local   # OCI labels incl. revision and com.vinods21.todo.jira
```

Images built by Docker have no `.git` in their build context (by design), so `/actuator/info` of a container has
`build.*` (including `build.git-commit` and `build.jira`) but no `git` section.

**Images:** backend = JRE 21 (Alpine) + the Spring Boot jar, running as UID 10001, Java as PID 1 (clean `SIGTERM`
shutdown); frontend = unprivileged nginx (UID 101, container port 8080) + `dist/`. Both are multi-stage builds from
pinned base images with a Docker `HEALTHCHECK`; the containers run with a read-only root filesystem, all
capabilities dropped and `no-new-privileges`. The frontend image is built with a same-origin API base
(`VITE_API_BASE_URL=/`), so the same image works on any host or port; the proxy target is the container env var
`BACKEND_URL` (default `http://backend:8080`).

**Vite dev server against the containerised backend:** start the stack (or just `docker compose --profile app up -d
--wait backend`) and run `npm run dev` in `frontend/` — it calls `http://localhost:8080` cross-origin, which the
backend allows by default (SCRUM-7-AC-12).

**Troubleshooting**

- *Port already in use* (`bind: address already in use`): another process holds 3000/8080/5432 — e.g. a
  `./mvnw spring-boot:run` backend occupies 8080, so stop it or set `TODO_BACKEND_PORT=8081` (likewise
  `TODO_FRONTEND_PORT`, `TODO_DB_PORT`).
- *Stack does not become healthy* (`up --wait` fails): `docker compose --profile app ps` shows which service is
  unhealthy; `docker compose logs backend` explains why (typically the database). A slow machine may need
  `--wait-timeout 300`.
- *Backend fails after a schema change* (Flyway validation error against old data): the volume holds an older or
  modified schema — reset it with `docker compose --profile app down -v`.
- *The UI shows a network/server error*: the backend is down or restarting; nginx answers `502` until it is healthy
  again.

## Run locally (SCRUM-2-NFR-08)

Prerequisites: JDK 21, and Docker (for the local database and the integration tests). Maven is not needed;
the committed Maven Wrapper (`./mvnw`, `mvnw.cmd`) downloads Maven 3.9.11 on first use.

1. Start PostgreSQL 16 (only PostgreSQL — the containerised backend and frontend are behind the Compose profile
   `app`, see [Run with Docker Compose](#run-with-docker-compose-scrum-7)):

   ```bash
   docker compose up -d
   ```

2. Run the application (Flyway creates the schema on startup):

   ```bash
   ./mvnw spring-boot:run
   ```

   or build and run the executable jar:

   ```bash
   ./mvnw -DskipTests package
   java -jar target/todo-backend-0.1.0-SNAPSHOT.jar
   ```

3. Check it is up: `curl http://localhost:8080/actuator/health` returns `{"status":"UP"}`.

4. Run all tests and the coverage gate (needs Docker for Testcontainers):

   ```bash
   ./mvnw verify
   ```

   Reports: `target/surefire-reports/` (tests) and `target/site/jacoco/index.html` (coverage; the build fails
   below 80% line coverage on the `service` and `web` packages).

Stop the database with `docker compose down` (add `-v` to delete its data volume).

### Environment variables (SCRUM-2-NFR-05)

| Variable | Default (local development only) | Purpose |
|---|---|---|
| `DB_URL` | `jdbc:postgresql://localhost:5432/todo` | JDBC URL of the PostgreSQL database |
| `DB_USERNAME` | `todo` | Database user |
| `DB_PASSWORD` | `todo` | Database password (matches `docker-compose.yml`; not a real secret) |
| `SERVER_PORT` | `8080` | HTTP port |
| `APP_CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated list of origins allowed to call `/api/**` (CORS) |

Example: `DB_URL=jdbc:postgresql://db:5432/todo DB_PASSWORD=... APP_CORS_ALLOWED_ORIGINS=http://localhost:3000 java -jar target/todo-backend-0.1.0-SNAPSHOT.jar`

## API

All endpoints consume and produce `application/json`.

| Method | Path | Description | Success |
|---|---|---|---|
| `POST` | `/api/tasks` | Create a task (`title` required, `description`, `status`, `dueDate` optional; `status` defaults to `TODO`) | `201` + `Location` |
| `GET` | `/api/tasks?page=0&size=20&status=DONE` | List tasks, newest first (`page` ≥ 0, `size` 1–100, larger sizes are clamped to 100); optional `status` filter (SCRUM-6, see below) | `200` |
| `GET` | `/api/tasks/{id}` | Get one task | `200` |
| `PUT` | `/api/tasks/{id}` | Replace `title`, `description`, `status` (required), `dueDate` | `200` |
| `PATCH` | `/api/tasks/{id}/status` | Change only the status: body `{"status": "IN_PROGRESS"}`; returns the full task (SCRUM-6) | `200` |
| `DELETE` | `/api/tasks/{id}` | Delete a task | `204` |
| `GET` | `/actuator/health` | Health (includes database connectivity) | `200` |
| `GET` | `/actuator/info` | Git and build information (incl. `build.jira`) | `200` |

Task JSON:

```json
{
  "id": 1,
  "title": "Write docs",
  "description": "optional, max 2000 chars",
  "status": "TODO",
  "createdAt": "2026-11-17T10:15:30.123456Z",
  "dueDate": "2026-12-01"
}
```

`status` is one of `TODO`, `IN_PROGRESS`, `DONE`. `id` and `createdAt` are server-assigned; values sent by the
client are ignored. List responses look like
`{"items": [...], "page": 0, "size": 20, "totalElements": 1, "totalPages": 1}`.

**Status changes and filtering (SCRUM-6, [ADR 0009](docs/adr/0009-status-sub-resource-patch.md)):**

- `PATCH /api/tasks/{id}/status` accepts `{"status": "TODO" | "IN_PROGRESS" | "DONE"}`; other fields in the body
  (e.g. `title`) are ignored. Any status may change to any other (no transition rules); setting the current status
  again is a successful no-op. Errors: missing/`null` status → 400 `Validation failed` with a `status` field error;
  unknown or wrong-case value (`"done"`) → 400 `Invalid value for field 'status'`; malformed JSON → 400; non-numeric
  id → 400; unknown id → 404; non-JSON content type → 415. A failed request never changes the task.
  `PATCH /api/tasks/{id}` (without `/status`) stays `405`.
- `GET /api/tasks?status=<STATUS>` returns only tasks with that status; `page`, `size`, `totalElements` and
  `totalPages` refer to the filtered set, ordering stays newest first, and filtering happens in PostgreSQL (index
  `ix_tasks_status_created_at_id`, Flyway V2). Without `status` the list is unfiltered. The value must be exactly one
  enum name: unknown, wrong-case, empty (`?status=`), comma-separated (`TODO,DONE`) or repeated
  (`status=TODO&status=DONE`) values → 400 `Invalid value for parameter 'status'`.
- CORS allows `PATCH` for the configured origins.

```bash
curl -i -X PATCH http://localhost:8080/api/tasks/1/status \
  -H 'Content-Type: application/json' -d '{"status": "DONE"}'
curl 'http://localhost:8080/api/tasks?status=DONE&page=0&size=20'
```

Every error (400, 404, 405, 415, 500) uses one body:

```json
{
  "timestamp": "2026-11-17T10:15:30.123Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/tasks",
  "fieldErrors": [ { "field": "title", "message": "must not be blank" } ]
}
```

Example:

```bash
curl -i -X POST http://localhost:8080/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title": "Buy milk", "dueDate": "2026-12-01"}'
```

## Test layers (SCRUM-7)

| Layer | Tool | What it covers | Run locally | Reports (local / CI artifact) |
|---|---|---|---|---|
| Backend unit + slice | JUnit 5, Mockito, MockMvc (`@WebMvcTest`) | service rules, controller contract, error mapping, CORS config | `./mvnw verify` | `target/surefire-reports/`, `target/site/jacoco/` / `todo-backend-<key>-<sha>-reports` |
| Backend integration | `@SpringBootTest(RANDOM_PORT)` + Testcontainers PostgreSQL 16 | CRUD, paging, status, Flyway, restart persistence; real-HTTP error contract, CORS and actuator exposure (SCRUM-7-AC-13..15) | `./mvnw verify` (needs Docker) | same |
| Frontend unit + component | Vitest, Testing Library, MSW | API client, pages, components (no backend) | `cd frontend && npm test` (`npm run test:coverage` for the gate) | `frontend/reports/` / `todo-frontend-<key>-<sha>-reports` |
| End-to-end (Compose) | Playwright (Chromium) | browser → nginx → backend → PostgreSQL: list, create, edit + deep-link reload, status change, filter, backend validation error, build identity; HTTP smoke of the stack (SCRUM-7-AC-18, AC-19) | see below | `e2e/reports/compose/` / `todo-e2e-<key>-<sha>-reports` |
| End-to-end (dev mode) | Playwright | Vite dev server on 5173 → backend on 8080 cross-origin (SCRUM-7-AC-21, SCRUM-1-AC-14) | see below | `e2e/reports/dev/` / same artifact |

End-to-end tests ([`e2e/`](e2e), ADR [0012](docs/adr/0012-end-to-end-testing-playwright.md)) have their own
`package.json`; Node.js 22 is needed:

```bash
docker compose --profile app up --build -d --wait     # the stack under test on :3000 / :8080
cd e2e
npm ci
npx playwright install --with-deps chromium           # once per Playwright version
npm test                                              # compose mode → reports/compose/
npm run test:dev                                      # dev mode: starts Vite on 5173 (or reuses yours) → reports/dev/
npx playwright show-report reports/compose/html
```

The tests create their own uniquely named tasks, so they pass against a database that already has data; only the
empty-state test needs a fresh volume (`down -v`) and is skipped otherwise (CI enforces it with
`E2E_EXPECT_EMPTY_DB=1`). Override the targets with `E2E_BASE_URL` / `E2E_BACKEND_URL`; `npm run test:dev` uses POSIX
env syntax (on Windows use WSL or `set E2E_MODE=dev`).

Select one story's or one AC's tests in each layer: `./mvnw test -Dgroups=SCRUM-7`,
`npx vitest run -t 'SCRUM-7-'`, `npx playwright test -g 'SCRUM-7-AC-18'`.

**CI** (`.github/workflows/ci.yml`): jobs `build` (backend), `frontend` and `e2e` run in parallel after `identity`.
`e2e` lints the Dockerfiles (hadolint), builds both images with the derived Jira key and commit, starts the stack
with `docker compose up --wait`, checks image labels, non-root users, runtime contents and sizes, runs the compose and
dev-mode suites and a lifecycle/persistence script (clean `SIGTERM` stop, data kept across restarts, removed by
`down -v`), writes a summary to the run page and uploads `todo-e2e-<key>-<sha>-reports` (Playwright HTML/JUnit/JSON,
traces/screenshots/videos on failure, `docker compose logs`).

## Traceability

Every artefact traces back to its Jira story and acceptance criteria (ADR
[0004](docs/adr/0004-traceability-conventions.md), build identity per ADR
[0008](docs/adr/0008-ci-derived-build-identity.md)):

- **Branch / commits:** `feature/SCRUM-<n>-<slug>`; commit subjects `SCRUM-<n>: [ROLE] ...` with a `Refs: SCRUM-<n>`
  trailer.
- **Tests:** every test class has `@Tag("SCRUM-<n>")` (methods added to an older story's class carry a method-level
  tag); every test's `@DisplayName` starts with the AC ID(s) it verifies. List covered ACs after a build with
  `grep -hoE 'SCRUM-[0-9]+-AC-[0-9]+' target/surefire-reports/TEST-*.xml | sort -uV`, or run only one story's tests
  with e.g. `./mvnw test -Dgroups=SCRUM-6`.
- **Build identity (ADR 0008):** the Jira key is not hard-coded. CI derives it once per run from the branch
  (`feature/SCRUM-<n>-…` → `SCRUM-<n>`, `main` → `main`, anything else → `NONE`) and passes it to Maven
  (`-Djira.issue=…`) and Vite (`JIRA_KEY`). Local builds say `UNKNOWN` unless you pass it yourself:
  `./mvnw verify -Djira.issue=SCRUM-6`, `JIRA_KEY=SCRUM-6 npm run build`.
- **Jar:** the manifest carries `X-Jira-Issue`, `X-Git-Commit`, `X-Git-Branch` and `Implementation-Version`
  (`unzip -p target/todo-backend-0.1.0-SNAPSHOT.jar META-INF/MANIFEST.MF`); `build.jira` is in
  `META-INF/build-info.properties` at the jar root (Spring Boot 4 — not under `BOOT-INF/classes/`).
- **Runtime:** `GET /actuator/info` returns the git commit/branch and `build.jira` (the build's Jira key).
- **CI:** GitHub Actions workflow `CI` (`.github/workflows/ci.yml`): job `identity` derives the key (shown in the
  run summary), job `build` publishes the jar as artifact `todo-backend-<key>-<commit sha>` and test + coverage
  reports as `todo-backend-<key>-<commit sha>-reports`, after checking that the key is in the jar; job `e2e`
  (SCRUM-7) tags the images `todo-backend:<key>-<sha>` / `todo-frontend:<key>-<sha>` and uploads
  `todo-e2e-<key>-<commit sha>-reports`.
- **Matrices:** [`docs/traceability/`](docs/traceability) maps each story's AC/NFR to code, tests and CI evidence.

## Frontend (SCRUM-1)

React 19 + TypeScript (strict) + Vite 8 + React Router 8 in [`frontend/`](frontend) (SCRUM-1-NFR-01). It calls the
backend's `/api/tasks` endpoints directly from the browser (cross-origin, relying on the backend's CORS default; no
dev proxy). In the container image it is served by nginx, which proxies the API on the same origin (SCRUM-7,
ADR 0011).

### Prerequisites (SCRUM-1-NFR-02)

- Node.js **22** (`>=22.22.2`; `frontend/.nvmrc` → `nvm use`) and npm 10.
- Dependencies are pinned exactly and locked in `frontend/package-lock.json`; install with `npm ci`.

### Environment variables (SCRUM-1-AC-13)

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | `frontend/.env.local`, shell or CI env | `http://localhost:8080` | Origin of the backend (no trailing slash, no `/api` suffix); `/` = same-origin (`<page origin>/api/…`, used by the container image behind nginx — SCRUM-7-AC-17) |
| `JIRA_KEY` | CI (`identity` job) or shell | `UNKNOWN` | Jira key embedded in the build identity (ADR 0008) |
| `GITHUB_SHA`, `GITHUB_REF_NAME`, `GITHUB_HEAD_REF` | set by GitHub Actions | `git` CLI fallback | Commit/branch embedded in the build identity |

`VITE_API_BASE_URL` is read when the dev server starts or the build runs (Vite inlines it), so changing it needs no
code change: copy [`frontend/.env.example`](frontend/.env.example) to `frontend/.env.local`, or run e.g.
`VITE_API_BASE_URL=http://localhost:8081 npm run dev`.

### Run against the local backend (SCRUM-1-AC-14)

1. Start the database and backend as described in [Run locally](#run-locally-scrum-2-nfr-08)
   (`docker compose up -d`, `./mvnw spring-boot:run`) with the default configuration.
2. Start the frontend:

   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

3. Open <http://localhost:5173>. The dev server always uses port 5173 (`strictPort`) because
   `http://localhost:5173` is the backend's default allowed CORS origin (`APP_CORS_ALLOWED_ORIGINS`); if the port is
   busy it fails instead of moving to another port.

Views: `/` (task list, `?status=<STATUS>&page=N`), `/tasks/new` (create), `/tasks/:id/edit` (edit).

**Status management (SCRUM-6):** each list row has a "Status for <title>" select that changes the task's status in
place with `PATCH /api/tasks/{id}/status` (the row is disabled with "Saving…" while the request runs; failures revert
the row and show an alert). The "Status" filter above the list (All / To do / In progress / Done) is kept in the URL,
e.g. `/?status=IN_PROGRESS` or `/?status=DONE&page=2`, so refresh, bookmarks and Back/Forward restore it; changing
the filter starts at page 1, paging keeps it, and an unknown `?status` value is treated as "All". An empty filtered
list says "No tasks with status …" with a "Show all tasks" link. Editing a task returns to the same filter and page.

### Test, lint, type-check and build (SCRUM-1-NFR-03, NFR-04)

```bash
cd frontend
npm run lint            # ESLint (react-hooks rules, no explicit any), zero warnings
npm run typecheck       # tsc -b --noEmit (strict)
npm test                # Vitest + Testing Library + MSW, non-watch; no backend needed
npm run test:coverage   # same, plus coverage gate (lines/statements/functions 80 %, branches 75 %)
npm run build           # type-check + production build to frontend/dist
npm run preview         # serve the production build on http://localhost:4173
```

Reports: `frontend/reports/junit.xml` (tests), `frontend/reports/coverage/index.html` (coverage),
`frontend/dist/build-info.json` (build identity). Run a single AC's tests with `npx vitest run -t 'SCRUM-1-AC-11'`,
or one story's with `npx vitest run -t 'SCRUM-6-'`.

### Frontend traceability (ADR 0004 / 0007)

- **Commits:** `SCRUM-<n>: [ROLE] ...` with a `Refs: SCRUM-<n>` trailer, on `feature/SCRUM-<n>-<slug>`.
- **Tests:** each test file has one top-level `describe('SCRUM-<n> <area>')` per story; every test name starts with
  the AC/NFR ID(s) it verifies. After `npm run test:coverage`,
  `grep -oE 'SCRUM-[0-9]+-AC-[0-9]+' reports/junit.xml | sort -uV` lists the covered ACs.
- **Build (ADR 0008):** `dist/build-info.json` holds `{ jira, commit, branch, builtAt }`, `dist/index.html` carries
  `<meta name="build-info" content="<key> <commit>">`, and the app footer shows `<key> · <short commit>`, where
  `<key>` is `JIRA_KEY` (derived from the branch in CI, `UNKNOWN` locally).
- **CI:** job `frontend` in `.github/workflows/ci.yml` (lint, typecheck, tests + coverage gate, build, build-identity
  check) uploads `todo-frontend-<key>-<commit sha>` (dist) and `todo-frontend-<key>-<commit sha>-reports` (junit +
  coverage).
- **Matrices:** [`docs/traceability/SCRUM-1.md`](docs/traceability/SCRUM-1.md),
  [`docs/traceability/SCRUM-6.md`](docs/traceability/SCRUM-6.md).
