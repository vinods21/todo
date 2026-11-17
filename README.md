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
| `GET` | `/api/tasks?page=0&size=20` | List tasks, newest first (`page` ≥ 0, `size` 1–100, larger sizes are clamped to 100) | `200` |
| `GET` | `/api/tasks/{id}` | Get one task | `200` |
| `PUT` | `/api/tasks/{id}` | Replace `title`, `description`, `status` (required), `dueDate` | `200` |
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

Every artefact traces back to Jira SCRUM-2 and its acceptance criteria (ADR
[0004](docs/adr/0004-traceability-conventions.md)):

- **Branch / commits:** `feature/SCRUM-2-<slug>`; commit subjects `SCRUM-2: [ROLE] ...` with a `Refs: SCRUM-2` trailer.
- **Tests:** every test class has `@Tag("SCRUM-2")`; every test's `@DisplayName` starts with the AC ID(s) it
  verifies. List covered ACs after a build with
  `grep -ho 'SCRUM-2-AC-[0-9]*' target/surefire-reports/TEST-*.xml | sort -u`, or run only this story's tests
  with `./mvnw test -Dgroups=SCRUM-2`.
- **Jar:** the manifest carries `X-Jira-Issue`, `X-Git-Commit`, `X-Git-Branch` and `Implementation-Version`
  (`unzip -p target/todo-backend-0.1.0-SNAPSHOT.jar META-INF/MANIFEST.MF`).
- **Runtime:** `GET /actuator/info` returns the git commit/branch and `build.jira = SCRUM-2`.
- **CI:** GitHub Actions workflow `SCRUM-2 CI` (`.github/workflows/ci.yml`) publishes the jar as artifact
  `todo-backend-SCRUM-2-<commit sha>` and test + coverage reports as `todo-backend-SCRUM-2-<commit sha>-reports`.
- **Matrix:** [`docs/traceability/SCRUM-2.md`](docs/traceability/SCRUM-2.md) maps each AC/NFR to code, tests and CI evidence.

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
| `JIRA_KEY` | shell (optional) | `SCRUM-1` | Jira key embedded in the build identity |
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

Views: `/` (task list, `?page=N`), `/tasks/new` (create), `/tasks/:id/edit` (edit).

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
`frontend/dist/build-info.json` (build identity). Run a single AC's tests with `npx vitest run -t 'SCRUM-1-AC-11'`.

### Frontend traceability (ADR 0004 / 0007)

- **Commits:** `SCRUM-1: [ROLE] ...` with a `Refs: SCRUM-1` trailer, on `feature/SCRUM-1-react-frontend-setup`.
- **Tests:** each test file has one `describe('SCRUM-1 <area>')`; every test name starts with the AC/NFR ID(s) it
  verifies. After `npm run test:coverage`, `grep -o 'SCRUM-1-AC-[0-9]*' reports/junit.xml | sort -u` lists the
  covered ACs (AC-01..AC-13; AC-14 is a configuration + manual check).
- **Build:** `dist/build-info.json` holds `{ jira, commit, branch, builtAt }`, `dist/index.html` carries
  `<meta name="build-info" content="SCRUM-1 <commit>">`, and the app footer shows `SCRUM-1 · <short commit>`.
- **CI:** job `frontend` in `.github/workflows/ci.yml` (lint, typecheck, tests + coverage gate, build) uploads
  `todo-frontend-SCRUM-1-<commit sha>` (dist) and `todo-frontend-SCRUM-1-<commit sha>-reports` (junit + coverage).
- **Matrix:** [`docs/traceability/SCRUM-1.md`](docs/traceability/SCRUM-1.md).
