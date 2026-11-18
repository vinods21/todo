# ADR 0009 — Status changes via `PATCH /api/tasks/{id}/status`; single-valued, strictly parsed `status` filter

- Status: Accepted
- Date: 2026-11-17
- Jira: [SCRUM-6](https://suranagivinod.atlassian.net/browse/SCRUM-6) — SCRUM-6-AC-01..AC-07, assumptions A-01, A-03, A-04; open question Q-02
- Extends: SCRUM-2 REST contract ([design §5](../architecture/SCRUM-2-design.md)), error format [ADR 0003](0003-error-response-format.md)

## Context

The UI must change a task's status from the list without sending (and possibly clobbering) the other fields, and
list tasks filtered by status. `PUT /api/tasks/{id}` already exists as a full replacement and must not change
(NFR-01); `PATCH /api/tasks/{id}` currently returns 405 and an existing test pins that. PM decided: no transition
rules (A-01), a dedicated sub-resource returning the full task (A-03), a single optional filter value (A-04).

## Decision

### Status change

- `PATCH /api/tasks/{id}/status`, `Content-Type: application/json`, body `{"status": "TODO" | "IN_PROGRESS" | "DONE"}`
  (`TaskStatusUpdateRequest`, `@NotNull`, unknown properties ignored), **200** with the full `TaskResponse`.
- Any from→to transition is accepted; same→same is a successful no-op (idempotent). Last write wins (A-06).
- Errors use the ADR 0003 body: missing/null → `Validation failed` + `fieldErrors[status]`; unknown or
  wrong-case value → `Invalid value for field 'status'` + `fieldErrors[status]`; malformed JSON → 400; unknown
  id → 404; non-numeric id → 400; non-JSON → 415. Validation happens before the service, so a failed request
  never changes data.
- `PATCH /api/tasks/{id}` (no sub-resource) stays **405**; no JSON Merge Patch / JSON Patch support.
- CORS allows `PATCH`.

### Filter

- `GET /api/tasks?status=<NAME>` — optional; **exactly one** value that is exactly an enum constant name.
- Absent → unfiltered (SCRUM-2 behaviour). Unknown, wrong-case, empty (`?status=`), repeated
  (`status=A&status=B`) or comma-separated (`A,B`) → **400** `Invalid value for parameter 'status'`,
  `fieldErrors: []` (same shape as the existing type-mismatch error for query/path parameters).
- Filtering and the count are done in PostgreSQL (`findByStatus` with the existing `createdAt DESC, id DESC`
  sort), supported by Flyway V2 index `ix_tasks_status_created_at_id (status, created_at DESC, id DESC)`.
- Implementation detail that is part of the decision: the controller binds `status` as raw `String[]` and parses
  it itself, because Spring's enum binding turns an empty value into `null` (= silently unfiltered) and takes
  the first of repeated values.

## Alternatives considered

| Option | Why not |
|---|---|
| Reuse `PUT /api/tasks/{id}` from the list | Client must send all fields it may hold stale copies of (overwrites concurrent edits of title/description); heavier UI path; AC-09 forbids it |
| Generic `PATCH /api/tasks/{id}` with JSON Merge Patch (`application/merge-patch+json`) | General partial-update semantics (null = remove, validation per field, content type) for one field nobody else needs yet; breaks the pinned 405 test; out of scope (A-03) |
| `PUT /api/tasks/{id}/status` | Equally valid REST-wise; PM chose PATCH (A-03) as "partial modification of the task", and the response is the parent representation, which reads more naturally for PATCH. No functional difference |
| `POST /api/tasks/{id}/transitions` (command/action resource) | Implies a workflow/transition model that A-01 explicitly rejects |
| 204 No Content | UI would need a second GET to render server state (A-03) |
| Filter: `TaskStatus` enum `@RequestParam` | Empty value silently unfiltered (violates AC-07), repeated values silently first-wins |
| Filter: repeated values = first wins | Later multi-value support (Q-02) would change results of already-successful requests; 400 → 200 is the compatible direction |
| Filter: case-insensitive / trimmed values | Inconsistent with request bodies (Jackson is exact); more test surface |
| `Specification`/Querydsl for filtering | Single fixed predicate; derived query is enough (YAGNI) |
| No V2 index | Works at current size, but adding it later on a big table needs `CREATE INDEX CONCURRENTLY` (non-transactional migration); free now |

## Consequences

- New endpoint and parameter are additive; existing clients and tests are unaffected (except the CORS method list,
  which only grows).
- Multi-status filtering (Q-02) can later accept repeated `status` values without breaking any client that works
  today.
- Adding transition rules later would add a 409/422 error case to this endpoint — a contract change requiring a
  new ADR.
- One more migration (V2) to keep in mind for tests that count Flyway history rows.
