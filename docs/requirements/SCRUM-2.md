# SCRUM-2 — Spring Boot Backend Setup: Refined Requirements

| Field | Value |
|---|---|
| Jira key | [SCRUM-2](https://suranagivinod.atlassian.net/browse/SCRUM-2) |
| Type / Priority | Story / Highest |
| Due date | 2026-11-26 |
| Parent epic | SCRUM-5 — Build a To-Do Application (Spring Boot, React, PostgreSQL, REST APIs) |
| Author role | Product Manager (PM → Architect → Dev pipeline) |
| Status | Draft — ready for architecture |

**Traceability:** Every requirement in this document has a stable ID (`SCRUM-2-AC-xx`, `SCRUM-2-NFR-xx`).
Design docs, code, tests and commits for this story must reference these IDs (commits also carry `Refs: SCRUM-2`).
The traceability table in section 7 maps each ID to the test(s) that verify it and is completed by Dev.

---

## 1. Problem statement

The To-Do application (SCRUM-5) needs a backend that stores tasks durably and exposes them over a REST API
so the React frontend (SCRUM-1) can create, view, update and delete tasks. No backend exists yet. This story
delivers a runnable Spring Boot service backed by PostgreSQL with validated, well-behaved CRUD endpoints for
tasks and a unit-test baseline.

## 2. Scope

### In scope
- Spring Boot application skeleton, build, and PostgreSQL connectivity.
- `Task` resource with fields `id`, `title`, `description`, `status`, `createdAt`, `dueDate`.
- REST CRUD endpoints for tasks, including paginated listing.
- Input validation and a consistent error response format.
- `status` as a simple enum field that can be set on create/update (no transition rules).
- CORS configuration allowing the React dev origin (configurable).
- Database schema managed by versioned migrations.
- Unit tests (plus slice/integration tests where the Architect deems appropriate).
- A CI build that compiles, tests and produces the executable jar.

### Out of scope
- **Status workflow / transition rules** (e.g. forbidding DONE → TODO, dedicated transition endpoints) — owned by **SCRUM-6 Task Status Management**.
- **Frontend** — owned by **SCRUM-1 React Frontend Setup**.
- **Deployment, environments, containers for production, release pipeline** — owned by **SCRUM-7 Testing and Deployment**.
- Authentication / authorization and multi-user ownership of tasks.
- Filtering, full-text search, sorting beyond the default, tags, priorities, attachments, soft delete, auditing history.
- API versioning strategy beyond a `/api` prefix; OpenAPI/Swagger UI is optional (nice-to-have, not required).

## 3. Domain model

| Field | Type | Rules |
|---|---|---|
| `id` | Long (DB-generated) | Server-assigned; read-only; ignored if supplied by client. |
| `title` | String | Required; trimmed; not blank; 1–200 characters. |
| `description` | String | Optional; max 2000 characters; may be `null`. |
| `status` | Enum `TODO` \| `IN_PROGRESS` \| `DONE` | Optional on create (defaults to `TODO`); required on full update; any other value is rejected. |
| `createdAt` | Timestamp (ISO-8601 UTC instant, e.g. `2026-11-17T10:15:30Z`) | Server-set on create; immutable; ignored if supplied by client. |
| `dueDate` | Date (ISO-8601 `yyyy-MM-dd`) | Optional; may be `null`; any valid date accepted (past dates allowed — see A-04). |

## 4. Acceptance criteria

All endpoints are under the base path `/api/tasks`, consume and produce `application/json`.

### Setup & configuration
- **SCRUM-2-AC-01** — The application starts successfully against a PostgreSQL database whose connection
  (URL, username, password) is supplied via environment variables, and the `tasks` table is created by the
  migration tool on startup against an empty database.
- **SCRUM-2-AC-02** — A health endpoint (`GET /actuator/health`) returns HTTP 200 with status `UP` when the
  database is reachable.

### CRUD endpoints
- **SCRUM-2-AC-03** — **Create:** `POST /api/tasks` with a valid body returns **201 Created**, a `Location`
  header pointing to `/api/tasks/{id}`, and the created task in the body including server-generated `id` and
  `createdAt`. If `status` is omitted it is `TODO`.
- **SCRUM-2-AC-04** — **Get by id:** `GET /api/tasks/{id}` returns **200 OK** with the task when it exists.
- **SCRUM-2-AC-05** — **List:** `GET /api/tasks` returns **200 OK** with a paginated result. Query params
  `page` (0-based, default 0) and `size` (default 20, max 100) are supported; response includes the items
  plus `page`, `size`, `totalElements`, `totalPages`. Default ordering is `createdAt` descending (newest first).
  An empty database returns an empty item list, not an error.
- **SCRUM-2-AC-06** — **Update:** `PUT /api/tasks/{id}` with a valid body replaces `title`, `description`,
  `status` and `dueDate` and returns **200 OK** with the updated task. `id` and `createdAt` are unchanged
  regardless of any values sent by the client.
- **SCRUM-2-AC-07** — **Delete:** `DELETE /api/tasks/{id}` returns **204 No Content** when the task exists;
  a subsequent `GET` for that id returns 404.
- **SCRUM-2-AC-08** — **Not found:** `GET`, `PUT` and `DELETE` on a non-existent id return **404 Not Found**
  with the standard error body (AC-13).
- **SCRUM-2-AC-09** — Data persists in PostgreSQL: a task created via the API is returned by subsequent
  requests after an application restart.

### Field rules & validation
- **SCRUM-2-AC-10** — `title` missing, blank/whitespace-only, or longer than 200 characters → **400 Bad
  Request** with a field error for `title`. `description` longer than 2000 characters → 400 with a field
  error for `description`.
- **SCRUM-2-AC-11** — `status` with a value other than `TODO`, `IN_PROGRESS`, `DONE` → 400. `dueDate` not
  in `yyyy-MM-dd` format (or not a real date) → 400. Malformed JSON body → 400. All with the standard error body.
- **SCRUM-2-AC-12** — Client-supplied `id` or `createdAt` in a create/update body is ignored (not an error);
  the server values are used. A non-numeric path id (e.g. `/api/tasks/abc`) → 400.

### Error handling
- **SCRUM-2-AC-13** — All error responses (400, 404, 405, 415, 500) use one consistent JSON body:
  `timestamp`, `status`, `error`, `message`, `path`, and for validation failures a `fieldErrors` array of
  `{ "field", "message" }` entries listing **every** invalid field. (RFC 9457 Problem Details is an acceptable
  representation provided these fields are present.)
- **SCRUM-2-AC-14** — Unexpected server errors return **500** with the standard body and a generic message;
  no stack traces, SQL or internal class names are exposed in the response.

### CORS
- **SCRUM-2-AC-15** — CORS allows the React dev origin `http://localhost:5173` by default for methods
  `GET, POST, PUT, DELETE, OPTIONS` on `/api/**`; the allowed origin list is overridable via an environment
  variable (comma-separated). Requests from non-allowed origins receive no `Access-Control-Allow-Origin` header.

### Tests
- **SCRUM-2-AC-16** — Automated tests cover the service layer (create, get, list, update, delete, not-found)
  and the web layer (status codes, validation errors, error body shape) for AC-03 to AC-14; the test suite
  runs in the build and passes. Line coverage of service + controller packages ≥ 80%.

## 5. Non-functional requirements

- **SCRUM-2-NFR-01** — Java 21 (LTS) is the language/runtime level for build and run.
- **SCRUM-2-NFR-02** — Spring Boot **4.1.2** (Spring Web, Spring Data JPA, Bean Validation, Actuator).
- **SCRUM-2-NFR-03** — PostgreSQL **16** is the target database; local development DB is reproducible
  (e.g. a `docker-compose.yml` for Postgres 16) — tests that need a DB use Testcontainers (Postgres 16) or an
  equivalent; H2 is not used as a stand-in for integration tests.
- **SCRUM-2-NFR-04** — Schema changes are applied only via versioned migrations (Flyway or Liquibase —
  Architect's choice); Hibernate `ddl-auto` is `validate` or `none`, never `update`/`create`.
- **SCRUM-2-NFR-05** — All environment-specific configuration (DB URL/user/password, server port, CORS
  origins) is supplied via environment variables with sensible local defaults; no secrets committed to the repo.
- **SCRUM-2-NFR-06** — A CI workflow (GitHub Actions) runs on push/PR: build, run all tests, and produce the
  executable Spring Boot jar as a build artifact. The build fails if any test fails.
- **SCRUM-2-NFR-07** — Single build tool with wrapper committed (Maven `mvnw` or Gradle `gradlew`) so the
  project builds with only a JDK 21 installed.
- **SCRUM-2-NFR-08** — A short README section documents how to run locally (start DB, env vars, run app,
  run tests) and lists the endpoints.

## 6. Assumptions & open questions

Decisions below are defaults taken by PM so work is not blocked; flag to PM if any should change.

- **A-01** — No authentication; the API is open (single-user, local-dev scope). Security is a future story.
- **A-02** — `id` is a database-generated `Long` (BIGINT identity), not a UUID.
- **A-03** — `createdAt` is stored and returned in UTC as an ISO-8601 instant; no `updatedAt` field is
  required (may be added by Dev if trivial, but not a requirement).
- **A-04** — `dueDate` is a date only (no time); past dates are allowed (no "must be in the future" rule) to
  keep updates of overdue tasks possible.
- **A-05** — Update is a full replacement via `PUT`; `PATCH`/partial update is out of scope. SCRUM-6 may add
  a dedicated status-change operation.
- **A-06** — Any status value may be set on create/update in this story (no transition validation); SCRUM-6
  will introduce rules and may tighten this behaviour.
- **A-07** — Pagination defaults: `page=0`, `size=20`, max `size=100`; requests with `size` > 100 are clamped
  to 100 (not rejected); negative `page`/`size` → 400.
- **A-08** — Default React dev origin is `http://localhost:5173` (Vite). If SCRUM-1 uses a different port
  (e.g. `3000`), it is configured via env var — no code change needed.
- **A-09** — `title` is trimmed before validation and storage; `description` is stored as provided.
- **A-10** — DELETE is a hard delete.
- **A-11** — CI platform is GitHub Actions; production deployment remains with SCRUM-7.
- **Open question Q-01** — Confirm with SCRUM-1 owner the exact frontend dev port and whether the list
  response shape in AC-05 suits the UI. (Non-blocking; defaults above apply.)

## 7. Traceability matrix

| AC ID | Description | Test(s) |
|---|---|---|
| SCRUM-2-AC-01 | App starts with env-configured PostgreSQL; migration creates `tasks` table | TBD |
| SCRUM-2-AC-02 | `/actuator/health` returns 200 UP | TBD |
| SCRUM-2-AC-03 | POST creates task → 201, Location, default status TODO | TBD |
| SCRUM-2-AC-04 | GET by id → 200 | TBD |
| SCRUM-2-AC-05 | Paginated list, defaults, newest first, empty list OK | TBD |
| SCRUM-2-AC-06 | PUT updates mutable fields; id/createdAt immutable | TBD |
| SCRUM-2-AC-07 | DELETE → 204; subsequent GET 404 | TBD |
| SCRUM-2-AC-08 | 404 for unknown id on GET/PUT/DELETE | TBD |
| SCRUM-2-AC-09 | Data persists across restart | TBD |
| SCRUM-2-AC-10 | Title/description validation → 400 with field errors | TBD |
| SCRUM-2-AC-11 | Invalid status/dueDate/malformed JSON → 400 | TBD |
| SCRUM-2-AC-12 | Client id/createdAt ignored; non-numeric path id → 400 | TBD |
| SCRUM-2-AC-13 | Consistent error body incl. all field errors | TBD |
| SCRUM-2-AC-14 | 500 with generic message, no internals leaked | TBD |
| SCRUM-2-AC-15 | CORS for configurable React dev origin | TBD |
| SCRUM-2-AC-16 | Service + web layer tests run in build; ≥ 80% coverage | TBD |
| SCRUM-2-NFR-01 | Java 21 | TBD |
| SCRUM-2-NFR-02 | Spring Boot 4.1.2 | TBD |
| SCRUM-2-NFR-03 | PostgreSQL 16; reproducible local DB; Testcontainers | TBD |
| SCRUM-2-NFR-04 | Versioned migrations; no ddl-auto update | TBD |
| SCRUM-2-NFR-05 | Config via env vars; no committed secrets | TBD |
| SCRUM-2-NFR-06 | CI builds, tests, publishes jar | TBD |
| SCRUM-2-NFR-07 | Build wrapper committed | TBD |
| SCRUM-2-NFR-08 | README run instructions | TBD |
