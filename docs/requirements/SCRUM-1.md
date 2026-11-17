# SCRUM-1 — React Frontend Setup: Refined Requirements

| Field | Value |
|---|---|
| Jira key | [SCRUM-1](https://suranagivinod.atlassian.net/browse/SCRUM-1) |
| Type / Priority | Story / High |
| Due date | 2026-11-21 |
| Parent epic | SCRUM-5 — Build a To-Do Application (Spring Boot, React, PostgreSQL, REST APIs) |
| Depends on | SCRUM-2 — Spring Boot Backend Setup (done, merged to `main`) — API contract in [`docs/architecture/SCRUM-2-design.md`](../architecture/SCRUM-2-design.md) §5–6 |
| Author role | Product Manager (PM → Architect → Dev pipeline) |
| Status | Draft — ready for architecture |

**Traceability:** Every requirement in this document has a stable ID (`SCRUM-1-AC-xx`, `SCRUM-1-NFR-xx`).
Design docs, code, tests and commits for this story must reference these IDs (commits also carry `Refs: SCRUM-1`),
following [ADR 0004](../adr/0004-traceability-conventions.md) adapted to the frontend toolchain (e.g. test names
start with the AC ID they verify). The traceability table in section 7 maps each ID to the test(s) that verify it
and is completed by Dev.

---

## 1. Problem statement

The To-Do application (SCRUM-5) has a working REST backend (SCRUM-2) but no user interface. Users need a
browser UI to see their tasks and to create and edit them. This story delivers a React single-page application
that lists tasks, provides create and edit forms, talks to the SCRUM-2 `/api/tasks` endpoints, and behaves
sensibly while data is loading and when requests fail.

Jira acceptance criteria (verbatim) and where they are refined:

| Jira AC | Refined in |
|---|---|
| Initialize React application. | NFR-01..03, AC-13, AC-14 |
| Display all tasks in a list. | AC-01..03 |
| Provide forms to create and edit tasks. | AC-04..08 |
| Integrate with Spring Boot REST APIs. | AC-01, AC-04, AC-06, AC-08, AC-13, AC-14 |
| Handle loading and error states. | AC-09..12 |

## 2. Scope

### In scope
- React + TypeScript application scaffold in `frontend/` (Vite), with dev server, production build, tests and lint.
- Task list view backed by the paged `GET /api/tasks` endpoint.
- Create form (`POST /api/tasks`) and edit form (`GET` + `PUT /api/tasks/{id}`).
- `status` selectable from the enum `TODO` | `IN_PROGRESS` | `DONE` on create/edit (plain select, no workflow rules).
- Client-side validation mirroring the backend field rules; display of server-side validation errors.
- Loading indicators, error states with retry, not-found handling.
- Configurable API base URL via a Vite environment variable.
- CI job that builds, lints, type-checks and tests the frontend and uploads the build output.

### Out of scope
- **Delete** — not in the Jira ACs; the backend supports it (`DELETE /api/tasks/{id}`) but the UI does not
  expose it in this story. Candidate for a follow-up story.
- **Status workflow / transition rules**, quick status toggles, dedicated status actions — owned by **SCRUM-6
  Task Status Management**.
- **Deployment**, hosting, containerising or serving the SPA from the backend, environment promotion — owned by
  **SCRUM-7 Testing and Deployment**.
- Authentication / authorization, multi-user features.
- Filtering, searching, sorting controls, drag-and-drop, optimistic updates, offline support, i18n, theming /
  dark mode, visual design system beyond clean defaults.
- End-to-end browser tests against a running backend (e.g. Playwright) — optional nice-to-have, not required.
- Any change to the backend API contract.

## 3. API contract consumed (summary — source of truth is SCRUM-2 design)

| Operation | Request | Success | Errors used by UI |
|---|---|---|---|
| List | `GET /api/tasks?page={0-based}&size={n}` | 200 `{ items[], page, size, totalElements, totalPages }`, newest first | 400, 5xx |
| Get | `GET /api/tasks/{id}` | 200 task | 404, 5xx |
| Create | `POST /api/tasks` body `{ title, description?, status?, dueDate? }` | 201 task | 400 (`fieldErrors`), 5xx |
| Update | `PUT /api/tasks/{id}` body `{ title, description, status, dueDate }` | 200 task | 400 (`fieldErrors`), 404, 5xx |

Task: `id` (number), `title` (string), `description` (string \| null), `status` (`TODO` \| `IN_PROGRESS` \| `DONE`),
`createdAt` (ISO-8601 instant), `dueDate` (`yyyy-MM-dd` \| null).
Error body: `{ timestamp, status, error, message, path, fieldErrors: [{ field, message }] }`.
Field rules: `title` required, trimmed, 1–200 chars; `description` optional, max 2000 chars; `status` required on
update, defaults to `TODO` on create; `dueDate` optional date, past dates allowed.

## 4. Acceptance criteria

### Task list
- **SCRUM-1-AC-01** — **List view:** on load, the app requests `GET /api/tasks` and shows each returned task
  with its `title`, `status` (human-readable label, e.g. "In progress") and `dueDate` (or a "No due date"
  placeholder when null), in the order returned by the API (newest first).
- **SCRUM-1-AC-02** — **Paging:** the list requests a fixed page size (20) and shows the current page and total
  pages; "Previous"/"Next" controls load the adjacent page via the `page` query parameter. "Previous" is disabled
  on the first page and "Next" is disabled on the last page; paging controls are hidden when `totalPages` ≤ 1.
- **SCRUM-1-AC-03** — **Empty state:** when the API returns zero tasks, the list shows an explicit empty-state
  message (e.g. "No tasks yet") with a call to action to create a task, instead of an empty table or an error.

### Create & edit forms
- **SCRUM-1-AC-04** — **Create form:** a "New task" action opens a form with fields `title` (text),
  `description` (multi-line), `status` (select, default `TODO`) and `dueDate` (date input, optional). Submitting a
  valid form sends `POST /api/tasks` with `title` trimmed, empty `description`/`dueDate` sent as `null`, and on
  201 returns the user to the list, where the new task is visible (list reloaded, first page).
- **SCRUM-1-AC-05** — **Edit form prefilled:** each task in the list has an "Edit" action that loads
  `GET /api/tasks/{id}` and shows the same form prefilled with the task's current `title`, `description`,
  `status` and `dueDate`.
- **SCRUM-1-AC-06** — **Edit submit:** submitting a valid edit form sends `PUT /api/tasks/{id}` with all four
  mutable fields (status always included) and on 200 returns the user to the list showing the updated values.
  A "Cancel" action on create/edit returns to the list without sending a request.
- **SCRUM-1-AC-07** — **Client-side validation:** before any request is sent, the form blocks submission and
  shows an inline message next to the field when: `title` is empty or whitespace-only; `title` exceeds 200
  characters (after trimming); `description` exceeds 2000 characters. Past due dates are accepted.
- **SCRUM-1-AC-08** — **Server validation errors:** if the API responds 400 with `fieldErrors`, each entry is
  shown inline next to the matching form field (`title`, `description`, `status`, `dueDate`); entries for
  unknown fields, or a 400 without `fieldErrors`, are shown as a form-level error using the response `message`.
  The user's input is preserved.

### Loading & error states
- **SCRUM-1-AC-09** — **Loading indicators:** while the list or the edit-form task is being fetched, a visible
  loading indicator is shown (exposed to assistive tech, e.g. `role="status"`). While a create/edit submission
  is in flight, the submit button is disabled and indicates progress, preventing double submission.
- **SCRUM-1-AC-10** — **Error state with retry:** if loading the list or the task fails due to a network error
  (backend unreachable / CORS failure) or a 5xx response, an error message is shown (generic, user-friendly; no
  stack traces or raw response bodies) with a "Retry" action that re-issues the request. A failed submission
  (network/5xx) shows a form-level error, keeps the user's input, and allows resubmitting.
- **SCRUM-1-AC-11** — **Not found on edit:** if `GET` or `PUT /api/tasks/{id}` returns 404 (e.g. the task was
  deleted elsewhere, or the URL has an unknown id), the UI shows a "Task not found" message with a link back to
  the list; no form with stale data is submitted.
- **SCRUM-1-AC-12** — **Navigable views:** list, create and edit views have distinct URLs (e.g. `/`,
  `/tasks/new`, `/tasks/:id/edit`) so they survive a browser refresh and the browser Back button works; a
  non-numeric `:id` is treated as not found (AC-11).

### Integration & configuration
- **SCRUM-1-AC-13** — **Configurable API base URL:** the backend base URL is read from the Vite environment
  variable `VITE_API_BASE_URL` (default `http://localhost:8080` for local development); changing it requires no
  code change. The variable and its default are documented in `frontend/.env.example` and the README.
- **SCRUM-1-AC-14** — **Works with backend CORS default:** the Vite dev server runs on port **5173** (the
  backend's default allowed origin `http://localhost:5173`), so with the SCRUM-2 backend running with default
  configuration a developer can list, create and edit tasks from the browser without any backend config change
  or proxy.

## 5. Non-functional requirements

- **SCRUM-1-NFR-01** — **Stack:** React (current major) + TypeScript (`strict` mode) + Vite, located in
  `frontend/` at the repo root; the backend layout is not changed.
- **SCRUM-1-NFR-02** — **Runtime/tooling:** Node.js **22** LTS; npm with a committed `package-lock.json`;
  `npm ci` installs reproducibly. The required Node version is declared (`engines` and/or `.nvmrc`).
- **SCRUM-1-NFR-03** — **Scripts:** `npm run dev`, `npm run build` (type-check + production build to
  `frontend/dist`), `npm test` (non-watch), `npm run lint`, `npm run typecheck` all exist and succeed on a clean
  checkout.
- **SCRUM-1-NFR-04** — **Tests:** component/integration tests use **Vitest** + **React Testing Library**
  (jsdom) with network-level API mocking (**MSW** or equivalent) against the SCRUM-2 contract — no real backend
  required. Tests cover AC-01..AC-13; each test name starts with the AC ID(s) it verifies
  (e.g. `SCRUM-1-AC-03: shows empty state when no tasks`), per ADR 0004.
- **SCRUM-1-NFR-05** — **Code quality:** ESLint (with React hooks rules) and `tsc --noEmit` run clean; no `any`
  in the API client types (task, page and error body are typed).
- **SCRUM-1-NFR-06** — **CI:** the GitHub Actions workflow gains a frontend job (runs on push/PR, Node 22,
  `npm ci` cache) that runs lint, typecheck, tests and build; the build fails on any failure. It uploads
  `frontend/dist` as artifact `todo-frontend-SCRUM-1-${{ github.sha }}` (and test results/reports, on failure
  too). The existing backend job keeps working unchanged.
- **SCRUM-1-NFR-07** — **Accessibility basics:** every form control has an associated `<label>`; validation
  messages are linked to their field (`aria-describedby`/`aria-invalid`); forms and list actions are fully
  usable by keyboard (tab order, Enter submits, visible focus); error and loading messages are announced
  (`role="alert"` / `role="status"`). Tests query by role/label to enforce this.
- **SCRUM-1-NFR-08** — **Docs:** README gains a frontend section: prerequisites, env vars, how to run against
  the local backend, how to test/build.
- **SCRUM-1-NFR-09** — **Build identity:** the production build embeds the Jira key and git commit (e.g.
  `VITE_APP_JIRA=SCRUM-1`, commit sha) and exposes them unobtrusively (e.g. footer or `<meta>` tag) for
  traceability per ADR 0004.

## 6. Assumptions & open questions

Decisions below are defaults taken by PM so work is not blocked; flag to PM if any should change.

- **A-01** — No authentication; the UI calls the open API directly (matches SCRUM-2 A-01).
- **A-02** — The browser calls the backend cross-origin using `VITE_API_BASE_URL` (relying on SCRUM-2 CORS),
  rather than a Vite dev proxy. A proxy may be added by the Architect only if it keeps AC-13/AC-14 true.
- **A-03** — Page size is fixed at 20 (backend default); no user-selectable page size.
- **A-04** — No delete in the UI (see Out of scope); if a task is deleted via the API, the UI handles it as
  404 (AC-11).
- **A-05** — Dates: `dueDate` is displayed and edited as a plain calendar date (no timezone conversion);
  `createdAt` need not be displayed.
- **A-06** — Status is chosen freely from the enum in the edit form; SCRUM-6 may later restrict transitions.
- **A-07** — Edits use full replacement (`PUT`), last-write-wins; no concurrency/conflict detection.
- **A-08** — Routing library and state/data-fetching approach (plain `fetch` + hooks vs. a query library) are
  Architect's choice, keeping dependencies minimal.
- **A-09** — No UI component library is required; minimal CSS is acceptable. Target browsers: current
  evergreen Chrome, Firefox, Edge, Safari.
- **A-10** — CI platform is GitHub Actions; the frontend build artifact is not deployed (SCRUM-7).
- **Open question Q-01** — Should delete be added to SCRUM-1 or a separate story? Default: separate story.
  (Non-blocking.)
- **Open question Q-02** — Should the backend eventually serve the built SPA (single deployable) or be hosted
  separately? Deferred to SCRUM-7. (Non-blocking.)

## 7. Traceability matrix

| ID | Description | Test(s) |
|---|---|---|
| SCRUM-1-AC-01 | List shows title, status label, dueDate in API order | TBD |
| SCRUM-1-AC-02 | Paging controls drive `page` param; disabled/hidden at bounds | TBD |
| SCRUM-1-AC-03 | Empty state with create call to action | TBD |
| SCRUM-1-AC-04 | Create form posts trimmed/nullable fields; returns to list | TBD |
| SCRUM-1-AC-05 | Edit form loads and prefills task | TBD |
| SCRUM-1-AC-06 | Edit submit PUTs all fields; cancel sends nothing | TBD |
| SCRUM-1-AC-07 | Client-side validation mirrors backend rules | TBD |
| SCRUM-1-AC-08 | Server `fieldErrors` shown inline; form-level fallback | TBD |
| SCRUM-1-AC-09 | Loading indicators; submit disabled while in flight | TBD |
| SCRUM-1-AC-10 | Network/5xx error state with retry; input preserved | TBD |
| SCRUM-1-AC-11 | 404 on edit shows "Task not found" | TBD |
| SCRUM-1-AC-12 | Distinct URLs for list/create/edit; refresh & Back work | TBD |
| SCRUM-1-AC-13 | API base URL from `VITE_API_BASE_URL` | TBD |
| SCRUM-1-AC-14 | Dev server on 5173 works with backend CORS default | TBD |
| SCRUM-1-NFR-01 | React + TypeScript (strict) + Vite in `frontend/` | TBD |
| SCRUM-1-NFR-02 | Node 22; lockfile; `npm ci` | TBD |
| SCRUM-1-NFR-03 | dev/build/test/lint/typecheck scripts | TBD |
| SCRUM-1-NFR-04 | Vitest + Testing Library + MSW; AC-prefixed test names | TBD |
| SCRUM-1-NFR-05 | ESLint + `tsc --noEmit` clean; typed API client | TBD |
| SCRUM-1-NFR-06 | CI frontend job; `todo-frontend-SCRUM-1-<sha>` artifact | TBD |
| SCRUM-1-NFR-07 | Accessibility basics (labels, keyboard, announcements) | TBD |
| SCRUM-1-NFR-08 | README frontend section | TBD |
| SCRUM-1-NFR-09 | Build embeds Jira key + commit | TBD |
