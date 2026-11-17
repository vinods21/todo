# todo

Backend for the To-Do application (epic SCRUM-5): a Spring Boot 4.1.2 / Java 21 REST service backed by
PostgreSQL 16. Delivered by Jira story [SCRUM-2](https://suranagivinod.atlassian.net/browse/SCRUM-2).

- Requirements: [`docs/requirements/SCRUM-2.md`](docs/requirements/SCRUM-2.md)
- Design: [`docs/architecture/SCRUM-2-design.md`](docs/architecture/SCRUM-2-design.md) and [`docs/adr/`](docs/adr)
- Traceability matrix: [`docs/traceability/SCRUM-2.md`](docs/traceability/SCRUM-2.md)

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
