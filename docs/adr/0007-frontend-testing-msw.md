# ADR 0007 — Frontend testing: Vitest + React Testing Library (jsdom) + MSW node server, AC-prefixed test names

- Status: Accepted
- Date: 2026-11-17
- Jira: [SCRUM-1](https://suranagivinod.atlassian.net/browse/SCRUM-1) — SCRUM-1-NFR-04, NFR-06, NFR-07, AC-01..AC-13; extends [ADR 0004](0004-traceability-conventions.md)

## Context

NFR-04 requires Vitest + React Testing Library (jsdom) with network-level API mocking against the SCRUM-2
contract, no real backend, and test names starting with the AC IDs they verify. NFR-07 asks tests to query by
role/label so accessibility is enforced. ADR 0004 requires tests and CI reports to trace to ACs; on the backend
this is `@Tag` + `@DisplayName` in Surefire XML. CI (NFR-06) must publish test results and coverage, including on
failure.

## Decision

- **Vitest 5.1.0** (`environment: 'jsdom'` with **jsdom 31.0.1**, `globals: true`), **@testing-library/react 16.3.3**
  (+ `@testing-library/dom` 10.4.2), **@testing-library/user-event 14.6.12**,
  **@testing-library/jest-dom 7.0.1** (`/vitest` entry).
- **MSW 3.0.6 node server** (`setupServer` from `msw/node`) intercepts `fetch` at the network layer. Default
  handlers implement the four endpoints over an in-memory store with SCRUM-2 semantics; tests override with
  `server.use(...)`. `server.listen({ onUnhandledFrame: 'error' })` (MSW 3 option name; v2's `onUnhandledRequest`
  no longer type-checks) does **not** by itself fail a test: in MSW 3.0.6 it only logs
  `[MSW] Error: intercepted a request without a matching request handler` and makes the `fetch` reject with
  `TypeError: fetch failed`, which the app renders as a network error, so the test can still pass. Therefore
  `src/test/setup.ts` also registers a `server.events.on('request:unhandled', ...)` listener that records every
  unhandled request, and its `afterEach` throws `Unhandled request(s) in test: ...`, failing the test (verified with
  a probe test during review). "No request sent" (AC-06 Cancel, AC-07, AC-11 non-numeric id) is additionally
  asserted positively via the default handlers' `requestLog`.
- Components are rendered through the real route table with `createMemoryRouter`; queries use roles/labels only.
- **Traceability naming:** one top-level `describe('SCRUM-1 <area>')` per file (the frontend equivalent of
  `@Tag("SCRUM-1")`); every `it` name starts with `SCRUM-1-AC-xx`/`SCRUM-1-NFR-xx`. Vitest's **junit reporter**
  writes `frontend/reports/junit.xml` on every run; testcase names contain the IDs, so
  `grep -o 'SCRUM-1-AC-[0-9]*' reports/junit.xml | sort -u` lists covered ACs (verified in the spike).
- **Coverage:** `@vitest/coverage-v8` 5.1.0, `src/**` excluding `main.tsx`, `vite-env.d.ts`, test code; thresholds
  lines/statements/functions 80 %, branches 75 %; reports in `frontend/reports/coverage/` (html, lcov,
  json-summary). The CI test step fails below threshold.
- AC-14 (dev server + real backend CORS) is verified by configuration review and a documented manual smoke test,
  not an automated test. Browser E2E (Playwright) stays out of scope.

## Consequences

- Fast, deterministic tests with no backend or Docker; the same request/response shapes as the backend contract
  are exercised, but drift between the mock handlers and the real API is only caught by the manual smoke test
  until E2E/contract tests exist (candidate for SCRUM-7).
- jsdom is not a real browser: CORS, layout and native date-picker behaviour are not tested.
- The unhandled-request guard lives in `afterEach`, so a stray request is reported after the test body finishes
  (the failure names the request); a request issued after the test's last `afterEach` is not caught.
- Reviewers reject test files without the `SCRUM-1 …` describe or `it` names without an AC/NFR prefix.
