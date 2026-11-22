# SCRUM-7: backend image — ADR 0010, design §3.1 (AC-01..AC-03, NFR-01..NFR-07, NFR-12)
# Local: docker build -t todo-backend:local .   (identity: --build-arg JIRA_KEY=… GIT_COMMIT=… GIT_BRANCH=… VERSION=…)
# SCRUM-8 (ADR 0013, design §5.4): JAR_SOURCE=source (default: build the jar here, as in SCRUM-7) | prebuilt (Release
# workflow: the tested jar is passed as BuildKit named context `backend-jar` containing app.jar — build once, AC-25).
ARG JAR_SOURCE=source

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
# SCRUM-8-AC-04: product/build version (ADR 0013); local builds without it say 0.0.0-SNAPSHOT (the pom placeholder).
ARG VERSION=0.0.0-SNAPSHOT
# Tests run in the CI build job, not here (AC-01). git-commit-id is skipped (no .git in the context, NFR-06);
# the -D user properties fill X-Git-Commit / X-Git-Branch / X-Jira-Issue and build-info git-commit / jira.
RUN ./mvnw -B -ntp -Dmaven.test.skip=true -Djacoco.skip=true -Dmaven.gitcommitid.skip=true \
        "-Drevision=${VERSION}" \
        "-Djira.issue=${JIRA_KEY}" "-Dgit.commit.id.full=${GIT_COMMIT}" "-Dgit.branch=${GIT_BRANCH}" \
        package \
 && cp "target/todo-backend-${VERSION}.jar" /workspace/app.jar

# ---- jar selection (SCRUM-8-AC-25): BuildKit only builds the stages reachable from the target ----
FROM scratch AS jar-source
COPY --from=build /workspace/app.jar /app.jar

FROM scratch AS jar-prebuilt
# docker buildx build --build-context backend-jar=<dir with app.jar> --build-arg JAR_SOURCE=prebuilt .
# DL3022: backend-jar is a BuildKit named context (--build-context), not a stage.
# hadolint ignore=DL3022
COPY --from=backend-jar app.jar /app.jar

# DL3006: the base is one of the two local stages above, selected by a build argument.
# hadolint ignore=DL3006
FROM jar-${JAR_SOURCE} AS jar

# ---- runtime stage: JRE only (NFR-02, NFR-03) ----
# SCRUM-11 / ADR 0016: Alpine minor pinned in the tag (same image as 21.0.13_9-jre-alpine on 2026-11-20).
FROM eclipse-temurin:21.0.13_9-jre-alpine-3.24
# SCRUM-11 / ADR 0016 §2: OS-package floors until the base image ships them (Alpine 3.24 fixes of 2026-11-06/18;
# no rebuilt base yet). The build fails if the repository does not provide them (NFR-02). Remove each floor in the
# base-image bump that already contains it. gnupg (+ gnutls and 27 more) is only needed by the base image's own JDK
# signature check, never at runtime: removed (SCRUM-11-AC-04).
# SCRUM-12 (Release dry-run run 44994305133, scan): + libfontenc floor for HIGH CVE-2026-109908 (fixed 1.1.10-r0).
RUN apk add --no-cache 'libcrypto3>=3.5.9-r1' 'libssl3>=3.5.9-r1' 'openssl>=3.5.9-r1' 'zlib>=1.4-r0' \
      'libfontenc>=1.1.10-r0' \
 && apk del --no-cache gnupg \
 && ! apk info -e gnutls \
 && apk list --installed libcrypto3 libssl3 openssl zlib libfontenc
RUN addgroup -S -g 10001 todo \
 && adduser -S -D -H -u 10001 -G todo -s /sbin/nologin todo
WORKDIR /app
COPY --from=jar /app.jar /app/app.jar
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
# SCRUM-8-AC-14: base.name is a literal — keep it in sync with the runtime FROM (ADR 0010 table).
ARG JIRA_KEY=UNKNOWN
ARG GIT_COMMIT=UNKNOWN
ARG GIT_BRANCH=UNKNOWN
ARG VERSION=0.0.0-SNAPSHOT
ARG BUILD_DATE=UNKNOWN
ARG SOURCE_URL=https://github.com/vinods21/todo
LABEL org.opencontainers.image.title="todo-backend" \
      org.opencontainers.image.description="To-Do application REST API (Spring Boot 4.1.2, Java 21)" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="NOASSERTION" \
      org.opencontainers.image.base.name="docker.io/library/eclipse-temurin:21.0.13_9-jre-alpine-3.24" \
      com.vinods21.todo.jira="${JIRA_KEY}" \
      com.vinods21.todo.branch="${GIT_BRANCH}"
