# ADR 0012 — End-to-end tests with Playwright in `e2e/`, against Compose (and the Vite dev server) in a CI `e2e` job

- Status: Accepted
- Date: 2026-11-18
- Jira: [SCRUM-7](https://suranagivinod.atlassian.net/browse/SCRUM-7) — SCRUM-7-AC-18..AC-23, NFR-08, NFR-09, NFR-13; assumptions A-06, A-07, A-08
- **Amends:** [ADR 0007](0007-frontend-testing-msw.md) — its statements "AC-14 (dev server + real backend CORS)
  is verified by configuration review and a documented manual smoke test, not an automated test" and "Browser
  E2E (Playwright) stays out of scope" are replaced: SCRUM-1-AC-14 is now automated (AC-21), and the MSW-vs-real-API
  drift risk it lists is covered by the e2e suite. The rest of ADR 0007 (unit/component layer) is unchanged.
- Design: [SCRUM-7 design §8–§9](../architecture/SCRUM-7-design.md)

## Context

No test exercises the real frontend against the real backend and database. SCRUM-1-AC-14 and the SCRUM-6 manual
checks were never run. SCRUM-7 needs a headless-browser suite against the composed containers (AC-18), an
HTTP-level smoke of the stack (AC-19), and the dev-mode cross-origin set-up (AC-21), all in CI, deterministic
(NFR-09), and isolated from the frontend's dependency tree (A-07).

Options: **Playwright** (`@playwright/test`), Cypress, Selenium/WebDriver, curl scripts only.

## Decision

- **Tool: Playwright `@playwright/test` 1.65.1** (exact pin, current release on 2026-11-18, `npm view`),
  Chromium only (headless shell). Chosen for: first-class TypeScript without a build step, auto-waiting
  locators and web-first assertions (no sleeps), a built-in `request` API (AC-19 without curl scripts or a
  second tool), `webServer` (starts the Vite dev server for AC-21 and waits for it), project dependencies
  (ordering without order-dependent tests), and trace/video/screenshot artefacts. Rejected: Cypress (heavier
  install, cross-origin dev-mode set-up needs `cy.origin` gymnastics, separate API runner), Selenium (more
  plumbing, no built-in waiting/report/trace), curl-only (no browser — cannot prove AC-18).
- **Location:** `e2e/` at the repo root, own `package.json` + `package-lock.json` (exact pins:
  `@playwright/test` 1.65.1, `@types/node` 22.20.5, `typescript` 6.0.3 — same versions as `frontend/`),
  `engines.node` `>=22.22.2 <23`, `type: module`. Not part of the frontend's lint/audit/coverage scope.
- **Modes (env `E2E_MODE`):**
  - `compose` (default) — `E2E_BASE_URL` (default `http://localhost:3000`, the nginx container),
    `E2E_BACKEND_URL` (default `http://localhost:8080`, only for `/actuator/info`); projects
    `empty-state` → (`http`, `ui`) via `dependencies`.
  - `dev` — base URL `http://localhost:5173`; Playwright `webServer` runs `npm --prefix ../frontend run dev`
    (reused if already running locally); API set-up goes directly to `E2E_BACKEND_URL`; one project `dev-smoke`
    that runs only tests tagged `@dev-smoke` (list loads, create, status change). This is SCRUM-1-AC-14 automated.
- **Determinism (NFR-09):** no `waitForTimeout`; locators by role/label (same accessibility contract as ADR
  0007); waits on UI state or specific responses (`page.waitForResponse`); every test creates its own data with
  a unique title (`e2e <label> <runId>-<n>`); `workers: 1` (several tests assert "newest first" on the shared
  list, which concurrent creators would break) — the suite is small, so serial is cheap; `retries: 1` in CI only,
  and the run summary lists every flaky (passed-on-retry) test; `forbidOnly` in CI. The unfiltered/filtered
  empty states (AC-18.1/.5) need an empty database: they live in project `empty-state`, which every other project
  depends on, and run only if the database is empty — otherwise they are skipped with a reason, **unless**
  `E2E_EXPECT_EMPTY_DB=1` (set in CI on a fresh volume, A-08), where a non-empty database fails the test.
- **No mocks.** The one deliberate interception: AC-18.6 rewrites the outgoing create request's title to `"   "`
  with `page.route(...).continue({ postData })` to bypass the client-side validation (which mirrors the server's
  exactly); the response — the backend's real 400 `ApiError` through the proxy — is not touched.
- **Browser errors fail tests:** a fixture collects `pageerror` and console errors (CSP violations, uncaught
  exceptions); Chrome's own "Failed to load resource: … 4xx" lines for deliberately provoked errors are ignored.
- **Naming (ADR 0004):** test titles start with the AC IDs (`SCRUM-7-AC-18: …`); files group by area; reports:
  `list`, HTML, JUnit (`reports/<mode>/junit.xml`), JSON (`reports/<mode>/results.json`); traces,
  screenshots and videos retained on failure under `reports/<mode>/test-results/`.
- **CI:** new job `e2e` in workflow `CI` (`needs: identity`, parallel to `build`/`frontend`) — builds both images
  with Buildx + GitHub Actions cache, starts Compose with `--wait`, verifies labels/non-root/sizes, runs the
  compose suite, the dev-mode smoke, the lifecycle/persistence script, always collects `docker compose logs` and
  tears down with `down -v`, and uploads `todo-e2e-<JIRA_KEY>-<sha>-reports` (ADR 0008 naming). Browsers are
  cached by Playwright version (`~/.cache/ms-playwright`).
- **Layering (A-06 confirmed):** backend integration tests stay on Testcontainers + `RANDOM_PORT`; only the e2e
  job uses Compose.

## Consequences

- The real browser → nginx → Spring Boot → PostgreSQL path, the dev-mode CORS path and the image/Compose
  configuration are verified on every push; SCRUM-1-AC-14 and the SCRUM-6 manual checks are closed with CI
  evidence (AC-23).
- E2E is not part of any coverage gate (NFR-10). It cannot run in the authoring workspace (no Docker; the
  Playwright CDN is blocked there) — Dev can only type-check it and `playwright test --list` locally; CI is the
  first real run.
- Serial execution caps parallelism; acceptable for ~15 tests (< 2 min). If the suite grows, tests asserting on
  the shared list order must move to per-test filtering before `workers` is raised.
- One more lock file to maintain; Playwright upgrades are deliberate PRs (browser revision changes with it).
