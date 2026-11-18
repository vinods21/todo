# SCRUM-7 — Requirements Traceability Matrix

Jira: [SCRUM-7](https://suranagivinod.atlassian.net/browse/SCRUM-7) · Branch: `feature/SCRUM-7-testing-and-deployment` ·
Requirements: [`docs/requirements/SCRUM-7.md`](../requirements/SCRUM-7.md) · Design: [`docs/architecture/SCRUM-7-design.md`](../architecture/SCRUM-7-design.md) ·
ADRs: [0010](../adr/0010-container-images-and-build-identity.md), [0011](../adr/0011-spa-hosting-nginx-reverse-proxy.md), [0012](../adr/0012-end-to-end-testing-playwright.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md) (as amended by [0008](../adr/0008-ci-derived-build-identity.md)), [ADR 0007](../adr/0007-frontend-testing-msw.md) (as amended by 0012)

**Status: TEMPLATE — to be filled by Dev.** Replace every `<…>` placeholder; "TBD" cells must be empty of TBD
before review. The backend, images, Compose stack and e2e suite cannot run in the authoring workspace (design §0) —
their evidence is the `CI` run on the PR head.

How to read the columns:
- Backend "Test" = `Class#method` (paths relative to `src/test/java/com/vinods21/todo/`) with `@Tag("SCRUM-7")` and a
  `@DisplayName` starting with the ID.
- Frontend "Test" = `<file> › <it name>` (relative to `frontend/`) inside `describe('SCRUM-7 <area>')`.
- E2E "Test" = `<file> › <title>` (relative to `e2e/`) with project name (`[http]`, `[ui]`, `[empty-state]`,
  `[dev-smoke]`); titles start with the ID.
- "CI evidence" = workflow `CI` run on `<sha>`: job `build` → `todo-backend-SCRUM-7-<sha>-reports`; job `frontend` →
  `todo-frontend-SCRUM-7-<sha>-reports`; job `e2e` → `todo-e2e-SCRUM-7-<sha>-reports` (`compose/`, `dev/`,
  `compose-logs*.txt`) and its step summary (image table, lifecycle results, e2e stats).

CI run: `<run id + link>` (jobs `identity`, `build`, `frontend`, `e2e` green) · Commit SHA: `<sha>` ·
`e2e` job duration: `<mm:ss>` (NFR-08 target ≤ 12 min; cold/warm cache noted) · Image sizes: backend `<MB>` (≤ 300),
frontend `<MB>` (≤ 80) · Flaky tests (passed on retry): `<none | list>` · Coverage — backend lines (service + web*):
`<%>` · frontend: lines `<%>`, statements `<%>`, functions `<%>`, branches `<%>` (gate 80/80/80/75)

> Verify AC coverage: `grep -hoE 'SCRUM-7-AC-[0-9]+' TEST-*.xml | sort -uV` (expect AC-13..AC-15),
> `grep -oE 'SCRUM-7-AC-[0-9]+' frontend/reports/junit.xml | sort -uV` (expect AC-16, AC-17),
> `grep -hoE 'SCRUM-7-AC-[0-9]+' e2e/reports/*/junit.xml | sort -uV` (expect AC-02, AC-04..AC-06, AC-18, AC-19, AC-21).

| ID | Requirement (short) | Code / config (file / symbol) | Test(s) | CI evidence |
|---|---|---|---|---|
| SCRUM-7-AC-01 | Backend image builds from clean checkout; build identity via build args, `UNKNOWN` otherwise | `Dockerfile` (build stage, `-Dmaven.gitcommitid.skip`, `-Dgit.commit.id.full`, `-Dgit.branch`, `-Djira.issue`); `.dockerignore` | `e2e/tests/stack.http.spec.ts › SCRUM-7-AC-02, SCRUM-7-AC-19: backend /actuator/info reports the build identity` [http]; `verify-images.sh` labels | step "Build backend image", "Verify images…", run `<id>` |
| SCRUM-7-AC-02 | Backend container configurable by env; Flyway; health UP | `docker-compose.yml` `backend.environment`; `Dockerfile` `ENTRYPOINT` | Compose `--wait`; `stack.http.spec.ts › …round-trip…` | step "Start stack…", run `<id>` |
| SCRUM-7-AC-03 | Clean SIGTERM stop < 10 s (no SIGKILL); `HEALTHCHECK` on actuator health | `Dockerfile` exec-form `ENTRYPOINT`, `HEALTHCHECK` | `.github/scripts/verify-lifecycle.sh` step 3 (exit code `<143/0>`, `<s>` s) | step "Lifecycle and persistence", run `<id>` |
| SCRUM-7-AC-04 | Frontend image (`npm ci` + build, Node 22) with build identity | `frontend/Dockerfile`; `frontend/.dockerignore` | `stack.http.spec.ts › SCRUM-7-AC-19, SCRUM-7-AC-04, SCRUM-7-AC-05: / serves index.html…`, `› SCRUM-7-AC-04: /build-info.json…` [http] | step "Build frontend image", run `<id>` |
| SCRUM-7-AC-05 | SPA fallback, 404 for missing assets, cache policies | `frontend/nginx/default.conf.template` (`location /`, `^~ /assets/`, extension regex, `= /index.html`) | `stack.http.spec.ts › …client-side routes…`, `› …fingerprinted assets…`, `› …missing asset returns 404…` [http]; `ui/tasks.spec.ts › SCRUM-7-AC-18: editing … deep link survives a reload` [ui] | e2e `compose/junit.xml`, run `<id>` |
| SCRUM-7-AC-06 | Proxy `/api/**` + `/actuator/health`; errors pass through; 5xx when backend down | `default.conf.template` (`^~ /api/`, `= /actuator/health`, `^~ /actuator/`); `frontend/nginx/proxy.conf` | `stack.http.spec.ts › …/actuator/health is proxied…`, `› …API round-trip…`, `› …error bodies pass through…` [http]; `ui/tasks.spec.ts › SCRUM-7-AC-18, SCRUM-7-AC-06: a backend validation error…` [ui]; backend-down 502: `<test or documented manual note>` | run `<id>` |
| SCRUM-7-AC-07 | One command builds and starts the stack | `docker-compose.yml` (profile `app`); README "Run with Docker Compose" | CI `docker compose up -d --no-build --wait` (images built by Buildx from the same Dockerfiles) | run `<id>` |
| SCRUM-7-AC-08 | Env-configurable with local defaults; `.env.example` | `docker-compose.yml` `${TODO_*:-…}`; `.env.example` | CI overrides `TODO_IMAGE_TAG`, `COMPOSE_PROFILES` | Compose review in PR |
| SCRUM-7-AC-09 | Health-gated start-up; `up --wait` | `docker-compose.yml` `healthcheck` × 3, `depends_on: condition: service_healthy` | CI `--wait --wait-timeout 240` | run `<id>` |
| SCRUM-7-AC-10 | Data persists across `down`/`up`; `down -v` clears; backend restart keeps data, no re-migration | `docker-compose.yml` volume `todo-pgdata` | `verify-lifecycle.sh` steps 4–6 | step "Lifecycle and persistence", run `<id>` |
| SCRUM-7-AC-11 | Postgres-only dev workflow preserved | profile `app` on `backend`/`frontend`; README "Run locally" | `docker compose up -d` starts only `postgres` (`<checked how>`); CI `build` job unchanged | PR review |
| SCRUM-7-AC-12 | Backend on host 8080 with CORS default 5173 | `docker-compose.yml` `backend.ports`, `APP_CORS_ALLOWED_ORIGINS` | AC-21 dev-mode run | run `<id>` |
| SCRUM-7-AC-13 | `ApiError` contract over real HTTP (400/404/405/415, unknown route, paging) | `support/PostgresTestcontainersConfiguration`, `support/RealHttp` (test code); `<fix, if a defect was found>` | `ErrorContractIntegrationTest#<…>` (list all) | surefire, run `<id>` |
| SCRUM-7-AC-14 | CORS preflight/actual against running app; foreign origin status pinned (`<403>`) | `config/WebConfig` (unchanged) | `CorsIntegrationTest#<…>` (matrix: `<paths × methods actually asserted>`) | surefire, run `<id>` |
| SCRUM-7-AC-15 | Only `health`/`info` exposed | `application.yml` `management.*` (unchanged) | `ActuatorExposureIntegrationTest#<…>` | surefire, run `<id>` |
| SCRUM-7-AC-16 | Component tests for untested components | — | `src/components/Pager.test.tsx`, `StatusFilter.test.tsx`, `TaskTable.test.tsx`, `ErrorPanel.test.tsx`, `Loading.test.tsx`, `TaskNotFound.test.tsx`, `Layout.test.tsx`, `src/pages/NotFoundPage.test.tsx` (per file: `<what it adds>`) | junit, run `<id>` |
| SCRUM-7-AC-17 | Same-origin API base; existing behaviour unchanged | `src/api/client.ts` `buildUrl(path, query, baseUrl)`; `src/api/config.ts` (doc) | `src/api/config.test.ts › SCRUM-7-AC-17: …`; `src/api/client.test.ts › SCRUM-7-AC-17: …` | junit, run `<id>` |
| SCRUM-7-AC-18 | Browser e2e against composed containers (items 1–7) | `e2e/` | 1 `empty-state.spec.ts` [empty-state] + `ui/tasks.spec.ts › …list loads…` · 2 `› …created via the form…` · 3 `› …editing…` · 4 `› …status changed…` · 5 `› …filtering…` + empty-state · 6 `› …backend validation error…` · 7 `› …footer…` | `todo-e2e-SCRUM-7-<sha>-reports/compose/`, run `<id>` |
| SCRUM-7-AC-19 | HTTP smoke of the composed stack | `e2e/tests/stack.http.spec.ts` | all `[http]` tests | run `<id>` |
| SCRUM-7-AC-20 | CI job builds images, starts stack, runs tests, tears down, uploads reports | `.github/workflows/ci.yml` job `e2e` | n/a | run `<id>`; artifact `todo-e2e-SCRUM-7-<sha>-reports` |
| SCRUM-7-AC-21 | Dev server 5173 → backend container cross-origin (closes SCRUM-1-AC-14) | `e2e/playwright.config.ts` (`E2E_MODE=dev`, `webServer`) | `ui/tasks.spec.ts` `@dev-smoke` tests [dev-smoke] | `…-reports/dev/`, run `<id>` |
| SCRUM-7-AC-22 | OCI labels (revision, Jira key) + non-root verified in CI | `.github/scripts/verify-images.sh` | n/a | step summary table, run `<id>` |
| SCRUM-7-AC-23 | SCRUM-1/SCRUM-6 pending manual checks closed | `docs/traceability/SCRUM-1.md` (AC-14, Open items), `docs/traceability/SCRUM-6.md` (Manual checks) | — | links to run `<id>` |
| SCRUM-7-AC-24 | README "Run with Docker Compose" | `README.md` | n/a | PR review |
| SCRUM-7-AC-25 | README test layers and local execution | `README.md` | n/a | PR review |
| SCRUM-7-NFR-01 | Non-root, unprivileged nginx port | `USER 10001:10001`, `USER 101:101`, `listen 8080` | `verify-images.sh` (image user + `id -u`) | run `<id>` |
| SCRUM-7-NFR-02 | Multi-stage; no build tools at runtime | both Dockerfiles | `verify-images.sh` runtime-contents check | run `<id>` |
| SCRUM-7-NFR-03 | Small images; cacheable layers | base images; layer order | sizes in step summary | run `<id>` |
| SCRUM-7-NFR-04 | Exact pinned bases; lock files | `FROM` lines (ADR 0010 table) | hadolint (`DL3006/DL3007`) | run `<id>` |
| SCRUM-7-NFR-05 | OCI labels + Jira key via build args; tags `<KEY>-<sha>` | `LABEL` blocks; CI `tags` | `verify-images.sh` | run `<id>` |
| SCRUM-7-NFR-06 | No secrets in images/contexts | `.dockerignore` allow-lists; env-only config | `verify-images.sh` history check | run `<id>` |
| SCRUM-7-NFR-07 | Healthchecks with runtime tools; frontend checks nginx | `HEALTHCHECK`s; `/healthz` | `--wait` | run `<id>` |
| SCRUM-7-NFR-08 | `e2e` ≤ 12 min, parallel, cached | gha cache, browser cache | job timing (header above) | run `<id>` |
| SCRUM-7-NFR-09 | Deterministic e2e; ≤ 1 retry, flaky reported | `playwright.config.ts` (`workers: 1`, `retries`), `fixtures.ts`, `scripts/summarize.mjs` | review: no `waitForTimeout` (`grep -r waitForTimeout e2e/tests` → empty) | step summary "E2E", run `<id>` |
| SCRUM-7-NFR-10 | Coverage gates pass; tests tagged | — | `./mvnw test -Dgroups=SCRUM-7`; `npx vitest run -t 'SCRUM-7-'` | `build`/`frontend` jobs, run `<id>` |
| SCRUM-7-NFR-11 | No functional regression | `buildUrl` signature only extended | all existing tests green; deliberate test changes: `<none expected>` | run `<id>` |
| SCRUM-7-NFR-12 | Container security basics; Dockerfile lint | `.hadolint.yaml`; nginx headers/`server_tokens off`; `read_only`, `cap_drop`; JVM `MaxRAMPercentage` | hadolint step; `stack.http.spec.ts › SCRUM-7-NFR-12: …` | run `<id>` |
| SCRUM-7-NFR-13 | Traceability conventions | commits, design, ADRs 0010–0012, this matrix | n/a | PR |

## Deviations from the design

| Design § | Deviation | Reason | Evidence |
|---|---|---|---|
| `<§>` | `<e.g. base-image fallback tag, read_only dropped, CORS matrix narrowed>` | `<why>` | `<run id>` |

## Documented limitations (not automated)

| Item | Reason |
|---|---|
| `<e.g. Tomcat-level 400 for malformed URL escapes (HTML body)>` | `<rejected before Spring; out of scope per design §7.1>` |

## Deliberate changes to existing tests

None expected (design §5.1 extends `buildUrl` backward-compatibly). List any here with a reason.
