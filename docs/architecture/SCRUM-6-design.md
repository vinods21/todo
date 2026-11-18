# SCRUM-6 — Task Status Management: Solution Design

| Field | Value |
|---|---|
| Jira key | [SCRUM-6](https://suranagivinod.atlassian.net/browse/SCRUM-6) (epic SCRUM-5) |
| Requirements | [`docs/requirements/SCRUM-6.md`](../requirements/SCRUM-6.md) — `SCRUM-6-AC-01..17`, `SCRUM-6-NFR-01..09`, assumptions `A-01..A-09`, questions `Q-01..Q-03` |
| Builds on | [SCRUM-2 design](SCRUM-2-design.md) (backend contract §5, errors §6), [SCRUM-1 design](SCRUM-1-design.md) (frontend §4–§9) |
| Branch | `feature/SCRUM-6-task-status-management` |
| Author role | Architect (PM → Architect → Dev pipeline) |
| ADRs | **new** [0008](../adr/0008-ci-derived-build-identity.md) CI-derived build identity (answers Q-03, supersedes part of [0004](../adr/0004-traceability-conventions.md)), **new** [0009](../adr/0009-status-sub-resource-patch.md) status sub-resource `PATCH` + filter contract; unchanged: 0001–0003, 0005–0007 |
| Traceability matrix | [`docs/traceability/SCRUM-6.md`](../traceability/SCRUM-6.md) (template; Dev fills it) |
| Status | Ready for Dev |

All requirement IDs refer to `docs/requirements/SCRUM-6.md`. Assumptions A-01..A-09 are accepted as-is (no
transition rules, single-value filter, pessimistic UI, last-write-wins, native `<select>`). Q-01 and Q-02 stay
out of scope (the filter contract below is forward-compatible with Q-02). **Q-03 is decided in ADR 0008** (§9).

Workspace constraints (unchanged): the backend cannot be built in the authoring workspace (Maven Central is
blocked) — GitHub Actions is the first compile/test. The frontend can be built and tested locally.

---

## 1. Change overview

```
 Browser SPA (frontend/)                                         todo-backend (Spring Boot 4.1.2)
 ┌──────────────────────────────────────────────┐               ┌───────────────────────────────────────────────┐
 │ TaskListPage  ── StatusFilter (?status=)      │  GET /api/tasks?page&size&status  ─►  TaskController.list      │
 │   └ TaskTable ── StatusSelect (per row) ──────┼─ PATCH /api/tasks/{id}/status ───►  TaskController.updateStatus│
 │ params.ts (page+status ⇄ URL, returnTo)       │  (CORS preflight now allows PATCH)   TaskService.updateStatus  │
 │ api/tasks.ts listTasks({page,status}),        │                                      TaskService.listByStatus  │
 │              updateTaskStatus(id,status)      │                                      TaskRepository.findByStatus│
 └──────────────────────────────────────────────┘               │ Flyway V2: index (status, created_at, id)     │
 CI: identity job → JIRA_KEY → build (-Djira.issue) + frontend (env JIRA_KEY)   (ADR 0008)                      │
```

No new runtime or dev dependencies on either side. No change to existing endpoints, DTOs or error body
(NFR-01).

## 2. Backend

### 2.1 Files

| File (under `src/main/…/com/vinods21/todo/`) | Change |
|---|---|
| `web/dto/TaskStatusUpdateRequest.java` | **new** record |
| `web/InvalidQueryParameterException.java` | **new** `RuntimeException` carrying the parameter name |
| `web/TaskController.java` | **add** `updateStatus` (`PATCH /{id}/status`); **extend** `list` with `status` |
| `web/error/GlobalExceptionHandler.java` | **add** `@ExceptionHandler(InvalidQueryParameterException.class)` → 400 |
| `service/TaskService.java` | **add** `updateStatus(long, TaskStatus)`, `listByStatus(int, int, TaskStatus)` |
| `repository/TaskRepository.java` | **add** `Page<Task> findByStatus(TaskStatus status, Pageable pageable)` |
| `config/WebConfig.java` | **add** `"PATCH"` to `allowedMethods` |
| `src/main/resources/db/migration/V2__add_tasks_status_index.sql` | **new** migration (§2.7) |
| `pom.xml` | `jira.issue` default → `UNKNOWN`; surefire system property (§9) |

`Task`, `TaskStatus`, `TaskResponse`, `PageResponse`, `TaskCreateRequest`, `TaskUpdateRequest`, `ApiError`, V1:
**unchanged**.

### 2.2 `TaskStatusUpdateRequest` (AC-01, AC-03)

```java
/** Body of PATCH /api/tasks/{id}/status (SCRUM-6-AC-01). Unknown fields such as "title" are ignored, never applied. */
@JsonIgnoreProperties(ignoreUnknown = true)                       // com.fasterxml.jackson.annotation (stays there in Jackson 3)
public record TaskStatusUpdateRequest(@NotNull @JsonProperty("status") TaskStatus status) { }
```

- `@JsonProperty` on the single component pins Jackson to a **properties-based** creator, so a bare JSON
  string body (`"DONE"`) is a 400, not silently accepted as a delegating creator.
- Enum parsing is Jackson's default: exact, case-sensitive constant names (`"done"`, `"DONEE"` → 400) — same as
  the existing `PUT`/`POST` bodies. Do not enable `ACCEPT_CASE_INSENSITIVE_ENUMS`.

### 2.3 Controller

```java
/** SCRUM-6-AC-01..AC-03: change only the status; returns the full task. */
@PatchMapping("/{id}/status")
public TaskResponse updateStatus(@PathVariable("id") long id, @Valid @RequestBody TaskStatusUpdateRequest request) {
    return TaskResponse.from(taskService.updateStatus(id, request.status()));
}

/** SCRUM-2-AC-05 + SCRUM-6-AC-05..AC-07: optional single-valued status filter. */
@GetMapping
public PageResponse<TaskResponse> list(
        @RequestParam(name = "page", defaultValue = "0") @Min(0) int page,
        @RequestParam(name = "size", defaultValue = "20") @Min(1) int size,
        @RequestParam(name = "status", required = false) String[] status) {
    int effectiveSize = Math.min(size, MAX_PAGE_SIZE);
    TaskStatus filter = parseStatusFilter(status);            // null = no filter
    Page<Task> result = filter == null
            ? taskService.list(page, effectiveSize)            // SCRUM-2 path, unchanged call
            : taskService.listByStatus(page, effectiveSize, filter);
    return PageResponse.from(result.map(TaskResponse::from));
}

/** SCRUM-6-AC-07: exactly one value that is exactly an enum constant name; anything else → 400. */
static TaskStatus parseStatusFilter(String[] values) {
    if (values == null) return null;                                         // parameter absent
    if (values.length != 1) throw new InvalidQueryParameterException("status"); // "", repeated, "A,B"
    for (TaskStatus s : TaskStatus.values()) if (s.name().equals(values[0])) return s;
    throw new InvalidQueryParameterException("status");                      // "done", "DONEE", ...
}
```

Keep the controller **without** class-level `@Validated` (see the existing Javadoc — built-in method validation
must stay active for `@Min`). `@PatchMapping` has no `consumes`: like `POST`/`PUT`, a non-JSON body yields
`HttpMediaTypeNotSupportedException` → 415.

**Why `String[]` and an explicit parser instead of `TaskStatus status`** (verified against Spring's binding
code — this is the trap to avoid):

| Request | `TaskStatus status` binding (rejected) | `String[] status` + `parseStatusFilter` (chosen) |
|---|---|---|
| no `status` | `null` → all ✔ | `null` → all ✔ |
| `?status=DONE` | DONE ✔ | `["DONE"]` → DONE ✔ |
| `?status=done` / `DONEE` | `MethodArgumentTypeMismatchException` → 400 ✔ | 400 ✔ |
| `?status=` (empty) | **`null` → silently unfiltered** — both `StringToEnumConverterFactory` and `TypeConverterDelegate` map an empty enum string to `null`, and `required=false` accepts it ✘ violates AC-07 | `String→String[]` conversion gives `[]` → 400 ✔ |
| `?status=TODO&status=DONE` | `ArrayToObjectConverter` silently takes the **first** value ✘ (not a 500, but hidden behaviour) | `["TODO","DONE"]` → 400 ✔ |
| `?status=TODO,DONE` | 400 | `["TODO","DONE"]` → 400 ✔ |

**Repeated `status` decision (AC-07 "behaviour defined by the Architect"):** 400 with the standard body. This is
forward-compatible with Q-02 — accepting several values later turns a 400 into a 200 for the same request,
whereas "first value wins" would later have to change the result of an already-successful request.

Whitespace note: Spring's `String→String[]` conversion trims elements, so `?status=%20DONE` is accepted as
`DONE`. This leniency is harmless and **must not be pinned by tests** either way.

### 2.4 Error mapping (verified against `GlobalExceptionHandler`)

| Situation | Exception reaching the handler | Status | `message` | `fieldErrors` | AC |
|---|---|---|---|---|---|
| PATCH body `{}` or `{"status":null}` | `MethodArgumentNotValidException` (`handleMethodArgumentNotValid`) | 400 | `Validation failed` | `[{"field":"status","message":"must not be null"}]` | 03 |
| PATCH `{"status":"done"}` / `"DONEE"` | `HttpMessageNotReadableException` caused by Jackson 3 `InvalidFormatException` (a `DatabindException`, not a `StreamReadException`) | 400 | `Invalid value for field 'status'` | `[{"field":"status","message":"invalid value"}]` | 03 |
| PATCH malformed JSON `{"status":` | `HttpMessageNotReadableException` caused by `StreamReadException` | 400 | `Malformed JSON request` | `[]` | 03 |
| PATCH bare string `"DONE"` / empty body | `HttpMessageNotReadableException` (mismatched input, no property path / missing body) | 400 | `Malformed JSON request` | `[]` | 03 |
| PATCH `/api/tasks/abc/status` | `MethodArgumentTypeMismatchException` (`handleTypeMismatch`) | 400 | `Invalid value for parameter 'id'` | `[]` | 03 |
| PATCH unknown id | `TaskNotFoundException` | 404 | `Task with id 99 not found` | `[]` | 03 |
| PATCH `Content-Type: text/plain` | `HttpMediaTypeNotSupportedException` | 415 | `Content type 'text/plain' is not supported` | `[]` | 03 |
| `GET ?status=DONEE` / `done` / empty / repeated / `A,B` | **`InvalidQueryParameterException`** (new, own `@ExceptionHandler`) | 400 | `Invalid value for parameter 'status'` | `[]` | 07 |
| `GET ?status=DONE&page=-1` | `HandlerMethodValidationException` (unchanged; runs before the method body) | 400 | `Validation failed` | `[{"field":"page",…}]` | 05 |
| `PATCH /api/tasks/1` (no `/status`) | `HttpRequestMethodNotSupportedException` — **unchanged** SCRUM-2-AC-13 test | 405 | `Request method 'PATCH' is not supported` | `[]` | NFR-01 |

The new handler mirrors `handleTypeMismatch` exactly (same message template, empty `fieldErrors`), so a client
sees the same shape whether a query parameter has the wrong type or a disallowed value:

```java
@ExceptionHandler(InvalidQueryParameterException.class)
public ResponseEntity<ApiError> handleInvalidQueryParameter(InvalidQueryParameterException ex, HttpServletRequest request) {
    ApiError body = ApiError.of(HttpStatus.BAD_REQUEST, "Invalid value for parameter '" + ex.getParameterName() + "'",
            request.getRequestURI(), List.of());
    return ResponseEntity.badRequest().body(body);
}
```

`InvalidQueryParameterException` lives in `web` (thrown by the controller only); it never copies the raw value
into the message (SCRUM-2-AC-14 leak rule). Because body validation runs during argument resolution, any 400
for the PATCH happens **before** the service is called — the stored task is untouched (AC-03).

### 2.5 Service

```java
/** SCRUM-6-AC-01, AC-02: any transition allowed (A-01); same→same is a successful no-op. */
public Task updateStatus(long id, TaskStatus status) {          // class-level @Transactional (read-write)
    Objects.requireNonNull(status, "status");
    Task task = get(id);                                        // load-or-404 (TaskNotFoundException)
    task.setStatus(status);
    return taskRepository.save(task);                           // managed entity; save() kept for symmetry with update()
}

/** SCRUM-6-AC-05, NFR-08: filtering happens in the database, same ordering as list(). */
@Transactional(readOnly = true)
public Page<Task> listByStatus(int page, int size, TaskStatus status) {
    return taskRepository.findByStatus(status, PageRequest.of(page, size, DEFAULT_SORT));
}
```

`list(int, int)` is **kept unchanged** and still used for the unfiltered case, so every SCRUM-2 test that mocks
or verifies `list(page, size)` (`TaskControllerTest` lines ~140–200, `TaskServiceTest#listUsesPageSizeAndSort`)
stays valid without edits (NFR-01). No transition rules, no `updatedAt` (A-01, A-09).

### 2.6 Repository

```java
/** SCRUM-6-AC-05: WHERE status = ? with the caller's Pageable (sort createdAt DESC, id DESC) + derived count query. */
Page<Task> findByStatus(TaskStatus status, Pageable pageable);
```

A derived query (not a `Specification`): one fixed predicate, no dynamic combination needed (YAGNI); it is
type-checked at startup by Spring Data. Spring Data generates `select count(t) from Task t where t.status = ?1`
for `totalElements`.

### 2.7 Flyway V2 — decision: **add** the index

`src/main/resources/db/migration/V2__add_tasks_status_index.sql` (exact content):

```sql
-- SCRUM-6: supports status-filtered, newest-first listing (SCRUM-6-AC-05, SCRUM-6-NFR-02, SCRUM-6-NFR-08)
CREATE INDEX ix_tasks_status_created_at_id ON tasks (status, created_at DESC, id DESC);
```

Rationale: the filtered query is `WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT/OFFSET`; this index
serves predicate **and** order (index range scan, no sort) and the count. Adding it now is free (empty/small
table, plain `CREATE INDEX` inside Flyway's transaction); adding it later on a large table would need
`CREATE INDEX CONCURRENTLY`, i.e. a non-transactional Flyway migration and write-lock considerations. The V1
index `ix_tasks_created_at_id` still serves the unfiltered list. Low cardinality (3 values) is fine because the
index is composite and ordered. V1 is not edited (SCRUM-2-NFR-04, ADR 0002); `ddl-auto=validate` ignores indexes.

Consequence for an existing test: `TaskPersistenceRestartTest` asserts `count(*) … WHERE success == 1` — see
§8.3 (deliberate change).

### 2.8 CORS (AC-04)

`WebConfig`: `.allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")`. Nothing else changes
(origins, headers, `Location` exposure, max-age). Existing `CorsConfigTest` assertions use `containsString` and
stay green unchanged; a new test covers `PATCH`.

## 3. API contract delta (adds to SCRUM-2 design §5)

| # | Method & path | Request | Success | Errors | ACs |
|---|---|---|---|---|---|
| 6 | `PATCH /api/tasks/{id}/status` | `{"status":"TODO"\|"IN_PROGRESS"\|"DONE"}` (`application/json`; extra fields ignored) | **200** `TaskResponse` (full task; only `status` changed) | 400 (§2.4), 404, 415 | 01–03 |
| 3′ | `GET /api/tasks?page=&size=&status=` | `status` optional, **exactly one** exact enum name | **200** `PageResponse` of the filtered set; `totalElements`/`totalPages` refer to the filtered set; order `createdAt DESC, id DESC` | 400 `Invalid value for parameter 'status'` for unknown/wrong-case/empty/repeated/comma-separated; paging errors unchanged | 05–07 |

ADR 0009 records the endpoint shape and the filter rules.

## 4. Frontend

### 4.1 Files

| File (under `frontend/src/`) | Change |
|---|---|
| `api/types.ts` | **add** `TaskStatusUpdateRequest`, `ListTasksParams`, `isTaskStatus()` |
| `api/client.ts` | `HttpMethod` adds `'PATCH'` |
| `api/tasks.ts` | `listTasks(params, signal)` (signature change); **add** `updateTaskStatus` |
| `pages/params.ts` | **add** `parseStatusParam`, `parseListParams`, `listSearchParams`, `listPath` |
| `pages/TaskListPage.tsx` | filter, announcements, row error alert, reload/clamp logic, filter-aware empty state |
| `components/TaskTable.tsx` | status cell renders `StatusSelect`; new callback props |
| `components/StatusSelect.tsx` | **new** per-row control |
| `components/StatusFilter.tsx` | **new** list filter control |
| `index.css` | small styles (`.list-toolbar`, `.row-saving`) — optional |
| `test/handlers.ts` | GET honours `status`; **new** `PATCH /tasks/:id/status` handler |
| `vite.config.ts` | default Jira key `UNKNOWN` instead of `'SCRUM-1'` (ADR 0008) |

`useAsync`, `client.request` logic, `errors.ts`, `TaskForm`, create/edit pages: **unchanged** (edit page keeps
using `returnTarget`; only the value it receives now may contain `status`).

### 4.2 API layer

```ts
// types.ts
export interface TaskStatusUpdateRequest { status: TaskStatus }
export interface ListTasksParams { /** 0-based */ page: number; status?: TaskStatus }
export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value)
}

// tasks.ts
/** SCRUM-1-AC-01/02, SCRUM-6-AC-12: status omitted when undefined (buildUrl skips undefined). */
export function listTasks({ page, status }: ListTasksParams, signal?: AbortSignal): Promise<Page<Task>> {
  return request<Page<Task>>('GET', '/api/tasks', { query: { page, size: PAGE_SIZE, status }, signal })
}
/** SCRUM-6-AC-09: only { status } is sent. */
export function updateTaskStatus(id: number, status: TaskStatus): Promise<Task> {
  const body: TaskStatusUpdateRequest = { status }
  return request<Task>('PATCH', `/api/tasks/${id}/status`, { body })
}
```

- Query key order stays `page, size, status` → `?page=0&size=20&status=DONE`; unfiltered URLs are byte-identical
  to SCRUM-1 (existing `requestLog` assertions keep passing).
- ⚠ The method string must be upper-case `'PATCH'`: `fetch` normalises only `get/post/put/delete/head/options`;
  a lower-case `patch` would be sent verbatim and rejected by the server/CORS.
- `PATCH` is not CORS-safelisted → the browser preflights; AC-04 makes the backend allow it.
- No `AbortSignal` for the PATCH: a mutation is not cancelled when the user navigates away (results are ignored
  via `useIsMounted`).

### 4.3 URL state — `pages/params.ts` (AC-13, AC-15)

```ts
export interface ListParams { /** 1-based */ page: number; status?: TaskStatus }
/** Exact, case-sensitive enum name; anything else (incl. null/'') → undefined = "All" (mirrors parsePageParam). */
export function parseStatusParam(raw: string | null): TaskStatus | undefined
export function parseListParams(sp: URLSearchParams): ListParams          // { page: parsePageParam(...), status: parseStatusParam(...) }
/** status first, page only when > 1: {page:2,status:'DONE'} → "status=DONE&page=2"; {page:1} → "" */
export function listSearchParams(p: ListParams): URLSearchParams
export function listPath(p: ListParams): string                           // '/' or '/?' + listSearchParams(p)
```

- An invalid `?status=` value is treated as "All" and **never sent to the API**; the URL is not rewritten
  (same policy as an invalid `?page`).
- Filter change → `setSearchParams(listSearchParams({ page: 1, status }))` (push, so Back/Forward restore the
  previous filter — AC-13). Pager → `listSearchParams({ page: p + 1, status })` (keeps the filter).
- `returnTo` for Edit links = `listPath({ page, status })` (AC-15). `returnTarget()` already accepts any
  same-app path, so the edit page needs no change; Cancel and successful submit land on e.g.
  `/?status=DONE&page=2`. After **create**, navigation stays `/` (SCRUM-1 behaviour).

### 4.4 `StatusSelect` (per row — AC-08..AC-11, NFR-06)

```tsx
interface StatusSelectProps {
  task: Task
  onChanged: (updated: Task) => void                  // after a 200
  onFailed: (task: Task, error: ApiError) => void     // after any failure (already reverted)
}
```

- Native `<select aria-label={`Status for ${task.title}`}>` with the three `STATUS_LABELS` options; initial value
  `task.status`. TaskTable renders it as `<StatusSelect key={`${task.id}:${task.status}`} … />` so fresh server
  data (after a reload) resets the local state without an effect.
- `onChange(next)`: ignore if pending; remember `previous`; set value to `next` and `pending = true`;
  `await updateTaskStatus(task.id, next)`:
  - success → value = `updated.status` (server truth), `onChanged(updated)`;
  - failure → value = `previous` (**revert**), `onFailed(task, apiError)` (non-`ApiError` → `ApiError('server', 0, GENERIC_ERROR_MESSAGE)`).
  - Skip all state updates if unmounted (`useIsMounted`).
- While pending: `disabled` (prevents double submission — AC-10), `aria-busy="true"`, and a visible
  `<span id="status-saving-<id>" className="row-saving">Saving…</span>` referenced by `aria-describedby`.
  Other rows are independent components → stay enabled.
- Focus: if the select had focus when the change started, re-focus it once `pending` returns to `false`
  (browsers blur a focused element when it becomes `disabled`; keyboard users must not be dropped to `<body>`).
- Interpretation of A-05 (pessimistic): the chosen value is displayed while the request is in flight (a native
  select cannot sensibly show anything else) but nothing else reacts (no reload, no filter re-evaluation,
  no announcement) until the server confirms; on failure the row reverts (AC-11).

### 4.5 `StatusFilter` (AC-12)

`<label htmlFor="status-filter">Status</label><select id="status-filter">` with options
`'' → "All"`, then `TASK_STATUSES` → `STATUS_LABELS`. Controlled by the URL (`value={status ?? ''}`).
Rendered in a toolbar **above** the result area in every state (loading, error, empty, table) so the user can
always change/clear it. Accessible name is exactly `Status`; row controls are `Status for <title>`, so
`getByRole('combobox', { name: 'Status' })` is unambiguous.

### 4.6 `TaskListPage` behaviour

```ts
const { page, status } = parseListParams(searchParams)
const load = useCallback((signal) => listTasks({ page: page - 1, status }, signal), [page, status])
const result = useAsync(load)
const [announcement, setAnnouncement] = useState<string | null>(null)   // role="status"
const [rowError, setRowError] = useState<string | null>(null)           // role="alert"
const clampAfterChange = useRef(false)
```

| Event | Behaviour |
|---|---|
| Row change succeeded | `setRowError(null)`; `setAnnouncement(\`Status of "${t.title}" changed to ${STATUS_LABELS[t.status]}.\`)`; **if `status` (filter) is set** → `clampAfterChange.current = true; result.reload()` (the task no longer matches — AC-10). Unfiltered → no reload; the row already shows the server value. |
| Row change failed, `kind === 'not-found'` | `setRowError(\`Task not found: "${t.title}" may have been deleted.\`)`; `result.reload()` (AC-11). |
| Row change failed, `kind === 'network'` | `setRowError(\`Could not change the status of "${t.title}". ${NETWORK_ERROR_MESSAGE}\`)` (row already reverted). |
| Row change failed, anything else (5xx, 400, 405, …) | same with `GENERIC_ERROR_MESSAGE` — **never** `error.message` from a body (AC-11 "no raw bodies"). |
| New change started | clear `rowError` (user retries). |
| Reload after a filtered change returns `items: []`, `page > 1`, `totalPages > 0` | effect guarded by `clampAfterChange`: `setSearchParams(listSearchParams({ page: totalPages, status }), { replace: true })` → shows the last non-empty page (AC-10). Only after a status change — a stale bookmarked `?page=9` keeps the SCRUM-1 "This page is empty." behaviour (existing test). |
| Filter/page changes | clear `announcement` and `rowError`. |

Render (announcement/alert regions are rendered **only when non-empty**, because existing SCRUM-1 tests assert
there is exactly one `role="status"` while loading and none afterwards, and no `role="alert"` in the empty
state):

```
<h1>Tasks</h1>
<div className="list-toolbar"><StatusFilter …/></div>
{announcement && <p role="status">{announcement}</p>}
{rowError && <div role="alert">{rowError}</div>}
loading → <Loading/> | error → <ErrorPanel/> (unchanged) | success → body below
```

Success body (empty-state precedence, AC-14):

1. `items.length > 0` → `TaskTable` + `Pager` (pager uses `listSearchParams({ page: p + 1, status })`).
2. `status && totalElements === 0` → `<p>No tasks with status {STATUS_LABELS[status]}.</p>` + `<Link to="/">Show all tasks</Link>`.
3. `page === 1` → SCRUM-1 "No tasks yet." + "Create your first task" (unfiltered empty — unchanged).
4. otherwise → "This page is empty." + "Go to the first page" linking to `listPath({ page: 1, status })`.

The reload after a filtered change uses `useAsync.reload()` (the list briefly shows "Loading tasks…"); the
outcome is announced through the page-level status region, which sits outside the reloaded area. A
stale-while-revalidate `refresh()` in `useAsync` was considered and rejected for this story (extra hook
complexity for a cosmetic gain).

### 4.7 `TaskTable`

Props become `{ tasks, returnTo, onStatusChanged, onStatusFailed }`. The Status column cell renders
`StatusSelect` instead of the plain label (the label text now lives in the selected `<option>`). Column headers,
caption, Edit link and due-date rendering are unchanged.

### 4.8 MSW default handlers (`test/handlers.ts`)

- `GET /tasks`: `status` param → if present and `isTaskStatus` → filter before paging; if present and invalid →
  400 `errorBody(400, "Invalid value for parameter 'status'")` (mirrors the backend; the app never sends it).
- **new** `PATCH /tasks/:id/status`: `log(request)`, push body to `bodyLog`, 404 body if unknown id, 400 with
  `fieldErrors: [{ field: 'status', … }]` if `!isTaskStatus(body.status)`, else set `existing.status` and return
  `existing`. `requestLog` entries look like `PATCH /api/tasks/3/status`.

## 5. Accessibility (NFR-06)

- Row control: native `<select>` (keyboard-operable), accessible name `Status for <title>`, disabled +
  `aria-busy` + described by "Saving…" while in flight, focus restored afterwards.
- Filter: labelled `<select>` (`Status`).
- Announcements: success → `role="status"` (polite); failures → `role="alert"`. Messages include the task title.
- Visible focus already provided by `index.css` `:focus-visible`.

## 6. Requirement → design coverage

| ID | Design element |
|---|---|
| AC-01 | §2.2–2.5 `PATCH`, `TaskStatusUpdateRequest` (`ignoreUnknown`), `updateStatus` |
| AC-02 | §2.5 no transition rules; same→same allowed |
| AC-03 | §2.4 error matrix; validation before service call |
| AC-04 | §2.8 |
| AC-05, AC-06 | §2.3 `list`, §2.5 `listByStatus`, §2.6 `findByStatus`, §2.7 index |
| AC-07 | §2.3 `parseStatusFilter`, §2.4 `InvalidQueryParameterException`; repeated → 400 |
| AC-08..AC-11 | §4.4, §4.6, §4.7 |
| AC-12 | §4.2 `listTasks({page,status})`, §4.5 |
| AC-13 | §4.3 |
| AC-14 | §4.6 empty-state precedence |
| AC-15 | §4.3 `listPath` as `returnTo` |
| AC-16 | unchanged create/edit; edit page re-fetches on mount (§8.2 test) |
| AC-17 | §8.1 `TaskStatusIntegrationTest` |
| NFR-01 | `list(int,int)` kept; deliberate test changes listed in §8.3 only |
| NFR-02 | §2.7 V2, V1 untouched |
| NFR-03/04 | §8 |
| NFR-05 | §9 CI |
| NFR-06 | §5 |
| NFR-07 | §9, §10, ADR 0008 |
| NFR-08 | §2.6 DB query + index; frontend never filters locally |
| NFR-09 | README (Dev): `PATCH /api/tasks/{id}/status`, `status` param + 400 rules, UI filter / `?status=`; update the traceability/CI paragraphs to ADR 0008 names |

## 7. Implementation notes / gotchas for Dev

- Spring Boot 4 / Spring 7 imports as in SCRUM-2 §9 (`@MockitoBean`, `org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest`, Testcontainers 2.x `org.testcontainers.postgresql.PostgreSQLContainer`).
- MockMvc: `patch("/api/tasks/1/status")` from `MockMvcRequestBuilders` (already imported in `TaskControllerTest`).
  Repeated param: `get("/api/tasks").param("status", "TODO", "DONE")`; empty: `.param("status", "")`.
- `RestClient` supports `HttpMethod.PATCH` with the JDK `HttpClient` request factory that Boot 4 picks by
  default; the existing `call(method, uri, json)` helper pattern works. If CI reports "Invalid HTTP method:
  PATCH" (only `SimpleClientHttpRequestFactory`/`HttpURLConnection` has this limit), build the client with
  `RestClient.builder().requestFactory(new JdkClientHttpRequestFactory())`.
- React hooks v7 lint (`set-state-in-effect`): the clamp effect calls `setSearchParams` (router navigation),
  not a `useState` setter; if the rule still flags it, move the clamp into a callback driven by the reload
  result rather than disabling the rule.
- Coverage gates are unchanged (backend JaCoCo ≥ 80 % lines on `service` + `web*`; frontend 80/80/80/75).

## 8. Test plan

Conventions (ADR 0004/0007): new backend classes `@Tag("SCRUM-6")` + class `@DisplayName("SCRUM-6 …")`;
methods added to existing SCRUM-2 classes get a **method-level** `@Tag("SCRUM-6")` (JUnit merges it with the
class tag) and a `@DisplayName` starting with the SCRUM-6 ID(s). Frontend: in files that already have a
`describe('SCRUM-1 …')`, add a **second top-level** `describe('SCRUM-6 <area>')` (amends SCRUM-1 §9's "exactly
one describe per file" to "one per story per file"); every `it` name starts with the SCRUM-6 ID(s).
Run one story: `./mvnw test -Dgroups=SCRUM-6`, `npx vitest run -t 'SCRUM-6-'`.

### 8.1 Backend

| Test class (`src/test/java/com/vinods21/todo/…`) | Kind | Cases → ACs |
|---|---|---|
| `service/TaskServiceTest` (extend) | Mockito unit | `SCRUM-6-AC-01`: `updateStatus` loads, sets only status (title/description/dueDate/createdAt/id unchanged), saves, returns · `SCRUM-6-AC-02`: `@ParameterizedTest` over all 9 from→to pairs (incl. same→same) succeeds · `SCRUM-6-AC-03`: unknown id → `TaskNotFoundException`, `save` never called · `SCRUM-6-AC-05, SCRUM-6-NFR-08`: `listByStatus(2,5,DONE)` calls `findByStatus(DONE, pageable)` with page 2, size 5, sort `createdAt DESC, id DESC`, never `findAll` |
| `web/TaskControllerTest` (extend) | `@WebMvcTest` | `AC-01`: PATCH → 200 full `TaskResponse`; body `{"status":"DONE","title":"hacked"}` → service called with `(1, DONE)` only (`ArgumentCaptor`/`verify`) · `AC-03`: `{}` and `{"status":null}` → 400 `Validation failed` + `fieldErrors[0].field == "status"`; `"done"`/`"DONEE"` → 400 `Invalid value for field 'status'` + field `status`; malformed JSON and bare `"DONE"` → 400; `/api/tasks/abc/status` → 400 `Invalid value for parameter 'id'`; unknown id (service throws) → 404 standard body; `text/plain` → 415; for every 400/415 `verify(taskService, never()).updateStatus(anyLong(), any())` · `AC-05`: `?status=DONE` → `listByStatus(0,20,DONE)`, `list` never called, items/paging from the filtered page; `?status=DONE&page=1&size=150` → `listByStatus(1,100,DONE)`; `?status=DONE&page=-1` → 400 `page` field error · `AC-06`: no `status` → `list(0,20)` (existing behaviour), filter with no matches → `items: []`, `totalElements: 0`, `totalPages: 0` · `AC-07`: `@ParameterizedTest` over `DONEE`, `done`, `""`, `TODO,DONE`, and repeated `status=TODO&status=DONE` → 400, `message == "Invalid value for parameter 'status'"`, `fieldErrors` empty, service never called · `NFR-01`: existing `PATCH /api/tasks/1` → 405 test stays as-is |
| `web/CorsConfigTest` (extend) | `@WebMvcTest` | `AC-04`: preflight `OPTIONS /api/tasks/1/status` with `Access-Control-Request-Method: PATCH` from `http://localhost:5173` → 200, `Access-Control-Allow-Origin` = origin, `Access-Control-Allow-Methods` contains `PATCH`; same preflight from `http://evil.test` → no `Access-Control-Allow-Origin` |
| `TaskStatusIntegrationTest` (**new**) | `@SpringBootTest(RANDOM_PORT)` + `@Testcontainers` + `@Container @ServiceConnection PostgreSQLContainer("postgres:16-alpine")`, `RestClient`, `JdbcTemplate` cleanup per test (same pattern as `TodoApplicationIntegrationTest`) | `AC-17` (+AC-01): create task (TODO, description, dueDate) → PATCH `IN_PROGRESS` → 200 with other fields equal to the create response → `GET /api/tasks/{id}` shows `IN_PROGRESS` + same fields/`createdAt` → `?status=IN_PROGRESS` contains it, `?status=TODO` does not · `AC-02`: `DONE → TODO` (reopen) and same→same return 200 against PG · `AC-03`: PATCH `{"status":"done"}` → 400 and the row in PG (via `JdbcTemplate`) still has the old status; unknown id → 404 · `AC-05`: 5 tasks (3 DONE) → `?status=DONE&size=2` → `totalElements 3`, `totalPages 2`, newest-first; page 1 has the oldest DONE · `AC-07`: `?status=done` and repeated `status` → 400 through the full stack · `NFR-02`: `flyway_schema_history` has version `2` with `success`; `pg_indexes` contains `ix_tasks_status_created_at_id` |

JaCoCo: the new code is in `service` and `web*`, fully covered by the cases above; gate unchanged.

### 8.2 Frontend

| Test file | Top-level describe | Cases → ACs |
|---|---|---|
| `src/api/tasks.test.ts` (extend) | `SCRUM-6 tasks API` | `AC-12`: `listTasks({ page: 0, status: 'DONE' })` → `?page=0&size=20&status=DONE`; without status → no `status` key · `AC-09, NFR-04`: `updateTaskStatus(3,'IN_PROGRESS')` sends `PATCH /api/tasks/3/status`, `Content-Type: application/json`, body exactly `{"status":"IN_PROGRESS"}`, resolves to the task; 404 → `ApiError` kind `not-found` |
| `src/pages/params.test.ts` (**new**) | `SCRUM-6 list URL parameters` | `AC-13`: `parseStatusParam` accepts the 3 exact names, rejects `done`, `DONEE`, `''`, `null`; `parseListParams`; `listSearchParams`/`listPath` (`{1}`→`/`, `{2}`→`/?page=2`, `{1,DONE}`→`/?status=DONE`, `{2,DONE}`→`/?status=DONE&page=2`) · `AC-15`: `returnTarget({ returnTo: '/?status=DONE&page=2' })` round-trips |
| `src/components/StatusSelect.test.tsx` (**new**, rendered standalone with MSW) | `SCRUM-6 status select` | `AC-08, NFR-06`: combobox named `Status for <title>`, 3 labelled options, current value selected · `AC-09`: selecting sends one PATCH with `{status}` only, calls `onChanged` with the server task · `AC-10`: while in flight (deferred handler) the select is disabled, `aria-busy`, "Saving…" describes it; re-enabled and focused afterwards · `AC-11`: 500 → value reverts, `onFailed` called with kind `server`; network error → kind `network` |
| `src/pages/TaskListPage.test.tsx` (extend) | `SCRUM-6 task list status` | `AC-08`: each row has `Status for <title>` with the current value; Edit link still present · `AC-09`: change → `requestLog` has `PATCH /api/tasks/n/status` and no `PUT`, path stays `/`, row shows new value, `role="status"` announces `Status of "X" changed to Done.` · `AC-10`: in-flight row disabled while another row is enabled; with `?status=TODO`, changing a row to Done reloads (`GET …&status=TODO` twice) and the row disappears; with `?status=TODO&page=2` and the only task on page 2 changed → URL becomes `/?status=TODO` page 1 (clamp) · `AC-11`: 500 / network / 400 → row reverts, `role="alert"` with generic text, no body text leaked; retry succeeds; 404 → alert contains `Task not found` and the list is re-requested · `AC-12`: filter combobox `Status` has All/To do/In progress/Done; choosing Done requests `status=DONE`, page 0; choosing All requests without status · `AC-13`: URL `/?status=IN_PROGRESS` after selection; direct entry `/?status=DONE&page=2` requests `page=1&…&status=DONE` and preselects Done; filter change from page 2 resets to page 1; Pager Next keeps `status`; `/?status=done` → treated as All, request has no `status` · `AC-14`: filtered empty → `No tasks with status Done.` + "Show all tasks" link → `/` and the unfiltered list; unfiltered empty still "No tasks yet." |
| `src/pages/TaskEditPage.test.tsx` (extend) | `SCRUM-6 edit task` | `AC-15`: from `/?status=DONE&page=2`, Edit → Cancel and Edit → Save both return to `/?status=DONE&page=2` · `AC-16`: change a status in the list, open Edit → form's Status shows the new value; saving sends `PUT` with that status; create form still sends `status` |
| `src/routes.test.tsx` (extend) | `SCRUM-6 routing` | `AC-13`: select a filter, then `router.navigate(-1)` → previous (unfiltered) list and filter shows All; forward restores |

Coverage gates unchanged (80/80/80/75). `src/pages/params.ts`, `StatusSelect.tsx`, `StatusFilter.tsx` must not
lower them.

### 8.3 Deliberate changes to existing tests (NFR-01 — call out in the PR)

| Test | Today | Change | Why |
|---|---|---|---|
| `TodoApplicationIntegrationTest#infoCarriesJiraKey` | asserts `$.build.jira == "SCRUM-2"` | display name `SCRUM-2-NFR-06, SCRUM-6-NFR-07: /actuator/info build.jira equals the Jira key the build was made for (ADR 0008)`, add method-level `@Tag("SCRUM-6")`; assert `build.jira` matches `SCRUM-\d+\|main\|NONE\|UNKNOWN` **and**, when system property `build.jira.expected` is set (always under Maven, §9), equals it | key is now injected per build (`-Djira.issue`) |
| `TaskPersistenceRestartTest#taskSurvivesRestart` | `count(*) FROM flyway_schema_history WHERE success == 1` | capture the count after the first start (≥ 1) and assert the second start has the **same** count; keep the display name's intent ("migrations are not re-applied"), add `SCRUM-6-NFR-02` to it and a method-level `@Tag("SCRUM-6")` | V2 makes it 2; the assertion should express "no re-application", not "exactly one migration" |
| `frontend/src/pages/TaskListPage.test.tsx › SCRUM-1-AC-01` | reads `textContent` of the first 3 cells | read title/due date from cells, status via `within(row).getByRole('combobox', { name: 'Status for <title>' })` `toHaveDisplayValue('To do')` etc. | status cell is now a control |
| `frontend/src/api/tasks.test.ts › SCRUM-1-AC-01, SCRUM-1-AC-02` | `listTasks(2)` | `listTasks({ page: 2 })` | signature change |
| `frontend/src/components/BuildInfo.test.tsx › SCRUM-1-NFR-09` | `expect(__JIRA_KEY__).toBe('SCRUM-1')` | name `SCRUM-1-NFR-09, SCRUM-6-NFR-07: …`; `expect(__JIRA_KEY__).toMatch(/^(SCRUM-\d+\|main\|NONE\|UNKNOWN)$/)` | key comes from CI (`JIRA_KEY`) or `UNKNOWN` locally |
| `frontend/src/routes.test.tsx › SCRUM-1-AC-12, SCRUM-1-NFR-09` | `toHaveTextContent('SCRUM-1 ·')` | `toHaveTextContent(\`${__JIRA_KEY__} ·\`)` | same |

No other existing test may change. `CorsConfigTest` and all `TaskControllerTest`/`TaskServiceTest` SCRUM-2
methods stay as they are.

## 9. Build identity & CI (Q-03 → ADR 0008)

**Decision:** the Jira key is derived once per workflow run from the branch and injected into both builds;
nothing story-specific is hard-coded in `pom.xml`, `vite.config.ts` or `ci.yml` any more.

| Branch (`github.head_ref` for PRs, else `github.ref_name`) | `JIRA_KEY` |
|---|---|
| matches `^feature/(SCRUM-[0-9]+)(-\|$)` | the captured key, e.g. `SCRUM-6` |
| `main` | `main` |
| anything else (e.g. `dependabot/…`) | `NONE` |
| local build, nothing passed | `UNKNOWN` (pom default / vite default) |

### 9.1 `.github/workflows/ci.yml`

```yaml
# ADR 0008: build identity (Jira key) derived from the branch; jobs: identity → build (backend), frontend.
name: CI
on: { push: { branches: ["feature/**", main] }, pull_request: {} }     # unchanged triggers (keep block style)
permissions: { contents: read }

jobs:
  identity:
    runs-on: ubuntu-latest
    outputs:
      jira_key: ${{ steps.derive.outputs.jira_key }}
    steps:
      - name: Derive Jira key from branch
        id: derive
        env:
          BRANCH: ${{ github.head_ref || github.ref_name }}   # via env, never inlined into the script (injection)
        run: |
          re='^feature/(SCRUM-[0-9]+)(-|$)'
          if [[ "$BRANCH" =~ $re ]]; then key="${BASH_REMATCH[1]}"
          elif [[ "$BRANCH" == "main" ]]; then key="main"
          else key="NONE"; fi
          echo "jira_key=$key" >> "$GITHUB_OUTPUT"
          echo "### Build identity: \`$key\` (commit \`${GITHUB_SHA::7}\`)" >> "$GITHUB_STEP_SUMMARY"

  build:
    needs: identity
    runs-on: ubuntu-latest
    env:
      JIRA_KEY: ${{ needs.identity.outputs.jira_key }}
    steps:
      # checkout (fetch-depth 0) and setup-java unchanged
      - name: Build, test, coverage gate
        run: ./mvnw -B -ntp verify "-Djira.issue=${JIRA_KEY}"
      - name: Verify build identity
        run: |
          jar=$(ls target/todo-backend-*.jar)
          unzip -p "$jar" META-INF/MANIFEST.MF | tr -d '\r' | grep -qx "X-Jira-Issue: ${JIRA_KEY}"
          # As implemented: build-info.properties is at the jar root META-INF/ in Boot 4 (not BOOT-INF/classes/),
          # so the step locates it via `unzip -Z1 "$jar" | grep -E '(^|/)META-INF/build-info\.properties$'`.
          unzip -p "$jar" META-INF/build-info.properties | grep -qx "build.jira=${JIRA_KEY}"
      - name: Coverage summary          # if: always(); heading "### Backend line coverage (${JIRA_KEY})";
                                        # AC list: grep -hoE 'SCRUM-[0-9]+-AC-[0-9]+' … | sort -uV
      - name: Upload jar                # name: todo-backend-${{ env.JIRA_KEY }}-${{ github.sha }}
      - name: Upload test & coverage reports   # name: todo-backend-${{ env.JIRA_KEY }}-${{ github.sha }}-reports

  frontend:
    needs: identity
    runs-on: ubuntu-latest
    env:
      JIRA_KEY: ${{ needs.identity.outputs.jira_key }}       # read by vite.config.ts (tests + build)
    defaults: { run: { working-directory: frontend } }
    steps:
      # checkout, setup-node, npm ci, audit, lint, typecheck, test:coverage, build — unchanged
      - name: Verify build identity
        run: node -e 'const b=require("./dist/build-info.json"); if (b.jira!==process.env.JIRA_KEY) { console.error(b); process.exit(1) }'
      - name: Test & coverage summary   # "### Frontend line coverage (${JIRA_KEY})"; grep -oE 'SCRUM-[0-9]+-AC-[0-9]+' … | sort -uV
      - name: Upload dist               # name: todo-frontend-${{ env.JIRA_KEY }}-${{ github.sha }}
      - name: Upload test & coverage reports   # name: todo-frontend-${{ env.JIRA_KEY }}-${{ github.sha }}-reports
```

Job ids `build` and `frontend` are unchanged (required status checks reference job names, not the workflow
name). The summaries list **all** story ACs exercised (SCRUM-1, -2 and -6), since every story's tests run on
every build.

### 9.2 `pom.xml`

```xml
<!-- ADR 0008: overridden by CI with -Djira.issue=<key derived from the branch>; UNKNOWN for local builds -->
<jira.issue>UNKNOWN</jira.issue>
```

and in `maven-surefire-plugin` `<configuration>` (next to the existing `statelessTestsetReporter`):

```xml
<systemPropertyVariables>
    <build.jira.expected>${jira.issue}</build.jira.expected>
</systemPropertyVariables>
```

`build-info` (`additionalProperties/jira`) and the manifest (`X-Jira-Issue`) already use `${jira.issue}` — no
other pom change. A `-D` user property overrides the pom property during interpolation, so
`/actuator/info` → `build.jira`, `META-INF/build-info.properties` and `X-Jira-Issue` all carry the CI key.

### 9.3 `frontend/vite.config.ts`

`const jira = firstNonEmpty(process.env.JIRA_KEY) ?? 'UNKNOWN'` (was `'SCRUM-1'`). `build-info.json`,
`<meta name="build-info">` and the footer already use `jira`. No branch parsing in Vite — the derivation lives
in exactly one place (the `identity` job). Locally: `JIRA_KEY=SCRUM-6 npm run build`,
`./mvnw verify -Djira.issue=SCRUM-6`.

## 10. Traceability (ADR 0004 + 0008 applied)

| Artefact | SCRUM-6 convention |
|---|---|
| Jira | [SCRUM-6](https://suranagivinod.atlassian.net/browse/SCRUM-6), epic SCRUM-5 |
| Branch | `feature/SCRUM-6-task-status-management` |
| Commits | `SCRUM-6: [ROLE] <summary>` (PM, ARCH, DEV, QA, CI, REVIEW) + trailer `Refs: SCRUM-6` |
| Requirements / design | `docs/requirements/SCRUM-6.md`; this document; ADRs 0008, 0009 |
| Migration header | `-- SCRUM-6: …` first line of `V2__add_tasks_status_index.sql` |
| Backend tests | `@Tag("SCRUM-6")` (class for new classes, method for additions), `@DisplayName("SCRUM-6-AC-xx: …")` → surefire XML |
| Frontend tests | `describe('SCRUM-6 <area>')`, `it('SCRUM-6-AC-xx: …')` → `frontend/reports/junit.xml` |
| Build identity | branch-derived (ADR 0008): jar `X-Jira-Issue: SCRUM-6`, `/actuator/info` `build.jira = SCRUM-6`, `dist/build-info.json` `"jira": "SCRUM-6"`, footer `SCRUM-6 · <sha7>` for builds of this branch/PR |
| CI | workflow `CI`; artifacts `todo-backend-SCRUM-6-<sha>`(`-reports`), `todo-frontend-SCRUM-6-<sha>`(`-reports`); "Verify build identity" steps |
| PR | title `SCRUM-6: Task Status Management`; body links Jira, requirements, this design, ADRs 0008–0009, matrix, CI run; lists the §8.3 deliberate test changes |
| Matrix | [`docs/traceability/SCRUM-6.md`](../traceability/SCRUM-6.md) (template → Dev fills) |

Historical matrices `docs/traceability/SCRUM-1.md` / `SCRUM-2.md` and the SCRUM-1/-2 design docs are records of
what was built then and are **not** rewritten; README's traceability paragraphs are updated to the ADR 0008
names (NFR-09).

Verification (reviewers):

```bash
./mvnw test -Dgroups=SCRUM-6                                           # in CI
grep -hoE 'SCRUM-6-AC-[0-9]+' target/surefire-reports/TEST-*.xml | sort -uV   # expect AC-01..07, AC-17
cd frontend && npm run test:coverage && grep -oE 'SCRUM-6-AC-[0-9]+' reports/junit.xml | sort -uV  # expect AC-08..16
JIRA_KEY=SCRUM-6 npm run build && cat dist/build-info.json
```

## 11. Suggested commit sequence (Dev)

1. `SCRUM-6: [CI] derive build identity from the branch (ADR 0008)` — `ci.yml`, `pom.xml`, `vite.config.ts`, the 4 identity-related test changes (§8.3 rows 1, 5, 6) + ADR-conformant README paragraph.
2. `SCRUM-6: [DEV] add PATCH /api/tasks/{id}/status and status filter` — backend §2 + backend tests (incl. §8.3 row 2).
3. `SCRUM-6: [DEV] add status API client and URL params` — §4.2–4.3 + tests (incl. §8.3 row 4).
4. `SCRUM-6: [DEV] add per-row status control and list filter` — §4.4–4.8 + tests (incl. §8.3 row 3).
5. `SCRUM-6: [DEV] document status management and fill traceability matrix` — README (NFR-09), matrix.

Each with `Refs: SCRUM-6`. Definition of done: frontend `npm ci && npm run lint && npm run typecheck &&
npm run test:coverage && npm run build` green locally; both CI jobs green (NFR-05) with artifacts named
`…-SCRUM-6-<sha>`; manual smoke (backend + `npm run dev`: change status from list, filter, edit round-trip)
recorded in the matrix if a runnable backend is available.

## 12. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Backend never compiled locally; Spring binding behaviour for `String[] status` differs from the analysis in §2.3 | Low | The `AC-07` parameterized controller test pins every case; if a case misbehaves in CI, read `request.getParameterValues("status")` (raw servlet values) in the controller instead — same parser, same exception |
| Jackson 3 treats the single-component record as delegating | Low | `@JsonProperty("status")` + bare-string test (§2.2) |
| `RestClient` + `PATCH` in the integration test | Low | §7 fallback to `JdkClientHttpRequestFactory` |
| `identity` job adds ~10–20 s before `build`/`frontend` start | Certain, minor | Accepted for a single source of truth; alternative (duplicate 6-line step per job) noted in ADR 0008 |
| Branch-protection rules referencing the old workflow name | Low | Job names unchanged; repo owner checks branch protection after merge |
| Fork PRs: attacker-controlled branch names | Low | Branch passed via `env`, regex-validated; output is only a matched key or a literal |
| Disabled `<select>` drops keyboard focus | Medium (browser-dependent) | Explicit focus restore (§4.4) |
| Reload after filtered change flickers "Loading tasks…" | Certain, cosmetic | Accepted (§4.6); announcement region sits outside the reloaded area |
| Concurrent edit form overwrites a quick change | Accepted (A-06) | Documented; no optimistic locking in this story |
