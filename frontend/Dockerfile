# SCRUM-7: frontend image — ADR 0010/0011, design §3.2 (AC-04..AC-06, NFR-01..NFR-07, NFR-12)
# Local: docker build -t todo-frontend:local frontend

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
# ADR 0008 mechanism: vite.config.ts reads JIRA_KEY, GITHUB_SHA, GITHUB_REF_NAME (no git in this image).
RUN GITHUB_SHA="${GIT_COMMIT}" GITHUB_REF_NAME="${GIT_BRANCH}" npm run build

# ---- runtime stage: unprivileged nginx (UID 101, port 8080) ----
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24
COPY nginx/security-headers.conf nginx/proxy.conf /etc/nginx/snippets/
# Rendered by the entrypoint to /etc/nginx/conf.d/default.conf (replaces the base image's default server).
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/ /usr/share/nginx/html/
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
ARG VERSION=UNKNOWN
ARG BUILD_DATE=UNKNOWN
ARG SOURCE_URL=https://github.com/vinods21/todo
LABEL org.opencontainers.image.title="todo-frontend" \
      org.opencontainers.image.description="To-Do application SPA (React 19, Vite 8) served by nginx" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="NOASSERTION" \
      com.vinods21.todo.jira="${JIRA_KEY}" \
      com.vinods21.todo.branch="${GIT_BRANCH}"
