# ADR 0001 — Maven (with wrapper) and Spring Boot 4.1.2 on Java 21

- Status: Accepted
- Date: 2026-11-17
- Jira: [SCRUM-2](https://suranagivinod.atlassian.net/browse/SCRUM-2) — SCRUM-2-NFR-01, NFR-02, NFR-07

## Context

SCRUM-2 mandates Java 21 and Spring Boot 4.1.2 (Spring Framework 7, Jakarta EE 11, Jackson 3, Hibernate 7).
Spring Boot 4 split auto-configuration and test support into many small modules (e.g. `spring-boot-starter-webmvc`,
`spring-boot-starter-webmvc-test`, `spring-boot-starter-flyway`). The authoring workspace cannot reach Maven
Central, so the build is first executed in GitHub Actions; every guessed version is a failure risk.

## Decision

- Build with **Maven** and commit the **Maven Wrapper** (3.3.2, only-script, Maven 3.9.11).
- Inherit from `org.springframework.boot:spring-boot-starter-parent:4.1.2`; **no dependency declares a version** —
  all come from the Boot BOM (starters webmvc, data-jpa, validation, actuator, flyway; `flyway-database-postgresql`;
  `postgresql`; test: starter-test, starter-webmvc-test, spring-boot-testcontainers, Testcontainers PG + JUnit).
- Only two things are pinned, both plugins: `jacoco-maven-plugin` **0.8.13** (not managed by Boot) and
  `git-commit-id-maven-plugin` **9.0.1** (pinned deliberately for reproducible traceability metadata).
- Project at repo root, `groupId com.vinods21`, `artifactId todo-backend`, base package `com.vinods21.todo`.
- No Lombok, no H2, no MapStruct: Java records cover DTOs.

## Consequences

- Version drift is limited to what Spring tests together in the 4.1.2 BOM.
- Developers need only JDK 21 (`./mvnw`).
- Any further pinned version must be added to this ADR with a reason.
- Boot 4 import locations (e.g. `org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest`, `@MockitoBean`)
  differ from Boot 3 tutorials; the design doc lists them.
