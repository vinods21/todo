# SCRUM-1 — React Frontend Setup: Solution Design

| Field | Value |
|---|---|
| Jira key | [SCRUM-1](https://suranagivinod.atlassian.net/browse/SCRUM-1) (epic SCRUM-5) |
| Requirements | [`docs/requirements/SCRUM-1.md`](../requirements/SCRUM-1.md) — `SCRUM-1-AC-01..14`, `SCRUM-1-NFR-01..09`, assumptions `A-01..A-10` |
| Backend contract | [`docs/architecture/SCRUM-2-design.md`](SCRUM-2-design.md) §5 (REST API), §6 (error body), [ADR 0003](../adr/0003-error-response-format.md) |
| Branch | `feature/SCRUM-1-react-frontend-setup` |
| Author role | Architect (PM → Architect → Dev pipeline) |
| ADRs | [0005](../adr/0005-frontend-stack-react-vite-ts.md) stack, [0006](../adr/0006-frontend-api-client-and-state.md) API client & state, [0007](../adr/0007-frontend-testing-msw.md) testing; conventions [0004](../adr/0004-traceability-conventions.md) |
| Traceability matrix | [`docs/traceability/SCRUM-1.md`](../traceability/SCRUM-1.md) (template; Dev fills it) |
| Status | Ready for Dev |

All requirement IDs refer to `docs/requirements/SCRUM-1.md`. Assumptions A-01..A-10 are accepted as-is; in
particular A-02 (no Vite dev proxy — the browser calls the backend cross-origin) and A-08 (minimal
dependencies). Q-01 (delete) and Q-02 (serving the SPA) stay out of scope.

---

## 1. Context

```
 Browser (evergreen)                                   GitHub Actions (ubuntu-latest)
 ┌─────────────── todo-frontend SPA (React 19 + TS, Vite 8) ───────────────┐   job `build`    (backend, unchanged)
 │ pages (TaskListPage, TaskCreatePage, TaskEditPage, NotFoundPage)        │   job `frontend` (new: lint, typecheck,
 │   → components (TaskForm, TaskTable, Pager, Loading, ErrorPanel, ...)  │                  test+coverage, build)
 │   → hooks (useAsync)  → api (client.ts, tasks.ts, types.ts, errors.ts) │
 └─────────────────────────────────────┬───────────────────────────────────┘
       dev: http://localhost:5173      │ fetch(JSON), cross-origin (CORS allowed by backend default)
                                       ▼ VITE_API_BASE_URL (default http://localhost:8080)
                     todo-backend (SCRUM-2) /api/tasks
```

The frontend is a static SPA with no server component. In dev it runs on the Vite dev server (port 5173, the
backend's default allowed CORS origin — AC-14). In tests the network is mocked by MSW at the `fetch` level, so no
backend is needed (NFR-04). The production build in `frontend/dist` is uploaded by CI but not deployed (A-10,
SCRUM-7).

**Workspace note:** Node 22 / npm 10 are available in the authoring workspace and the npm registry is reachable.
The Architect ran a throwaway spike (outside the repo) with **exactly** the versions in §3: `npm ci`,
`tsc -b`, ESLint flat config, Vitest + RTL + MSW node server, v8 coverage, junit reporter, `vite build` with the
`define` + build-info plugin of §10 all worked. Gotchas found in the spike are called out inline (⚠).

## 2. Repository layout

The backend stays at the repo root unchanged (NFR-01). The frontend is a self-contained npm project:

```
frontend/
├── .env.example                 VITE_API_BASE_URL=http://localhost:8080  (AC-13; committed — see ⚠ below)
├── .nvmrc                       22                                         (NFR-02)
├── .gitignore                   node_modules/, dist/, reports/, coverage/, *.tsbuildinfo, .env, .env.local
├── eslint.config.js             flat config (§12)
├── index.html                   <div id="root">, <title>Todo</title>, lang="en"
├── package.json / package-lock.json
├── tsconfig.json                solution file → references app + node
├── tsconfig.app.json            src/** (strict, DOM libs, vitest + jest-dom types)
├── tsconfig.node.json           vite.config.ts (strict, node types)
├── vite.config.ts               plugins, define, dev server 5173, Vitest config (§10, §11)
└── src/
    ├── main.tsx                 createRoot + <StrictMode> + <RouterProvider router={createBrowserRouter(routes)}>  (excluded from coverage)
    ├── routes.tsx               `routes: RouteObject[]` — single source for app + tests (§4)
    ├── vite-env.d.ts            /// vite/client; ImportMetaEnv { VITE_API_BASE_URL?: string }; declare const __JIRA_KEY__, __GIT_SHA__
    ├── index.css                minimal CSS, visible :focus-visible outline (NFR-07)
    ├── api/
    │   ├── config.ts            resolveApiBaseUrl(env) → string; export const API_BASE_URL   (AC-13)
    │   ├── types.ts             Task, TaskStatus, TASK_STATUSES, TaskCreateRequest, TaskUpdateRequest, Page<T>, ApiErrorBody, FieldErrorItem
    │   ├── errors.ts            class ApiError + toApiError(response) + isApiError()                       (§5.3)
    │   ├── client.ts            request<T>(method, path, {query, body, signal}) — the only place calling fetch
    │   └── tasks.ts             listTasks, getTask, createTask, updateTask
    ├── hooks/
    │   └── useAsync.ts          load-on-mount/deps-change hook with abort + reload()                       (§6)
    ├── components/
    │   ├── Layout.tsx           header (app name + "New task" link), <main><Outlet/></main>, <BuildInfo/> footer
    │   ├── BuildInfo.tsx        footer text "SCRUM-1 · <7-char sha>"                                        (NFR-09)
    │   ├── Loading.tsx          <p role="status">{label}</p>                                                (AC-09)
    │   ├── ErrorPanel.tsx       <div role="alert"> message + optional "Retry" button                       (AC-10)
    │   ├── TaskTable.tsx        list rendering (title, status label, due date, Edit link)                   (AC-01)
    │   ├── Pager.tsx            Previous / "Page x of y" / Next                                             (AC-02)
    │   ├── TaskForm.tsx         shared create/edit form (controlled), field + form-level errors           (AC-04..08, NFR-07)
    │   ├── taskForm.ts          TaskFormValues, toFormValues(task), toCreateRequest, toUpdateRequest, validateTaskForm
    │   └── statusLabels.ts      STATUS_LABELS: Record<TaskStatus, string>
    ├── pages/
    │   ├── TaskListPage.tsx     /                                                                           (AC-01..03, 09, 10)
    │   ├── TaskCreatePage.tsx   /tasks/new                                                                  (AC-04, 07..10)
    │   ├── TaskEditPage.tsx     /tasks/:id/edit                                                             (AC-05..11)
    │   └── NotFoundPage.tsx     * (unknown route) — "Page not found" + link to list
    └── test/
        ├── setup.ts             jest-dom matchers, MSW server lifecycle, cleanup
        ├── server.ts            setupServer(...handlers)
        ├── handlers.ts          default handlers over an in-memory task store; reset per test
        ├── fixtures.ts          makeTask(), makePage(), errorBody() builders typed against src/api/types
        └── renderApp.tsx        renderApp(initialPath) → { router, user } using createMemoryRouter(routes)
    (test files are co-located: src/**/*.test.ts(x) — see §9)
```

⚠ **`.env.example` is ignored by the root `.gitignore`** (`.env.*` pattern, added in SCRUM-2 — verified with
`git check-ignore`). Dev must add a negation line `!.env.example` to the root `.gitignore` directly after
`.env.*` (keeps the SCRUM-2 secret-protection rule intact) and confirm `git status` shows
`frontend/.env.example`. `frontend/.gitignore` additionally ignores the build/test outputs listed above.

## 3. Dependencies (exact pins, verified with `npm view` on 2026-11-17)

Install with `npm install --save-exact` (`-E`) so `package.json` holds exact versions; `package-lock.json` is
committed (NFR-02). No UI library, no data-fetching library, no form library, no CSS framework (A-08, A-09).

**Runtime (`dependencies`) — 3 packages**

| Package | Version | Why |
|---|---|---|
| `react` | 19.3.1 | NFR-01 (current major) |
| `react-dom` | 19.3.1 | NFR-01 |
| `react-router` | 8.5.1 | Routing, AC-12 (ADR 0005). Single package in v7+; **do not** add `react-router-dom`. |

**Dev (`devDependencies`) — 20 packages**

| Package | Version | Why |
|---|---|---|
| `vite` | 8.3.8 | Dev server + build (NFR-01) |
| `@vitejs/plugin-react` | 6.3.0 | JSX/Fast Refresh for Vite 8 |
| `typescript` | **6.0.3** | NFR-01 strict. ⚠ Not 7.0.2 (`latest`): `typescript-eslint@8.73.0` peer range is `>=4.8.4 <6.1.0`. |
| `@types/react` | 19.3.0 | Types |
| `@types/react-dom` | 19.3.0 | Types |
| `@types/node` | 22.20.5 | Types for `vite.config.ts` (matches Node 22 runtime) |
| `vitest` | 5.1.0 | Test runner (NFR-04) |
| `@vitest/coverage-v8` | 5.1.0 | Coverage (must equal vitest version) |
| `jsdom` | 31.0.1 | DOM environment. ⚠ engines `node ^22.22.2` — CI's `setup-node` `22` resolves the latest 22.x, fine. |
| `@testing-library/react` | 16.3.3 | RTL (NFR-04) |
| `@testing-library/dom` | 10.4.2 | Required peer of RTL 16 / jest-dom 7 |
| `@testing-library/user-event` | 14.6.12 | Realistic typing/clicking/keyboard (NFR-07) |
| `@testing-library/jest-dom` | 7.0.1 | `toBeInTheDocument`, `toBeDisabled`, `toHaveAccessibleDescription`… (import `@testing-library/jest-dom/vitest`) |
| `msw` | 3.0.6 | Network-level mocking (NFR-04, ADR 0007). ⚠ v3 API: `server.listen({ onUnhandledFrame: 'error' })` (v2's `onUnhandledRequest` no longer type-checks). |
| `eslint` | 10.15.0 | Lint (NFR-05) |
| `@eslint/js` | 10.0.1 | Recommended JS rules |
| `typescript-eslint` | 8.73.0 | TS rules; `no-explicit-any: error` (NFR-05) |
| `eslint-plugin-react-hooks` | 7.1.1 | Hooks rules (NFR-05) — `reactHooks.configs.flat.recommended` |
| `eslint-plugin-react-refresh` | 0.5.8 | Fast-refresh safety — `reactRefresh.configs.vite` |
| `globals` | 17.14.0 | Browser globals for ESLint |

Explicitly **not** added: `@tanstack/react-query`/SWR (ADR 0006), `react-hook-form`/`zod` (four fields, rules
mirrored by hand), `axios` (fetch is enough), `prettier` (optional later; not an NFR), Playwright (out of scope).
Any added dependency must be recorded in ADR 0005 with a reason.

`npm audit` on 2026-11-17 reports a high-severity ReDoS advisory in transitive **dev-only** `picomatch`
(via `tinyglobby`/`@typescript-eslint/*`); runtime deps are clean (`npm audit --omit=dev` → 0). Do **not** run
`npm audit fix --force` (it downgrades vitest). CI runs `npm audit --omit=dev --audit-level=high` as a gate (§13).

**`package.json` essentials**

```jsonc
{
  "name": "todo-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.22.2 <23" },       // NFR-02 (+ .nvmrc "22")
  "scripts": {
    "dev": "vite",                                // port 5173, strictPort (AC-14)
    "build": "tsc -b && vite build",              // type-check + dist/ (NFR-03)
    "preview": "vite preview",
    "test": "vitest run",                         // non-watch (NFR-03)
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",     // CI; enforces thresholds
    "lint": "eslint . --max-warnings 0",
    "typecheck": "tsc -b --noEmit"
  }
}
```

## 4. Routing (AC-12)

Library: `react-router` 8.5.1, **data router** API (`createBrowserRouter` in `main.tsx`, `createMemoryRouter`
in tests) over one shared `routes` array, using only `element`/`errorElement` (no loaders/actions — data loading
stays in components, see ADR 0006).

```tsx
// src/routes.tsx
export const routes: RouteObject[] = [{
  element: <Layout />,
  errorElement: <ErrorPanel message="Something went wrong." />,  // render-error backstop, no stack trace
  children: [
    { index: true,                 element: <TaskListPage /> },       // "/"            (?page=N, 1-based)
    { path: 'tasks/new',           element: <TaskCreatePage /> },     // "/tasks/new"
    { path: 'tasks/:id/edit',      element: <TaskEditPage /> },       // "/tasks/:id/edit"
    { path: '*',                   element: <NotFoundPage /> },
  ],
}]
```

- `routes.tsx` exports only `routes`; ESLint's react-refresh rule flags mixing component and non-component
  exports, so add `// eslint-disable-next-line react-refresh/only-export-components` on that export (or keep page
  components in their own files, which they are) — the spike hit this.
- **List page in the URL:** the current list page is the search param `page` (1-based for humans: `/?page=3`
  → API `page=2`). Missing/invalid/`<1` → page 1. This makes paging survive refresh and Back (AC-02, AC-12).
- **Id parsing:** `TaskEditPage` parses `:id` with `/^[1-9]\d*$/` (positive safe integer). Anything else renders
  the "Task not found" state **without** issuing a request (AC-11/AC-12; MSW `onUnhandledFrame: 'error'` makes
  a stray request fail the test).
- **Return target:** the list's Edit links pass `state={{ returnTo: '/?page=N' }}`. After a successful edit or
  Cancel, navigate to `location.state?.returnTo ?? '/'` (validated to start with `/`). After create, always
  navigate to `/` (first page, AC-04 — newest first means the new task is on page 1).
- Hosting fallback (all paths → `index.html`) is a deployment concern for SCRUM-7; the Vite dev server and
  `vite preview` already do it.

## 5. API layer

### 5.1 Types (`src/api/types.ts`) — no `any` (NFR-05)

```ts
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]
export interface Task { id: number; title: string; description: string | null; status: TaskStatus;
                        createdAt: string /* ISO instant */; dueDate: string | null /* yyyy-MM-dd */ }
export interface TaskCreateRequest { title: string; description: string | null; status: TaskStatus; dueDate: string | null }
export type TaskUpdateRequest = TaskCreateRequest           // all four fields always sent (AC-06)
export interface Page<T> { items: T[]; page: number; size: number; totalElements: number; totalPages: number }
export interface FieldErrorItem { field: string; message: string }
export interface ApiErrorBody { timestamp: string; status: number; error: string; message: string; path: string; fieldErrors: FieldErrorItem[] }
```

Response bodies are trusted to match the SCRUM-2 contract (same repo, contract-tested on the backend) and are
cast with `as` at one place (`client.ts`). Error bodies are **not** trusted (proxies/gateways can return HTML),
so `errors.ts` validates them with a small type guard `isApiErrorBody(x: unknown): x is ApiErrorBody`.

### 5.2 Configuration (`src/api/config.ts`, AC-13)

```ts
export const DEFAULT_API_BASE_URL = 'http://localhost:8080'
export function resolveApiBaseUrl(raw: string | undefined): string {
  const v = raw?.trim(); return (v ? v : DEFAULT_API_BASE_URL).replace(/\/+$/, '')   // strip trailing slashes
}
export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
```

`VITE_API_BASE_URL` is read at build/dev-start time (Vite inlines `import.meta.env`). Override locally via
`frontend/.env.local` or the shell (`VITE_API_BASE_URL=http://host:8081 npm run dev`). Documented in
`frontend/.env.example` and the README (AC-13, NFR-08). Tests do not set it, so MSW handlers use the default
base URL; `config.test.ts` tests `resolveApiBaseUrl` directly.

### 5.3 Error normalisation (`src/api/errors.ts`)

Every failure leaving the API layer is an `ApiError` (never a raw `Response`, `TypeError` or JSON body):

```ts
export type ApiErrorKind = 'network' | 'validation' | 'not-found' | 'server' | 'http'
export class ApiError extends Error {
  readonly name = 'ApiError'
  constructor(readonly kind: ApiErrorKind,
              readonly status: number,                 // 0 for network errors
              message: string,                         // safe to show to users
              readonly fieldErrors: FieldErrorItem[] = []) { super(message) }
}
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'
export const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.'
```

| Situation | `kind` | `status` | `message` (shown to user) | `fieldErrors` |
|---|---|---|---|---|
| `fetch` rejects with `TypeError` (backend down, DNS, **CORS** failure) | `network` | 0 | `NETWORK_ERROR_MESSAGE` | [] |
| `fetch` rejects with `AbortError` | — rethrown as-is; `useAsync` ignores it (unmount/deps change) | | | |
| 400 with valid `ApiErrorBody` | `validation` | 400 | `body.message` (e.g. "Validation failed") | `body.fieldErrors` |
| 400 with unparsable/foreign body | `validation` | 400 | `GENERIC_ERROR_MESSAGE` | [] |
| 404 | `not-found` | 404 | `'Task not found'` | [] |
| 5xx (any body) | `server` | status | `GENERIC_ERROR_MESSAGE` — **body is never shown** (AC-10) | [] |
| other 4xx (405, 415, …) | `http` | status | `body.message` if valid body, else `GENERIC_ERROR_MESSAGE` | [] |
| 2xx but body not JSON (should not happen) | `server` | status | `GENERIC_ERROR_MESSAGE` | [] |

`toApiError(response)` reads `response.text()` then `JSON.parse` in a try/catch (works for empty/HTML bodies).
`err instanceof ApiError` and `isApiError(e)` are both fine; components switch on `kind`.

### 5.4 Client (`src/api/client.ts`) and endpoints (`src/api/tasks.ts`)

```ts
type Query = Record<string, string | number | undefined>
export async function request<T>(method: 'GET'|'POST'|'PUT', path: string,
    opts: { query?: Query; body?: unknown; signal?: AbortSignal } = {}): Promise<T>
```

- URL: `new URL(API_BASE_URL + path)`; query params appended with `URLSearchParams` (skip `undefined`).
- Headers: `Accept: application/json`; plus `Content-Type: application/json` only when a body is sent.
  No credentials/cookies (`credentials` left at default `same-origin`; A-01). These are CORS-simple apart from
  `Content-Type: application/json`, which the backend's CORS config already allows (SCRUM-2-AC-15).
- `try { res = await fetch(...) } catch (e) { if (isAbort(e)) throw e; throw new ApiError('network', 0, …) }`.
- `!res.ok` → `throw await toApiError(res)`. `res.ok` → `return (await res.json()) as T`.
- No retries, timeouts or caching in the client (YAGNI; "Retry" is a user action, AC-10).

```ts
export const PAGE_SIZE = 20                                                      // A-03
listTasks(page: number, signal?: AbortSignal): Promise<Page<Task>>              // GET  /api/tasks?page=&size=20
getTask(id: number, signal?: AbortSignal): Promise<Task>                         // GET  /api/tasks/{id}
createTask(req: TaskCreateRequest): Promise<Task>                                // POST /api/tasks  (201)
updateTask(id: number, req: TaskUpdateRequest): Promise<Task>                    // PUT  /api/tasks/{id} (200)
```

## 6. State, loading and error patterns (AC-09..11)

No global store: each page owns its state; the server is the source of truth and pages re-fetch on mount
(after create/edit the list page mounts again → fresh data, AC-04/AC-06). See ADR 0006.

**`useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: DependencyList)`** returns a discriminated union
plus `reload`:

```ts
type AsyncState<T> = { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: ApiError }
function useAsync<T>(...): AsyncState<T> & { reload: () => void }
```

- Creates an `AbortController` per run; aborts on unmount/deps change (prevents stale responses overwriting
  newer ones and "setState on unmounted" in StrictMode double-mount).
- `reload()` bumps an internal counter in deps → re-run, state goes back to `loading` (AC-10 Retry).
- Non-`ApiError` throws are wrapped as `ApiError('server', 0, GENERIC_ERROR_MESSAGE)`; `AbortError` ignored.
- Must satisfy `react-hooks/exhaustive-deps`: accept `deps` explicitly and disable the rule only on that one
  internal `useEffect` line with a comment, or (preferred) take the caller's `fn` via `useCallback` and depend
  on it.

**Page rendering rules**

| Page | loading | error | success |
|---|---|---|---|
| List | `<Loading label="Loading tasks…"/>` (`role="status"`) | `<ErrorPanel message={error.message} onRetry={reload}/>` (`role="alert"`, "Retry" button) | items → `TaskTable` + `Pager`; `items.length === 0 && page === 1` → empty state "No tasks yet" + "Create your first task" link to `/tasks/new` (AC-03). Empty non-first page (e.g. stale `?page=9`) → "This page is empty" + link to page 1. |
| Edit (load) | `<Loading label="Loading task…"/>` | `kind==='not-found'` → `TaskNotFound` ("Task not found" heading + "Back to tasks" link; no form, AC-11); otherwise `ErrorPanel` with Retry | `TaskForm` prefilled via `toFormValues(task)` (AC-05) |
| Create / Edit (submit) | button `disabled` + text "Saving…" (`aria-busy` on form) — no double submission (AC-09) | `validation` → field errors inline + form-level for leftovers (AC-08); `not-found` on PUT → switch page to `TaskNotFound` (AC-11); `network`/`server`/`http` → form-level `role="alert"` message; inputs kept, button re-enabled (AC-10) | navigate to list (§4) |

Submission is a plain async handler in the page (`const [submitting, setSubmitting] = useState(false)`), not
`useAsync`. Guard against double submit both by `disabled` and an early `if (submitting) return`.

**Display rules (AC-01):** columns Title / Status / Due date / Actions in a `<table>` with `<caption>` (or a
`<ul>` of articles — Dev's choice, tests query by role). Status label via `STATUS_LABELS`
(`TODO`→"To do", `IN_PROGRESS`→"In progress", `DONE`→"Done"). `dueDate` shown as the raw `yyyy-MM-dd` string
(A-05: no `Date` parsing, no timezone shift, locale-independent tests); `null` → "No due date". Order = API order.
Edit link accessible name includes the title (`aria-label="Edit <title>"`) so it is unambiguous.

**Pager (AC-02):** rendered only when `totalPages > 1`; text "Page {page+1} of {totalPages}" (`aria-live="polite"`);
"Previous" disabled when `page === 0`, "Next" disabled when `page >= totalPages - 1`; clicking sets the URL
search param (`setSearchParams`), which re-runs `useAsync` with the new page. Use `<button>`s inside
`<nav aria-label="Pagination">`.

## 7. Forms and validation (AC-04..08, NFR-07)

One `TaskForm` for both pages: props `initialValues`, `submitLabel` ("Create task" / "Save changes"),
`onSubmit(values): Promise<void>`, `onCancel()`, `submitting`, `serverErrors?: { fields: Partial<Record<FormField,string>>; form?: string }`.

`taskForm.ts` (pure, unit-tested):

```ts
export type FormField = 'title' | 'description' | 'status' | 'dueDate'
export interface TaskFormValues { title: string; description: string; status: TaskStatus; dueDate: string }  // '' = empty
export const EMPTY_FORM: TaskFormValues = { title: '', description: '', status: 'TODO', dueDate: '' }
export const TITLE_MAX = 200, DESCRIPTION_MAX = 2000
export function validateTaskForm(v: TaskFormValues): Partial<Record<FormField, string>>
export function toCreateRequest(v: TaskFormValues): TaskCreateRequest
export function toUpdateRequest(v: TaskFormValues): TaskUpdateRequest
export function toFormValues(t: Task): TaskFormValues          // null → ''
export function mapServerErrors(e: ApiError): { fields: Partial<Record<FormField,string>>; form?: string }
```

**Rules mirroring the backend (SCRUM-2 §5/§7):**

| Field | Client rule | Message | Request mapping |
|---|---|---|---|
| title | `v.title.trim().length === 0` | "Title is required." | `title.trim()` (backend `strip()`s too) |
| title | `v.title.trim().length > 200` | "Title must be at most 200 characters." | |
| description | `v.description.length > 2000` (not trimmed — backend doesn't trim it) | "Description must be at most 2000 characters." | `''`/whitespace-only → `null`, else value unchanged |
| status | select limited to `TASK_STATUSES`; default `TODO` | — | always sent (create and update) |
| dueDate | none (past dates allowed; `<input type="date">` yields `yyyy-MM-dd` or `''`) | — | `''` → `null` |

String length uses `String.prototype.length` (UTF-16 code units), which matches Java `@Size` on `String`.

**Server errors (AC-08):** `mapServerErrors` puts each `fieldErrors[i]` whose `field` ∈ `FormField` into
`fields[field]` (first message per field wins); unknown fields are joined into `form`; if there are no known
field entries, `form = e.message`. Inputs are never reset on error. Client errors are recomputed on submit; a
field's error clears when the user edits that field.

**Accessibility (NFR-07):** `<form noValidate>` (custom messages; no browser bubbles), each control has
`<label htmlFor>`; `title` has `aria-required="true"`; when a field has an error: `aria-invalid="true"` and
`aria-describedby="<field>-error"` pointing at `<p id="<field>-error">`; the form-level error is
`<div role="alert">`. On a failed submit, focus moves to the first invalid field (or the form alert). Enter in
the title field submits (native form behaviour). No `maxLength` attribute on inputs — it would silently truncate
pastes and make the AC-07 message unreachable. Cancel is a `<button type="button">` that navigates without a
request (AC-06).

## 8. Build identity (NFR-09)

Values computed once in `vite.config.ts`:

| Value | Source (first non-empty wins) |
|---|---|
| `jira` | constant `'SCRUM-1'` (overridable via env `JIRA_KEY` for later stories) |
| `commit` | env `GITHUB_SHA` → `git rev-parse HEAD` → `'unknown'` |
| `branch` | env `GITHUB_HEAD_REF` (PRs) → `GITHUB_REF_NAME` → `git rev-parse --abbrev-ref HEAD` → `'unknown'` |
| `builtAt` | `new Date().toISOString()` at config load |

`git` is called via `execSync` with stderr ignored inside try/catch, so builds without `.git` still work.
On `pull_request` events `GITHUB_SHA` is the merge commit — the same SHA used in the artifact name, so they
stay consistent.

Exposure:
1. `define: { __JIRA_KEY__: JSON.stringify(jira), __GIT_SHA__: JSON.stringify(commit) }` (also active in Vitest
   — verified in the spike). Declared in `vite-env.d.ts`.
2. `<BuildInfo/>` in the layout footer: small muted text `SCRUM-1 · 1a2b3c4` (`__GIT_SHA__.slice(0, 7)`), with
   `title` attribute holding the full SHA.
3. A local Vite plugin `buildInfo()` (in `vite.config.ts`, `apply: 'build'`):
   - `transformIndexHtml` injects `<meta name="build-info" content="SCRUM-1 <full sha>">` into `<head>`;
   - `generateBundle` emits `dist/build-info.json`:
     `{ "jira": "SCRUM-1", "commit": "<sha>", "branch": "<branch>", "builtAt": "<ISO>" }` via
     `this.emitFile({ type: 'asset', fileName: 'build-info.json', source })`.

## 9. Test strategy (NFR-04, NFR-07, ADR 0007)

- **Runner/env:** Vitest 5 `environment: 'jsdom'`, `globals: true`, `setupFiles: ['./src/test/setup.ts']`.
- **Network:** MSW 3 node server (`msw/node` `setupServer`). `setup.ts`:
  `beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))`,
  `afterEach(() => { server.resetHandlers(); resetStore(); cleanup() })`, `afterAll(() => server.close())`.
  Default handlers in `handlers.ts` implement the four endpoints over an in-memory store seeded per test
  (`seedTasks(n)`), mirroring SCRUM-2 semantics (newest first, `page`/`size`, 404 body, 400 body with
  `fieldErrors`). Tests override per case with `server.use(http.get(..., () => HttpResponse.json(errorBody(500), { status: 500 })))`,
  `HttpResponse.error()` for network failures, and a deferred promise for loading/in-flight states.
  Request assertions capture `request.url`/`await request.json()` inside handlers (no fetch spying).
- **Rendering:** `renderApp('/tasks/7/edit')` → `createMemoryRouter(routes, { initialEntries: [path] })` +
  `RouterProvider`; returns `{ router, user: userEvent.setup() }`. `router.state.location` asserts URLs.
- **Queries:** by role/label only (`getByRole('button', { name: 'Retry' })`, `getByLabelText('Title')`) —
  this enforces NFR-07. No snapshot tests, no `data-testid` unless unavoidable.
- **Naming (ADR 0004 adapted):** every test file has exactly one top-level `describe('SCRUM-1 <area>', …)`;
  every `it`/`test` name starts with the AC/NFR ID(s) it verifies, e.g.
  `it('SCRUM-1-AC-03: shows empty state with create link when no tasks', …)`, multi-ID
  `it('SCRUM-1-AC-07, SCRUM-1-AC-04: …')`. Vitest's junit reporter writes
  `name="SCRUM-1 task list &gt; SCRUM-1-AC-01: …"` into `reports/junit.xml` (verified), so
  `grep -o 'SCRUM-1-AC-[0-9]*' reports/junit.xml | sort -u` lists covered ACs. Run one area with
  `npx vitest run -t "SCRUM-1-AC-07"`.

**Test file → AC mapping (minimum; Dev may add cases)**

| Test file | Top-level describe | Verifies |
|---|---|---|
| `src/api/config.test.ts` | `SCRUM-1 API configuration` | AC-13 (default `http://localhost:8080`, env override, trailing slash/blank handling) |
| `src/api/client.test.ts` | `SCRUM-1 API client` | AC-10 (network `TypeError` → `ApiError('network', 0)`, 5xx → generic message, body not leaked), AC-08 (400 body → `fieldErrors`; non-JSON 400 → generic), AC-11 (404 → `not-found`), AC-13 (requests go to `API_BASE_URL`), NFR-05 (typed results) |
| `src/api/tasks.test.ts` | `SCRUM-1 tasks API` | AC-01/AC-02 (`GET /api/tasks?page=N&size=20`), AC-04 (POST body/201), AC-05 (GET by id), AC-06 (PUT body with all four fields) |
| `src/components/taskForm.test.ts` | `SCRUM-1 task form model` | AC-07 (blank/whitespace title, 200 vs 201 chars after trim, 2000 vs 2001 description, past date OK), AC-04 (trim, `''`→`null`), AC-06 (update request always has status), AC-08 (`mapServerErrors` known/unknown/no fields) |
| `src/components/TaskForm.test.tsx` | `SCRUM-1 task form` | AC-07 (inline messages, no request), AC-08 (server errors inline + form-level, input preserved), AC-09 (submit disabled + "Saving…"), NFR-07 (labels, `aria-invalid`/`aria-describedby`, Enter submits, focus on first invalid field) |
| `src/components/BuildInfo.test.tsx` | `SCRUM-1 build identity` | NFR-09 (footer shows `SCRUM-1` and short SHA from `__JIRA_KEY__`/`__GIT_SHA__`) |
| `src/pages/TaskListPage.test.tsx` | `SCRUM-1 task list` | AC-01 (title, status label, due date / "No due date", API order), AC-02 (page 1/2/3 requests, Prev/Next disabled at bounds, hidden when `totalPages ≤ 1`, `?page` in URL), AC-03 (empty state + CTA), AC-09 (`role="status"` while loading), AC-10 (500 and network error → `role="alert"` + Retry re-requests and recovers) |
| `src/pages/TaskCreatePage.test.tsx` | `SCRUM-1 create task` | AC-04 (fields, default TODO, POST payload trimmed/nulls, back on `/` with new task visible), AC-06 (Cancel → `/`, no request), AC-07, AC-08, AC-09 (no double POST on double click), AC-10 (5xx/network submit → form error, input kept, resubmit works) |
| `src/pages/TaskEditPage.test.tsx` | `SCRUM-1 edit task` | AC-05 (loading then prefilled), AC-06 (PUT with all fields incl. status, return to list showing updated values, Cancel no request), AC-09, AC-10 (load error + Retry; submit error), AC-11 (GET 404, PUT 404, non-numeric id → "Task not found" + link, no request) |
| `src/routes.test.tsx` | `SCRUM-1 routing` | AC-12 (`/`, `/tasks/new`, `/tasks/:id/edit` render the right page on direct entry = refresh; New task → back via `router.navigate(-1)` returns to list; list `?page=2` survives re-entry; unknown path → Page not found; `/tasks/abc/edit` → not found) |

**Not covered by automated tests (by design):**
- **AC-14** — configuration evidence (`server.port: 5173, strictPort: true` in `vite.config.ts`, no proxy) plus a
  manual smoke check by Dev against the SCRUM-2 backend with default config (`docker compose up -d`,
  `./mvnw spring-boot:run`, `npm run dev`, list/create/edit in a browser); record the result in the matrix.
  NFR-04 requires tests for AC-01..13 only.
- NFR-01/02/03/05/06/08 — evidenced by files and the CI run, listed in the matrix.

**Coverage (`vitest run --coverage`, `@vitest/coverage-v8`):**

```ts
coverage: {
  provider: 'v8',
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
  reporter: ['text', 'html', 'lcov', 'json-summary'],
  reportsDirectory: './reports/coverage',
  thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
}
```

The run fails below threshold (mirrors SCRUM-2's 80% line gate). `reporters: ['default', 'junit']`,
`outputFile: { junit: './reports/junit.xml' }` — junit is written on every run, including failures.

## 10. `vite.config.ts` (reference shape — verified in the spike)

```ts
/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
// git(), jira/commit/branch/builtAt per §8; buildInfo(): Plugin per §8
export default defineConfig({
  plugins: [react(), buildInfo()],
  define: { __JIRA_KEY__: JSON.stringify(jira), __GIT_SHA__: JSON.stringify(commit) },
  server: { port: 5173, strictPort: true },          // AC-14: fail rather than drift to 5174 (not CORS-allowed)
  preview: { port: 4173 },
  build: { sourcemap: true },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'],
          reporters: ['default', 'junit'], outputFile: { junit: './reports/junit.xml' },
          coverage: { /* §9 */ } },
})
```

No `server.proxy` (A-02). Dev server binds to `localhost` (default).

## 11. TypeScript & lint (NFR-05)

- `tsconfig.app.json`: `target ES2022`, `lib [ES2022, DOM, DOM.Iterable]`, `module ESNext`,
  `moduleResolution bundler`, `jsx react-jsx`, `strict: true`, `noUncheckedIndexedAccess: true`,
  `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax: true`,
  `noEmit: true`, `skipLibCheck: true`,
  `types: ["vite/client", "vitest/globals", "@testing-library/jest-dom/vitest"]`, `include: ["src"]`.
- `tsconfig.node.json`: same strictness, `lib [ES2023]`, `types: ["node"]`, `include: ["vite.config.ts"]`.
- Both set `tsBuildInfoFile` under `node_modules/.tmp/` (required by `tsc -b` with `noEmit`).
- `eslint.config.js` (flat):
  ```js
  export default defineConfig([
    globalIgnores(['dist', 'reports', 'coverage']),
    { files: ['**/*.{ts,tsx}'],
      extends: [js.configs.recommended, tseslint.configs.recommended,
                reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
      languageOptions: { globals: globals.browser },
      rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  ])
  ```
  `npm run lint` uses `--max-warnings 0`.

## 12. Configuration summary (AC-13, AC-14, NFR-08)

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | `frontend/.env.local` / shell / CI env | `http://localhost:8080` | Backend origin (no trailing `/api`) |
| `GITHUB_SHA`, `GITHUB_REF_NAME`, `GITHUB_HEAD_REF` | set by GitHub Actions | git CLI fallback | Build identity (NFR-09) |
| `JIRA_KEY` | optional | `SCRUM-1` | Build identity Jira key |

`frontend/.env.example` (committed):
```
# SCRUM-1-AC-13: origin of the SCRUM-2 backend (no trailing slash, no /api suffix)
VITE_API_BASE_URL=http://localhost:8080
```

README (NFR-08): add a "Frontend (SCRUM-1)" section — prerequisites (Node 22 via `.nvmrc`), `cd frontend &&
npm ci`, env table above, run against local backend (start backend per existing steps, then `npm run dev`, open
`http://localhost:5173`), test/coverage/lint/typecheck/build commands, report locations
(`frontend/reports/junit.xml`, `frontend/reports/coverage/index.html`, `frontend/dist/build-info.json`), and the
frontend traceability bullets (§14). Keep the backend sections unchanged; update the intro to mention both parts.

## 13. CI design (NFR-06)

Add one job, `frontend`, to the existing `.github/workflows/ci.yml`. The existing `build` (backend) job, the
workflow `name`, triggers and `permissions` are **left byte-for-byte unchanged**; the two jobs run in parallel
on the same triggers (push to `feature/**`/`main`, all PRs). No path filters.

```yaml
  # SCRUM-1-NFR-06: frontend lint, typecheck, tests (+coverage gate, junit) and production build artifact.
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: frontend/.nvmrc        # "22"
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install
        run: npm ci

      - name: Audit runtime dependencies
        run: npm audit --omit=dev --audit-level=high

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Test with coverage gate
        run: npm run test:coverage

      - name: Build
        run: npm run build                          # GITHUB_SHA / GITHUB_REF_NAME feed build-info (NFR-09)

      - name: Test & coverage summary
        if: always()
        run: |
          if [ -f reports/coverage/coverage-summary.json ]; then
            node -e 'const s=require("./reports/coverage/coverage-summary.json").total.lines.pct; console.log(`### SCRUM-1 frontend line coverage: ${s}%`)' >> "$GITHUB_STEP_SUMMARY"
          fi
          if [ -f reports/junit.xml ]; then
            echo "### SCRUM-1 acceptance criteria exercised by tests" >> "$GITHUB_STEP_SUMMARY"
            { grep -o 'SCRUM-1-AC-[0-9]*' reports/junit.xml || true; } | sort -u | tr '\n' ' ' >> "$GITHUB_STEP_SUMMARY"
            echo >> "$GITHUB_STEP_SUMMARY"
          fi

      - name: Upload dist
        uses: actions/upload-artifact@v4
        with:
          name: todo-frontend-SCRUM-1-${{ github.sha }}
          path: frontend/dist/                      # upload-artifact ignores working-directory → repo-relative path
          if-no-files-found: error

      - name: Upload test & coverage reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: todo-frontend-SCRUM-1-${{ github.sha }}-reports
          path: |
            frontend/reports/junit.xml
            frontend/reports/coverage/
          if-no-files-found: warn
```

Notes:
- `defaults.run.working-directory` applies to `run` steps only; `uses` steps take repo-relative paths (hence
  `frontend/...` above).
- `fetch-depth` default (1) is enough: commit comes from `GITHUB_SHA`, branch from `GITHUB_REF_NAME`/`GITHUB_HEAD_REF`.
- Any failing step fails the job (default `bash -e`); reports upload runs on failure too (`if: always()`).
- Same action major versions as the backend job (`checkout@v4`, `upload-artifact@v4`); `setup-node@v4`.

**Follow-up (not in this story):** the workflow is still named `SCRUM-2 CI` and the backend artifacts are
`todo-backend-SCRUM-2-<sha>` — they encode the story that introduced them, not the story being built. Leave the
backend job and workflow name untouched in SCRUM-1 (NFR-06: "keeps working unchanged"; avoids a cross-story
change in a frontend PR). Raise a follow-up (e.g. under SCRUM-7) to rename the workflow to `CI` and decide on a
project-level artifact naming scheme (e.g. `todo-backend-<sha>` with the Jira key taken from the branch/PR), and
update the SCRUM-2 matrix/README references at the same time.

## 14. Traceability (ADR 0004 applied to the frontend)

| Artefact | Convention for SCRUM-1 |
|---|---|
| Jira | [SCRUM-1](https://suranagivinod.atlassian.net/browse/SCRUM-1), epic SCRUM-5 |
| Branch | `feature/SCRUM-1-<slug>` → this story: `feature/SCRUM-1-react-frontend-setup` |
| Commits | subject `SCRUM-1: [ROLE] <summary>` (ROLE ∈ PM, ARCH, DEV, QA, CI, REVIEW), body trailer `Refs: SCRUM-1`; reference AC IDs in the body where useful |
| Requirements | `docs/requirements/SCRUM-1.md` (`SCRUM-1-AC-01..14`, `SCRUM-1-NFR-01..09`) |
| Design | this document + ADRs 0005–0007; code comments reference AC IDs only where non-obvious (e.g. `// SCRUM-1-AC-11: non-numeric id → not found without a request`) |
| Tests | one top-level `describe('SCRUM-1 <area>')` per file; every `it` name starts with `SCRUM-1-AC-xx` / `SCRUM-1-NFR-xx` (§9) — visible in `frontend/reports/junit.xml` |
| Build | `dist/build-info.json` `{jira, commit, branch, builtAt}`, `<meta name="build-info">` in `dist/index.html`, footer `SCRUM-1 · <sha7>` (§8) |
| CI | job `frontend` in `.github/workflows/ci.yml`; artifacts `todo-frontend-SCRUM-1-${{ github.sha }}` (dist) and `todo-frontend-SCRUM-1-${{ github.sha }}-reports` (junit + coverage); job summary lists covered ACs + coverage |
| PR | title `SCRUM-1: React frontend setup`; body links Jira, requirements, this design, ADRs 0005–0007, matrix, and the CI run |
| Matrix | [`docs/traceability/SCRUM-1.md`](../traceability/SCRUM-1.md): ID → code → test (`file › it name`) → CI evidence; Dev fills it, CI run link added after the first green build |

Verification commands (for README and reviewers):

```bash
cd frontend
npm run test:coverage && grep -o 'SCRUM-1-AC-[0-9]*' reports/junit.xml | sort -u   # expect AC-01..AC-13
npm run build && cat dist/build-info.json && grep build-info dist/index.html
npx vitest run -t 'SCRUM-1-AC-11'                                                   # one AC's tests
```

## 15. Implementation order for Dev (suggested commits)

1. `SCRUM-1: [DEV] scaffold Vite React TS app with pinned deps, scripts, lint and tsconfig` (+ root `.gitignore` `!.env.example`)
2. `SCRUM-1: [DEV] add typed API client, error normalisation and config` (+ tests)
3. `SCRUM-1: [DEV] add routing, layout, build identity and list page with paging` (+ tests)
4. `SCRUM-1: [DEV] add create/edit task form with validation and error states` (+ tests)
5. `SCRUM-1: [DEV] add frontend CI job` (`[CI]` role acceptable)
6. `SCRUM-1: [DEV] document frontend in README and fill traceability matrix`

Each with `Refs: SCRUM-1`. Definition of done: `npm ci && npm run lint && npm run typecheck &&
npm run test:coverage && npm run build` green locally from a clean clone; `git diff main -- src pom.xml` empty
(backend untouched); `.github/workflows/ci.yml` diff only adds the `frontend` job; manual AC-14 smoke check done.

## 16. Risks

| Risk | Mitigation |
|---|---|
| New majors (Vite 8, Vitest 5, MSW 3, ESLint 10, React Router 8) have API changes vs. common examples | Spike-verified versions and snippets in this doc; exact pins; lockfile |
| TypeScript 7 `latest` incompatible with typescript-eslint | Pin TS 6.0.3 (ADR 0005); revisit when typescript-eslint supports TS 7 |
| `.env.example` silently ignored | Root `.gitignore` negation (§2) |
| Dev server falling back to port 5174 → CORS failures | `strictPort: true` (§10) |
| Flaky async tests | `findBy*`/`waitFor`, deferred MSW responses for loading states, no timers/sleeps, `onUnhandledFrame: 'error'` |
| Dev-only transitive `picomatch` advisory | Audit gate on runtime deps only; bump when upstream fixes |
