# ADR 0006 — Frontend data access: typed `fetch` client with normalised `ApiError`, page-local state via a small `useAsync` hook

- Status: Accepted · the contract trusted by `client.ts` is now `api/openapi.yaml`, enforced by [ADR 0017](0017-api-contract-openapi.md) (SCRUM-12)
- Date: 2026-11-17
- Jira: [SCRUM-1](https://suranagivinod.atlassian.net/browse/SCRUM-1) — SCRUM-1-AC-01, AC-04..AC-11, AC-13, NFR-05; assumptions A-01, A-02, A-07, A-08

## Context

The UI uses four endpoints of the SCRUM-2 API (list, get, create, update) and must show loading indicators
(AC-09), user-friendly errors with Retry for network/5xx failures without leaking response bodies (AC-10), a
"Task not found" state on 404 (AC-11), inline server validation errors from the ADR 0003 error body (AC-08), and
read the base URL from `VITE_API_BASE_URL` (AC-13). NFR-05 forbids `any` in API types. A-08 prefers minimal
dependencies. There is no caching, background refresh, optimistic update or cross-page shared state requirement;
edits are last-write-wins (A-07).

Options considered for data fetching: (a) TanStack Query / SWR, (b) React Router loaders/actions, (c) plain
`fetch` + a small typed client + a custom hook.

## Decision

Option (c).

- **`src/api/client.ts`** is the only module that calls `fetch`. It builds URLs from `API_BASE_URL`
  (`resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL)`, default `http://localhost:8080`, trailing slashes
  stripped), sets JSON headers, supports `AbortSignal`, and converts every failure into an **`ApiError`**:
  `kind` (`network` | `validation` | `not-found` | `server` | `http`), `status` (0 for network), a
  user-safe `message`, and `fieldErrors`. Network/CORS `TypeError` → `network`; 400 → `validation` with
  `fieldErrors` from a type-guarded `ApiErrorBody`; 404 → `not-found`; 5xx → `server` with a fixed generic
  message (body never shown); `AbortError` passes through untouched.
- **`src/api/tasks.ts`** exposes typed `listTasks(page)`, `getTask(id)`, `createTask(req)`, `updateTask(id, req)`
  with page size fixed at 20 (A-03). Types (`Task`, `TaskStatus`, `Page<T>`, `ApiErrorBody`, requests) mirror
  SCRUM-2 §5–6 exactly.
- **`useAsync(fn, deps)`** returns `{status:'loading'} | {status:'success',data} | {status:'error',error}` plus
  `reload()`, aborting in-flight requests on unmount/deps change. Pages use it for reads; submissions are plain
  async handlers with a `submitting` flag.
- **No global store.** Pages own their state; the list re-fetches on mount, so returning from create/edit always
  shows fresh server data (AC-04, AC-06). List page number is URL state (`?page=N`).
- Form values ↔ request mapping and client validation (mirroring SCRUM-2 Bean Validation rules) live in a pure
  module `taskForm.ts`, unit-tested independently of React.

Rejected: TanStack Query (caching/dedup/invalidation unneeded for four endpoints; adds a dependency and concepts);
React Router loaders/actions (couples data and error handling to the router and makes the AC-08 "keep input,
show inline errors" flow and per-section Retry more awkward to express and test).

## Consequences

- One place to change HTTP behaviour; components never see raw `Response`s, so the AC-10 no-leak rule is
  enforced structurally and testable in `client.test.ts`.
- No response caching: navigating back to the list always refetches (acceptable at this scale; a query library
  can replace `useAsync` later behind the same `api/tasks.ts` functions).
- Successful response bodies are trusted to match the contract (cast once in the client); error bodies are
  validated because intermediaries may return non-JSON.
- CORS failures are indistinguishable from "server down" in the browser; both surface as the network message.
