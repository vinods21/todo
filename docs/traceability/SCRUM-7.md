# SCRUM-7 — Requirements Traceability Matrix

Jira: [SCRUM-7](https://suranagivinod.atlassian.net/browse/SCRUM-7) · Branch: `feature/SCRUM-7-testing-and-deployment` ·
Requirements: [`docs/requirements/SCRUM-7.md`](../requirements/SCRUM-7.md) · Design: [`docs/architecture/SCRUM-7-design.md`](../architecture/SCRUM-7-design.md) ·
ADRs: [0010](../adr/0010-container-images-and-build-identity.md), [0011](../adr/0011-spa-hosting-nginx-reverse-proxy.md), [0012](../adr/0012-end-to-end-testing-playwright.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md) (as amended by [0008](../adr/0008-ci-derived-build-identity.md)), [ADR 0007](../adr/0007-frontend-testing-msw.md) (as amended by 0012)

**Status: filled by Dev (2026-11-18).** The backend, images, Compose stack and e2e suite cannot run in the authoring
workspace (design §0) — their evidence is the `CI` run below (the later docs-only commit does not change code).

How to read the columns:
- Backend "Test" = `Class#method` (paths relative to `src/test/java/com/vinods21/todo/`) with `@Tag("SCRUM-7")` and a
  `@DisplayName` starting with the ID.
- Frontend "Test" = `<file> › <it name>` (relative to `frontend/`) inside `describe('SCRUM-7 <area>')`.
- E2E "Test" = `<file> › <title>` (relative to `e2e/`) with project name (`[http]`, `[ui]`, `[empty-state]`,
  `[dev-smoke]`); titles start with the ID.
- "CI evidence" = workflow `CI` run on `<sha>`: job `build` → `todo-backend-SCRUM-7-<sha>-reports`; job `frontend` →
  `todo-frontend-SCRUM-7-<sha>-reports`; job `e2e` → `todo-e2e-SCRUM-7-<sha>-reports` (`compose/`, `dev/`,
  `compose-logs*.txt`) and its step summary (image table, lifecycle results, e2e stats).

CI run: [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) (jobs `identity`, `build`, `frontend`, `e2e` green) · Commit SHA: `6a5025de28d822384bfbcaccfa178e7cf54c2b51` ·
`e2e` job duration: `06:49` (warm layer cache; 4:44 of it is `playwright install-deps` apt packages — the previous
green run [44229750651](https://github.com/vinods21/todo/actions/runs/44229750651) on `9a99726` took `03:21`; NFR-08
target ≤ 12 min met) · Image sizes: backend `119 MB` (≤ 300), frontend `25 MB` (≤ 80) (`docker image inspect .Size`) ·
Flaky tests (passed on retry): none (compose 18/18, dev 3/3 passed first time) · Coverage — backend lines (service +
web*): JaCoCo gate (≥ 80 %) passed, no main-code change · frontend: lines 100 %, statements 99.1 %, functions 100 %,
branches 95.36 % (gate 80/80/80/75)

Test counts on that run: backend 143 tests (SCRUM-7: `ErrorContractIntegrationTest` 12, `CorsIntegrationTest` 20,
`ActuatorExposureIntegrationTest` 15 = 47 new); frontend 149 tests in 20 files (30 new SCRUM-7 tests: 25 AC-16 + 5
AC-17); e2e compose 18 (`empty-state` 1, `http` 10, `ui` 7) + dev mode 3.

> Verify AC coverage: `grep -hoE 'SCRUM-7-AC-[0-9]+' TEST-*.xml | sort -uV` (expect AC-13..AC-15),
> `grep -oE 'SCRUM-7-AC-[0-9]+' frontend/reports/junit.xml | sort -uV` (expect AC-16, AC-17),
> `grep -hoE 'SCRUM-7-AC-[0-9]+' e2e/reports/*/junit.xml | sort -uV` (expect AC-02, AC-04..AC-06, AC-18, AC-19, AC-21).

| ID | Requirement (short) | Code / config (file / symbol) | Test(s) | CI evidence |
|---|---|---|---|---|
| SCRUM-7-AC-01 | Backend image builds from clean checkout; build identity via build args, `UNKNOWN` otherwise | `Dockerfile` (build stage, `-Dmaven.gitcommitid.skip`, `-Dgit.commit.id.full`, `-Dgit.branch`, `-Djira.issue`); `.dockerignore` | `e2e/tests/stack.http.spec.ts › SCRUM-7-AC-02, SCRUM-7-AC-19: backend /actuator/info reports the build identity` [http]; `verify-images.sh` labels | steps "Build backend image", "Verify images…", run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-02 | Backend container configurable by env; Flyway; health UP | `docker-compose.yml` `backend.environment`; `Dockerfile` `ENTRYPOINT` | Compose `--wait`; `stack.http.spec.ts › …round-trip…` | step "Start stack…", run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-03 | Clean SIGTERM stop < 10 s (no SIGKILL); `HEALTHCHECK` on actuator health | `Dockerfile` exec-form `ENTRYPOINT`, `HEALTHCHECK` | `.github/scripts/verify-lifecycle.sh` step 3 (exit code `143`, `0.345` s, OOMKilled false); `HEALTHCHECK` gates `--wait` | step "Lifecycle and persistence", run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-04 | Frontend image (`npm ci` + build, Node 22) with build identity | `frontend/Dockerfile`; `frontend/.dockerignore` | `stack.http.spec.ts › SCRUM-7-AC-19, SCRUM-7-AC-04, SCRUM-7-AC-05: / serves index.html…`, `› SCRUM-7-AC-04: /build-info.json…` [http] | step "Build frontend image", run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-05 | SPA fallback, 404 for missing assets, cache policies | `frontend/nginx/default.conf.template` (`location /`, `^~ /assets/`, extension regex, `= /index.html`) | `stack.http.spec.ts › …client-side routes…`, `› …fingerprinted assets…`, `› …missing asset returns 404…` [http]; `ui/tasks.spec.ts › SCRUM-7-AC-18: editing … deep link survives a reload` [ui] | e2e `compose/junit.xml`, run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-06 | Proxy `/api/**` + `/actuator/health`; errors pass through; 5xx when backend down | `default.conf.template` (`^~ /api/`, `= /actuator/health`, `^~ /actuator/`); `frontend/nginx/proxy.conf` | `stack.http.spec.ts › …/actuator/health is proxied…`, `› …API round-trip…`, `› …error bodies pass through…` [http]; `ui/tasks.spec.ts › SCRUM-7-AC-18, SCRUM-7-AC-06: a backend validation error…` [ui]; backend-down 502: not asserted by a test — see *Documented limitations* | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-07 | One command builds and starts the stack | `docker-compose.yml` (profile `app`); README "Run with Docker Compose" | CI `docker compose up -d --no-build --wait` (images built by Buildx from the same Dockerfiles) | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-08 | Env-configurable with local defaults; `.env.example` | `docker-compose.yml` `${TODO_*:-…}`; `.env.example` | CI overrides `TODO_IMAGE_TAG`, `COMPOSE_PROFILES` | Compose review in PR |
| SCRUM-7-AC-09 | Health-gated start-up; `up --wait` | `docker-compose.yml` `healthcheck` × 3, `depends_on: condition: service_healthy` | CI `--wait --wait-timeout 240` (postgres → backend → frontend healthy in order) | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-10 | Data persists across `down`/`up`; `down -v` clears; backend restart keeps data, no re-migration | `docker-compose.yml` volume `todo-pgdata` | `verify-lifecycle.sh` steps 4–6 | step "Lifecycle and persistence", run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-11 | Postgres-only dev workflow preserved | profile `app` on `backend`/`frontend`; README "Run locally" | `docker compose up -d` starts only `postgres` (checked with `docker compose config --services` → `postgres`; with `COMPOSE_PROFILES=app` → `postgres backend frontend`); CI `build` job unchanged | PR review |
| SCRUM-7-AC-12 | Backend on host 8080 with CORS default 5173 | `docker-compose.yml` `backend.ports`, `APP_CORS_ALLOWED_ORIGINS` | AC-21 dev-mode run | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-13 | `ApiError` contract over real HTTP (400/404/405/415, unknown route, paging) | `support/PostgresTestcontainersConfiguration`, `support/RealHttp` (test code); no defect found — real HTTP matches the slice tests | `ErrorContractIntegrationTest#blankTitle`, `#malformedJson`, `#unknownStatusOnCreate`, `#nonNumericId`, `#unknownId`, `#unknownApiRoute`, `#unknownRootRoute`, `#unsupportedMethodOnItem`, `#unsupportedMethodOnCollection`, `#unsupportedMediaType`, `#negativePage`, `#zeroSize` (12) | surefire, run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-14 | CORS preflight/actual against running app; foreign origin status pinned (`403`) | `config/WebConfig` (unchanged) | `CorsIntegrationTest#preflightFromDevOriginAccepted` (full matrix `/api/tasks`, `/api/tasks/1`, `/api/tasks/1/status` × GET, POST, PUT, PATCH, DELETE = 15, all 200 — unmapped combinations are accepted from the global `/api/**` config, not narrowed), `#actualGetFromDevOrigin`, `#actualPostFromDevOriginExposesLocation`, `#preflightFromForeignOriginRejected` (403), `#actualGetFromForeignOriginRejected` (403), `#requestWithoutOrigin` (20) | surefire, run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-15 | Only `health`/`info` exposed | `application.yml` `management.*` (unchanged) | `ActuatorExposureIntegrationTest#healthUpWithoutDetails`, `#infoExposed`, `#discoveryListsOnlyHealthAndInfo`, `#sensitiveEndpointsNotExposed` (11 endpoints), `#shutdownNotExposed` (15) | surefire, run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-16 | Component tests for untested components | — | `src/components/Pager.test.tsx`, `StatusFilter.test.tsx`, `TaskTable.test.tsx`, `ErrorPanel.test.tsx`, `Loading.test.tsx`, `TaskNotFound.test.tsx`, `Layout.test.tsx`, `src/pages/NotFoundPage.test.tsx` — Pager (6: hidden for 0/1 pages, landmark + text, bounds disabled, callbacks), StatusFilter (5: name, options/values, selection, callbacks incl. `undefined` for All, controlled), TaskTable (5: caption/headers, row order + due dates, status comboboxes, Edit link href + `returnTo` router state, empty), ErrorPanel (3: alert, Retry, children), Loading (1: `role=status`), TaskNotFound (1: h1, text, link navigates), Layout (3: banner links, Outlet, footer identity), NotFoundPage (1: heading + link) | junit, run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-17 | Same-origin API base; existing behaviour unchanged | `src/api/client.ts` `buildUrl(path, query, baseUrl)`; `src/api/config.ts` (doc) | `src/api/config.test.ts › SCRUM-7-AC-17: …`; `src/api/client.test.ts › SCRUM-7-AC-17: …` (2 config + 3 client tests incl. a real request with `VITE_API_BASE_URL='/'`) | junit, run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-18 | Browser e2e against composed containers (items 1–7) | `e2e/` | 1 `empty-state.spec.ts` [empty-state] + `ui/tasks.spec.ts › …list loads…` · 2 `› …created via the form…` · 3 `› …editing…` · 4 `› …status changed…` · 5 `› …filtering…` + empty-state · 6 `› …backend validation error…` · 7 `› …footer…` | `todo-e2e-SCRUM-7-6a5025de28d822384bfbcaccfa178e7cf54c2b51-reports/compose/`, run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-19 | HTTP smoke of the composed stack | `e2e/tests/stack.http.spec.ts` | all `[http]` tests (10) | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-20 | CI job builds images, starts stack, runs tests, tears down, uploads reports | `.github/workflows/ci.yml` job `e2e` | n/a | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631); artifact `todo-e2e-SCRUM-7-6a5025de28d822384bfbcaccfa178e7cf54c2b51-reports` |
| SCRUM-7-AC-21 | Dev server 5173 → backend container cross-origin (closes SCRUM-1-AC-14) | `e2e/playwright.config.ts` (`E2E_MODE=dev`, `webServer`) | `ui/tasks.spec.ts` `@dev-smoke` tests [dev-smoke] | `…-reports/dev/` (3/3), run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-22 | OCI labels (revision, Jira key) + non-root verified in CI | `.github/scripts/verify-images.sh` | n/a | step summary + job log table (revision `6a5025de28d8`, jira `SCRUM-7`, users `10001:10001` / `101:101`, runtime UIDs 10001 / 101), run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-23 | SCRUM-1/SCRUM-6 pending manual checks closed | `docs/traceability/SCRUM-1.md` (AC-14, Open items), `docs/traceability/SCRUM-6.md` (Manual checks) | — | links to run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-AC-24 | README "Run with Docker Compose" | `README.md` | n/a | PR review |
| SCRUM-7-AC-25 | README test layers and local execution | `README.md` | n/a | PR review |
| SCRUM-7-NFR-01 | Non-root, unprivileged nginx port | `USER 10001:10001`, `USER 101:101`, `listen 8080` | `verify-images.sh` (image user + `id -u`) | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-02 | Multi-stage; no build tools at runtime | both Dockerfiles | `verify-images.sh` runtime-contents check | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-03 | Small images; cacheable layers | base images; layer order | sizes in step summary (119 MB / 25 MB) | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-04 | Exact pinned bases; lock files | `FROM` lines (ADR 0010 table) | hadolint (`DL3006/DL3007`), clean | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-05 | OCI labels + Jira key via build args; tags `<KEY>-<sha>` | `LABEL` blocks; CI `tags` | `verify-images.sh` | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-06 | No secrets in images/contexts | `.dockerignore` allow-lists; env-only config | `verify-images.sh` history check | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-07 | Healthchecks with runtime tools; frontend checks nginx | `HEALTHCHECK`s; `/healthz` | `--wait` | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-08 | `e2e` ≤ 12 min, parallel, cached | gha cache, browser cache | job timing (header above) | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-09 | Deterministic e2e; ≤ 1 retry, flaky reported | `playwright.config.ts` (`workers: 1`, `retries`), `fixtures.ts`, `scripts/summarize.mjs` | review: no `waitForTimeout` (`grep -r waitForTimeout e2e/tests` → empty) | step summary "E2E" (flaky: none), run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-10 | Coverage gates pass; tests tagged | — | `./mvnw test -Dgroups=SCRUM-7`; `npx vitest run -t 'SCRUM-7-'` | `build`/`frontend` jobs, run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-11 | No functional regression | `buildUrl` signature only extended | all existing tests green; deliberate test changes: none | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-12 | Container security basics; Dockerfile lint | `.hadolint.yaml`; nginx headers/`server_tokens off`; `read_only`, `cap_drop`; JVM `MaxRAMPercentage` | hadolint step; `stack.http.spec.ts › SCRUM-7-NFR-12: …` | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |
| SCRUM-7-NFR-13 | Traceability conventions | commits, design, ADRs 0010–0012, this matrix | n/a | PR |

## Deviations from the design

| Design § | Deviation | Reason | Evidence |
|---|---|---|---|
| §3.1, §3.2 `HEALTHCHECK` | JSON form: backend `CMD ["sh", "-c", "wget … ${SERVER_PORT:-8080} … \|\| exit 1"]`, frontend `CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]` | hadolint DL3025 failed the lint step (`failure-threshold: warning`); behaviour unchanged | run [44226764289](https://github.com/vinods21/todo/actions/runs/44226764289) |
| §6.1 frontend `tmpfs` | `/tmp`, `/var/cache/nginx`, `/etc/nginx/conf.d` mounted with `uid=101,gid=101,mode=0755` (`read_only` kept) | R6 materialised differently than foreseen: the root-owned tmpfs made `20-envsubst-on-templates.sh` skip rendering ("/etc/nginx/conf.d is not writable"), so nginx ran without a server on 8080 → unhealthy. Fixed without dropping `read_only` | run [44227861909](https://github.com/vinods21/todo/actions/runs/44227861909) |
| §4.1 nginx | added `location = /actuator { return 404; }` | the bare discovery path fell through to the SPA fallback (200 `index.html`); only `/actuator/…` was blocked | run [44229237129](https://github.com/vinods21/todo/actions/runs/44229237129) |
| §8.4 `stack.http` health test | asserts `status: UP` and no `components`/`details` instead of deep-equal `{"status":"UP"}` | in a container Spring Boot adds `"groups": ["liveness","readiness"]` (not sensitive) | run [44228738338](https://github.com/vinods21/todo/actions/runs/44228738338) |
| §9.2 history check | `.env` matched only as a whole file name; hits are printed | `\.env` matched the nginx base image's `15-local-resolvers.envsh` (false positive) | run [44228264494](https://github.com/vinods21/todo/actions/runs/44228264494) |
| §9.1 CI job | every step after "Start stack" runs with `!cancelled() && steps.stack.outcome == 'success'`; extra failure-only "Diagnostics" step (ps, container state, logs); image table also printed to the job log; the Chromium cache-hit flag reaches the script via env instead of `${{ }}` interpolation | one failing check skipped `npm ci` and broke the dev-mode step; compose logs were only in the artifact; step summaries are not readable via the REST API | runs [44228264494](https://github.com/vinods21/todo/actions/runs/44228264494), [44227174434](https://github.com/vinods21/todo/actions/runs/44227174434) |
| §7.1 `RealHttp` | sends `Accept: application/json` and `Accept-Language: en` | mimics the SPA's API client; pins the Bean Validation message language (`must not be blank`) independent of the runner locale | run [44230358631](https://github.com/vinods21/todo/actions/runs/44230358631) |

Design fallbacks **not** needed: base-image tags (R1) all resolved; Q-03 Maven flags (R2) worked (`/actuator/info`
`build.git-commit` = sha, asserted by `[http]`); nginx resolver/envsubst filter (R5) worked once conf.d was writable;
CSP (R7) caused no browser errors; CORS matrix (R9) not narrowed; JDK client headers (R10) fine; `--only-shell` (R11)
fine; backend `read_only` fine; no AC-13 defect (R8).

## Documented limitations (not automated)

| Item | Reason |
|---|---|
| Tomcat-level 400 for malformed URL escapes (HTML body) | rejected before Spring; out of scope per design §7.1 |
| nginx 502 while the backend is down (AC-06) | by configuration (`proxy_intercept_errors off`, resolver + variable `proxy_pass`); not asserted by a test. The lifecycle script shows nginx re-resolving the re-created backend (marker GET 200 through the proxy after the backend restart) |
| Image sizes | `docker image inspect .Size` on the runner's image store; informational (NFR-03 is not a gate, R13) |

## Deliberate changes to existing tests

None. `buildUrl` gained an optional third parameter (backward-compatible); all SCRUM-1/2/6 tests are unchanged and
green.
