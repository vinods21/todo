# SCRUM-7: backend image — ADR 0010, design §3.1 (AC-01..AC-03, NFR-01..NFR-07, NFR-12)
# Local: docker build -t todo-backend:local .   (identity: --build-arg JIRA_KEY=… GIT_COMMIT=… GIT_BRANCH=…)

# ---- build stage: Maven Wrapper on JDK 21 (NFR-02) ----
FROM eclipse-temurin:21.0.13_9-jdk-noble AS build
WORKDIR /workspace

# Dependency layer (NFR-03): only pom.xml / wrapper invalidate it. A regular layer, not a cache mount, so the
# GitHub Actions layer cache (type=gha, mode=max) restores it on fresh runners (ADR 0010).
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B -ntp dependency:go-offline

COPY src/ src/
# Build identity (Q-03, ADR 0010): declared after the dependency layer so a new commit never invalidates it.
ARG JIRA_KEY=UNKNOWN
ARG GIT_COMMIT=UNKNOWN
ARG GIT_BRANCH=UNKNOWN
# Tests run in the CI build job, not here (AC-01). git-commit-id is skipped (no .git in the context, NFR-06);
# the -D user properties fill X-Git-Commit / X-Git-Branch / X-Jira-Issue and build-info git-commit / jira.
RUN ./mvnw -B -ntp -Dmaven.test.skip=true -Djacoco.skip=true -Dmaven.gitcommitid.skip=true \
        "-Djira.issue=${JIRA_KEY}" "-Dgit.commit.id.full=${GIT_COMMIT}" "-Dgit.branch=${GIT_BRANCH}" \
        package \
 && cp target/todo-backend-*.jar /workspace/app.jar

# ---- runtime stage: JRE only (NFR-02, NFR-03) ----
FROM eclipse-temurin:21.0.13_9-jre-alpine
RUN addgroup -S -g 10001 todo \
 && adduser -S -D -H -u 10001 -G todo -s /sbin/nologin todo
WORKDIR /app
COPY --from=build /workspace/app.jar /app/app.jar
USER 10001:10001
EXPOSE 8080
# NFR-07: busybox wget ships with the base image; non-2xx (DOWN = 503) → unhealthy. JSON form (hadolint DL3025);
# sh -c only to honour SERVER_PORT.
HEALTHCHECK --interval=10s --timeout=3s --start-period=90s --retries=3 \
  CMD ["sh", "-c", "wget -q -O /dev/null \"http://127.0.0.1:${SERVER_PORT:-8080}/actuator/health\" || exit 1"]
# AC-03: exec form → the JVM is PID 1 and receives SIGTERM (Boot graceful shutdown). NFR-12: container-aware heap.
# Extra JVM flags: JAVA_TOOL_OPTIONS. Configuration: DB_URL, DB_USERNAME, DB_PASSWORD, SERVER_PORT, APP_CORS_ALLOWED_ORIGINS.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/app.jar"]

# NFR-05: OCI labels from build args (UNKNOWN when not supplied — never a hard-coded story key).
ARG JIRA_KEY=UNKNOWN
ARG GIT_COMMIT=UNKNOWN
ARG GIT_BRANCH=UNKNOWN
ARG VERSION=UNKNOWN
ARG BUILD_DATE=UNKNOWN
ARG SOURCE_URL=https://github.com/vinods21/todo
LABEL org.opencontainers.image.title="todo-backend" \
      org.opencontainers.image.description="To-Do application REST API (Spring Boot 4.1.2, Java 21)" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="NOASSERTION" \
      com.vinods21.todo.jira="${JIRA_KEY}" \
      com.vinods21.todo.branch="${GIT_BRANCH}"
