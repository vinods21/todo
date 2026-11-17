# SCRUM-1 — Requirements Traceability Matrix

Jira: [SCRUM-1](https://suranagivinod.atlassian.net/browse/SCRUM-1) · Branch: `feature/SCRUM-1-react-frontend-setup` ·
Requirements: [`docs/requirements/SCRUM-1.md`](../requirements/SCRUM-1.md) · Design: [`docs/architecture/SCRUM-1-design.md`](../architecture/SCRUM-1-design.md) ·
ADRs: [0005](../adr/0005-frontend-stack-react-vite-ts.md), [0006](../adr/0006-frontend-api-client-and-state.md), [0007](../adr/0007-frontend-testing-msw.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md)

**Status: Filled by Dev (2026-11-17)** — CI run link and commit SHA to be added after the first green run of the
`frontend` job on this branch (placeholders `<sha>` below).

"Test" = `<file> › <it name>` where the file's top-level `describe` is `SCRUM-1 <area>` and the `it` name starts
with the ID (design §9). "CI evidence" = the GitHub Actions run of the `frontend` job in `.github/workflows/ci.yml`
on the given commit and its artifacts `todo-frontend-SCRUM-1-<sha>` (dist incl. `build-info.json`) and
`todo-frontend-SCRUM-1-<sha>-reports` (`junit.xml` + coverage).

CI run: _TBD (link after first green run)_ · Commit SHA: `<sha>` · Artifacts: `todo-frontend-SCRUM-1-<sha>`, `todo-frontend-SCRUM-1-<sha>-reports` ·
Coverage (lines): 100 % locally (statements 99.1 %, branches 94.9 %, functions 100 %; gate 80/80/80/75) — CI value _TBD_

Local verification (2026-11-17, Node 22.23.4 / npm 10.9.9, clean `npm ci`): `npm run lint` ✔, `npm run typecheck` ✔,
`npm run test:coverage` ✔ (10 files, 77 tests; 81 after the review fixes), `npm run build` ✔ (`dist/build-info.json` + `<meta name="build-info">`
present), `npm audit --omit=dev --audit-level=high` → 0 vulnerabilities.

> Verify AC coverage from the reports artifact with `grep -o 'SCRUM-1-AC-[0-9]*' junit.xml | sort -u`
> (expected: AC-01..AC-13 — verified locally). Build identity: `cat build-info.json` in the dist artifact.

Paths below are relative to `frontend/`. CI evidence for every row: `frontend` job run on `<sha>` (junit testcase
names in `todo-frontend-SCRUM-1-<sha>-reports/junit.xml` unless stated otherwise).

| ID | Requirement (short) | Code (file / symbol) | Test(s) | CI evidence |
|---|---|---|---|---|
| SCRUM-1-AC-01 | List shows title, status label, dueDate in API order | `src/pages/TaskListPage.tsx` `TaskListPage`; `src/components/TaskTable.tsx`; `src/components/statusLabels.ts` `STATUS_LABELS`; `src/api/tasks.ts` `listTasks` | `src/pages/TaskListPage.test.tsx › SCRUM-1-AC-01: shows title, status label and due date (or placeholder) in API order`; `src/api/tasks.test.ts › SCRUM-1-AC-01, SCRUM-1-AC-02: listTasks requests GET /api/tasks?page=N&size=20` | junit, run `<sha>` |
| SCRUM-1-AC-02 | Paging controls drive `page` param; disabled/hidden at bounds | `src/components/Pager.tsx` `Pager`; `src/pages/params.ts` `parsePageParam`; `src/api/tasks.ts` `PAGE_SIZE` | `src/pages/TaskListPage.test.tsx › SCRUM-1-AC-02, SCRUM-1-AC-12: Previous/Next load adjacent pages via ?page and disable at the bounds`; `› SCRUM-1-AC-02: paging is hidden when there is a single page`; `› SCRUM-1-AC-02: an invalid ?page falls back to the first page` | junit, run `<sha>` |
| SCRUM-1-AC-03 | Empty state with create call to action | `src/pages/TaskListPage.tsx` (empty-state branch) | `src/pages/TaskListPage.test.tsx › SCRUM-1-AC-03: shows an empty state with a create call to action when there are no tasks`; `› SCRUM-1-AC-03: an empty page beyond the last one offers a link to the first page` | junit, run `<sha>` |
| SCRUM-1-AC-04 | Create form posts trimmed/nullable fields; returns to list | `src/pages/TaskCreatePage.tsx`; `src/hooks/useIsMounted.ts`; `src/components/TaskForm.tsx`; `src/components/taskForm.ts` `toCreateRequest`, `EMPTY_FORM`; `src/api/tasks.ts` `createTask` | `src/pages/TaskCreatePage.test.tsx › SCRUM-1-AC-04: "New task" opens the form …`; `› SCRUM-1-AC-04: submitting POSTs trimmed title and nulls, then shows the new task on the first page`; `› SCRUM-1-AC-04: description, status and due date are sent when filled in`; `› SCRUM-1-AC-04: leaving the page while the POST is in flight does not navigate when it completes`; `src/components/taskForm.test.ts › SCRUM-1-AC-04: create request trims the title …`; `src/api/tasks.test.ts › SCRUM-1-AC-04: …` | junit, run `<sha>` |
| SCRUM-1-AC-05 | Edit form loads and prefills task | `src/pages/TaskEditPage.tsx` `EditTask`; `src/components/taskForm.ts` `toFormValues`; `src/api/tasks.ts` `getTask` | `src/pages/TaskEditPage.test.tsx › SCRUM-1-AC-05, SCRUM-1-AC-09: shows a loading status, then the form prefilled with the task`; `› SCRUM-1-AC-05: the list Edit action opens the edit form for that task`; `src/components/taskForm.test.ts › SCRUM-1-AC-05: …` | junit, run `<sha>` |
| SCRUM-1-AC-06 | Edit submit PUTs all fields; cancel sends nothing | `src/pages/TaskEditPage.tsx` `handleSubmit`; `src/components/taskForm.ts` `toUpdateRequest`; `src/pages/params.ts` `returnTarget`; `src/api/tasks.ts` `updateTask` | `src/pages/TaskEditPage.test.tsx › SCRUM-1-AC-06: submitting PUTs all four fields and returns to the list showing the updated values`; `› SCRUM-1-AC-06: status is always sent even when unchanged`; `› SCRUM-1-AC-06, SCRUM-1-AC-12: edit from page 2 returns to page 2; Cancel sends no request`; `› SCRUM-1-AC-06: leaving the page while the PUT is in flight does not navigate when it completes`; `src/pages/TaskCreatePage.test.tsx › SCRUM-1-AC-06: Cancel returns to the list without sending a create request` | junit, run `<sha>` |
| SCRUM-1-AC-07 | Client-side validation mirrors backend rules | `src/components/taskForm.ts` `validateTaskForm`, `TITLE_MAX`, `DESCRIPTION_MAX`; `src/components/TaskForm.tsx` `handleSubmit` | `src/components/taskForm.test.ts › SCRUM-1-AC-07: …` (4 tests: required, 200/201, 2000/2001, past date); `src/components/TaskForm.test.tsx › SCRUM-1-AC-07, SCRUM-1-NFR-07: blank title blocks submit …`; `› SCRUM-1-AC-07: too-long title and description are reported inline …`; `src/pages/TaskCreatePage.test.tsx › SCRUM-1-AC-07: invalid input is reported inline and no request is sent`; `src/pages/TaskEditPage.test.tsx › SCRUM-1-AC-07: invalid edits are blocked client-side without a PUT` | junit, run `<sha>` |
| SCRUM-1-AC-08 | Server `fieldErrors` shown inline; form-level fallback | `src/components/taskForm.ts` `mapServerErrors`; `src/api/errors.ts` `toApiError`, `isApiErrorBody`; `src/components/TaskForm.tsx` `showErrors` | `src/components/taskForm.test.ts › SCRUM-1-AC-08: …` (3 tests); `src/components/TaskForm.test.tsx › SCRUM-1-AC-08: server errors are shown inline and form-level; input is preserved`; `src/pages/TaskCreatePage.test.tsx › SCRUM-1-AC-08: …` (3 tests, incl. the real backend shape for an invalid `dueDate`); `src/pages/TaskEditPage.test.tsx › SCRUM-1-AC-08: …`; `src/api/client.test.ts › SCRUM-1-AC-08: …` (2 tests) | junit, run `<sha>` |
| SCRUM-1-AC-09 | Loading indicators; submit disabled while in flight | `src/components/Loading.tsx` (`role="status"`); `src/hooks/useAsync.ts`; `src/components/TaskForm.tsx` (`submitting`, `inFlight`, `aria-busy`) | `src/pages/TaskListPage.test.tsx › SCRUM-1-AC-09: shows a loading status while the list is being fetched`; `src/pages/TaskEditPage.test.tsx › SCRUM-1-AC-05, SCRUM-1-AC-09: …`; `src/components/TaskForm.test.tsx › SCRUM-1-AC-09: submit is disabled and shows progress while in flight; no double submission`; `src/pages/TaskCreatePage.test.tsx › SCRUM-1-AC-09: double clicking submit sends a single POST` | junit, run `<sha>` |
| SCRUM-1-AC-10 | Network/5xx error state with retry; input preserved | `src/api/client.ts` `request`; `src/api/errors.ts` `ApiError`, `GENERIC_ERROR_MESSAGE`, `NETWORK_ERROR_MESSAGE`; `src/components/ErrorPanel.tsx`; `src/hooks/useAsync.ts` `reload` | `src/pages/TaskListPage.test.tsx › SCRUM-1-AC-10: a 500 shows a generic alert without the body; Retry re-requests and recovers`; `› SCRUM-1-AC-10: a network error shows a connection message and Retry re-issues the request`; `› SCRUM-1-AC-10: a 404 from the list endpoint (wrong API base URL) shows a generic error, not "Task not found"`; `src/pages/TaskEditPage.test.tsx › SCRUM-1-AC-10: …` (load + PUT); `src/pages/TaskCreatePage.test.tsx › SCRUM-1-AC-10: …` (5xx + network); `src/api/client.test.ts › SCRUM-1-AC-10: …` (6 tests) | junit, run `<sha>` |
| SCRUM-1-AC-11 | 404 on edit shows "Task not found" | `src/pages/TaskEditPage.tsx` (`deleted`, not-found branch); `src/components/TaskNotFound.tsx`; `src/pages/params.ts` `parseTaskId` | `src/pages/TaskEditPage.test.tsx › SCRUM-1-AC-11: GET 404 shows "Task not found" …`; `› SCRUM-1-AC-11: PUT 404 (task deleted elsewhere) replaces the form …`; `› SCRUM-1-AC-11, SCRUM-1-AC-12: a non-numeric or non-positive id is not found without any request`; `src/api/client.test.ts › SCRUM-1-AC-11: 404 becomes a not-found ApiError` | junit, run `<sha>` |
| SCRUM-1-AC-12 | Distinct URLs for list/create/edit; refresh & Back work | `src/routes.tsx` `routes`; `src/main.tsx` (`createBrowserRouter`); `src/pages/params.ts` | `src/routes.test.tsx › SCRUM-1-AC-12: …` (7 tests: direct entry for `/`, `/tasks/new`, `/tasks/:id/edit`; Back; `?page` re-entry; unknown path); `src/pages/TaskListPage.test.tsx › SCRUM-1-AC-02, SCRUM-1-AC-12: …`; `src/pages/TaskEditPage.test.tsx › SCRUM-1-AC-12: URL helpers parse page, id and return target defensively` | junit, run `<sha>` |
| SCRUM-1-AC-13 | API base URL from `VITE_API_BASE_URL` | `src/api/config.ts` `resolveApiBaseUrl`, `API_BASE_URL`; `src/vite-env.d.ts`; `.env.example` | `src/api/config.test.ts › SCRUM-1-AC-13: …` (3 tests); `src/api/client.test.ts › SCRUM-1-AC-13: sends requests to API_BASE_URL …` | junit, run `<sha>`. Also checked locally: `VITE_API_BASE_URL=http://api.example.test:9000 vite build` inlines that origin |
| SCRUM-1-AC-14 | Dev server on 5173 works with backend CORS default | `vite.config.ts` `server: { port: 5173, strictPort: true }`, no `server.proxy`; `src/api/config.ts` default `http://localhost:8080` | Not automated, by design (ADR 0007). **Manual smoke check: PENDING.** 2026-11-17: `npm run dev` served on `http://localhost:5173` (HTTP 200) ✔; a full run against the backend could not be done in the Dev workspace (Maven Central blocked by the egress proxy, so the backend could not be built). To do before merge: `docker compose up -d`, `./mvnw spring-boot:run`, `npm run dev`, list/create/edit in a browser; record date, backend commit and result here | Config review of `vite.config.ts` in run `<sha>` |
| SCRUM-1-NFR-01 | React + TypeScript (strict) + Vite in `frontend/` | `package.json` (`react` 19.3.1, `vite` 8.3.8, `typescript` 6.0.3); `tsconfig.app.json` / `tsconfig.node.json` (`strict: true`); backend layout unchanged | n/a | Job steps `Typecheck`, `Build` in run `<sha>` |
| SCRUM-1-NFR-02 | Node 22; lockfile; `npm ci` | `.nvmrc` (`22`); `package.json` `engines.node` `>=22.22.2 <23`; `package-lock.json` | n/a | Steps `setup-node` (`node-version-file: frontend/.nvmrc`) and `Install` (`npm ci`) in run `<sha>` |
| SCRUM-1-NFR-03 | dev/build/test/lint/typecheck scripts | `package.json` `scripts` (`dev`, `build`, `preview`, `test`, `test:watch`, `test:coverage`, `lint`, `typecheck`) | n/a | Steps `Lint`, `Typecheck`, `Test with coverage gate`, `Build` in run `<sha>` |
| SCRUM-1-NFR-04 | Vitest + Testing Library + MSW; AC-prefixed test names | `vite.config.ts` `test`; `src/test/setup.ts`, `server.ts`, `handlers.ts`, `fixtures.ts`, `renderApp.tsx` | All 10 test files (77 tests): one `describe('SCRUM-1 <area>')` each; every name starts with an AC/NFR ID; any request without a handler fails the test (`src/test/setup.ts`) | `junit.xml` in `todo-frontend-SCRUM-1-<sha>-reports`; job summary lists AC-01..AC-13 |
| SCRUM-1-NFR-05 | ESLint + `tsc --noEmit` clean; typed API client | `eslint.config.js` (`no-explicit-any: error`, react-hooks, `--max-warnings 0`); `src/api/types.ts`; `src/api/errors.ts` `isApiErrorBody` | `src/api/client.test.ts › SCRUM-1-NFR-05: error bodies are validated by a type guard` | Steps `Lint`, `Typecheck` in run `<sha>` |
| SCRUM-1-NFR-06 | CI frontend job; `todo-frontend-SCRUM-1-<sha>` artifact | `.github/workflows/ci.yml` job `frontend` (backend job `build` unchanged) | n/a | Artifacts `todo-frontend-SCRUM-1-<sha>` and `todo-frontend-SCRUM-1-<sha>-reports` of run `<sha>` |
| SCRUM-1-NFR-07 | Accessibility basics (labels, keyboard, announcements) | `src/components/TaskForm.tsx` (`<label htmlFor>`, `aria-invalid`, `aria-describedby`, `aria-required`, focus management, `noValidate`); `Loading.tsx` (`role="status"`); `ErrorPanel.tsx` (`role="alert"`); `Pager.tsx` (`nav`, `aria-live`); `TaskTable.tsx` (`aria-label="Edit <title>"`); `src/index.css` `:focus-visible` | `src/components/TaskForm.test.tsx › SCRUM-1-NFR-07: every control has a label …`; `› SCRUM-1-AC-07, SCRUM-1-NFR-07: blank title blocks submit, shows a linked inline message and focuses the field`; `› SCRUM-1-NFR-07: Enter in the title field submits the form …`; `› SCRUM-1-AC-10, SCRUM-1-NFR-07: a form-level error only is announced and receives focus`; all tests query by role/label | junit, run `<sha>` |
| SCRUM-1-NFR-08 | README frontend section | `README.md` § "Frontend (SCRUM-1)" (prerequisites, env vars, run against local backend, test/build, traceability) | n/a | Reviewed in PR |
| SCRUM-1-NFR-09 | Build embeds Jira key + commit | `vite.config.ts` (`define` `__JIRA_KEY__`/`__GIT_SHA__`, plugin `buildInfo()` → `<meta name="build-info">` + `dist/build-info.json`); `src/components/BuildInfo.tsx` (footer `SCRUM-1 · <sha7>`) | `src/components/BuildInfo.test.tsx › SCRUM-1-NFR-09: footer shows the Jira key and short commit, full commit in the title`; `src/routes.test.tsx › SCRUM-1-AC-12, SCRUM-1-NFR-09: the layout shows the app name, New task link and build footer` | `build-info.json` in `todo-frontend-SCRUM-1-<sha>` (`commit` = `<sha>`) |

## Deviations from the design

| Item | Design | Implemented | Reason |
|---|---|---|---|
| Unhandled requests | ADR 0007 / design §9 (as originally written): `server.listen({ onUnhandledFrame: 'error' })` makes a stray request fail the test — ADR 0007 and design corrected in the review commit | Same option **plus** a `request:unhandled` listener in `src/test/setup.ts` that fails the test in `afterEach` | Checked with a probe test: in MSW 3.0.6, `'error'` only logs and makes `fetch` reject. The app shows that as a network error, so the test still passed. "No request" tests also assert the request log of the default handlers |
| `TaskForm` API | Design §7: page passes `submitting` and `serverErrors` props | `onSubmit(values)` resolves with `{ fields, form }` errors or `undefined`; `TaskForm` owns `submitting` and error state | Keeps the double-submit guard and error/focus handling in one place. Avoids syncing props into state, which the react-hooks v7 `set-state-in-effect` rule flags. Behaviour matches the design |
| `useAsync` signature | `useAsync(fn, deps)` | `useAsync(fn)`; callers memoise `fn` with `useCallback` | The design marks this as the preferred option. It satisfies `exhaustive-deps` without disabling the rule |
| URL helpers | in pages | `src/pages/params.ts` (`parsePageParam`, `parseTaskId`, `returnTarget`) | `react-refresh/only-export-components` forbids mixing component and helper exports |
| Extra component | — | `src/components/TaskNotFound.tsx` | Used by the edit page for invalid id, GET 404 and PUT 404 |

## Follow-ups raised by this story

| Item | Owner / target | Status |
|---|---|---|
| Workflow still named `SCRUM-2 CI`; backend artifacts `todo-backend-SCRUM-2-<sha>` — rename/re-scheme (design §13) | SCRUM-7 or new story | Open (left unchanged in SCRUM-1) |
| Delete in UI (Q-01) | New story | Open |
| Serve/host SPA, SPA fallback routing (Q-02) | SCRUM-7 | Open |
| Adopt TypeScript 7 once typescript-eslint supports it (ADR 0005) | Later story | Open |
| Dev-only transitive `picomatch` ReDoS advisory (13 high findings in `npm audit`, dev deps only; runtime deps clean) | Later dependency bump | Open (CI gates on `--omit=dev`) |
| AC-14 manual smoke check against a running backend | Dev / reviewer before merge | Pending |

## Review (SCRUM-1 [REVIEW] commit)

Independent review against `docs/requirements/SCRUM-1.md`, the design/ADRs and the real SCRUM-2 backend code
(`TaskController`, `PageResponse`, `TaskResponse`, `TaskCreateRequest`/`TaskUpdateRequest`, `TaskStatus`,
`ApiError`/`FieldErrorItem`, `GlobalExceptionHandler`): paths, paging shape, field names, enum values, date
formats and error body match the frontend types and client. Fixed in the review commit:

| Severity | Finding | Fix |
|---|---|---|
| Medium | A create/edit submission that completed after the user had left the form (Cancel, header link) still navigated to the list, yanking the user away from the view they had moved to | `src/hooks/useIsMounted.ts`; pages navigate only while mounted; regression tests for POST and PUT |
| Low | `?page=` values above 2^31 were sent as API `page` > Java `int` max, which the backend rejects with 400 (`Invalid value for parameter 'page'`) and Retry could never fix | `parsePageParam` caps at `MAX_PAGE_PARAM` (2^31), else page 1 |
| Low | Any 404 is normalised to "Task not found"; on the list (only reachable with a wrong `VITE_API_BASE_URL`) that message was misleading | List shows the generic message for `not-found` |
| Low (test) | AC-08 "400 without fieldErrors" test used `Invalid value for field 'dueDate'`, which the real backend always sends **with** a `dueDate` field error | Test uses `Malformed JSON request`; new test covers the real invalid-`dueDate` shape (inline under Due date) |
| Docs | ADR 0007 claimed `onUnhandledFrame: 'error'` fails tests | ADR 0007 and design §4/§9 corrected to describe the `request:unhandled` guard |

