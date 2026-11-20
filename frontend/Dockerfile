# SCRUM-7: frontend image — ADR 0010/0011, design §3.2 (AC-04..AC-06, NFR-01..NFR-07, NFR-12)
# Local: docker build -t todo-frontend:local frontend
# SCRUM-8 (ADR 0013, design §5.4): DIST_SOURCE=source (default: build dist/ here) | prebuilt (Release workflow: the
# tested bundle is passed as BuildKit named context `frontend-dist` = extracted todo-frontend-<v>.tar.gz, AC-25).
ARG DIST_SOURCE=source

# ---- build stage: Node 22 (= frontend/.nvmrc), lock file (NFR-04) ----
FROM node:22.23.4-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY src/ src/
# A-02 / AC-17: same-origin API base — nothing environment-specific is inlined.
ENV VITE_API_BASE_URL=/
ARG JIRA_KEY=UNKNOWN
ARG GIT_COMMIT=UNKNOWN
ARG GIT_BRANCH=UNKNOWN
# SCRUM-8-AC-04: product/build version (ADR 0013); local builds without it say 0.0.0-SNAPSHOT.
ARG VERSION=0.0.0-SNAPSHOT
# ADR 0008 mechanism: vite.config.ts reads JIRA_KEY, GITHUB_SHA, GITHUB_REF_NAME, APP_VERSION (no git in this image).
RUN GITHUB_SHA="${GIT_COMMIT}" GITHUB_REF_NAME="${GIT_BRANCH}" APP_VERSION="${VERSION}" npm run build

# ---- bundle selection (SCRUM-8-AC-25): BuildKit only builds the stages reachable from the target ----
FROM scratch AS dist-source
COPY --from=build /app/dist/ /dist/

FROM scratch AS dist-prebuilt
# docker buildx build --build-context frontend-dist=<extracted tarball> --build-arg DIST_SOURCE=prebuilt frontend
# DL3022: frontend-dist is a BuildKit named context (--build-context), not a stage.
# hadolint ignore=DL3022
COPY --from=frontend-dist / /dist/

# DL3006: the base is one of the two local stages above, selected by a build argument.
# hadolint ignore=DL3006
FROM dist-${DIST_SOURCE} AS dist

# ---- runtime stage: unprivileged nginx (UID 101, port 8080) ----
FROM nginx/nginx-unprivileged:1.30.7-alpine3.24
# SCRUM-11 / ADR 0016 §2: OS-package floors until the base image ships them; build fails if unavailable (NFR-02).
# Root only for apk; the image switches back to 101 below. No `openssl` here (would install the CLI).
USER root
RUN apk add --no-cache 'libcrypto3>=3.5.9-r1' 'libssl3>=3.5.9-r1' 'zlib>=1.4-r0' \
 && apk list --installed libcrypto3 libssl3 zlib
COPY nginx/security-headers.conf nginx/proxy.conf /etc/nginx/snippets/
# Rendered by the entrypoint to /etc/nginx/conf.d/default.conf (replaces the base image's default server).
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=dist /dist/ /usr/share/nginx/html/
ENV BACKEND_URL=http://backend:8080 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_FILTER="^(BACKEND_URL|NGINX_LOCAL_RESOLVERS)$"
USER 101:101
EXPOSE 8080
# NFR-07: checks nginx itself, not the backend. JSON form (hadolint DL3025); busybox wget exits 1 on failure.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]

ARG JIRA_KEY=UNKNOWN
ARG GIT_COMMIT=UNKNOWN
ARG GIT_BRANCH=UNKNOWN
ARG VERSION=0.0.0-SNAPSHOT
ARG BUILD_DATE=UNKNOWN
ARG SOURCE_URL=https://github.com/vinods21/todo
# SCRUM-8-AC-14: base.name is a literal — keep it in sync with the runtime FROM (ADR 0010 table).
LABEL org.opencontainers.image.title="todo-frontend" \
      org.opencontainers.image.description="To-Do application SPA (React 19, Vite 8) served by nginx" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="NOASSERTION" \
      org.opencontainers.image.base.name="docker.io/nginx/nginx-unprivileged:1.30.7-alpine3.24" \
      com.vinods21.todo.jira="${JIRA_KEY}" \
      com.vinods21.todo.branch="${GIT_BRANCH}"
