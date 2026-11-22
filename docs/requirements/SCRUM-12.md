# SCRUM-12 — Add OpenAPI contract tests for the Task REST API (backend + frontend): Refined Requirements

| Field | Value |
|---|---|
| Jira key | [SCRUM-12](https://suranagivinod.atlassian.net/browse/SCRUM-12) |
| Type | Story (quality / API governance) |
| Parent epic | SCRUM-5 — Build a To-Do Application (Spring Boot, React, PostgreSQL, REST APIs) |
| Depends on | SCRUM-2 (REST API, [ADR 0003](../adr/0003-error-response-format.md)), SCRUM-6 (`PATCH …/status`, `status` filter, [ADR 0009](../adr/0009-status-sub-resource-patch.md)), SCRUM-1 (frontend, [ADR 0006](../adr/0006-frontend-api-client-and-state.md), [ADR 0007](../adr/0007-frontend-testing-msw.md)), SCRUM-7 (real-HTTP ITs, e2e), SCRUM-8 (CI/Release, pinned tools, NFR-02) — all merged; `main` = `1fde974` |
| Branch | `feature/SCRUM-12-openapi-contract-tests` |
| Author role | Product Manager (PM → Architect → Dev pipeline) |
| Status | Draft — ready for architecture |

**Traceability:** Requirements carry stable IDs (`SCRUM-12-AC-xx`, `SCRUM-12-NFR-xx`). Design, code, tests
(`@Tag("SCRUM-12")`, `@DisplayName`/test names starting with the AC IDs), commits (`SCRUM-12: [ROLE] …` +
`Refs: SCRUM-12`) and CI evidence reference them per [ADR 0004](../adr/0004-traceability-conventions.md) (as amended
by ADR 0008 / 0013). Dev fills `docs/traceability/SCRUM-12.md`.

**Requirement keywords:** "must" = mandatory for acceptance; "should" = expected unless the design justifies a
deviation; "may" = Architect's option.

---

## 1. Problem statement

The Task REST API is described only in prose: SCRUM-2 design §5–6 (endpoints, bodies, error body) and SCRUM-6 design
§3 (status sub-resource, `status` filter). Three copies of that contract are kept in sync **by hand**:

1. the backend (`TaskController`, DTO records, `ApiError`/`FieldErrorItem`, `GlobalExceptionHandler`);
2. the frontend types (`frontend/src/api/types.ts`, "typed mirror of the REST contract") and the client functions in
   `frontend/src/api/tasks.ts`;
3. the frontend test doubles — MSW default handlers (`frontend/src/test/handlers.ts`) and payload builders
   (`frontend/src/test/fixtures.ts`) — which ADR 0007 itself flags as a drift risk "until E2E/contract tests exist".

Nothing fails today if, for example, the backend renames `dueDate`, makes `description` non-nullable, adds a status
code, or if an MSW handler returns a field the backend never sends: unit tests on both sides stay green against their
own assumptions, and only the (narrow) Playwright suite might notice. There is also no machine-readable description a
consumer or reviewer can diff, and no signal when a change breaks existing clients.

Facts the Architect needs (from the code on `main` `1fde974`, not decisions):

| Operation (Spring mapping) | Success | Error statuses the running app produces today (ADR 0003 body) |
|---|---|---|
| `POST /api/tasks` (`create`) | **201** + `Location` header, `TaskResponse` | 400 (validation, malformed JSON, invalid enum/date), 415 (non-JSON content type), 500 |
| `GET /api/tasks/{id}` (`get`) | **200** `TaskResponse` | 400 (non-numeric id), 404, 500 |
| `GET /api/tasks?page&size&status` (`list`) | **200** `PageResponse<TaskResponse>` | 400 (`page` < 0, `size` < 1, non-numeric, invalid/empty/repeated `status`), 500 |
| `PUT /api/tasks/{id}` (`update`) | **200** `TaskResponse` | 400, 404, 415, 500 |
| `PATCH /api/tasks/{id}/status` (`updateStatus`) | **200** `TaskResponse` | 400, 404, 415, 500 |
| `DELETE /api/tasks/{id}` (`delete`) | **204** no body | 400 (non-numeric id), 404, 500 |
| unmapped route / unsupported method | — | 404 / 405 (`Allow` header), same body |

- `size` > 100 is **clamped**, not rejected (SCRUM-2 A-07); `status` is bound as raw `String[]` and parsed strictly
  (ADR 0009) — a generator that infers the parameter from the Java type would describe it wrongly.
- `TaskResponse.description` and `.dueDate` are serialized as `null` when absent (SCRUM-2 design §5); the frontend
  sends `null` for empty optional fields on POST/PUT.
- Backend: Spring Boot 4.1.2 / Spring Framework 7 / **Jackson 3** (`tools.jackson`) / Java 21. Maven Central is not
  reachable from the agent sandbox — the backend is built and tested by CI only. npm works locally.
- Frontend: TypeScript **6.0.3**, MSW **3.0.6**, Vitest 5.1.0, Node 22 (`.nvmrc`).
- CI conventions (SCRUM-8-NFR-02): new workflow steps use SHA-pinned actions; downloaded CLIs are pinned by version
  **and** SHA-256 in `.github/scripts/release/install-tools.sh`; shell scripts under `.github/scripts/` are
  shellcheck-linted by the `Release` workflow's `tooling` job.
- Production exposure today: only `/api/**`, `/actuator/health` and `/actuator/info` on the backend
  (SCRUM-7-AC-15); nginx proxies only `/api/` and `/actuator/health` (ADR 0011).

## 2. Goal

One committed, reviewed OpenAPI document is the contract for the Task API. CI proves, on every push and pull request,
that (a) the backend serves exactly what the document says, (b) the frontend's types and test doubles agree with it,
and (c) any change to it that would break existing clients is visible and needs an explicit, reviewable
acknowledgment.

## 3. Scope

### In scope
- An OpenAPI 3.x document for the six Task operations, committed to the repository.
- A recorded decision (ADR) on the source of truth: code-first (generated from the backend, e.g. springdoc-openapi)
  vs. spec-first (hand-written, code validated against it).
- Backend contract tests against the running application (real HTTP, PostgreSQL via Testcontainers as in the
  SCRUM-7 integration tests) for success and error responses.
- Drift detection between the committed document and what the backend actually serves.
- Frontend: types generated from or checked against the document; MSW handlers/fixtures validated against it.
- Breaking-change detection against `main` with an explicit acknowledgment mechanism.
- CI wiring (`CI` workflow; `Release` dry-run must keep passing), README/docs, ADR, design, traceability matrix.

### Out of scope
- Any change to API behaviour (paths, status codes, bodies, headers, validation, CORS) — the contract documents what
  exists. Inconsistencies found while documenting are recorded as follow-ups, not fixed here.
- Publishing the document or an interactive UI (Swagger UI / Scalar) in any deployed environment.
- Actuator endpoints in the contract (`/actuator/health`, `/actuator/info` stay covered by SCRUM-7 tests).
- Generated API **clients** (backend or frontend) replacing the hand-written `client.ts` / `tasks.ts` (ADR 0006 stays).
- Consumer-driven contract tooling (Pact etc.), contract publishing to a broker, API versioning in URLs.
- Contract version numbering policy (`info.version` semantics) beyond what the design needs for determinism.
- Documenting 405/406 for undeclared methods/media types per operation (OpenAPI describes declared operations; the
  generic 404/405 behaviour stays specified by ADR 0003 and tested by `ErrorContractIntegrationTest`).

## 4. Acceptance criteria

Jira ACs are split into verifiable criteria; the right column maps them back.

| ID | Criterion (must) | Jira AC |
|---|---|---|
| SCRUM-12-AC-01 | An OpenAPI **3.x** document is committed at a fixed path in the repository. It describes all six Task operations (§1 table) with a stable `operationId` each; the `page`, `size` and `status` query parameters (type, default, minimum, allowed `status` values, single-valued, optional); the `id` path parameter; request bodies (`TaskCreateRequest`, `TaskUpdateRequest`, `TaskStatusUpdateRequest`) with required fields, nullability and length limits; response bodies (`TaskResponse`, page response) with required and nullable fields; **every status code each operation produces** per §1 (incl. 201 + `Location`, 204 without body); and the standard `ApiError` / `FieldErrorItem` body as a reusable component referenced by every error response. | "An OpenAPI 3.x document describes all Task endpoints, parameters (page, size, status), request/response bodies, status codes and the standard ApiError body, and is committed to the repo" |
| SCRUM-12-AC-02 | The source-of-truth decision (code-first vs. spec-first) is recorded in a new ADR with the options considered, the rationale and the consequences (how the document is updated, who reviews it, where generation runs). | "(source of truth decided and recorded in an ADR: code-first via springdoc vs. spec-first)" |
| SCRUM-12-AC-03 | Backend contract tests send representative requests over real HTTP to the running application (PostgreSQL via Testcontainers) and validate **every** response against the **committed** document: the status code is documented for that operation, the `Content-Type` matches a documented media type, the body validates against the documented schema (no undocumented properties, required properties present, types/formats/enums respected), documented required headers are present, and 204 responses have no body. Success and error cases are covered. | "Backend contract tests verify the running application's responses (success and error cases) conform to the contract" |
| SCRUM-12-AC-04 | The backend build fails if (a) the application serves an `/api/**` endpoint (method + path) that the document does not describe, or the document describes one the application does not serve; (b) a response has a status code the document does not list for that operation; or (c) a documented `(operation, status)` pair is not exercised by any contract-test scenario (500 may be exempted, with the reason stated). | "CI fails on any mismatch or undocumented endpoint/status" |
| SCRUM-12-AC-05 | CI detects drift between the committed document and the document the backend generates/serves: a semantic difference fails the backend job with a **readable diff** (unified, line-oriented, in the test output and the job summary or an uploaded artifact). Ordering/formatting-only differences do not fail. The procedure to bring the committed document up to date is documented and produces a byte-identical result when repeated. | "CI detects drift between the committed spec and what the backend actually serves (e.g. generated spec diff), failing with a readable diff" |
| SCRUM-12-AC-06 | Frontend API types are generated from the committed document (generated file committed); the `frontend` CI job fails if the generated file is not up to date. `types.ts` derives its contract types from the generated ones or is checked against them at compile time, so that a contract change incompatible with the UI code fails `npm run typecheck`. Runtime constants (`TASK_STATUSES`) are checked to list exactly the documented enum values. | "Frontend: the API types … are generated from or validated against the contract …" |
| SCRUM-12-AC-07 | The MSW default handlers and the payload builders in `fixtures.ts` are validated against the committed document in a frontend test: every default handler maps to a documented operation, and each response they produce for representative requests (success and error) has a documented status and a schema-valid body (no undocumented properties). A contract change that the handlers/fixtures no longer satisfy fails the `frontend` job. | "… and/or MSW handlers are generated from or validated against the contract, so a contract change that breaks the UI fails the frontend job" |
| SCRUM-12-AC-08 | CI compares the document on the branch with the document on `main` (the merge base for branch pushes and pull requests; the previous commit for pushes to `main`) using a breaking-change tool, reports **all** changes (breaking and non-breaking) in the job summary, and fails when a breaking change (at least: removed operation/field/enum value, changed type, field became required/nullable where that breaks clients, new required parameter, removed success status, new response enum value) is not acknowledged. When `main` has no document yet, the check passes with a notice. | "Breaking-change detection: CI reports breaking changes to the contract against main (e.g. removed field, changed type, new required param) …" |
| SCRUM-12-AC-09 | The acknowledgment is explicit, reviewable in the pull-request diff, verifiable identically in `push` and `pull_request` runs (no dependency on PR labels or other PR-only data), identifies the story that accepts the break (Jira key) with a justification, and acknowledges only the specific change(s) listed — not "anything". Malformed acknowledgments fail the check; stale ones are reported. | "… and fails unless explicitly acknowledged" |
| SCRUM-12-AC-10 | The generated API description and any API-documentation UI are **not reachable in production**: the released backend image answers 404 (ApiError body) for `/v3/api-docs`, `/v3/api-docs.yaml`, `/swagger-ui.html` and `/swagger-ui/**` (or whatever paths the chosen generator uses), and nginx does not proxy them. Verified by an automated check against the built image/jar, not only by configuration review. | Constraint from refinement ("springdoc endpoints must not be exposed in production") |
| SCRUM-12-AC-11 | No change to API behaviour: all existing backend tests (`TaskControllerTest`, `ErrorContractIntegrationTest`, …), frontend tests and Playwright suites pass **unchanged** (assertions not modified); coverage gates (backend JaCoCo 80 % lines on service/web, frontend 80/80/80/75) unchanged and met; `CI` (identity, build, frontend, e2e, new contract job) and the `Release` dry-run (incl. tooling, scan, e2e-release, release-gate) are green on the branch head. | "Existing tests, coverage gates, CI and Release dry-run stay green; no change to API behaviour." |
| SCRUM-12-AC-12 | README (and/or a doc linked from it) explains: where the contract lives; how to change an endpoint and update the document, the generated frontend types and the handlers; how to read a drift / conformance / breaking-change failure; how to acknowledge an intended breaking change; which commands run each check locally. | "README / docs explain how to update the contract" |
| SCRUM-12-AC-13 | Each new gate is proven to fail: automated tests show that the backend conformance checker rejects an undocumented status, an undocumented property, a missing required property, a wrong type and an unknown operation; that the drift check reports a diff for a changed document; that the breaking-change gate fails on an unacknowledged break and passes with a valid acknowledgment; and that the frontend validator rejects a non-conforming handler response. | (implied by "CI fails on …") |
| SCRUM-12-AC-14 | Traceability per ADR 0004: test classes tagged `SCRUM-12`, test names start with AC IDs, commits `SCRUM-12: [ROLE] …` + `Refs: SCRUM-12`, `docs/traceability/SCRUM-12.md` filled with CI run links; new CI job(s) list the SCRUM-12 AC IDs they exercise in the job summary like the existing jobs. | "traceability per ADR 0004" |

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| SCRUM-12-NFR-01 | **No production footprint beyond documentation metadata.** The production jar/image must not gain an HTTP endpoint, a UI or a document generator; any library added to the runtime classpath must be annotation-only (no transitive dependencies) and is subject to the existing vulnerability gate (ADR 0014). Fail-safe defaults: if a generator were ever on the runtime classpath, its endpoints must be off unless explicitly enabled. |
| SCRUM-12-NFR-02 | **Supply chain (SCRUM-8-NFR-02):** new actions SHA-pinned; downloaded CLIs pinned by version + SHA-256 in `install-tools.sh` (checksums taken from the upstream release and verified); npm dev dependencies at exact versions in `package.json` + lockfile; Maven versions explicit or BOM-managed; every chosen version verified compatible with Boot 4.1.2 / Spring 7 / Jackson 3 / Java 21 and TypeScript 6 / MSW 3 (evidence in the design). |
| SCRUM-12-NFR-03 | **Deterministic and canonical:** generating the document twice from the same commit yields identical bytes; no random ports, build versions, timestamps or host names in it. The committed file is in one canonical form (key order, formatting) so diffs are minimal and reviewable. |
| SCRUM-12-NFR-04 | **Readable failures:** every gate names the operation (`METHOD /path`, `operationId`), the status, the JSON pointer of the failing value and what was expected; drift prints a unified diff; the breaking-change gate prints each unacknowledged change with the tool's rule id and the exact line to add to acknowledge it. |
| SCRUM-12-NFR-05 | **Single source of truth:** exactly one committed contract document; no second hand-maintained copy of response shapes in the frontend (derive or assert). |
| SCRUM-12-NFR-06 | **CI cost:** the backend job grows by at most one additional Spring context / PostgreSQL container; a new contract job (if any) completes in ≤ 3 minutes; frontend job growth ≤ 1 minute. |
| SCRUM-12-NFR-07 | **Local reproducibility:** every frontend and breaking-change check is runnable locally with Node/npm (and the pinned CLI via `install-tools.sh`); backend checks with JDK 21 + Docker (`./mvnw verify`), including a documented "update the committed document" command. |
| SCRUM-12-NFR-08 | **Minimal, reviewable diff:** only the files the design lists change; documentation annotations on controller/DTOs must not change runtime behaviour (any annotation with a runtime effect must be justified in the design and covered by the unchanged existing tests). |
| SCRUM-12-NFR-09 | **Test-classpath hygiene:** if test-scope libraries bring Jackson 2 (`com.fasterxml.jackson.databind`) or other parallel stacks, the application under test must still serialize with Jackson 3 exactly as in production; a guard test asserts it. |
| SCRUM-12-NFR-10 | Existing release mechanics unaffected: jar/tarball reproducibility (SCRUM-8-NFR-03), SBOM validity and floors, image sizes (≤ 300 / 80 MB), the `Release` workflow file needs no change unless the design justifies one. |

## 6. Assumptions

| ID | Assumption |
|---|---|
| A-01 | A springdoc-openapi line supporting Spring Boot 4.x exists (3.x) and a release built against Boot **4.1.x** is available on Maven Central; the Architect verifies via the upstream repository (GitHub reachable, Maven Central not). |
| A-02 | The documented contract equals today's behaviour; if documenting reveals an inconsistency (e.g. a status code the design never mentioned), it is documented as-is and raised as a follow-up issue, not fixed in this story (NFR-08, AC-11). |
| A-03 | 500 responses cannot be provoked over real HTTP without fault injection; documenting 500 on every operation (ADR 0003 body) and exempting it from the "every documented status is exercised" rule is acceptable if the design states it and existing `@WebMvcTest` tests (SCRUM-2-AC-14) keep covering the 500 body. |
| A-04 | The first introduction of the document (this story) has no baseline on `main`; the breaking-change check passes with a notice on this branch and becomes effective for the next story. |
| A-05 | The Dev agent cannot run the backend build locally; bootstrapping the committed document may take a CI round-trip (generated document taken from the CI artifact after review). The design must make this workflow explicit. |
| A-06 | Pull requests are merged with merge commits (history of `main`: "Merge pull request #8 …"); the acknowledgment mechanism must nevertheless survive squash/rebase merges. |

## 7. Questions for the Architect

| ID | Question |
|---|---|
| Q-01 | Code-first (springdoc generating at test time, committed snapshot reviewed) or spec-first (hand-written document, springdoc output or tests validate code against it)? Where does the generator run (test scope only?) and how is production exposure ruled out structurally rather than by a property? |
| Q-02 | OpenAPI 3.0 or 3.1? Consider nullability (`nullable` vs. `type: [T, "null"]`), the generator's default, the Java and TypeScript validators and the breaking-change tool. |
| Q-03 | Which Java response validator (Jackson 3 compatibility; a Jackson 2-based library only with a stated classpath impact), and how are undocumented properties detected (the document itself should not need `additionalProperties: false` if that would make additive changes breaking)? |
| Q-04 | How is the `status` filter (bound as `String[]`, ADR 0009) and the 201 `Location` header described correctly without behaviour change? |
| Q-05 | Normalisation for the drift diff: what is stripped/sorted, and is the committed file required to be in canonical form? |
| Q-06 | Frontend: `openapi-typescript` (peer dependency vs. TypeScript 6?), `openapi-msw` typed handlers vs. runtime validation of handler responses (Ajv), or both? How does a Vitest test read a file outside `frontend/` without changing dev-server behaviour or the Docker build context? |
| Q-07 | Breaking-change tool (e.g. `oasdiff`), which rules fail, base-commit selection for `push` vs. `pull_request` vs. `main`, and the acknowledgment mechanism (file entry vs. commit trailer vs. label) — which one is verifiable in both event types and survives squash merges? |
| Q-08 | Should the `Release` workflow run any of the new checks, or is `CI` sufficient (the release is cut from `main`, which passed CI)? |
