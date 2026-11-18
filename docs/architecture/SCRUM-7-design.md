# SCRUM-7 — Testing and Deployment: Solution Design

| Field | Value |
|---|---|
| Jira key | [SCRUM-7](https://suranagivinod.atlassian.net/browse/SCRUM-7) (epic SCRUM-5) |
| Requirements | [`docs/requirements/SCRUM-7.md`](../requirements/SCRUM-7.md) — `SCRUM-7-AC-01..25`, `SCRUM-7-NFR-01..13`, assumptions `A-01..A-09`, questions `Q-01..Q-05` |
| Builds on | [SCRUM-2 design](SCRUM-2-design.md) (API, errors, config), [SCRUM-1 design](SCRUM-1-design.md) (frontend, build identity), [SCRUM-6 design](SCRUM-6-design.md) (status API, CI identity) |
| Branch | `feature/SCRUM-7-testing-and-deployment` |
| Author role | Architect (PM → Architect → Dev pipeline) |
| ADRs | **new** [0010](../adr/0010-container-images-and-build-identity.md) container images + build identity (Q-03, Q-04), **new** [0011](../adr/0011-spa-hosting-nginx-reverse-proxy.md) nginx SPA hosting + reverse proxy (A-01, A-02, A-09, Q-05; resolves SCRUM-1 Q-02; amends 0006), **new** [0012](../adr/0012-end-to-end-testing-playwright.md) Playwright e2e (amends 0007); unchanged: 0001–0005, 0008, 0009 |
| Traceability matrix | [`docs/traceability/SCRUM-7.md`](../traceability/SCRUM-7.md) (template; Dev fills it) |
| Status | Ready for Dev |

All IDs refer to `docs/requirements/SCRUM-7.md`. Assumptions A-01, A-02, A-03, A-05..A-09 are **accepted**;
A-04 is accepted with a refinement (Compose **profile** `app`, §6.1). Q-01 (publish), Q-02 (scan) stay out of
scope; Q-03 → ADR 0010; Q-04 → tags only, no digests (ADR 0010); Q-05 → `/actuator/info` **not** proxied (ADR 0011).

### 0. Workspace constraints (read first)

| Capability | Authoring/Dev workspace | GitHub Actions `ubuntu-latest` |
|---|---|---|
| Backend build/tests (Maven Central) | **No** | Yes |
| Docker / Compose / Buildx | **No** | Yes (Engine + Compose v2 + Buildx) |
| npm registry | Yes — `frontend/` and `e2e/` deps install; frontend tests run | Yes |
| Docker Hub tag lookup | No (blocked); tags checked against public listings 2026-11-18 | Validated by the first image build |
| Playwright browser download (`cdn.playwright.dev`) | **No** (proxy refuses; `npx playwright install --dry-run chromium` lists the URL but the CDN is blocked; the preinstalled `/opt/pw-browsers/chromium-1243` belongs to Playwright 1.63.0, not 1.65.1) | Yes (cached) |

Consequence: Dev can implement and locally verify **only** the frontend changes (AC-16, AC-17: `npm run lint`,
`typecheck`, `test:coverage`, `build`) and the e2e project's **static** correctness (`npm ci`, `tsc --noEmit`,
`npx playwright test --list` in both modes — verified in an Architect spike with the config in §8.2). Dockerfiles,
nginx, Compose, backend tests, the e2e run and the CI job are first executed in CI (§12 lists what only CI can
prove).

---

## 1. Change overview

```
                         docker compose --profile app up --build -d --wait          (AC-07)
 ┌──────────── host ────────────────────────────────────────────────────────────────────────────────┐
 │ browser ─► :3000 ─► frontend (nginx-unprivileged, UID 101, :8080)                                 │
 │                      ├ /, /tasks/new, /tasks/:id/edit … → index.html (SPA fallback, no-cache)     │
 │                      ├ /assets/*  → files, immutable 1y; missing → 404                            │
 │                      ├ /healthz   → 200 (container healthcheck)                                   │
 │                      ├ /api/**, = /actuator/health → proxy → ${BACKEND_URL} (default backend:8080)│
 │                      └ /actuator/* (other) → 404                                                  │
 │ curl / Vite dev :5173 ─► :8080 ─► backend (JRE 21 alpine, UID 10001, java = PID 1)                │
 │                                    └ JDBC → postgres:5432                                         │
 │ psql / ./mvnw spring-boot:run ─► :5432 ─► postgres (postgres:16-alpine, volume todo-pgdata)       │
 └───────────────────────────────────────────────────────────────────────────────────────────────────┘
 CI job e2e: hadolint → buildx (gha cache) both images → compose up --wait → verify labels/non-root/size
             → Playwright (compose: http + ui) → Playwright (dev: Vite 5173 → backend 8080, CORS)
             → lifecycle/persistence script → logs → down -v → artifact todo-e2e-<KEY>-<sha>-reports
```

No API, UI-behaviour or env-variable change (NFR-11). Product-code changes: **one** frontend function
(`buildUrl`, AC-17). `pom.xml`, `application.yml`, `vite.config.ts`: **unchanged**.

## 2. Files Dev creates / changes

| File | New/Change | Section | IDs |
|---|---|---|---|
| `Dockerfile` (repo root, backend) | new | §3.1 | AC-01..03, NFR-01..07, NFR-12 |
| `.dockerignore` (repo root) | new | §3.3 | NFR-06 |
| `frontend/Dockerfile` | new | §3.2 | AC-04, NFR-01..07 |
| `frontend/.dockerignore` | new | §3.3 | NFR-06 |
| `frontend/nginx/default.conf.template` | new | §4.1 | AC-05, AC-06, NFR-07, NFR-12 |
| `frontend/nginx/security-headers.conf`, `frontend/nginx/proxy.conf` | new | §4.1, §4.2 | AC-06, NFR-12 |
| `docker-compose.yml` | change (extend) | §6.1 | AC-07..12 |
| `.env.example` (repo root) | new | §6.2 | AC-08 |
| `.hadolint.yaml` | new | §3.4 | NFR-12 |
| `frontend/src/api/client.ts` | change `buildUrl` | §5.1 | AC-17 |
| `frontend/src/api/config.ts` | doc comment only | §5.1 | AC-17 |
| `frontend/src/api/config.test.ts`, `client.test.ts` | add `describe('SCRUM-7 …')` | §5.2 | AC-17 |
| `frontend/src/components/{Pager,StatusFilter,TaskTable,ErrorPanel,Loading,TaskNotFound,Layout}.test.tsx`, `frontend/src/pages/NotFoundPage.test.tsx` | new | §7.2 | AC-16 |
| `src/test/java/com/vinods21/todo/support/PostgresTestcontainersConfiguration.java` | new | §7.1 | AC-13..15 |
| `src/test/java/com/vinods21/todo/support/RealHttp.java` | new | §7.1 | AC-13..15 |
| `src/test/java/com/vinods21/todo/ErrorContractIntegrationTest.java` | new | §7.1 | AC-13 |
| `src/test/java/com/vinods21/todo/CorsIntegrationTest.java` | new | §7.1 | AC-14 |
| `src/test/java/com/vinods21/todo/ActuatorExposureIntegrationTest.java` | new | §7.1 | AC-15 |
| `e2e/` (`package.json`, `package-lock.json`, `tsconfig.json`, `playwright.config.ts`, `.gitignore`, `tests/**`, `scripts/summarize.mjs`) | new | §8 | AC-18, AC-19, AC-21, NFR-09 |
| `.github/workflows/ci.yml` | add job `e2e` (others untouched) | §9.1 | AC-20, AC-22, NFR-08 |
| `.github/scripts/verify-images.sh`, `.github/scripts/verify-lifecycle.sh` | new (mode 100755, LF) | §9.2, §9.3 | AC-03, AC-10, AC-22, NFR-01..03, NFR-05, NFR-06 |
| `README.md` | change | §10 | AC-24, AC-25 |
| `docs/traceability/SCRUM-1.md`, `docs/traceability/SCRUM-6.md` | change (pending manual checks → evidence) | §11 | AC-23 |
| `docs/traceability/SCRUM-7.md` | fill | — | NFR-13 |

---

## 3. Images (ADR 0010)

### 3.1 Backend `Dockerfile` (repo root; context = repo root)

```dockerfile
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
# NFR-07: busybox wget ships with the base image; non-2xx (DOWN = 503) → unhealthy.
HEALTHCHECK --interval=10s --timeout=3s --start-period=90s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${SERVER_PORT:-8080}/actuator/health" || exit 1
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
```

Notes for Dev:
- **Q-03 mechanism** (why it is reliable): `-D` user properties win over POM/plugin-set properties in both model
  interpolation and mojo-parameter evaluation, so the manifest entries (`X-Git-Commit: ${git.commit.id.full}`,
  `X-Git-Branch: ${git.branch}`, `X-Jira-Issue: ${jira.issue}`) and `build-info` `additionalProperties`
  (`git-commit`, `jira`) take the build-arg values. `maven.gitcommitid.skip` is the plugin's documented `skip`
  property. No `pom.xml` change. In images `/actuator/info` has `build.*` but no `git.*` section (no
  `git.properties`) — expected, documented in README.
- The only-script `mvnw` downloads Maven 3.9.11 with `curl`/`wget` (present in the Temurin **noble** image —
  that is why the build stage is noble, not alpine) into `/root/.m2/wrapper`, which lands in the dependency layer.
- `dependency:go-offline` does not resolve everything (some plugin deps are resolved lazily); the remainder is
  downloaded in the package step — acceptable. Do **not** add `-o` (offline).
- `cp target/todo-backend-*.jar` matches only the repackaged jar (`.jar.original` does not match; no test jar
  with `maven.test.skip`).
- The base image's `__cacert_entrypoint.sh` is replaced on purpose (no custom CA support needed).
- Java exit code on `SIGTERM` is **143**; `docker stop` → 143 (or 0) within 10 s, never 137 (§9.3).

### 3.2 Frontend `frontend/Dockerfile` (context = `frontend/`)

```dockerfile
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
# NFR-07: checks nginx itself, not the backend.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

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
```

Notes: `JIRA_KEY` is already in the RUN environment as a build arg of the same name; `vite.config.ts`'s
`git rev-parse` fallback fails silently (no git) — irrelevant because `GITHUB_SHA` is set. `npm run build` =
`tsc -b && vite build` needs devDependencies (installed by `npm ci`). Source maps (`build.sourcemap: true`) are
served — the repo is public; acceptable. If a `public/` folder is ever added, add it to the `COPY` list **and**
the `.dockerignore` allow-list.

### 3.3 `.dockerignore` files (allow-lists, NFR-06)

```gitignore
# /.dockerignore — SCRUM-7-NFR-06: backend build context = only what the Maven build needs
*
!pom.xml
!mvnw
!.mvn/
!src/
```

```gitignore
# /frontend/.dockerignore — SCRUM-7-NFR-06: no node_modules, dist, reports, .env*, editor files
*
!package.json
!package-lock.json
!index.html
!tsconfig.json
!tsconfig.app.json
!tsconfig.node.json
!vite.config.ts
!src/
!nginx/
```

### 3.4 `.hadolint.yaml` (NFR-12)

```yaml
# SCRUM-7-NFR-12 (ADR 0010): CI fails on warnings. Every ignored rule must carry a reason here.
failure-threshold: warning
ignored: []
```

Expected clean (no `apk`/`apt` installs, exec-form `ENTRYPOINT`, numeric non-root `USER`, pinned `FROM`s). If
hadolint flags something unforeseen, fix the Dockerfile; only ignore with a written reason.

---

## 4. nginx (ADR 0011)

### 4.1 `frontend/nginx/default.conf.template`

```nginx
# SCRUM-7: SPA hosting + reverse proxy — ADR 0011, design §4 (AC-05, AC-06, NFR-07, NFR-12).
# Rendered by the nginx entrypoint (envsubst, NGINX_ENVSUBST_FILTER) into /etc/nginx/conf.d/default.conf.
# ${BACKEND_URL}: scheme://host:port of the API, no path (default http://backend:8080).
# ${NGINX_LOCAL_RESOLVERS}: filled from /etc/resolv.conf by 15-local-resolvers.envsh (Docker DNS).

server_tokens off;

server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    absolute_redirect off;          # never leak the internal port 8080 in redirects

    resolver ${NGINX_LOCAL_RESOLVERS} valid=10s ipv6=off;
    set $backend "${BACKEND_URL}";  # variable → re-resolved, nginx starts even if the backend is not up yet

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/css application/javascript application/json image/svg+xml text/plain;

    include /etc/nginx/snippets/security-headers.conf;

    # NFR-07: container healthcheck — nginx itself, independent of the backend.
    location = /healthz {
        access_log off;
        default_type text/plain;
        return 200 "ok\n";
    }

    # AC-06: API → backend. No URI in proxy_pass: the original path + query string are forwarded unchanged.
    location ^~ /api/ {
        proxy_pass $backend;
        include /etc/nginx/snippets/proxy.conf;
    }

    # AC-06: health only (Q-05: /actuator/info is checked on the backend port, not proxied).
    location = /actuator/health {
        proxy_pass $backend;
        include /etc/nginx/snippets/proxy.conf;
    }
    location ^~ /actuator/ {
        return 404;
    }

    # AC-05: fingerprinted assets — long-lived; missing → 404 (never index.html).
    location ^~ /assets/ {
        try_files $uri =404;
        include /etc/nginx/snippets/security-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    # AC-05: any other path ending in a file extension (/build-info.json, /favicon.ico, /nope.png): file or 404.
    location ~ \.[^/]+$ {
        try_files $uri =404;
        include /etc/nginx/snippets/security-headers.conf;
        add_header Cache-Control "no-cache" always;
    }

    # AC-05: the SPA entry point is always revalidated.
    location = /index.html {
        include /etc/nginx/snippets/security-headers.conf;
        add_header Cache-Control "no-cache" always;
    }

    # AC-05: history-API fallback for client-side routes (/tasks/new, /tasks/42/edit, /?status=DONE&page=2).
    location / {
        try_files $uri /index.html;
    }
}
```

`frontend/nginx/proxy.conf` is a third small snippet (copied with `security-headers.conf`, §3.2):

```nginx
# SCRUM-7-AC-06 / ADR 0011: transparent proxying; error bodies pass through (proxy_intercept_errors off).
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header Host $http_host;                       # keeps host:port → correct Location (A-09)
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $http_host;
proxy_connect_timeout 5s;
proxy_read_timeout 30s;
proxy_intercept_errors off;
```

Precedence (why it works): `=` exact matches first (`/healthz`, `/actuator/health`, `/index.html`); then the
longest `^~` prefix (`/api/`, `/actuator/`, `/assets/`) stops regex evaluation — so `/api/tasks/1.json` is still
proxied; then the extension regex; else `location /`. A deep link like `/tasks/42/edit` has no extension → `/`
→ `try_files` falls back to `/index.html` → internal redirect to `= /index.html` (no-cache + headers).
`$uri/` is deliberately **not** in `try_files` (directories such as `/assets` would 403). The SCRUM-1 route
param check (non-numeric ids) stays a client concern.

**Location headers / A-09:** confirmed no backend change. `Host $http_host` makes Tomcat report
`localhost:3000`, so `ServletUriComponentsBuilder.fromCurrentRequest()` yields
`http://localhost:3000/api/tasks/{id}` via the proxy; AC-19 asserts this. `server.forward-headers-strategy` stays
**unset** (would trust spoofable `X-Forwarded-*` on the directly published port 8080 for no gain).

Backend down: the resolver can no longer resolve `backend` (container stopped) or the connection is refused →
nginx **502** → the UI's existing generic/network error (AC-06).

### 4.2 `frontend/nginx/security-headers.conf`

```nginx
# SCRUM-7-NFR-12 / ADR 0011. Included at server level AND in every location that sets its own add_header
# (nginx does not inherit add_header into such locations).
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" always;
```

CSP fits the current build (`dist/index.html` has only `<script type="module" src="/assets/…">` and a stylesheet
link; React's `style` props use CSSOM, which CSP does not block). A CSP violation shows as a browser console
error, which fails every e2e UI test (§8.3), so a regression cannot slip through.

---

## 5. Same-origin API base (AC-17, ADR 0011)

### 5.1 Code change

`config.ts` already maps `'/'` (and `'//'`, `' / '`) to `''` (trailing slashes stripped after trim), and
blank/unset to the default. What breaks today is `new URL('' + '/api/tasks')` in `client.ts` (no base → `TypeError:
Invalid URL`, verified in the Architect spike). Change **only** `buildUrl`:

```ts
// client.ts — SCRUM-1-AC-13, SCRUM-7-AC-17
/**
 * Absolute API_BASE_URL → used as is (the second URL argument is ignored for absolute inputs).
 * '' (VITE_API_BASE_URL='/', same-origin — ADR 0011) → resolved against the page origin: <origin>/api/….
 * `baseUrl` is a parameter only so tests can exercise both modes without re-importing the module.
 */
export function buildUrl(path: string, query?: Query, baseUrl: string = API_BASE_URL): URL {
  const url = new URL(baseUrl + path, window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }
  return url
}
```

`config.ts`: no logic change; update the doc comment: "`/` (only slashes) = same-origin → `''`; blank/unset →
`DEFAULT_API_BASE_URL`". **Blank stays the default** (existing SCRUM-1-AC-13 test pins it; changing it would be
an NFR-11 regression). Also document `VITE_API_BASE_URL=/` in `frontend/.env.example` as a comment line.

### 5.2 Tests (append `describe('SCRUM-7 same-origin API base')` to the existing files)

| File | `it` (prefix `SCRUM-7-AC-17:`) |
|---|---|
| `src/api/config.test.ts` | `'/'`, `'//'`, `' / '` resolve to `''` (same-origin); blank/undefined still `http://localhost:8080`; absolute + trailing-slash cases unchanged (assert next to the new ones, existing SCRUM-1 tests untouched) |
| `src/api/client.test.ts` | `buildUrl('/api/tasks', { page: 0, size: 20, status: 'DONE' }, '')` → `` `${window.location.origin}/api/tasks?page=0&size=20&status=DONE` `` (jsdom origin is `http://localhost:3000`); `buildUrl('/api/tasks', undefined, 'https://api.example.test')` → `https://api.example.test/api/tasks` (page origin ignored); default call still `http://localhost:8080/…`; **end-to-end through `request`**: `vi.stubEnv('VITE_API_BASE_URL', '/')`, `vi.resetModules()`, `const { request } = await import('./client')`, MSW handler on `` `${window.location.origin}/api/tasks` `` → the request lands there; `afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })` (pattern verified in the spike: `API_BASE_URL === ''`, request URL `http://localhost:3000/api/tasks?page=0`) |

---

## 6. Compose (AC-07..AC-12)

### 6.1 `docker-compose.yml`

Decision on A-04: **one file; `backend` and `frontend` carry `profiles: [app]`.**

| Command | Starts | Why |
|---|---|---|
| `docker compose up -d` (unchanged) or `docker compose up -d postgres` | PostgreSQL only | AC-11: the existing README command keeps meaning "dev database"; no image build, and no backend container grabbing port 8080 from `./mvnw spring-boot:run` |
| `docker compose --profile app up --build -d --wait` | all three | AC-07 single command; `--wait` returns when healthy (AC-09) |
| `docker compose --profile app down` (`-v` to wipe data) | stops all | always pass the profile when the app services may be running (older Compose versions ignore profiled services on `down` without it) |

Rejected: services without profiles (plain `up -d` would build both images and occupy 8080 — breaks the
documented dev workflow); a second `docker-compose.dev.yml` (A-04: one file).

```yaml
# SCRUM-2-NFR-03 + SCRUM-7 (AC-07..AC-12, design §6). Credentials are LOCAL-DEVELOPMENT DEFAULTS, not secrets.
#   PostgreSQL only (local dev):  docker compose up -d
#   Whole stack:                  docker compose --profile app up --build -d --wait   → http://localhost:3000
# Override any ${TODO_*} via environment or a git-ignored .env (see .env.example).
services:
  postgres:
    image: postgres:16-alpine            # same tag as the Testcontainers integration tests (ADR 0010)
    container_name: todo-postgres        # kept (existing name; README/dev habits)
    environment:
      POSTGRES_DB: ${TODO_DB_NAME:-todo}
      POSTGRES_USER: ${TODO_DB_USER:-todo}
      POSTGRES_PASSWORD: ${TODO_DB_PASSWORD:-todo}
    ports:
      - "${TODO_DB_PORT:-5432}:5432"
    volumes:
      - todo-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \"$${POSTGRES_USER}\" -d \"$${POSTGRES_DB}\""]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s
      start_interval: 1s

  backend:
    profiles: [app]
    build:
      context: .
      dockerfile: Dockerfile
      args:
        JIRA_KEY: ${JIRA_KEY:-UNKNOWN}
        GIT_COMMIT: ${GIT_COMMIT:-UNKNOWN}
        GIT_BRANCH: ${GIT_BRANCH:-UNKNOWN}
        VERSION: ${TODO_BACKEND_VERSION:-UNKNOWN}
        BUILD_DATE: ${BUILD_DATE:-UNKNOWN}
    image: todo-backend:${TODO_IMAGE_TAG:-local}
    environment:
      DB_URL: jdbc:postgresql://postgres:5432/${TODO_DB_NAME:-todo}
      DB_USERNAME: ${TODO_DB_USER:-todo}
      DB_PASSWORD: ${TODO_DB_PASSWORD:-todo}
      SERVER_PORT: "8080"
      APP_CORS_ALLOWED_ORIGINS: ${TODO_CORS_ALLOWED_ORIGINS:-http://localhost:5173}   # AC-12: dev mode
    ports:
      - "${TODO_BACKEND_PORT:-8080}:8080"   # AC-12: curl/debug and Vite dev mode
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/actuator/health"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 90s
      start_interval: 2s
    read_only: true                      # NFR-12
    tmpfs:
      - /tmp                             # Tomcat work dirs, JVM perf data
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true

  frontend:
    profiles: [app]
    build:
      context: ./frontend
      args:
        JIRA_KEY: ${JIRA_KEY:-UNKNOWN}
        GIT_COMMIT: ${GIT_COMMIT:-UNKNOWN}
        GIT_BRANCH: ${GIT_BRANCH:-UNKNOWN}
        VERSION: ${TODO_FRONTEND_VERSION:-UNKNOWN}
        BUILD_DATE: ${BUILD_DATE:-UNKNOWN}
    image: todo-frontend:${TODO_IMAGE_TAG:-local}
    environment:
      BACKEND_URL: http://backend:8080
    ports:
      - "${TODO_FRONTEND_PORT:-3000}:8080"
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 10s
      start_interval: 1s
    read_only: true
    tmpfs:
      - /tmp                             # pid file, client body temp (nginx-unprivileged)
      - /var/cache/nginx
      - /etc/nginx/conf.d                # entrypoint renders default.conf here at start
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true

volumes:
  todo-pgdata:
```

Notes: no top-level `name:` — the project name stays the directory name, so existing developers keep their
existing `todo_todo-pgdata` volume (NFR-11). Compose healthchecks restate the image `HEALTHCHECK`s with
`start_interval` (needs Docker Engine ≥ 25) for fast readiness. `$$` escapes Compose interpolation so the
container shell expands `POSTGRES_USER`. If `read_only`/`tmpfs` makes a container fail in CI, drop `read_only`
for that service and record it (NFR-12 says "where practical") — do not add `chmod`/root workarounds.

### 6.2 `.env.example` (repo root; `.env` is already git-ignored)

```dotenv
# SCRUM-7-AC-08: copy to .env to override. Values are LOCAL-DEVELOPMENT defaults, not secrets.
TODO_DB_NAME=todo
TODO_DB_USER=todo
TODO_DB_PASSWORD=todo
TODO_DB_PORT=5432
TODO_BACKEND_PORT=8080
TODO_FRONTEND_PORT=3000
# Origins allowed to call the backend cross-origin (Vite dev server); comma-separated.
TODO_CORS_ALLOWED_ORIGINS=http://localhost:5173
# Image tag for todo-backend / todo-frontend (CI uses <JIRA_KEY>-<sha>).
TODO_IMAGE_TAG=local
# Build identity baked into images (ADR 0008/0010); UNKNOWN when unset.
# e.g. JIRA_KEY=SCRUM-7  GIT_COMMIT=$(git rev-parse HEAD)  GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
JIRA_KEY=UNKNOWN
GIT_COMMIT=UNKNOWN
GIT_BRANCH=UNKNOWN
# Optional: COMPOSE_PROFILES=app makes plain `docker compose up -d` start the whole stack.
```

---

## 7. New unit/integration/component tests

### 7.1 Backend (AC-13..AC-15) — Testcontainers + real HTTP

Conventions: class `@Tag("SCRUM-7")`, class `@DisplayName("SCRUM-7 …")`, method `@DisplayName("SCRUM-7-AC-xx: …")`
(ADR 0004). `./mvnw test -Dgroups=SCRUM-7` selects them.

**Shared container, one Spring context** (new pattern for new tests only — existing classes keep theirs):

```java
// src/test/java/com/vinods21/todo/support/PostgresTestcontainersConfiguration.java
/** SCRUM-7: one PostgreSQL 16 container for all SCRUM-7 integration tests (shared via Spring's context cache). */
@TestConfiguration(proxyBeanMethods = false)          // org.springframework.boot.test.context.TestConfiguration
public class PostgresTestcontainersConfiguration {
    @Bean
    @ServiceConnection                                 // org.springframework.boot.testcontainers.service.connection
    PostgreSQLContainer postgres() {                   // org.testcontainers.postgresql.PostgreSQLContainer (TC 2.x)
        return new PostgreSQLContainer("postgres:16-alpine");
    }
}
```

Each test class: `@SpringBootTest(webEnvironment = RANDOM_PORT)` + `@Import(PostgresTestcontainersConfiguration.class)`
(no `@Testcontainers`/`@Container` — Boot manages the bean's lifecycle), identical configuration in all three so
the context (and container) is reused.

```java
// src/test/java/com/vinods21/todo/support/RealHttp.java
/** Real HTTP client for RANDOM_PORT tests; never throws on 4xx/5xx. JDK HttpClient: sends Origin and
 *  Access-Control-Request-* headers (HttpURLConnection would silently drop them — never use SimpleClientHttpRequestFactory). */
public final class RealHttp {
    private final RestClient client;
    public RealHttp(int port) {
        this.client = RestClient.builder().baseUrl("http://localhost:" + port)
                .requestFactory(new JdkClientHttpRequestFactory()).build();   // org.springframework.http.client
    }
    public ResponseEntity<String> exchange(HttpMethod method, String uri, @Nullable String contentType,
                                           @Nullable String body, Map<String, String> headers) { … retrieve().onStatus(s -> true, (q, r) -> {}).toEntity(String.class) }
    /** ADR 0003 shape: exactly timestamp,status,error,message,path,fieldErrors; no leak markers. */
    public static void assertApiError(ResponseEntity<String> r, int status, String message, String path) { … }
}
```

`assertApiError` asserts: status code; `Content-Type` is `application/json` (not `application/problem+json`,
not `text/html`); JSON keys are **exactly** `{timestamp,status,error,message,path,fieldErrors}`; `status` equals
the code, `error` = reason phrase, `message` as given, `path` = request path, `fieldErrors` is an array; the raw
body contains none of `Exception`, `trace`, `org.springframework`, `java.`, `at com.` (SCRUM-2-AC-14).

| Class | Cases (each a `@Test`/`@ParameterizedTest` whose display name starts with the ID) |
|---|---|
| `ErrorContractIntegrationTest` — `SCRUM-7 error contract over real HTTP` | **AC-13** (all with `assertApiError`): `POST /api/tasks {"title":"  "}` → 400 `Validation failed`, `fieldErrors[0] = {title, must not be blank}` · malformed JSON `{"title":` → 400 `Malformed JSON request` · `POST {"title":"x","status":"NOPE"}` → 400 `Invalid value for field 'status'` (POST path; PATCH already covered by SCRUM-6) · `GET /api/tasks/abc` → 400 `Invalid value for parameter 'id'` · `GET /api/tasks/999999` → 404 `Task with id 999999 not found` · **`GET /api/nope`** → 404 `No endpoint GET /api/nope` · **`GET /nope`** (outside `/api`) → 404 same shape · **`PATCH /api/tasks/{existingId}`** → 405 `Request method 'PATCH' is not supported` + `Allow` header present · **`DELETE /api/tasks`** → 405 · **`POST /api/tasks` `text/plain`** → 415 `Content type 'text/plain…' is not supported` (assert `startsWith`, charset may be appended) · `GET /api/tasks?page=-1` → 400 `Validation failed` + `fieldErrors[0].field == "page"` · `GET /api/tasks?size=0` → 400. Not repeated (SCRUM-6 real-HTTP coverage): PATCH status 400/404/415, `?status=` 400 |
| `CorsIntegrationTest` — `SCRUM-7 CORS against the running application` | **AC-14**: `@ParameterizedTest` over paths `/api/tasks`, `/api/tasks/{id}`, `/api/tasks/{id}/status` × methods `GET, POST, PUT, PATCH, DELETE`: `OPTIONS` with `Origin: http://localhost:5173`, `Access-Control-Request-Method: <m>`, `Access-Control-Request-Headers: content-type` → 200, `Access-Control-Allow-Origin: http://localhost:5173`, `Access-Control-Allow-Methods` contains `<m>`, `Access-Control-Max-Age: 3600` · actual `GET /api/tasks` with that `Origin` → 200 + `Access-Control-Allow-Origin` + `Vary` contains `Origin` · actual `POST /api/tasks` with that `Origin` → 201 + `Access-Control-Expose-Headers` contains `Location` · preflight from `http://evil.test` → **403** (pin; body `Invalid CORS request` is Spring's `DefaultCorsProcessor` text — assert status and absent `Access-Control-Allow-Origin` only) · actual `GET` from `http://evil.test` → 403, no `Access-Control-Allow-Origin` · request **without** `Origin` → 200 (CORS not involved; same-origin/proxy case) |
| `ActuatorExposureIntegrationTest` — `SCRUM-7 actuator exposure over real HTTP` | **AC-15**: `/actuator/health` → 200 `{"status":"UP"}` and **no** `components`/`details` (show-details never) · `/actuator/info` → 200 with `build.jira` (matches `SCRUM-\d+\|main\|NONE\|UNKNOWN`) · `GET /actuator` → 200, `_links` keys ⊆ `{self, health, health-path, info}` · `@ParameterizedTest` over `env, beans, configprops, mappings, metrics, loggers, heapdump, threaddump, conditions, scheduledtasks, shutdown` (GET) and `POST /actuator/shutdown` → 404 (assert `ApiError` shape too: unexposed endpoints are unmapped → `NoResourceFoundException` → handler) |

CORS note (pin observed behaviour): Spring answers preflights from the **global** `/api/**` CORS config, so a
preflight for a method that has no handler on that exact path (e.g. `PUT` on `/api/tasks`) is expected to be
accepted too (browsers only preflight real calls). If CI shows Spring rejecting such unmapped combinations,
narrow the parameter set to the mapped combinations (`/api/tasks`: GET, POST; `/api/tasks/{id}`: GET, PUT,
DELETE; `…/status`: PATCH), and record the observed status in the matrix — it is **not** a product defect.

**Defect protocol (AC-13):** if any real-HTTP case differs from the `@WebMvcTest` expectation (e.g. Boot's
`/error` JSON or HTML instead of `ApiError`), fix it in `GlobalExceptionHandler`/config in a separate
`SCRUM-7: [DEV] fix …` commit, call it out in the PR as a SCRUM-2-AC-13 defect, and keep the test. Known
out-of-scope: requests rejected by Tomcat before Spring (e.g. malformed `%` escapes → Tomcat 400 HTML) — list in
the matrix as a documented limitation, not asserted.

JaCoCo: no main-code change expected → gate unaffected (NFR-10).

### 7.2 Frontend component tests (AC-16)

One new file per component; `describe('SCRUM-7 <Component>')`; each `it` starts with `SCRUM-7-AC-16:`; queries
by role/label; render standalone (components needing `Link`/`Outlet` inside a minimal `createMemoryRouter` +
`RouterProvider`; MSW is active but no test may send a request — the existing `afterEach` guard enforces it).
They assert the **component's own contract**, not page flows.

| New file | Cases |
|---|---|
| `components/Pager.test.tsx` | renders nothing for `totalPages` 0 and 1 · `navigation` named `Pagination`, text `Page 2 of 3` · first page: Previous disabled, Next enabled; Next → `onPageChange(1)` · last page: Next disabled; Previous → `onPageChange(page - 1)` · middle page both enabled · disabled buttons do not call back |
| `components/StatusFilter.test.tsx` | combobox named exactly `Status`; options `All`, `To do`, `In progress`, `Done` (values `''`, `TODO`, `IN_PROGRESS`, `DONE`) · `value` undefined → `All` selected; `DONE` → `Done` selected · selecting `In progress` → `onChange('IN_PROGRESS')`; selecting `All` → `onChange(undefined)` · controlled: re-render with new `value` updates the selection |
| `components/TaskTable.test.tsx` | table named `Tasks`; column headers Title/Status/Due date/Actions in order · one row per task in the given order · due date shown verbatim (`2026-12-01`, no timezone shift); `null` → `No due date` · status cell is a combobox `Status for <title>` with the task's value · `Edit <title>` link → `/tasks/<id>/edit`; clicking it navigates there with `location.state.returnTo === returnTo` (router state) · empty `tasks` → header row only · no request sent on render |
| `components/ErrorPanel.test.tsx` | `role="alert"` contains the message · no Retry button without `onRetry` · Retry button calls `onRetry` once · children rendered inside the alert |
| `components/Loading.test.tsx` | `role="status"` with the label text (accessible announcement) |
| `components/TaskNotFound.test.tsx` | heading level 1 `Task not found`; explanatory text; link `Back to tasks` → `/` (navigates) |
| `components/Layout.test.tsx` | `banner` contains link `Todo` → `/` and link `New task` → `/tasks/new` · `main` renders the child route (Outlet) · `contentinfo` shows `` `${__JIRA_KEY__} · ${__GIT_SHA__.slice(0, 7)}` `` |
| `pages/NotFoundPage.test.tsx` | heading `Page not found`; link `Back to tasks` → `/` |

Coverage gates (80/80/80/75) can only go up. Record each file + what it adds in the matrix.

---

## 8. End-to-end tests (ADR 0012)

### 8.1 Layout

```
e2e/
├── .gitignore                 node_modules/, reports/
├── package.json               private, "type": "module", engines node >=22.22.2 <23
├── package-lock.json
├── tsconfig.json              strict, noEmit, types ["node"]; include playwright.config.ts, tests/**/*.ts
├── playwright.config.ts       §8.2
├── scripts/summarize.mjs      §9.4 (run summary: counts, flaky tests, AC IDs)
└── tests/
    ├── support/env.ts         mode, baseURL, apiURL, backendURL, expected identity (shared by config + fixtures)
    ├── support/fixtures.ts    test.extend: api (TasksApi), browserErrors (auto); uniqueTitle()
    ├── empty-state.spec.ts    project empty-state (AC-18.1, AC-18.5 empty states)
    ├── stack.http.spec.ts     project http (AC-19, AC-04..06, NFR-12) — request API only, no browser
    └── ui/tasks.spec.ts       project ui; @dev-smoke subset → project dev-smoke (AC-18, AC-21)
```

`package.json` (exact pins, verified with `npm view` on 2026-11-18; `@playwright/test` 1.65.1 depends on
`playwright` 1.65.1 → Chromium 159.0.8154.6, revision 1255):

```json
{
  "name": "todo-e2e",
  "version": "0.1.0",
  "private": true,
  "description": "End-to-end tests for the To-Do application (SCRUM-7, ADR 0012)",
  "type": "module",
  "engines": { "node": ">=22.22.2 <23" },
  "scripts": {
    "test": "playwright test",
    "test:dev": "E2E_MODE=dev playwright test",
    "list": "playwright test --list",
    "typecheck": "tsc --noEmit",
    "report": "playwright show-report reports/compose/html"
  },
  "devDependencies": {
    "@playwright/test": "1.65.1",
    "@types/node": "22.20.5",
    "typescript": "6.0.3"
  }
}
```

Install with `npm install --save-exact`. (`test:dev` uses POSIX env syntax — documented; Windows users use
`set E2E_MODE=dev` / WSL.)

### 8.2 `playwright.config.ts` (typechecked and `--list`ed in both modes in the Architect spike)

```ts
// SCRUM-7-AC-18..AC-21, SCRUM-7-NFR-09 — ADR 0012. E2E_MODE=compose (default) | dev.
import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'
import { env } from './tests/support/env'

const CI = !!process.env.CI
const reportDir = `reports/${env.mode}`
const chromium = { ...devices['Desktop Chrome'], locale: 'en-US', timezoneId: 'UTC' }

const composeProjects: PlaywrightTestConfig['projects'] = [
  // Runs first (every other project depends on it): needs an empty database (A-08).
  { name: 'empty-state', testMatch: /empty-state\.spec\.ts$/, use: chromium },
  { name: 'http', testMatch: /\.http\.spec\.ts$/, dependencies: ['empty-state'] },
  { name: 'ui', testMatch: /ui\/.*\.spec\.ts$/, dependencies: ['empty-state'], use: chromium },
]
// AC-21: SCRUM-1-AC-14 automated — Vite dev server on 5173 → backend on 8080, cross-origin (CORS default).
const devProjects: PlaywrightTestConfig['projects'] = [
  { name: 'dev-smoke', testMatch: /ui\/.*\.spec\.ts$/, grep: /@dev-smoke/, use: chromium },
]

export default defineConfig({
  testDir: './tests',
  outputDir: `${reportDir}/test-results`,
  fullyParallel: false,
  workers: 1,                       // "newest first" assertions on a shared list (ADR 0012)
  retries: CI ? 1 : 0,              // NFR-09: at most one; flaky tests listed in the run summary
  forbidOnly: CI,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: `${reportDir}/html`, open: 'never' }],
    ['junit', { outputFile: `${reportDir}/junit.xml` }],
    ['json', { outputFile: `${reportDir}/results.json` }],
  ],
  use: {
    baseURL: env.baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  metadata: { ...env },
  projects: env.mode === 'dev' ? devProjects : composeProjects,
  webServer:
    env.mode === 'dev'
      ? {
          command: 'npm --prefix ../frontend run dev',   // VITE_API_BASE_URL unset → http://localhost:8080
          url: 'http://localhost:5173',
          reuseExistingServer: !CI,
          timeout: 120_000,
          stdout: 'pipe',
        }
      : undefined,
})
```

`tests/support/env.ts`:

```ts
// ADR 0012: one place for the e2e environment (config + fixtures).
const mode = process.env.E2E_MODE === 'dev' ? 'dev' : 'compose'
const backendURL = process.env.E2E_BACKEND_URL ?? 'http://localhost:8080'
const baseURL = process.env.E2E_BASE_URL ?? (mode === 'dev' ? 'http://localhost:5173' : 'http://localhost:3000')
export const env = {
  mode,
  baseURL,
  backendURL,
  /** API set-up: through the nginx proxy (compose) or straight to the backend (dev — no proxy on 5173). */
  apiURL: process.env.E2E_API_URL ?? (mode === 'dev' ? backendURL : baseURL),
  /** CI sets these to the identity of the build under test; locally they are read from /build-info.json. */
  expectedJiraKey: process.env.E2E_JIRA_KEY,
  expectedSha: process.env.E2E_GIT_SHA,
  expectEmptyDb: process.env.E2E_EXPECT_EMPTY_DB === '1',
} as const
```

### 8.3 `tests/support/fixtures.ts` (shape verified in the spike)

- `uniqueTitle(label)` → `` `e2e ${label} ${runId}-${n}` `` (`runId` = 8 chars of `crypto.randomUUID()` per run).
- `api: TasksApi` (Playwright `request` fixture against `env.apiURL`): `create(body) → Task` (asserts 201),
  `setStatus(id, status)` (asserts 200), `get(id)`, `remove(id)`, `total()` (`GET /api/tasks?size=1` →
  `totalElements`).
- `browserErrors` (`auto: true`): collects `pageerror` and `console` `error` messages, ignoring only
  `/Failed to load resource: the server responded with a status of 4\d\d/` (Chrome's line for deliberately
  provoked 4xx); after the test `expect(errors).toEqual([])` — catches CSP violations and uncaught errors.
- Locators by role/label only (ADR 0007 contract). No `waitForTimeout` anywhere (review rule).

### 8.4 Test catalogue

Titles start with the IDs; `{ tag: '@dev-smoke' }` marks the AC-21 subset.

**`empty-state.spec.ts`** (project `empty-state`; `api.total() > 0` → `test.skip` with reason, or **fail** when
`E2E_EXPECT_EMPTY_DB=1`):

| Test | Steps / assertions |
|---|---|
| `SCRUM-7-AC-18: on an empty database the list shows its empty states and fills once a task is created` | `/` → text `No tasks yet.` + link `Create your first task` (AC-18.1) · select filter `Done` → URL `?status=DONE`, text `No tasks with status Done.` · link `Show all tasks` → URL `/`, `No tasks yet.` again (AC-18.5 empty parts) · `Create your first task` → form → `Create task` → list has exactly one row with the title (AC-18.1 populated) |

**`stack.http.spec.ts`** (project `http`, `request` fixture with `baseURL` = frontend; compose mode only):

| Test | Assertions |
|---|---|
| `SCRUM-7-AC-19, SCRUM-7-AC-04, SCRUM-7-AC-05: / serves index.html with the build identity and no-cache` | 200, `content-type` `text/html`, body contains `<meta name="build-info" content="<KEY> <SHA>">` (expected from env, else consistent with `/build-info.json`), `cache-control: no-cache` |
| `SCRUM-7-AC-05, SCRUM-7-AC-19: client-side routes loaded directly return index.html` | `/tasks/new`, `/tasks/42/edit`, `/?status=DONE&page=2` → 200 html with `<div id="root">` and `no-cache` |
| `SCRUM-7-AC-05: fingerprinted assets have correct types and a long-lived immutable cache policy` | parse `/assets/*.js` and `*.css` from `/`; 200; `javascript` / `text/css`; `cache-control` contains `max-age=31536000` and `immutable` |
| `SCRUM-7-AC-05, SCRUM-7-AC-19: a missing asset returns 404, not index.html` | `/assets/nope.js` → 404, body has no `id="root"`; `/nope.png` → 404 |
| `SCRUM-7-AC-04: /build-info.json carries the identity of the build` | 200 JSON `{jira, commit, branch, builtAt}`; `jira`/`commit` = expected (CI) |
| `SCRUM-7-AC-06, SCRUM-7-AC-19: /actuator/health is proxied and UP; other actuator paths are not exposed via the frontend` | `/actuator/health` → 200 `{"status":"UP"}`; `/actuator/info`, `/actuator/env` via frontend → 404 (Q-05) |
| `SCRUM-7-AC-02, SCRUM-7-AC-19: backend /actuator/info reports the build identity` | `${E2E_BACKEND_URL}/actuator/info` → `build.jira` = expected key, `build.git-commit` = expected SHA (CI); locally: equal to `/build-info.json` values (images built together) |
| `SCRUM-7-AC-06, SCRUM-7-AC-19: API round-trip through the proxy` | `POST /api/tasks` → 201; `Location` = `${origin of baseURL}/api/tasks/<id>` (proves `Host $http_host`, A-09) · `PATCH …/status {"status":"DONE"}` → 200 `status DONE` · `GET /api/tasks?status=DONE&size=100` contains `<id>` · `DELETE` → 204 · `GET /api/tasks/<id>` → 404 `ApiError` (keys exactly ADR 0003, `message` `Task with id <id> not found`) |
| `SCRUM-7-AC-06: backend error bodies pass through the proxy unchanged` | 400 (`POST {"title":" "}` → `fieldErrors[0].field == "title"`), 404 (`/api/nope`), 405 (`PATCH /api/tasks/1`), 415 (`text/plain`) — `content-type` JSON, ADR 0003 keys; not nginx HTML |
| `SCRUM-7-NFR-12: responses carry security headers and hide the nginx version` | on `/`, `/assets/…`, `/api/tasks`: `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy`, `content-security-policy` present; `server` header is `nginx` without a version |

**`ui/tasks.spec.ts`** (project `ui`; tagged ones also in `dev-smoke`):

| Test | Steps / assertions |
|---|---|
| `SCRUM-7-AC-18, SCRUM-7-AC-21: the task list loads with the tasks from the backend` `@dev-smoke` | `api.create(title)`; `/` → table `Tasks` visible; first data row contains the title (AC-18.1 populated) |
| `SCRUM-7-AC-18, SCRUM-7-AC-21: a task created via the form appears first in the list` `@dev-smoke` | link `New task` → fill `Title`, `Description`, `Due date` → `Create task` (await the `POST …/api/tasks` response = 201) → URL `/` → row 1 contains title and due date |
| `SCRUM-7-AC-18: editing title, description and due date is shown in the list; the edit deep link survives a reload` | `api.create`; `/` → `Edit <title>` → URL `/tasks/<id>/edit` → `page.reload()` → form shows the stored values (nginx fallback) → change all three → `Save changes` → list row shows new title and due date; `api.get(id)` has the new description |
| `SCRUM-7-AC-18, SCRUM-7-AC-21: a status changed from the list row is shown and persists after a reload` `@dev-smoke` | `api.create`; `/` → combobox `Status for <title>` → `selectOption('DONE')` while awaiting the `PATCH …/status` response (200) → `role=status` says `Status of "<title>" changed to Done.` → `page.reload()` → combobox has value `DONE`. In dev mode this is the real cross-origin `PATCH` preflight (closes the SCRUM-6 manual "PATCH preflight" check) |
| `SCRUM-7-AC-18: filtering by status shows only matching tasks, keeps ?status= in the URL and survives a refresh` | `api.create` A (TODO) and B → `api.setStatus(B, IN_PROGRESS)`; `/` → filter `Status` = `In progress` → URL contains `status=IN_PROGRESS`; B visible, A not; **every** row's status combobox has value `IN_PROGRESS` (robust on a non-empty DB) → `page.reload()` → filter still `In progress`, same result |
| `SCRUM-7-AC-18, SCRUM-7-AC-06: a backend validation error is shown in the form` | `page.route('**/api/tasks', r => r.request().method() === 'POST' ? r.continue({ postData: JSON.stringify({ ...JSON.parse(r.request().postData()!), title: '   ' }) }) : r.continue())`; form with a valid title → `Create task` → response 400 → `Title` field gets accessible description `must not be blank` (backend Bean Validation message, `locale: en-US`), URL stays `/tasks/new`; no client message `Title is required.` (proves the body came from the backend through the proxy). Only the request is rewritten; the response is real (ADR 0012) |
| `SCRUM-7-AC-18: the footer shows the build identity of the build under test` | `/` → `contentinfo` text `` `${key} · ${sha.slice(0, 7)}` `` with key/sha from env (CI) or `/build-info.json` (local) |

### 8.5 Local commands (README, AC-25)

```bash
docker compose --profile app up --build -d --wait     # stack on :3000 / :8080
cd e2e && npm ci && npx playwright install --with-deps chromium
npm test                                               # compose mode → reports/compose/
npm run test:dev                                       # dev mode: starts Vite on 5173 (or reuses yours) → reports/dev/
npx playwright show-report reports/compose/html
```

---

## 9. CI (AC-20, AC-22, NFR-08)

### 9.1 New job in `.github/workflows/ci.yml`

Jobs `identity`, `build`, `frontend` and their artifacts are **unchanged**. Update the header comment to mention
`e2e`. Append:

```yaml
  # SCRUM-7-AC-20 (ADR 0010-0012): images + Compose stack + e2e. Parallel to build/frontend.
  e2e:
    needs: identity
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      JIRA_KEY: ${{ needs.identity.outputs.jira_key }}
      GIT_COMMIT: ${{ github.sha }}
      GIT_BRANCH: ${{ github.head_ref || github.ref_name }} # untrusted (fork PRs): env / action inputs only, always quoted
      TODO_IMAGE_TAG: ${{ needs.identity.outputs.jira_key }}-${{ github.sha }}
      COMPOSE_PROFILES: app
      COMPOSE_PROJECT_NAME: todo-e2e
    steps:
      - uses: actions/checkout@v4

      - name: Lint Dockerfiles (hadolint, SCRUM-7-NFR-12)
        run: docker run --rm -v "$PWD:/w:ro" -w /w hadolint/hadolint:v2.15.1 hadolint --config .hadolint.yaml Dockerfile frontend/Dockerfile

      - uses: actions/setup-node@v4
        with:
          node-version-file: frontend/.nvmrc
          cache: npm
          cache-dependency-path: |
            e2e/package-lock.json
            frontend/package-lock.json

      - name: Image metadata
        id: meta
        run: |
          echo "build_date=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_OUTPUT"
          echo "backend_version=$(python3 -c 'import xml.etree.ElementTree as E; print(E.parse("pom.xml").getroot().findtext("{http://maven.apache.org/POM/4.0.0}version"))')" >> "$GITHUB_OUTPUT"
          echo "frontend_version=$(node -p 'require("./frontend/package.json").version')" >> "$GITHUB_OUTPUT"

      - uses: docker/setup-buildx-action@v3

      - name: Build backend image (SCRUM-7-AC-01)
        uses: docker/build-push-action@v6
        with:
          context: .
          file: Dockerfile
          load: true
          push: false
          provenance: false
          sbom: false
          tags: todo-backend:${{ env.TODO_IMAGE_TAG }}
          build-args: |
            JIRA_KEY=${{ env.JIRA_KEY }}
            GIT_COMMIT=${{ github.sha }}
            GIT_BRANCH=${{ env.GIT_BRANCH }}
            VERSION=${{ steps.meta.outputs.backend_version }}
            BUILD_DATE=${{ steps.meta.outputs.build_date }}
          cache-from: type=gha,scope=todo-backend
          cache-to: type=gha,scope=todo-backend,mode=max

      - name: Build frontend image (SCRUM-7-AC-04)
        uses: docker/build-push-action@v6
        with:
          context: frontend
          file: frontend/Dockerfile
          load: true
          push: false
          provenance: false
          sbom: false
          tags: todo-frontend:${{ env.TODO_IMAGE_TAG }}
          build-args: |
            JIRA_KEY=${{ env.JIRA_KEY }}
            GIT_COMMIT=${{ github.sha }}
            GIT_BRANCH=${{ env.GIT_BRANCH }}
            VERSION=${{ steps.meta.outputs.frontend_version }}
            BUILD_DATE=${{ steps.meta.outputs.build_date }}
          cache-from: type=gha,scope=todo-frontend
          cache-to: type=gha,scope=todo-frontend,mode=max

      - name: Start stack and wait for health (SCRUM-7-AC-07, AC-09)
        id: stack
        run: docker compose up -d --no-build --wait --wait-timeout 240

      - name: Verify images and containers (SCRUM-7-AC-22, NFR-01, NFR-02, NFR-03, NFR-05, NFR-06)
        run: .github/scripts/verify-images.sh "todo-backend:${TODO_IMAGE_TAG}" "todo-frontend:${TODO_IMAGE_TAG}"

      - name: Install e2e dependencies
        working-directory: e2e
        run: npm ci

      - name: Playwright version
        id: pw
        working-directory: e2e
        run: echo "version=$(node -p 'require("./node_modules/@playwright/test/package.json").version')" >> "$GITHUB_OUTPUT"

      - name: Cache Playwright browsers
        id: pw-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.pw.outputs.version }}

      - name: Install Chromium
        working-directory: e2e
        run: |
          if [ "${{ steps.pw-cache.outputs.cache-hit }}" = "true" ]; then
            npx playwright install-deps chromium
          else
            npx playwright install --with-deps --only-shell chromium
          fi

      - name: E2E against Compose (SCRUM-7-AC-18, AC-19)
        working-directory: e2e
        env:
          E2E_EXPECT_EMPTY_DB: "1"
          E2E_JIRA_KEY: ${{ env.JIRA_KEY }}
          E2E_GIT_SHA: ${{ github.sha }}
        run: npx playwright test

      - name: Install frontend dependencies (dev mode)
        if: ${{ !cancelled() && steps.stack.outcome == 'success' }}
        working-directory: frontend
        run: npm ci

      - name: E2E dev mode — Vite 5173 → backend 8080 cross-origin (SCRUM-7-AC-21, closes SCRUM-1-AC-14)
        if: ${{ !cancelled() && steps.stack.outcome == 'success' }}
        working-directory: e2e
        env:
          E2E_MODE: dev
        run: npx playwright test

      - name: Lifecycle and persistence (SCRUM-7-AC-03, AC-10)
        if: ${{ !cancelled() && steps.stack.outcome == 'success' }}
        run: .github/scripts/verify-lifecycle.sh

      - name: E2E summary (SCRUM-7-NFR-09)
        if: always()
        run: node e2e/scripts/summarize.mjs >> "$GITHUB_STEP_SUMMARY"

      - name: Collect Compose logs and tear down
        if: always()
        run: |
          mkdir -p e2e/reports
          docker compose ps -a > e2e/reports/compose-ps.txt 2>&1 || true
          docker compose logs --no-color --timestamps > e2e/reports/compose-logs.txt 2>&1 || true
          docker compose down -v --remove-orphans

      - name: Upload e2e reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: todo-e2e-${{ env.JIRA_KEY }}-${{ github.sha }}-reports
          path: e2e/reports/
          if-no-files-found: warn
```

Design points: images are built by Buildx (gha cache, `mode=max` so the build-stage dependency layers are
cached), `load`ed into the runner's Docker, and Compose uses them by tag with `--no-build` (the same
`docker-compose.yml` developers use; CI only sets `TODO_IMAGE_TAG`/`COMPOSE_PROFILES` — A-04). Later steps run
after a test failure (`!cancelled()` + stack started) so one run reports everything; any failed step still fails
the job (AC-20). `provenance`/`sbom` are off because attestations cannot be `load`ed into the classic image
store. Fork PRs: `GIT_BRANCH` only reaches `build-args` (action input, not a shell) and env.

### 9.2 `.github/scripts/verify-images.sh` (AC-22) — `#!/usr/bin/env bash`, `set -euo pipefail`

Inputs: `$1` backend image, `$2` frontend image; env `GIT_COMMIT`, `JIRA_KEY`, `GITHUB_STEP_SUMMARY`. Collect all
failures, print `::error::` per failure, exit 1 at the end if any. Writes a Markdown table to the summary.

1. **Labels (NFR-05):** for each image, `docker image inspect -f '{{ index .Config.Labels "<label>" }}'`:
   `org.opencontainers.image.revision == $GIT_COMMIT`, `com.vinods21.todo.jira == $JIRA_KEY`;
   `title`, `description`, `version`, `source`, `created`, `licenses` non-empty and `version`/`created` ≠ `UNKNOWN`.
2. **Non-root (NFR-01):** image `.Config.User` is non-empty, numeric UID part ≠ `0` (`10001:10001`, `101:101`);
   running containers: `docker compose exec -T backend id -u` and `… frontend id -u` ≠ `0` (busybox `id`).
3. **Runtime contents (NFR-02):** `docker run --rm --entrypoint sh <backend> -c '! command -v javac && ! command -v mvn && [ ! -e /workspace ] && [ -f /app/app.jar ]'`;
   `docker run --rm --entrypoint sh <frontend> -c '! command -v node && ! command -v npm && [ -f /usr/share/nginx/html/index.html ]'`.
4. **No secrets in history (NFR-06):** `docker history --no-trunc` of both images must not match
   `DB_PASSWORD|POSTGRES_PASSWORD|NPM_TOKEN|_authToken|\.env`.
5. **Sizes (NFR-03):** `docker image inspect -f '{{.Size}}'` → MB; targets backend ≤ 300, frontend ≤ 80;
   over target → `::warning::` (not a failure) and flagged in the table.
6. Summary table: image, tag, revision, jira, user, runtime UID, size MB, target, result.

### 9.3 `.github/scripts/verify-lifecycle.sh` (AC-03, AC-10)

Uses `curl` (runner) and `docker compose` (inherits `COMPOSE_*` env). `FE=http://localhost:${TODO_FRONTEND_PORT:-3000}`.

1. Create marker task via `POST $FE/api/tasks` → `id` (201).
2. `before=$(docker compose exec -T postgres psql -U todo -d todo -tAc 'select count(*) from flyway_schema_history')`.
3. **AC-03:** `cid=$(docker compose ps -q backend)`; time `docker compose stop backend` (default 10 s grace);
   `docker inspect -f '{{.State.ExitCode}}' "$cid"` must be `143` or `0` (never `137` = SIGKILL) and elapsed
   < 10 s; `OOMKilled` false. Record exit code + seconds in the summary.
4. `docker compose up -d --no-build --wait backend` → `GET $FE/api/tasks/$id` = 200 (data kept; nginx re-resolves
   the backend) and the Flyway count equals `before` (no re-application) — AC-10 backend restart.
5. Save `docker compose logs` to `e2e/reports/compose-logs-before-down.txt`; `docker compose down` (volume kept)
   → `docker compose up -d --no-build --wait` → marker `GET` = 200 (AC-10 down/up).
6. `docker compose down -v` → `up -d --no-build --wait` → marker `GET` = 404 (AC-10 `down -v` removes data).
   Leaves a fresh stack for the teardown step.

Budget ~2 min. If NFR-08 (≤ 12 min) is exceeded on warm caches, drop step 6 first and note it in the matrix.

### 9.4 `e2e/scripts/summarize.mjs`

Node script (no deps): for each `e2e/reports/{compose,dev}/results.json` present, print `### E2E (<mode>,
${JIRA_KEY})` with `stats.expected/unexpected/flaky/skipped` and duration; list **flaky** test titles (status
`flaky` = passed on retry, NFR-09) and skipped ones with their reason; print the sorted unique
`SCRUM-\d+-AC-\d+` IDs found in `junit.xml`. Missing files → one line "no report (step did not run)". Exit 0
always (informational).

### 9.5 NFR-08 time budget (estimate; confirm in the PR)

| Step | Cold | Warm |
|---|---|---|
| hadolint + setup | 0.3 | 0.3 |
| backend image (deps + package) | 3.5 | 1.0 |
| frontend image | 1.0 | 0.3 |
| compose up --wait | 0.7 | 0.7 |
| verify images | 0.3 | 0.3 |
| npm ci + Chromium | 1.2 | 0.6 |
| e2e compose + dev (incl. frontend npm ci) | 1.8 | 1.8 |
| lifecycle | 2.0 | 2.0 |
| logs/teardown/upload | 0.3 | 0.3 |
| **total (min)** | **≈ 11** | **≈ 7.3** |

Parallel with `build` (~4–5 min) and `frontend` (~1.5 min); existing jobs are untouched (NFR-08 "≤ ~1 min
slower" holds trivially).

---

## 10. README (AC-24, AC-25) — outline for Dev

1. **Run with Docker Compose** (new, before "Run locally"): prerequisites (Docker Engine ≥ 25.0, Compose ≥ 2.24
   — `start_interval`, `--wait`); `docker compose --profile app up --build -d --wait`; URLs (app
   `http://localhost:3000`, API `http://localhost:8080/api/tasks`, health `…:3000/actuator/health`, info
   `…:8080/actuator/info`); stop `docker compose --profile app down`, reset `… down -v`; env table (§6.2) with
   defaults; rebuild after code changes (`… up --build -d --wait`, or `docker compose build backend`); logs
   (`docker compose logs -f backend`); build identity for local images (`JIRA_KEY=SCRUM-7 GIT_COMMIT=$(git rev-parse HEAD) GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) docker compose --profile app build`);
   labels (`docker image inspect -f '{{json .Config.Labels}}' todo-backend:local`); note that images have no
   `/actuator/info` `git` section (build.* carries the commit); troubleshooting: port in use (set
   `TODO_*_PORT`), stack not healthy (`docker compose ps`, `logs`, `--wait-timeout`), stale volume after a schema
   change (`down -v`), backend container occupying 8080 while running `./mvnw spring-boot:run`.
2. **Run locally**: unchanged commands (`docker compose up -d` still starts only PostgreSQL); add one sentence
   that the app services are behind the `app` profile; `docker compose down` → keep.
3. **Tests** (new "Test layers"): pyramid — backend unit/slice/integration (`./mvnw verify`, Docker for
   Testcontainers; reports `target/surefire-reports`, `target/site/jacoco`), frontend unit/component (`npm test`,
   `npm run test:coverage`; `frontend/reports/`), e2e compose and dev mode (§8.5; `e2e/reports/<mode>/`); CI
   artifacts `todo-backend-…-reports`, `todo-frontend-…-reports`, `todo-e2e-<KEY>-<sha>-reports`; selecting a
   story: `-Dgroups=SCRUM-7`, `vitest -t 'SCRUM-7-'`, `playwright test -g 'SCRUM-7-AC-18'`.
4. Frontend section: `VITE_API_BASE_URL=/` = same-origin (used by the image).

## 11. Closing pending manual checks (AC-23)

| Matrix | Row | New evidence |
|---|---|---|
| `docs/traceability/SCRUM-1.md` | SCRUM-1-AC-14 ("Manual smoke check: PENDING") and its "Open items" row | **Automated** — `e2e/tests/ui/tasks.spec.ts` `@dev-smoke` tests in project `dev-smoke` (CI step "E2E dev mode", job `e2e`, run `<id>`, artifact `todo-e2e-SCRUM-7-<sha>-reports/dev/`); CORS also by `CorsIntegrationTest` (AC-14). Mark done, keep the history text, add the date |
| `docs/traceability/SCRUM-6.md` | "Manual checks" (status change from list, filter, edit round-trip, PATCH preflight) | status change → `ui/tasks.spec.ts` status test (compose + dev); filter → filter test; edit round-trip → edit test; PATCH preflight → dev-mode status test (real browser preflight) + `CorsIntegrationTest` `…/status` × `PATCH`. Mark done with run id |

Anything that still cannot be automated (expected: none) is listed with a reason. Historical rows are amended,
not rewritten.

## 12. Risks — and what only CI can verify

| # | Risk / unverifiable here | Likelihood | Detection / mitigation |
|---|---|---|---|
| R1 | **Base-image tags** `eclipse-temurin:21.0.13_9-jdk-noble` / `21.0.13_9-jre-alpine`, `node:22.23.4-alpine`, `nginxinc/nginx-unprivileged:1.30.6-alpine3.24`, `hadolint/hadolint:v2.15.1` were checked against public listings (Temurin 21.0.13_9 and nginx-unprivileged 1.30.6/1.31.7 published Oct–Nov 2026; Node 22.23.4 released 2026-10-22; hadolint v2.15.1 released 2026-07-31) but not pulled | Low–Med | First CI build fails fast with "not found". Fallbacks: Temurin `21.0.13_9-jre` (noble) runtime — then the healthcheck must use `curl -fsS` (noble ships curl) and the size target needs re-checking; `node:22.23.4-alpine3.22`/`22.23.5-alpine`; `nginxinc/nginx-unprivileged:1.30.6-alpine`; hadolint `2.15.1` (tag without `v`) |
| R2 | **Q-03 Maven flags** (`-Dmaven.gitcommitid.skip`, `-Dgit.commit.id.full`, `-Dgit.branch`) — backend can't be built here | Low | AC-19 info test (`build.git-commit` = sha) and the label check fail visibly. Fallback: keep `skip` but drop it if a plugin version ignores the property (then `failOnNoGitDirectory=false` + the same `-D`s) |
| R3 | `dependency:go-offline` with Boot 4 parent misses artefacts | Med (harmless) | Remaining downloads happen in the package step; only cache efficiency suffers |
| R4 | Temurin noble build image lacks `curl`/`wget` for `mvnw` | Low | Build fails at the wrapper; fallback: `distributionType=bin` is unchanged — install `curl` via apt in the build stage only (`--no-install-recommends`, hadolint DL3008 ignore with reason) |
| R5 | nginx `15-local-resolvers.envsh` / `NGINX_LOCAL_RESOLVERS` or `NGINX_ENVSUBST_FILTER` behave differently in 1.30.6-unprivileged | Low–Med | nginx fails to start → `--wait` fails, logs show the line. Fallback: static `upstream backend_upstream { server backend:8080; }` + `proxy_pass http://backend_upstream;` (resolved at start; frontend `depends_on` backend healthy already guarantees resolvability) and `BACKEND_URL` → `BACKEND_HOST`/`BACKEND_PORT` template vars |
| R6 | `read_only` + `tmpfs` breaks a container (nginx temp paths, Tomcat) | Low–Med | `--wait` fails; drop `read_only` for that service and document (NFR-12 "where practical") |
| R7 | CSP blocks something in the built SPA | Low | Every UI e2e test fails via `browserErrors`; adjust the policy minimally, never add `unsafe-inline` for scripts |
| R8 | Real-HTTP error contract differs from slice tests (AC-13) — e.g. 404 for unknown routes rendered by Boot `/error` | Low–Med | That is the purpose of AC-13: fix in `GlobalExceptionHandler`/config, call out in PR |
| R9 | CORS preflight behaviour for unmapped method/path combinations (AC-14 matrix) | Med | Pin observed behaviour; narrow the matrix (§7.1) — not a defect |
| R10 | JDK `HttpClient` refuses a header used in AC-14 (`Origin`, `Access-Control-Request-*`) | Low | `Origin` is not on its restricted list; if CI says otherwise, add `jdk.httpclient.allowRestrictedHeaders=origin` to the surefire `systemPropertyVariables` (read when the JDK client class initialises) |
| R11 | Playwright 1.65.1 Chromium / `--only-shell` / `install-deps` on `ubuntu-latest` | Low | CI only (CDN blocked here). Fallback: drop `--only-shell` |
| R12 | GitHub Actions cache backend for Buildx `type=gha` (cache service v2) | Low | `setup-buildx-action@v3` installs a current Buildx; on cache errors the build still succeeds (cache miss), only slower |
| R13 | `docker image inspect .Size` semantics with the containerd image store (sizes may be reported differently) | Med | Sizes are a warning, not a gate; summary states the source; compare with `docker image ls` if suspicious |
| R14 | NFR-08 ≤ 12 min on a cold cache | Med | §9.5 estimate ≈ 11 min cold; first drop lifecycle step 6, then consider building both images in parallel with `docker buildx bake` |
| R15 | Compose `down` without `--profile app` leaves app containers on older Compose | Low | README always shows `--profile app down`; CI sets `COMPOSE_PROFILES` |
| R16 | Empty-state test skipped locally on a used database | Certain (by design) | Skip reason printed; CI enforces with `E2E_EXPECT_EMPTY_DB=1` on a fresh volume |
| R17 | Spring graceful shutdown exceeds 10 s under in-flight load | Low (idle in CI) | Lifecycle step 3 measures; if needed set `SPRING_LIFECYCLE_TIMEOUT_PER_SHUTDOWN_PHASE=5s` in Compose (env only, no code) |

## 13. Requirement → design coverage

| ID | Design | Verification (see matrix) |
|---|---|---|
| AC-01 | §3.1, ADR 0010 | CI backend image build; label check (§9.2); AC-19 info |
| AC-02 | §3.1, §6.1 | `--wait`; `stack.http` info + round-trip |
| AC-03 | §3.1 (exec-form, HEALTHCHECK) | §9.3 step 3; `--wait` |
| AC-04 | §3.2 | CI frontend image build; `stack.http` `/` meta + `/build-info.json` |
| AC-05 | §4.1 | `stack.http` (routes, assets, 404, cache); UI edit deep-link reload |
| AC-06 | §4.1, ADR 0011 | `stack.http` proxy/round-trip/error pass-through; UI validation test |
| AC-07 | §6.1 | CI `docker compose up --wait`; README |
| AC-08 | §6.1, §6.2 | Compose review; CI overrides `TODO_IMAGE_TAG` |
| AC-09 | §6.1 healthchecks + `depends_on` | CI `--wait` |
| AC-10 | §6.1 volume | §9.3 steps 4–6 |
| AC-11 | §6.1 profile `app` | README; CI `build` job unaffected |
| AC-12 | §6.1 backend port + CORS default | dev-mode e2e (AC-21) |
| AC-13 | §7.1 | `ErrorContractIntegrationTest` |
| AC-14 | §7.1 | `CorsIntegrationTest` |
| AC-15 | §7.1 | `ActuatorExposureIntegrationTest` |
| AC-16 | §7.2 | 8 new component test files |
| AC-17 | §5 | `config.test.ts`, `client.test.ts` additions |
| AC-18 | §8.4 | `empty-state.spec.ts`, `ui/tasks.spec.ts` |
| AC-19 | §8.4 | `stack.http.spec.ts` |
| AC-20 | §9.1 | job `e2e`, artifact `todo-e2e-<KEY>-<sha>-reports` |
| AC-21 | §8.2 dev mode | project `dev-smoke` in CI |
| AC-22 | §9.2 | `verify-images.sh` + summary |
| AC-23 | §11 | updated SCRUM-1/-6 matrices |
| AC-24, AC-25 | §10 | README review |
| NFR-01 | §3 `USER`, nginx :8080 | §9.2 (2) |
| NFR-02 | §3 multi-stage | §9.2 (3) |
| NFR-03 | §3 bases, layer order | §9.2 (5) summary |
| NFR-04 | ADR 0010 table | Dockerfile review; R1 |
| NFR-05 | §3 labels; tags `<KEY>-<sha>` | §9.2 (1) |
| NFR-06 | §3.3 allow-lists; env-only config | §9.2 (4); review |
| NFR-07 | §3 wget healthchecks; `/healthz` | `--wait`; review |
| NFR-08 | §9.1, §9.5 | CI timings in PR |
| NFR-09 | §8.2–§8.4, ADR 0012 | summary flaky list; code review (no sleeps) |
| NFR-10 | tags/names; no main-code change backend | `build`/`frontend` gates |
| NFR-11 | §1, §5.1, §6.1 (profile, volume name) | all existing tests green |
| NFR-12 | §3.4 hadolint, §4 headers, §6.1 read_only/cap_drop, JVM flags | hadolint step; `stack.http` headers test |
| NFR-13 | this doc, ADRs 0010–0012, matrix | PR |

## 14. Suggested commit sequence (Dev)

1. `SCRUM-7: [DEV] support a same-origin API base URL` — `client.ts`, `config.ts` comment, `.env.example` comment, AC-17 tests.
2. `SCRUM-7: [DEV] add component tests for untested components` — §7.2 (AC-16).
3. `SCRUM-7: [DEV] add real-HTTP integration tests for errors, CORS and actuator` — §7.1 (AC-13..15) (+ separate `fix` commit if a defect appears).
4. `SCRUM-7: [DEV] add backend and frontend Dockerfiles and nginx config` — §3, §4, `.dockerignore`s, `.hadolint.yaml`.
5. `SCRUM-7: [DEV] compose the full stack with health-gated start-up` — §6.
6. `SCRUM-7: [DEV] add Playwright e2e suite` — §8.
7. `SCRUM-7: [CI] add e2e job with image build, verification and reports` — §9.
8. `SCRUM-7: [DEV] document containers and test layers; close pending manual checks; fill traceability matrix` — §10, §11.

Each with `Refs: SCRUM-7`. Definition of done: frontend `npm ci && npm run lint && npm run typecheck &&
npm run test:coverage && npm run build` green locally; `e2e`: `npm ci && npm run typecheck && npm run list` and
`E2E_MODE=dev npx playwright test --list` locally; all four CI jobs green with artifacts named `…-SCRUM-7-<sha>`;
matrix filled with the run id.
