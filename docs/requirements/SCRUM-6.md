# SCRUM-6 — Task Status Management: Refined Requirements

| Field | Value |
|---|---|
| Jira key | [SCRUM-6](https://suranagivinod.atlassian.net/browse/SCRUM-6) |
| Type / Priority | Story / Medium |
| Parent epic | SCRUM-5 — Build a To-Do Application (Spring Boot, React, PostgreSQL, REST APIs) |
| Depends on | SCRUM-2 — Spring Boot Backend Setup (done, merged) — contract in [`docs/architecture/SCRUM-2-design.md`](../architecture/SCRUM-2-design.md) §5–6; SCRUM-1 — React Frontend Setup (done, merged) — [`docs/architecture/SCRUM-1-design.md`](../architecture/SCRUM-1-design.md) |
| Branch | `feature/SCRUM-6-task-status-management` |
| Author role | Product Manager (PM → Architect → Dev pipeline) |
| Status | Draft — ready for architecture |

**Traceability:** Every requirement in this document has a stable ID (`SCRUM-6-AC-xx`, `SCRUM-6-NFR-xx`).
Design docs, code, tests and commits for this story must reference these IDs (commits also carry `Refs: SCRUM-6`),
following [ADR 0004](../adr/0004-traceability-conventions.md): backend test classes carry `@Tag("SCRUM-6")` and
`@DisplayName`s starting with the AC ID; frontend test names start with the AC ID (as in SCRUM-1). The
traceability table in section 7 maps each ID to the test(s) that verify it and is completed by Dev.

---

## 1. Problem statement

Tasks already have a `status` (`TODO` | `IN_PROGRESS` | `DONE`) that is stored in PostgreSQL and can be changed
— but only by opening the full edit form and re-submitting every field (`PUT /api/tasks/{id}`). There is no way
to see only the tasks in a given state. Users who want to track progress therefore have to open each task to
move it along and scan the whole list to find what is still open.

This story makes status a first-class, fast interaction: change a task's status directly from the list with a
dedicated partial-update endpoint, and filter the list by status (server-side, combined with paging, reflected
in the URL). Earlier stories (SCRUM-2 A-05/A-06, SCRUM-1 A-06) deferred "status workflow / transition rules" to
this story; the PM decision is to **not** introduce transition restrictions (see A-01).

Jira acceptance criteria (verbatim) and where they are refined:

| Jira AC | Refined in |
|---|---|
| Support TODO, IN_PROGRESS, and DONE statuses. | AC-01, AC-02, AC-05 (enum already exists — SCRUM-2; confirmed unchanged, no transition rules) |
| Allow status updates from the UI. | AC-08..AC-11 (quick change from list); existing edit form kept (NFR-01) |
| Provide task filtering by status. | AC-05..AC-07 (backend), AC-12..AC-15 (frontend) |
| Persist status changes in the backend. | AC-01..AC-04, AC-17 |

## 2. Scope

### In scope
- **Backend:** dedicated partial-update endpoint `PATCH /api/tasks/{id}/status` with body `{ "status": … }`.
- **Backend:** optional `status` query parameter on `GET /api/tasks` (single value), combined with existing
  paging and ordering; invalid value → 400.
- **Backend:** CORS allows `PATCH` (currently `GET, POST, PUT, DELETE, OPTIONS` only) so the SPA can call the
  new endpoint cross-origin.
- **Frontend:** per-row status control in the task list that changes status without opening the edit form.
- **Frontend:** status filter control on the list ("All" + the three statuses), reflected in the URL
  (`?status=`), combined with paging, with a filter-aware empty state.
- Tests on both sides, including a Testcontainers integration test proving status changes persist and that
  filtering works against real PostgreSQL.

### Out of scope
- **Status transition rules / workflow** (e.g. forbidding `DONE → TODO`) — explicitly not introduced (A-01).
- **Delete in the UI** — still a separate future story (SCRUM-1 Q-01).
- **Bulk status updates** (select many → set status), "mark all done", drag-and-drop / kanban board.
- **Counts per status** (e.g. "To do (5)") — needs an extra aggregate query/endpoint and UI; deferred (Q-01).
- **Multi-value filtering** (`status=TODO&status=IN_PROGRESS`), search, sorting controls, other filters.
- New statuses, status history/audit trail, `updatedAt`/`completedAt` timestamps, optimistic concurrency.
- Optimistic UI updates (the UI waits for the server response — A-05), undo.
- Authentication / multi-user; deployment (SCRUM-7).
- Changing the existing `PUT`/`POST`/`GET {id}`/`DELETE` behaviour or response shapes (NFR-01).

## 3. API contract changes (summary — source of truth will be the SCRUM-6 design)

| Operation | Request | Success | Errors |
|---|---|---|---|
| **New:** change status | `PATCH /api/tasks/{id}/status` body `{ "status": "TODO" \| "IN_PROGRESS" \| "DONE" }` | 200 full task (`TaskResponse`) | 400 (missing/null/unknown status, malformed JSON, non-numeric id), 404, 415 |
| **Extended:** list | `GET /api/tasks?page=&size=&status=` — `status` optional, single enum value | 200 `PageResponse` (same shape), only matching tasks, `createdAt DESC, id DESC` | 400 unknown/empty `status` value (plus existing paging errors) |
| Unchanged | `POST`, `GET {id}`, `PUT {id}`, `DELETE {id}` | as SCRUM-2 | as SCRUM-2 |

All errors use the standard `ApiError` body (SCRUM-2-AC-13, ADR 0003).

**Why a single optional `status` value (not repeated params):** the Jira AC asks for filtering *by status*; the
UI need is a single "show me X" selector with an "All" option, which maps 1:1 to one optional value. It keeps
the contract, validation and tests minimal and the URL readable (`?status=DONE`). Multi-value filtering can be
added later in a backward-compatible way (accepting a repeated param is a superset of a single one), so nothing
is lost by starting simple.

## 4. Acceptance criteria

### Backend

#### Status change endpoint
- **SCRUM-6-AC-01** — **Change status:** `PATCH /api/tasks/{id}/status` with body `{"status":"<value>"}` where
  value is `TODO`, `IN_PROGRESS` or `DONE` returns **200 OK** with the full updated task (same `TaskResponse`
  shape as `GET /api/tasks/{id}`). Only `status` changes; `title`, `description`, `dueDate`, `id`, `createdAt`
  are unchanged. Unknown extra fields in the body (e.g. `title`) are ignored and never applied.
- **SCRUM-6-AC-02** — **Any transition allowed and idempotent:** every from→to combination of the three
  statuses (including backwards, e.g. `DONE → TODO`, and same → same) succeeds with 200. Setting the status a
  task already has is a successful no-op.
- **SCRUM-6-AC-03** — **Status change errors:** missing `status`, `"status": null`, a value outside the enum
  (incl. wrong case such as `"done"`), or malformed JSON → **400** with the standard error body (validation
  failures carry a `fieldErrors` entry for `status`); unknown id → **404**; non-numeric id → **400**;
  non-JSON content type → **415**. On any error the stored task is unchanged.
- **SCRUM-6-AC-04** — **CORS for PATCH:** a preflight `OPTIONS` for `PATCH /api/tasks/{id}/status` from an
  allowed origin (default `http://localhost:5173`) is accepted (`Access-Control-Allow-Methods` includes
  `PATCH`); non-allowed origins still get no `Access-Control-Allow-Origin` header (SCRUM-2-AC-15 otherwise
  unchanged).

#### Filtering
- **SCRUM-6-AC-05** — **Filter by status:** `GET /api/tasks?status=<value>` returns only tasks with that
  status; `page`, `size`, `totalElements` and `totalPages` refer to the **filtered** result set; ordering stays
  `createdAt DESC, id DESC`. Paging rules from SCRUM-2 (defaults, clamp to 100, negative → 400) apply
  unchanged when combined with `status`.
- **SCRUM-6-AC-06** — **No filter = unchanged behaviour:** without `status`, `GET /api/tasks` behaves exactly
  as in SCRUM-2-AC-05 (all tasks). A filter that matches nothing returns 200 with `items: []`,
  `totalElements: 0`, `totalPages: 0`.
- **SCRUM-6-AC-07** — **Invalid filter:** a `status` value outside the enum (e.g. `?status=DONEE`,
  `?status=done`) or an empty value (`?status=`) → **400** with the standard error body whose `message` names
  the parameter (e.g. `Invalid value for parameter 'status'`). Supplying `status` more than once is not
  supported (behaviour defined by the Architect, but must not return 500).

### Frontend

#### Quick status change from the list
- **SCRUM-6-AC-08** — **Per-row status control:** each row of the task list shows the status as an
  interactive control (e.g. a `<select>` with the three human-readable labels "To do", "In progress", "Done"),
  preselected with the task's current status, with an accessible name that identifies the task
  (e.g. "Status for <title>"). The existing "Edit" action remains.
- **SCRUM-6-AC-09** — **Change sends PATCH:** choosing a different status sends
  `PATCH /api/tasks/{id}/status` with `{ "status": <value> }` (no other fields, no navigation away from the
  list). On 200 the row shows the new status. The edit form and its `PUT` are not used for this.
- **SCRUM-6-AC-10** — **In-flight & feedback:** while the PATCH for a row is in flight that row's control is
  disabled (preventing double submission) and progress is indicated accessibly; other rows stay usable. On
  success, if the list is filtered and the task no longer matches the filter, the list is reloaded so the task
  disappears from the current view (if the current page becomes empty and is beyond the new last page, the
  user sees the last non-empty page or the filter-aware empty state — AC-14).
- **SCRUM-6-AC-11** — **Status change errors:** on network/5xx/400 the row reverts to its previous status and
  an error message is announced (`role="alert"`, generic and user-friendly; no raw bodies); the user can try
  again. On 404 (task deleted elsewhere) a "Task not found" message is shown and the list is reloaded.

#### Filtering
- **SCRUM-6-AC-12** — **Filter control:** the list page has a labelled status filter ("Status") with options
  "All" (default), "To do", "In progress", "Done". Selecting a status requests `GET /api/tasks?status=<value>`
  (page 0) and shows only matching tasks; "All" requests without `status`.
- **SCRUM-6-AC-13** — **Filter in the URL:** the selected filter is reflected in the list URL as
  `?status=<ENUM>` (e.g. `/?status=IN_PROGRESS`), combined with paging (`/?status=DONE&page=2`). Loading such a
  URL directly (refresh, bookmark, Back/Forward) restores the filter and page. Changing the filter resets to
  page 1. Paging controls keep the filter. An unknown/invalid `status` in the URL is treated as "All" (mirrors
  the SCRUM-1 `page` param handling) and no invalid value is sent to the API.
- **SCRUM-6-AC-14** — **Filter-aware empty state:** when a filtered result is empty, the list shows a message
  naming the filter (e.g. "No tasks with status Done") with an action to clear the filter (show all), instead
  of the SCRUM-1 "No tasks yet" message (which remains for the unfiltered empty case).
- **SCRUM-6-AC-15** — **Context preserved across edit:** navigating from a filtered/paged list to the edit
  form and back (submit or cancel) returns to the same filter and page (extends SCRUM-1's `returnTo`
  behaviour to include `status`).

### Cross-cutting
- **SCRUM-6-AC-16** — **Edit form still sets status:** creating and editing tasks via the existing forms
  (`POST`/`PUT` incl. `status`) keeps working unchanged; a status changed from the list is shown prefilled when
  the task's edit form is opened.
- **SCRUM-6-AC-17** — **Persistence verified end-to-end:** an integration test against real PostgreSQL 16
  (Testcontainers) shows that a status changed via `PATCH` is returned by a subsequent `GET /api/tasks/{id}`
  and by `GET /api/tasks?status=<new>` (and no longer by `?status=<old>`), with other fields unchanged.

## 5. Non-functional requirements

- **SCRUM-6-NFR-01** — **Backward compatibility:** the SCRUM-2 API contract and SCRUM-1 UI behaviour are
  preserved: existing endpoints, request/response shapes, status codes and error body unchanged; all existing
  SCRUM-1 and SCRUM-2 tests pass. Existing tests may only be changed where this story intentionally changes
  behaviour (e.g. SCRUM-2-AC-15 CORS method list, list-row markup now containing a status control), and such
  changes are called out in the design and the PR. The existing `PATCH /api/tasks/{id}` → 405 behaviour
  (SCRUM-2-AC-13 test) stays, since the new endpoint is the `/status` sub-resource.
- **SCRUM-6-NFR-02** — **No schema migration expected:** the `status` column and its CHECK constraint already
  exist (V1). If the Architect adds an index on `status` (or `(status, created_at)`) it must be a new versioned
  Flyway migration (`V2__…`), never an edit to V1 (SCRUM-2-NFR-04).
- **SCRUM-6-NFR-03** — **Backend tests:** service, web-slice (`@WebMvcTest`) and Testcontainers integration
  tests cover AC-01..AC-07 and AC-17; classes `@Tag("SCRUM-6")` (or methods, where added to existing classes),
  `@DisplayName` starting with the AC ID. The existing JaCoCo gate (service + controller ≥ 80 % lines) still
  passes.
- **SCRUM-6-NFR-04** — **Frontend tests:** Vitest + Testing Library + MSW tests cover AC-08..AC-16; test names
  start with the AC ID; queries by role/label (accessibility). The existing frontend coverage gate still
  passes; the API client function for the PATCH and the list `status` param are typed (no `any`).
- **SCRUM-6-NFR-05** — **CI green for both jobs:** the backend (`build`) and `frontend` jobs in
  `.github/workflows/ci.yml` both pass on the branch/PR; lint, typecheck, tests, coverage gates and builds pass.
- **SCRUM-6-NFR-06** — **Accessibility:** the per-row status control and the filter have accessible names,
  are operable by keyboard, and status changes/errors are announced (`role="status"` / `role="alert"`),
  consistent with SCRUM-1-NFR-07.
- **SCRUM-6-NFR-07** — **Traceability (ADR 0004):** commits `SCRUM-6: [ROLE] …` with `Refs: SCRUM-6`; tests
  reference SCRUM-6 AC IDs; design doc `docs/architecture/SCRUM-6-design.md`; matrix
  `docs/traceability/SCRUM-6.md` filled by Dev; PR titled `SCRUM-6: Task Status Management` linking Jira,
  requirements, design and matrix. Whether build identity / CI artifact names switch from `SCRUM-1`/`SCRUM-2`
  to `SCRUM-6` is decided by the Architect (Q-03).
- **SCRUM-6-NFR-08** — **Performance sanity:** filtering is done in the database (query by status with
  paging), never by loading all tasks and filtering in memory (backend or frontend).
- **SCRUM-6-NFR-09** — **Docs:** README endpoint list documents `PATCH /api/tasks/{id}/status` and the
  `status` query parameter; the frontend section mentions the status filter and `?status=` URL.

## 6. Assumptions & open questions

Decisions below are defaults taken by PM so work is not blocked; flag to PM if any should change.

- **A-01** — **No transition rules:** any status may move to any status (incl. `DONE → TODO` to reopen). The
  Jira text only requires supporting the three statuses and updating them; it does not ask for a workflow, and
  restrictions would add friction (e.g. accidental "Done" could not be undone) with no stated business need.
  This settles the deferral in SCRUM-2 A-06 / SCRUM-1 A-06.
- **A-02** — The status set stays exactly `TODO`, `IN_PROGRESS`, `DONE` (no new statuses, no DB change).
- **A-03** — The dedicated endpoint is a sub-resource `PATCH /api/tasks/{id}/status` returning the full task
  (200 + body, not 204) so the UI can render the server state without a second request. A generic
  `PATCH /api/tasks/{id}` (JSON Merge Patch) is not added.
- **A-04** — Filtering supports a single optional status value (see §3 rationale); the filter value in the API
  is the enum name, case-sensitive, consistent with request bodies.
- **A-05** — The UI is pessimistic: it shows the new status after the server confirms (with a per-row pending
  state); on failure it keeps/reverts to the old value. No optimistic update or undo.
- **A-06** — Last-write-wins; no concurrency/conflict detection between the quick change and an open edit
  form (consistent with SCRUM-1 A-07). Concretely, an edit form opened before a quick change will overwrite the
  status on submit — accepted.
- **A-07** — The per-row control is a native `<select>` (or equivalent accessible control) — exact widget and
  styling are Architect/Dev choice within NFR-06; no UI library is added.
- **A-08** — The filter is a single-select control, page size stays 20 (SCRUM-1 A-03), filter is not
  persisted beyond the URL (no local storage).
- **A-09** — No `updatedAt`/`completedAt` timestamps are introduced; `createdAt` ordering is unchanged.
- **Open question Q-01** — Should the list show counts per status (e.g. tabs "To do (5)")? Default: not in
  this story (needs an aggregate endpoint); candidate follow-up. (Non-blocking.)
- **Open question Q-02** — Is multi-status filtering (e.g. "not done" = `TODO` + `IN_PROGRESS`) needed?
  Default: no; can be added backward-compatibly via a repeated `status` param. (Non-blocking.)
- **Open question Q-03** — Should the jar `X-Jira-Issue`/`build.jira`, frontend build identity and CI artifact
  names be bumped to `SCRUM-6` for builds of this branch, or stay as-is until a per-branch derivation exists?
  Default: Architect decides; must remain consistent with ADR 0004. (Non-blocking.)

## 7. Traceability matrix

| ID | Description | Test(s) |
|---|---|---|
| SCRUM-6-AC-01 | `PATCH /api/tasks/{id}/status` → 200 full task; only status changes | TBD |
| SCRUM-6-AC-02 | Any transition allowed (incl. backwards); same→same is no-op 200 | TBD |
| SCRUM-6-AC-03 | PATCH errors: 400 missing/null/unknown/malformed, 404, 415; task unchanged | TBD |
| SCRUM-6-AC-04 | CORS preflight allows `PATCH` for allowed origins | TBD |
| SCRUM-6-AC-05 | `GET /api/tasks?status=` filters with paging/ordering on filtered set | TBD |
| SCRUM-6-AC-06 | No `status` = SCRUM-2 behaviour; no matches → empty page | TBD |
| SCRUM-6-AC-07 | Invalid/empty `status` filter → 400 standard body | TBD |
| SCRUM-6-AC-08 | Per-row status control with accessible name, current value preselected | TBD |
| SCRUM-6-AC-09 | Changing row status sends PATCH only; row shows new status | TBD |
| SCRUM-6-AC-10 | Row disabled while in flight; filtered list reloads after change | TBD |
| SCRUM-6-AC-11 | Error reverts row and announces; 404 shows not found and reloads | TBD |
| SCRUM-6-AC-12 | Filter control (All/To do/In progress/Done) drives `status` param | TBD |
| SCRUM-6-AC-13 | Filter in URL `?status=`, combined with `page`; invalid → All | TBD |
| SCRUM-6-AC-14 | Filter-aware empty state with clear-filter action | TBD |
| SCRUM-6-AC-15 | Edit/cancel returns to same filter and page | TBD |
| SCRUM-6-AC-16 | Create/edit forms still set status; quick change visible in edit form | TBD |
| SCRUM-6-AC-17 | Testcontainers: PATCHed status persists and is reflected by filter | TBD |
| SCRUM-6-NFR-01 | Backward compatible with SCRUM-1/SCRUM-2; existing tests pass | TBD |
| SCRUM-6-NFR-02 | No schema change; any index via new Flyway migration only | TBD |
| SCRUM-6-NFR-03 | Backend tests tagged SCRUM-6, AC-prefixed; JaCoCo gate passes | TBD |
| SCRUM-6-NFR-04 | Frontend Vitest/RTL/MSW tests, AC-prefixed; typed client; coverage gate | TBD |
| SCRUM-6-NFR-05 | CI `build` and `frontend` jobs green | TBD |
| SCRUM-6-NFR-06 | Accessible status control and filter; announcements | TBD |
| SCRUM-6-NFR-07 | ADR 0004 conventions; design doc, matrix, PR | TBD |
| SCRUM-6-NFR-08 | Filtering done in the database, not in memory | TBD |
| SCRUM-6-NFR-09 | README documents PATCH endpoint, `status` param, UI filter | TBD |
