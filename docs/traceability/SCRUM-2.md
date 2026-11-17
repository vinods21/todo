# SCRUM-2 — Requirements Traceability Matrix

Jira: [SCRUM-2](https://suranagivinod.atlassian.net/browse/SCRUM-2) · Branch: `feature/SCRUM-2-spring-boot-backend-setup` ·
Requirements: [`docs/requirements/SCRUM-2.md`](../requirements/SCRUM-2.md) · Design: [`docs/architecture/SCRUM-2-design.md`](../architecture/SCRUM-2-design.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md)

**To be completed by Dev.** "Test method" = `Class#method` whose `@DisplayName` starts with the ID.
"CI evidence" = link to the green GitHub Actions run and artifact `todo-backend-SCRUM-2-<sha>`.

CI run: _TBD_ · Commit SHA: _TBD_ · Artifact: `todo-backend-SCRUM-2-<sha>`

| ID | Requirement (short) | Code (class / file) | Test method(s) | CI evidence |
|---|---|---|---|---|
| SCRUM-2-AC-01 | Starts with env-configured PG; Flyway creates `tasks` | TBD | TBD | TBD |
| SCRUM-2-AC-02 | `/actuator/health` 200 UP | TBD | TBD | TBD |
| SCRUM-2-AC-03 | POST → 201, Location, default TODO | TBD | TBD | TBD |
| SCRUM-2-AC-04 | GET by id → 200 | TBD | TBD | TBD |
| SCRUM-2-AC-05 | Paginated list, defaults, newest first | TBD | TBD | TBD |
| SCRUM-2-AC-06 | PUT updates mutable fields only | TBD | TBD | TBD |
| SCRUM-2-AC-07 | DELETE → 204, then 404 | TBD | TBD | TBD |
| SCRUM-2-AC-08 | 404 on unknown id GET/PUT/DELETE | TBD | TBD | TBD |
| SCRUM-2-AC-09 | Persists across restart | TBD | TBD | TBD |
| SCRUM-2-AC-10 | title/description validation → 400 field errors | TBD | TBD | TBD |
| SCRUM-2-AC-11 | bad status/dueDate/malformed JSON → 400 | TBD | TBD | TBD |
| SCRUM-2-AC-12 | client id/createdAt ignored; non-numeric id → 400 | TBD | TBD | TBD |
| SCRUM-2-AC-13 | Consistent error body, all field errors | TBD | TBD | TBD |
| SCRUM-2-AC-14 | 500 generic, nothing leaked | TBD | TBD | TBD |
| SCRUM-2-AC-15 | CORS configurable origins | TBD | TBD | TBD |
| SCRUM-2-AC-16 | Tests in build, ≥ 80% line coverage service+web | TBD | TBD | TBD |
| SCRUM-2-NFR-01 | Java 21 | TBD | n/a | TBD |
| SCRUM-2-NFR-02 | Spring Boot 4.1.2 | TBD | n/a | TBD |
| SCRUM-2-NFR-03 | PG16, docker-compose, Testcontainers | TBD | TBD | TBD |
| SCRUM-2-NFR-04 | Flyway; ddl-auto validate | TBD | TBD | TBD |
| SCRUM-2-NFR-05 | Env-var config, no secrets | TBD | n/a | TBD |
| SCRUM-2-NFR-06 | CI build/test/jar artifact | TBD | n/a | TBD |
| SCRUM-2-NFR-07 | Maven wrapper committed | TBD | n/a | TBD |
| SCRUM-2-NFR-08 | README run instructions | TBD | n/a | TBD |
