# ADR 0002 — Flyway for schema migrations, Hibernate in validate mode

- Status: Accepted
- Date: 2026-11-17
- Jira: [SCRUM-2](https://suranagivinod.atlassian.net/browse/SCRUM-2) — SCRUM-2-AC-01, SCRUM-2-NFR-04

## Context

NFR-04 requires versioned migrations (Flyway or Liquibase) and forbids `ddl-auto=update/create`. The schema is
one table; the team writes PostgreSQL SQL directly.

## Decision

- Use **Flyway** via `spring-boot-starter-flyway` + `org.flywaydb:flyway-database-postgresql` (both BOM-managed;
  the PostgreSQL module is mandatory since Flyway 10).
- Plain SQL migrations in `src/main/resources/db/migration`, named `V<n>__<snake_case>.sql`, first line
  `-- SCRUM-<key>: ...` for traceability. V1 creates `tasks` (see design §4).
- Migrations run automatically on application startup; `spring.jpa.hibernate.ddl-auto=validate`.
- Applied migrations are immutable; changes go into a new version.
- Columns use `VARCHAR(n)` (not `TEXT`) so Hibernate validation of `String` fields passes.

## Consequences

- Schema is reproducible on every environment and in Testcontainers integration tests.
- Liquibase-style rollbacks are not available; fixes are forward-only migrations.
- Hibernate validation catches entity/schema drift at startup (fail fast).
