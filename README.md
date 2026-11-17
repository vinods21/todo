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

Architecture decisions for both parts are in [`docs/adr/`](docs/adr).

## Run locally (SCRUM-2-NFR-08)

Prerequisites: JDK 21, and Docker (for the local database and the integration tests). Maven is not needed;
the committed Maven Wrapper (`./mvnw`, `mvnw.cmd`) downloads Maven 3.9.11 on first use.

1. Start PostgreSQL 16:

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
  reports as `todo-backend-<key>-<commit sha>-reports`, after checking that the key is in the jar.
- **Matrices:** [`docs/traceability/`](docs/traceability) maps each story's AC/NFR to code, tests and CI evidence.

## Frontend (SCRUM-1)

React 19 + TypeScript (strict) + Vite 8 + React Router 8 in [`frontend/`](frontend) (SCRUM-1-NFR-01). It calls the
backend's `/api/tasks` endpoints directly from the browser (cross-origin, relying on the backend's CORS default; no
dev proxy).

### Prerequisites (SCRUM-1-NFR-02)

- Node.js **22** (`>=22.22.2`; `frontend/.nvmrc` → `nvm use`) and npm 10.
- Dependencies are pinned exactly and locked in `frontend/package-lock.json`; install with `npm ci`.

### Environment variables (SCRUM-1-AC-13)

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | `frontend/.env.local`, shell or CI env | `http://localhost:8080` | Origin of the backend (no trailing slash, no `/api` suffix) |
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
