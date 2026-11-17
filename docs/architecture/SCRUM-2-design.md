# SCRUM-2 — Spring Boot Backend Setup: Solution Design

| Field | Value |
|---|---|
| Jira key | [SCRUM-2](https://suranagivinod.atlassian.net/browse/SCRUM-2) (epic SCRUM-5) |
| Requirements | [`docs/requirements/SCRUM-2.md`](../requirements/SCRUM-2.md) — `SCRUM-2-AC-01..16`, `SCRUM-2-NFR-01..08`, assumptions `A-01..A-11` |
| Branch | `feature/SCRUM-2-spring-boot-backend-setup` |
| Author role | Architect (PM → Architect → Dev pipeline) |
| ADRs | [0001](../adr/0001-maven-and-spring-boot-4.md), [0002](../adr/0002-flyway-migrations.md), [0003](../adr/0003-error-response-format.md), [0004](../adr/0004-traceability-conventions.md) |
| Status | Ready for Dev |

All requirement IDs below refer to `docs/requirements/SCRUM-2.md`. Assumptions A-01..A-11 are accepted as-is.

---

## 1. Context

A single stateless Spring Boot 4.1.2 service (Java 21) exposing `/api/tasks` CRUD over JSON, persisting to
PostgreSQL 16. Consumers: the React SPA (SCRUM-1) in the browser (hence CORS) and CI. No auth (A-01).

```
 React dev server (http://localhost:5173)          GitHub Actions (ubuntu-latest, Docker)
            │  JSON / CORS                                   │ ./mvnw verify (Testcontainers PG16)
            ▼                                                ▼
 ┌──────────────────────── todo-backend (Spring Boot 4.1.2, Java 21) ───────────────────────┐
 │ web (TaskController, GlobalExceptionHandler, DTOs) → service (TaskService)               │
 │   → repository (TaskRepository, Spring Data JPA / Hibernate 7) → domain (Task, TaskStatus)│
 │ config (CorsProperties, WebConfig, ClockConfig)   Actuator: /actuator/health, /info      │
 └─────────────────────────────────────────┬────────────────────────────────────────────────┘
                                           │ JDBC (env-configured), Flyway migrations on startup
                                           ▼
                                   PostgreSQL 16 (`tasks`)
```

Build constraint: the Maven build **cannot run in the authoring workspace** (Maven Central blocked); the
first real compile/test happens in GitHub Actions. The design therefore uses only BOM-managed dependencies
plus a minimal set of explicitly pinned plugins (section 11), and avoids APIs whose location changed in
Spring Boot 4 unless the new location is spelled out here.

## 2. Coordinates & package layout

- Maven: `groupId=com.vinods21`, `artifactId=todo-backend`, `version=0.1.0-SNAPSHOT`, packaging `jar`,
  parent `org.springframework.boot:spring-boot-starter-parent:4.1.2`, `<java.version>21</java.version>`.
- Project lives at the **repo root** (`/pom.xml`, `/mvnw`, `/src`), so CI needs no working-directory tweaks.
- Base package: `com.vinods21.todo`.

```
src/main/java/com/vinods21/todo/
├── TodoApplication.java                 @SpringBootApplication
├── config/
│   ├── CorsProperties.java              @ConfigurationProperties("app.cors") record(List<String> allowedOrigins)
│   ├── WebConfig.java                   WebMvcConfigurer#addCorsMappings + @EnableConfigurationProperties(CorsProperties.class)
│   └── ClockConfig.java                 @Bean Clock systemUTC()
├── domain/
│   ├── Task.java                        @Entity @Table("tasks")
│   └── TaskStatus.java                  enum TODO, IN_PROGRESS, DONE
├── repository/
│   └── TaskRepository.java              JpaRepository<Task, Long>
├── service/
│   ├── TaskService.java                 @Service @Transactional business logic
│   └── TaskNotFoundException.java       RuntimeException(id)
└── web/
    ├── TaskController.java              @RestController @RequestMapping("/api/tasks") @Validated
    ├── dto/
    │   ├── TaskCreateRequest.java       record, Bean Validation
    │   ├── TaskUpdateRequest.java       record, Bean Validation (status @NotNull)
    │   ├── TaskResponse.java            record + static from(Task)
    │   └── PageResponse.java            record<T>(List<T> items, int page, int size, long totalElements, int totalPages)
    └── error/
        ├── ApiError.java                record — standard error body (AC-13)
        ├── FieldErrorItem.java          record(String field, String message)
        └── GlobalExceptionHandler.java  @RestControllerAdvice extends ResponseEntityExceptionHandler

src/main/resources/
├── application.yml
└── db/migration/V1__create_tasks_table.sql

src/test/java/com/vinods21/todo/        (see section 9)
```

Rules: controllers never touch repositories or entities directly beyond mapping `TaskResponse.from(task)`;
the service owns transactions, defaults, trimming-independent business rules and not-found semantics;
DTOs are the only types (de)serialized by Jackson. Constructor injection only, no field injection.
Service is a concrete class (no interface) — YAGNI.

## 3. Layers & responsibilities

| Layer | Class | Responsibility | ACs |
|---|---|---|---|
| web | `TaskController` | HTTP mapping, `@Valid` request bodies, path/query param binding, `Location` header, status codes, page-size clamping | 03–08, 10–12 |
| web | `GlobalExceptionHandler` | Maps every exception to `ApiError` | 08, 10–14 |
| service | `TaskService` | create (default status, `createdAt` from injected `Clock`), get, list (sort), update (mutable fields only), delete, throws `TaskNotFoundException` | 03–08, 12 |
| repository | `TaskRepository` | `JpaRepository<Task, Long>`; no custom queries needed | 05, 09 |
| domain | `Task`, `TaskStatus` | JPA mapping matching V1 schema (`ddl-auto=validate`) | 01, 09 |
| config | `WebConfig`, `CorsProperties` | CORS on `/api/**` | 15 |

### Service API (contract for Dev)

```java
// Service returns entities; the controller maps them to TaskResponse / PageResponse.
Task create(TaskCreateRequest req);                 // status = req.status() != null ? req.status() : TODO
                                                    // createdAt = Instant.now(clock).truncatedTo(ChronoUnit.MICROS)
Task get(long id);                                  // orElseThrow(() -> new TaskNotFoundException(id))
Page<Task> list(int page, int size);                // PageRequest.of(page, size, Sort.by(DESC,"createdAt").and(Sort.by(DESC,"id")))
Task update(long id, TaskUpdateRequest req);        // copies title, description, status, dueDate only
void delete(long id);                               // existsById ? deleteById : throw TaskNotFoundException
```

`createdAt` is truncated to microseconds so the value returned by `POST` equals what PostgreSQL
(`timestamptz`, µs precision) returns later. Secondary sort on `id DESC` makes ordering deterministic when
timestamps tie.

## 4. Domain model & database schema

`Task` entity mapping:

| Field | Java type | Column | JPA |
|---|---|---|---|
| id | `Long` | `id BIGINT GENERATED ALWAYS AS IDENTITY` | `@Id @GeneratedValue(strategy = IDENTITY)` |
| title | `String` | `title VARCHAR(200) NOT NULL` | `@Column(nullable=false, length=200)` |
| description | `String` | `description VARCHAR(2000)` | `@Column(length=2000)` |
| status | `TaskStatus` | `status VARCHAR(20) NOT NULL` + CHECK | `@Enumerated(EnumType.STRING) @Column(nullable=false, length=20)` |
| createdAt | `Instant` | `created_at TIMESTAMPTZ NOT NULL` | `@Column(name="created_at", nullable=false, updatable=false)` |
| dueDate | `LocalDate` | `due_date DATE` | `@Column(name="due_date")` |

Use `VARCHAR` (not `TEXT`) so Hibernate `ddl-auto=validate` type checks pass. Entity has a protected no-arg
constructor, getters, and setters only for mutable fields (`title`, `description`, `status`, `dueDate`);
`id`/`createdAt` have no public setters except a package-private/constructor path used by the service on create.

**Flyway migration** — `src/main/resources/db/migration/V1__create_tasks_table.sql` (exact content):

```sql
-- SCRUM-2: initial schema for the To-Do backend (SCRUM-2-AC-01, SCRUM-2-NFR-04)
CREATE TABLE tasks (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title       VARCHAR(200)  NOT NULL,
    description VARCHAR(2000),
    status      VARCHAR(20)   NOT NULL DEFAULT 'TODO',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    due_date    DATE,
    CONSTRAINT ck_tasks_status CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
    CONSTRAINT ck_tasks_title_not_blank CHECK (length(btrim(title)) > 0)
);

CREATE INDEX ix_tasks_created_at_id ON tasks (created_at DESC, id DESC);
```

DB defaults are a safety net only; the application always sets `status` and `created_at` explicitly.
Hibernate: `spring.jpa.hibernate.ddl-auto=validate`, `spring.jpa.open-in-view=false` (NFR-04).

## 5. REST API contract

Base path `/api/tasks`, `Content-Type: application/json`. Dates: `createdAt` ISO-8601 UTC instant
(`2026-11-17T10:15:30.123456Z`), `dueDate` `yyyy-MM-dd`. Jackson 3 (Boot 4 default) serializes `java.time`
as ISO strings without extra modules.

**Request bodies**

`TaskCreateRequest` / `TaskUpdateRequest` (records, annotated `@JsonIgnoreProperties(ignoreUnknown = true)`
from `com.fasterxml.jackson.annotation` — annotations stay in that package in Jackson 3; this makes
client-sent `id`/`createdAt` silently ignored, AC-12):

| Field | Create | Update | Constraints |
|---|---|---|---|
| title | required | required | compact constructor trims (`strip()`, A-09); `@NotBlank @Size(max = 200)` |
| description | optional | optional | `@Size(max = 2000)` |
| status | optional (default `TODO`) | **required** (`@NotNull`) | `TaskStatus` enum; unknown value → Jackson error → 400 |
| dueDate | optional | optional | `LocalDate`; bad format/invalid date → Jackson error → 400 |

**Response** `TaskResponse`: `{ "id", "title", "description", "status", "createdAt", "dueDate" }`
(nulls are serialized as `null`).

**List response** `PageResponse<TaskResponse>`:
`{ "items": [...], "page": 0, "size": 20, "totalElements": 0, "totalPages": 0 }`.

| # | Method & path | Request | Success | Errors | ACs |
|---|---|---|---|---|---|
| 1 | `POST /api/tasks` | `TaskCreateRequest` | **201**, `Location: /api/tasks/{id}` (via `ServletUriComponentsBuilder.fromCurrentRequest().path("/{id}")`), body `TaskResponse` | 400 validation / bad JSON / bad enum / bad date; 415 wrong content type | 03, 10, 11, 12, 13 |
| 2 | `GET /api/tasks/{id}` | – | **200** `TaskResponse` | 404 unknown id; 400 non-numeric id | 04, 08, 12 |
| 3 | `GET /api/tasks?page=&size=` | `page` int ≥0 default 0; `size` int ≥1 default 20, values >100 clamped to 100 | **200** `PageResponse`, sorted `createdAt DESC, id DESC`; empty DB → `items: []` | 400 for negative `page`, `size` < 1, non-numeric | 05, A-07 |
| 4 | `PUT /api/tasks/{id}` | `TaskUpdateRequest` | **200** `TaskResponse` (id/createdAt unchanged) | 404, 400 (as POST + missing status) | 06, 08, 10–12 |
| 5 | `DELETE /api/tasks/{id}` | – | **204** no body | 404 | 07, 08 |
| – | any unmapped route / wrong method | – | – | 404 / 405 standard body | 13 |
| – | `GET /actuator/health` | – | **200** `{"status":"UP"}` | 503 when DB down | 02 |
| – | `GET /actuator/info` | – | **200** git + build info incl. `build.jira=SCRUM-2` | – | traceability |

Pagination is bound with explicit `@RequestParam(defaultValue="0") @Min(0) int page`,
`@RequestParam(defaultValue="20") @Min(1) int size` on a `@Validated` controller (Spring 7 built-in method
validation raises `HandlerMethodValidationException` → 400), then `Math.min(size, 100)`. **Do not** use a
`Pageable` argument: Spring Data silently coerces negative values, which would violate A-07.

## 6. Error-handling design (AC-08, 10–14) — see ADR 0003

Single body type for every error:

```json
{
  "timestamp": "2026-11-17T10:15:30.123Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/tasks",
  "fieldErrors": [
    { "field": "title", "message": "must not be blank" },
    { "field": "description", "message": "size must be between 0 and 2000" }
  ]
}
```

`ApiError(Instant timestamp, int status, String error, String message, String path, List<FieldErrorItem> fieldErrors)`;
`fieldErrors` is an empty list (not omitted) when not a validation failure — simpler for clients and tests.
`error` = `HttpStatus.getReasonPhrase()`. `path` = `((ServletWebRequest) request).getRequest().getRequestURI()`.

`GlobalExceptionHandler extends ResponseEntityExceptionHandler` (`@RestControllerAdvice`). Overriding
`handleExceptionInternal(...)` converts **every** Spring MVC exception the base class handles (405, 415,
404 `NoResourceFoundException`, 400 `HttpMessageNotReadableException`, `TypeMismatchException`,
`MissingServletRequestParameterException`, …) into `ApiError`, so the base class's ProblemDetail body is never
emitted. Specific mappings:

| Exception | Status | message | fieldErrors | AC |
|---|---|---|---|---|
| `TaskNotFoundException` (own `@ExceptionHandler`) | 404 | `Task with id {id} not found` | [] | 08 |
| `MethodArgumentNotValidException` (override `handleMethodArgumentNotValid`) | 400 | `Validation failed` | **all** `FieldError`s (`getField()`, `getDefaultMessage()`), sorted by field for determinism | 10, 13 |
| `HandlerMethodValidationException` (override `handleHandlerMethodValidationException`) | 400 | `Validation failed` | one entry per invalid parameter (`page`, `size`) | 05, A-07 |
| `HttpMessageNotReadableException` (override `handleHttpMessageNotReadable`) | 400 | `Malformed JSON request` or, when the cause is a `tools.jackson.databind.exc.InvalidFormatException`/`MismatchedInputException`, `Invalid value for field '<path>'`; the field path is built from `DatabindException#getPath()` property names and also added as a `fieldErrors` entry | 0–1 | 11, 13 |
| `TypeMismatchException` / `MethodArgumentTypeMismatchException` (override `handleTypeMismatch`) | 400 | `Invalid value for parameter '<name>'` | [] | 12 |
| `HttpRequestMethodNotSupportedException` | 405 | `Request method 'X' is not supported` | [] | 13 |
| `HttpMediaTypeNotSupportedException` | 415 | `Content type 'X' is not supported` | [] | 13 |
| `NoResourceFoundException` | 404 | `No endpoint {METHOD} {path}` | [] | 13 |
| `Exception` (catch-all `@ExceptionHandler`) | 500 | `An unexpected error occurred` (fixed) | [] | 14 |

Leak prevention (AC-14): the catch-all logs the exception at ERROR server-side and **never** copies
`ex.getMessage()` into the body; messages for 4xx are built from our own templates, never raw Jackson/JDBC
text (Jackson messages contain class names). Also set `server.error.include-stacktrace=never`,
`server.error.include-message=never` as a backstop for errors outside MVC.
`spring.mvc.problemdetails.enabled` stays `false` (default).

## 7. Validation approach

- Bean Validation (`spring-boot-starter-validation`, Hibernate Validator 9 / Jakarta Validation 3.1) on DTO
  records; `@Valid @RequestBody` in controller → `MethodArgumentNotValidException` with **all** violations.
- Trimming (A-09) happens in the record compact constructor *before* validation:
  `title = title == null ? null : title.strip();`, so `"   "` → `""` → `@NotBlank` fails.
- Type-level errors (enum, date format, malformed JSON) are Jackson deserialization failures → 400 via
  `HttpMessageNotReadableException` (AC-11). Jackson cannot report multiple type errors at once; that is
  acceptable (AC-13 "every invalid field" applies to Bean Validation failures).
- Query params: `@Min` on controller params + `@Validated` on controller class.
- Path id: `@PathVariable long id`; non-numeric → `MethodArgumentTypeMismatchException` → 400 (AC-12).
- Default validation messages are used (no `messages.properties` needed).

## 8. Configuration & environment variables (NFR-05)

`src/main/resources/application.yml` (Dev implements exactly these keys):

```yaml
spring:
  application:
    name: todo-backend
  datasource:
    url: ${DB_URL:jdbc:postgresql://localhost:5432/todo}
    username: ${DB_USERNAME:todo}
    password: ${DB_PASSWORD:todo}
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate
  flyway:
    enabled: true
    locations: classpath:db/migration
server:
  port: ${SERVER_PORT:8080}
  error:
    include-stacktrace: never
    include-message: never
app:
  cors:
    allowed-origins: ${APP_CORS_ALLOWED_ORIGINS:http://localhost:5173}
management:
  endpoints:
    web:
      exposure:
        include: health,info
  endpoint:
    health:
      show-details: never
  info:
    git:
      mode: full
```

| Env var | Property | Default (local dev only) | Purpose / AC |
|---|---|---|---|
| `DB_URL` | `spring.datasource.url` | `jdbc:postgresql://localhost:5432/todo` | AC-01 |
| `DB_USERNAME` | `spring.datasource.username` | `todo` | AC-01 |
| `DB_PASSWORD` | `spring.datasource.password` | `todo` (matches `docker-compose.yml`; not a real secret) | AC-01 |
| `SERVER_PORT` | `server.port` | `8080` | NFR-05 |
| `APP_CORS_ALLOWED_ORIGINS` | `app.cors.allowed-origins` | `http://localhost:5173` (comma-separated list) | AC-15 |

### CORS (AC-15)

`CorsProperties` = `@ConfigurationProperties(prefix = "app.cors") record CorsProperties(List<String> allowedOrigins)`;
a comma-separated string binds to `List<String>`. `WebConfig implements WebMvcConfigurer` and carries
`@EnableConfigurationProperties(CorsProperties.class)` (so the `@WebMvcTest` slice picks it up):

```java
registry.addMapping("/api/**")
        .allowedOrigins(props.allowedOrigins().toArray(String[]::new))
        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
        .allowedHeaders("*")
        .exposedHeaders("Location")
        .maxAge(3600);
```

Non-allowed origins: Spring's `DefaultCorsProcessor` returns 403 for a preflight and omits
`Access-Control-Allow-Origin` — matches AC-15 (assert the header is absent). No credentials (no auth).

### Local DB

`docker-compose.yml` at repo root: service `postgres`, image `postgres:16-alpine`, env
`POSTGRES_DB=todo`, `POSTGRES_USER=todo`, `POSTGRES_PASSWORD=todo`, port `5432:5432`, named volume, healthcheck
`pg_isready`. Do **not** add `spring-boot-docker-compose` (keeps startup explicit and CI-neutral).

## 9. Test strategy (AC-16)

All test classes: JUnit 5, `@Tag("SCRUM-2")`, class-level `@DisplayName("SCRUM-2 …")`, and each test method
`@DisplayName` **starting with the AC ID** it verifies, e.g.
`@DisplayName("SCRUM-2-AC-03: create returns 201 with Location header and default status TODO")`.
All classes are named `*Test` so **Surefire runs everything in `mvn verify`** (no Failsafe split → one JaCoCo
exec file, one report set).

| Test class (`src/test/java/com/vinods21/todo/...`) | Kind | Covers |
|---|---|---|
| `service/TaskServiceTest` | Plain JUnit + Mockito (`@ExtendWith(MockitoExtension.class)`, mocked `TaskRepository`, `Clock.fixed(...)`) | AC-03 (default TODO, createdAt from clock, µs truncation), AC-04, AC-05 (PageRequest page/size + sort `createdAt DESC, id DESC`), AC-06 (only mutable fields copied; id/createdAt kept), AC-07, AC-08 (get/update/delete not found throw), AC-16 |
| `web/TaskControllerTest` | `@WebMvcTest(TaskController.class)` + `@MockitoBean TaskService` + `MockMvc` | AC-03 (201, `Location`, body), AC-04, AC-05 (defaults, clamp 150→100, negative page → 400, `size=0` → 400, empty list shape), AC-06, AC-07 (204), AC-08 (404 GET/PUT/DELETE with ApiError), AC-10 (missing/blank/whitespace/201-char title; 2001-char description; **both** errors listed together), AC-11 (bad status, `2026-13-45`, `17/11/2026`, malformed JSON), AC-12 (client `id`/`createdAt` ignored — verify via `ArgumentCaptor` they never reach service; `/api/tasks/abc` → 400), AC-13 (body shape incl. 405 `PATCH`, 415 `text/plain`, unknown route 404), AC-14 (service throws `RuntimeException("org.postgresql... SELECT secret")` → 500, generic message, body does not contain `org.`, `SELECT`, `Exception`) |
| `web/CorsConfigTest` | `@WebMvcTest(TaskController.class)` + `@MockitoBean TaskService`; second nested/separate class with `@TestPropertySource(properties = "app.cors.allowed-origins=http://a.test,http://b.test")` | AC-15: preflight `OPTIONS` from `http://localhost:5173` → `Access-Control-Allow-Origin` present; from `http://evil.test` → header absent; override list honoured |
| `TodoApplicationIntegrationTest` | `@SpringBootTest(webEnvironment = RANDOM_PORT)` + `@Testcontainers` + `@Container @ServiceConnection static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16-alpine")`; HTTP via `RestClient.create("http://localhost:" + port)` (spring-web, no extra test module) | AC-01 (context starts; Flyway created `tasks`; `flyway_schema_history` has V1), AC-02 (`/actuator/health` 200 `UP`), end-to-end AC-03/04/05/06/07 smoke against real PG (ordering, timestamps round-trip), `/actuator/info` contains `build.jira=SCRUM-2` |
| `TaskPersistenceRestartTest` | Testcontainers PG16 shared static container; starts the app **twice** with `new SpringApplicationBuilder(TodoApplication.class).properties("server.port=0", "spring.datasource.url=" + jdbcUrl, ...)`; create in run #1, `close()`, GET in run #2 | AC-09 (true restart), AC-01 (second start against already-migrated DB is a no-op migration) |

Notes for Dev:
- Spring Boot 4 imports: `org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest`,
  `org.springframework.test.context.bean.override.mockito.MockitoBean` (`@MockBean` is gone),
  `org.springframework.boot.testcontainers.service.connection.ServiceConnection`,
  `org.springframework.boot.test.web.server.LocalServerPort`.
- Testcontainers 2.x (managed by the Boot 4 BOM): artifacts `testcontainers-postgresql` and
  `testcontainers-junit-jupiter`; class `org.testcontainers.postgresql.PostgreSQLContainer` (non-generic).
  If the resolved BOM turns out to carry 1.x, fall back to artifacts `postgresql` / `junit-jupiter` and
  `org.testcontainers.containers.PostgreSQLContainer<?>` — check `mvn help:effective-pom` output in CI.
- `TestRestTemplate` moved to a separate module in Boot 4 — **don't use it**; use `RestClient`.
- Integration tests need Docker → they run in CI (ubuntu-latest) only; no H2 anywhere (NFR-03).

### Coverage gate (AC-16)

`jacoco-maven-plugin` (pinned, see §11): `prepare-agent` → `report` (phase `verify`) → `check` (phase
`verify`) with rule:

```xml
<rule>
  <element>PACKAGE</element>
  <includes>
    <include>com.vinods21.todo.service</include>
    <include>com.vinods21.todo.web*</include>
  </includes>
  <limits>
    <limit><counter>LINE</counter><value>COVEREDRATIO</value><minimum>0.80</minimum></limit>
  </limits>
</rule>
```

`haltOnFailure=true` → build fails below 80% on any of `service`, `web`, `web.dto`, `web.error`.
Report: `target/site/jacoco/` (HTML + `jacoco.xml` + `jacoco.csv`).

## 10. CI design (NFR-06) — `.github/workflows/ci.yml`

```yaml
name: SCRUM-2 CI
on:
  push:
    branches: ["**"]
  pull_request:
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0            # full history for git-commit-id plugin
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"
          cache: maven
      - name: Build, test, coverage gate
        run: ./mvnw -B -ntp verify
      - name: Coverage summary
        if: always()
        run: |
          if [ -f target/site/jacoco/jacoco.csv ]; then
            awk -F, 'NR>1 {m+=$8; c+=$9} END {printf "### SCRUM-2 line coverage: %.1f%%\n", (c*100)/(m+c)}' \
              target/site/jacoco/jacoco.csv >> "$GITHUB_STEP_SUMMARY"
          fi
      - name: Upload jar
        uses: actions/upload-artifact@v4
        with:
          name: todo-backend-SCRUM-2-${{ github.sha }}
          path: |
            target/todo-backend-*.jar
            !target/*.jar.original
          if-no-files-found: error
      - name: Upload test & coverage reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: todo-backend-SCRUM-2-${{ github.sha }}-reports
          path: |
            target/surefire-reports/
            target/site/jacoco/
          if-no-files-found: warn
```

`mvn verify` fails on any test failure or coverage below 80% (NFR-06, AC-16). The jar artifact is only
produced when the build passes; reports are uploaded even on failure for diagnosis.

## 11. Dependencies & plugins (ADR 0001)

**All dependency versions come from `spring-boot-starter-parent:4.1.2`. No `<version>` on any dependency.**

| Scope | groupId:artifactId | Version |
|---|---|---|
| compile | `org.springframework.boot:spring-boot-starter-webmvc` | BOM |
| compile | `org.springframework.boot:spring-boot-starter-data-jpa` | BOM |
| compile | `org.springframework.boot:spring-boot-starter-validation` | BOM |
| compile | `org.springframework.boot:spring-boot-starter-actuator` | BOM |
| compile | `org.springframework.boot:spring-boot-starter-flyway` | BOM |
| runtime | `org.flywaydb:flyway-database-postgresql` | BOM |
| runtime | `org.postgresql:postgresql` | BOM |
| test | `org.springframework.boot:spring-boot-starter-test` | BOM |
| test | `org.springframework.boot:spring-boot-starter-webmvc-test` | BOM |
| test | `org.springframework.boot:spring-boot-testcontainers` | BOM |
| test | `org.testcontainers:testcontainers-junit-jupiter` | BOM |
| test | `org.testcontainers:testcontainers-postgresql` | BOM |

Not used on purpose: Lombok (records suffice), H2, springdoc (optional, out of scope), MapStruct,
`spring-boot-docker-compose`, `spring-boot-resttestclient`.

| Plugin | Version | Notes |
|---|---|---|
| `org.springframework.boot:spring-boot-maven-plugin` | parent | goals `repackage` (parent default) + `build-info` with `<additionalProperties><jira>SCRUM-2</jira></additionalProperties>` |
| `org.apache.maven.plugins:maven-jar-plugin` | parent | manifest entries (see §12) |
| `org.apache.maven.plugins:maven-surefire-plugin` | parent | default includes `**/*Test.java` |
| `io.github.git-commit-id:git-commit-id-maven-plugin` | **pinned `9.0.1`** | user requirement to pin; overrides the parent's managed version |
| `org.jacoco:jacoco-maven-plugin` | **pinned `0.8.13`** (property `jacoco.version`) | not managed by the Boot parent; 0.8.13 supports Java 21+ |

Maven wrapper (NFR-07): `mvnw`, `mvnw.cmd`, `.mvn/wrapper/maven-wrapper.properties` with
`wrapperVersion=3.3.2`, `distributionType=only-script`,
`distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.11/apache-maven-3.9.11-bin.zip`.
Because Maven Central is unreachable from the authoring workspace, `mvn wrapper:wrapper` cannot be run there;
Dev hand-writes the standard Apache Maven Wrapper 3.3.2 *only-script* `mvnw`/`mvnw.cmd`, commits `mvnw` with
the executable bit (`git update-index --chmod=+x mvnw`), and CI is the proof that it works.

## 12. Traceability conventions (ADR 0004)

Traceability chain: **Jira SCRUM-2 → branch → commits → AC IDs in tests → surefire report → jar manifest /
`/actuator/info` → CI artifact → PR → traceability matrix.**

| Artefact | Convention | Example |
|---|---|---|
| Branch | `feature/SCRUM-2-<slug>` | `feature/SCRUM-2-spring-boot-backend-setup` |
| Commit subject | `SCRUM-2: [ROLE] <imperative summary>`; ROLE ∈ `PM`, `ARCH`, `DEV`, `QA`, `CI` | `SCRUM-2: [DEV] add task CRUD controller and service` |
| Commit trailer | `Refs: SCRUM-2` (git trailer block, blank line before) | – |
| Code comments | Only where non-obvious, cite the ID: `// SCRUM-2-AC-12: client id ignored` | – |
| Migration header | `-- SCRUM-2: ...` first line of each SQL file | V1 |
| Test class | `@Tag("SCRUM-2")` + class `@DisplayName("SCRUM-2 <subject>")` | `@DisplayName("SCRUM-2 TaskController")` |
| Test method | `@DisplayName("SCRUM-2-AC-xx: <behaviour>")`; a test covering several ACs lists them: `"SCRUM-2-AC-10, SCRUM-2-AC-13: ..."` | `"SCRUM-2-AC-03: create returns 201 with Location header"` |
| Surefire report | `target/surefire-reports/TEST-*.xml` contains display names → AC IDs searchable (`grep -o 'SCRUM-2-AC-[0-9]*'`) | – |
| Jar manifest | `Implementation-Title`, `Implementation-Version` (= project version), `X-Jira-Issue: SCRUM-2`, `X-Git-Commit: ${git.commit.id.full}`, `X-Git-Branch: ${git.branch}` | `unzip -p target/todo-backend-0.1.0-SNAPSHOT.jar META-INF/MANIFEST.MF` |
| Runtime | `GET /actuator/info` → `git` (full) + `build` incl. `build.jira = SCRUM-2` | – |
| CI artifact | `todo-backend-SCRUM-2-${{ github.sha }}` (+ `-reports`) | – |
| PR | title `SCRUM-2: Spring Boot backend setup`; body links `https://suranagivinod.atlassian.net/browse/SCRUM-2`, requirements, design, ADRs and traceability matrix | – |
| Matrix | `docs/traceability/SCRUM-2.md`: AC/NFR → code → test method → CI evidence (filled by Dev, CI link added after green run) | – |

**pom.xml fragments** (Dev copies these):

```xml
<properties>
  <java.version>21</java.version>
  <jira.issue>SCRUM-2</jira.issue>
  <jacoco.version>0.8.13</jacoco.version>
  <git-commit-id-plugin.version>9.0.1</git-commit-id-plugin.version>
</properties>

<plugin>
  <groupId>io.github.git-commit-id</groupId>
  <artifactId>git-commit-id-maven-plugin</artifactId>
  <version>${git-commit-id-plugin.version}</version>
  <executions>
    <execution>
      <id>get-the-git-infos</id>
      <goals><goal>revision</goal></goals>
      <phase>initialize</phase>
    </execution>
  </executions>
  <configuration>
    <failOnNoGitDirectory>false</failOnNoGitDirectory>
    <failOnUnableToExtractRepoInfo>false</failOnUnableToExtractRepoInfo>
    <generateGitPropertiesFile>true</generateGitPropertiesFile>
    <generateGitPropertiesFilename>${project.build.outputDirectory}/git.properties</generateGitPropertiesFilename>
    <offline>true</offline>
    <includeOnlyProperties>
      <includeOnlyProperty>^git.branch$</includeOnlyProperty>
      <includeOnlyProperty>^git.build.(time|version)$</includeOnlyProperty>
      <includeOnlyProperty>^git.commit.id.(abbrev|full)$</includeOnlyProperty>
      <includeOnlyProperty>^git.commit.time$</includeOnlyProperty>
      <includeOnlyProperty>^git.dirty$</includeOnlyProperty>
    </includeOnlyProperties>
    <commitIdGenerationMode>full</commitIdGenerationMode>
  </configuration>
</plugin>

<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-jar-plugin</artifactId>
  <configuration>
    <archive>
      <manifest>
        <addDefaultImplementationEntries>true</addDefaultImplementationEntries>
      </manifest>
      <manifestEntries>
        <X-Jira-Issue>${jira.issue}</X-Jira-Issue>
        <X-Git-Commit>${git.commit.id.full}</X-Git-Commit>
        <X-Git-Branch>${git.branch}</X-Git-Branch>
      </manifestEntries>
    </archive>
  </configuration>
</plugin>

<plugin>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-maven-plugin</artifactId>
  <executions>
    <execution>
      <goals><goal>build-info</goal></goals>
      <configuration>
        <additionalProperties>
          <jira>${jira.issue}</jira>
          <git-commit>${git.commit.id.full}</git-commit>
        </additionalProperties>
      </configuration>
    </execution>
  </executions>
</plugin>
```

`spring-boot-maven-plugin:repackage` reuses the jar plugin's manifest, so the custom entries survive in the
executable jar. On GitHub Actions the plugin's default `useBranchNameFromBuildEnvironment=true` takes the
branch from `GITHUB_HEAD_REF`/`GITHUB_REF`, so PR builds (detached HEAD) still report the real branch. Without
a `.git` directory the build still succeeds (`failOnNoGitDirectory=false`) and the git entries stay
unresolved — acceptable for local source-zip builds.

## 13. Requirement → design coverage

| ID | Design element |
|---|---|
| AC-01 | §4 V1 migration, §8 env vars, Flyway starter; `TodoApplicationIntegrationTest`, `TaskPersistenceRestartTest` |
| AC-02 | Actuator `health` exposure; `TodoApplicationIntegrationTest` |
| AC-03..08 | §3 service API, §5 contract |
| AC-09 | PostgreSQL persistence; `TaskPersistenceRestartTest` |
| AC-10..12 | §5, §7 |
| AC-13, AC-14 | §6, ADR 0003 |
| AC-15 | §8 CORS |
| AC-16 | §9 |
| NFR-01/02 | §2, §11, ADR 0001 |
| NFR-03 | §8 docker-compose, Testcontainers `postgres:16-alpine` |
| NFR-04 | §4, ADR 0002 |
| NFR-05 | §8 |
| NFR-06 | §10 |
| NFR-07 | §11 wrapper |
| NFR-08 | README section (Dev): prerequisites, `docker compose up -d`, env vars table (§8), `./mvnw spring-boot:run`, `./mvnw verify`, endpoint list (§5) |

## 14. Risks

| Risk | Mitigation |
|---|---|
| Build never compiled locally; Boot 4 module/package moves | Only BOM-managed deps; Boot 4 imports spelled out in §9; first CI run is the gate — Dev iterates on CI logs |
| Testcontainers artifact naming (1.x vs 2.x) | §9 fallback note |
| Hand-written Maven wrapper scripts | CI uses `./mvnw` so a broken wrapper fails fast and visibly |
| Jackson 3 exception class names differ from Jackson 2 | Handler matches on `HttpMessageNotReadableException` first; cause inspection is best-effort with generic fallback message |
| Docker API changes on ubuntu-latest vs Testcontainers | BOM-managed TC version; if Docker client errors appear, report in PR — do not pin TC ad hoc without noting it in ADR 0001 |
