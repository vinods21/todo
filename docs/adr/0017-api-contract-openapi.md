# ADR 0017 — The Task API contract is a committed OpenAPI 3.1 snapshot generated code-first by springdoc in tests; CI enforces conformance, drift, frontend agreement and acknowledged breaking changes

- Status: Accepted
- Date: 2026-11-22
- Jira: [SCRUM-12](https://suranagivinod.atlassian.net/browse/SCRUM-12) — SCRUM-12-AC-01..AC-14, NFR-01..NFR-10;
  questions Q-01..Q-08
- **Amends:** [ADR 0007](0007-frontend-testing-msw.md) — MSW default handlers and fixtures are no longer trusted to
  mirror the backend by convention; they are validated against `api/openapi.yaml`. [ADR 0006](0006-frontend-api-client-and-state.md)
  — "successful bodies are trusted to match the contract": the contract is now `api/openapi.yaml`, enforced on both
  sides.
- Design: [SCRUM-12 design](../architecture/SCRUM-12-design.md)

## Context

The Task API (6 operations, ADR 0003 error body, ADR 0009 status filter) is described in prose only (SCRUM-2 design
§5–6, SCRUM-6 design §3) and mirrored by hand three times: backend code, `frontend/src/api/types.ts`, and the MSW
handlers/fixtures. Nothing fails when they diverge. SCRUM-12 asks for a committed OpenAPI 3.x document, backend
contract tests, drift detection, frontend validation and breaking-change detection with explicit acknowledgment —
without changing API behaviour and without exposing documentation endpoints in production.

Constraints: Spring Boot 4.1.2 / Spring Framework 7 / **Jackson 3** / Java 21; TypeScript 6.0.3, MSW 3.0.6; pinned
tools with checksums and SHA-pinned actions (SCRUM-8-NFR-02); the Dev agent cannot run Maven locally.

## Decision

### 1. Source of truth: code-first, committed snapshot

| Option | For | Against |
|---|---|---|
| **A. Code-first: springdoc generates in tests; canonical snapshot `api/openapi.yaml` committed and reviewed** (chosen) | The document is derived from the code that actually runs (Spring MVC mappings, Bean Validation, DTO records), so it cannot describe something the code does not do; drift is a tree diff; one place to edit (the code + its annotations). | Annotations on controller/DTOs; generator quirks must be steered by annotations; the committed file is a build output that must be refreshed (one command / CI artifact). |
| B. Spec-first: hand-written document, code validated against it | Contract designed before code; no generator dependency. | A second full description (≈ 25 operation/status pairs, 8 schemas) maintained by hand next to code that already encodes it — the drift problem moves, it does not go away; the conformance tests would still be needed. |
| C. Spec-first with server stubs generated (openapi-generator) | Strong compile-time coupling. | Rewrites the controller layer (behaviour risk, AC-11), new build plugin, Jackson 3 support of generators uncertain. |

The **committed file is the contract** for everyone else: the frontend generates types from it, the conformance
tests validate responses against it, oasdiff diffs it against `main`, reviewers read its diff. The backend drift test
guarantees it equals what the code generates.

### 2. Generator placement and production exposure

- `org.springdoc:springdoc-openapi-starter-webmvc-api` **3.2.0** (built on Boot 4.1.2; `-api` = no Swagger UI) in
  **test scope only**. The only runtime addition is `io.swagger.core.v3:swagger-annotations-jakarta` 2.2.55
  (annotations, no dependencies).
- Non-exposure is **structural** (no generator in the jar, checked by `verify-jar.sh` in CI and Release), backed by
  fail-safe defaults (`springdoc.api-docs.enabled: false`, `springdoc.swagger-ui.enabled: false` in
  `application.yml`) and an e2e test against the real images (`/v3/api-docs`, `/swagger-ui*` → 404 on the backend;
  nginx forwards only `/api/` and `/actuator/health`).
- Generator settings live in `src/test/resources/application-openapi.yml` (profile `openapi`, contract tests only).

### 3. Document format and determinism

- **OpenAPI 3.1.0** (JSON Schema 2020-12): nullability as `type: [T, "null"]`, validated identically by networknt
  (Java, OpenAPI 3.1 dialect) and Ajv 2020 (frontend), mapped to `T | null` by openapi-typescript, understood by
  oasdiff.
- Pinned metadata (`@OpenAPIDefinition`: title, `version: "1"`, `servers: [/]`) — no ports, build versions or hosts.
- Canonical form: object keys sorted (fixed top-level order), `required` arrays sorted, other array orders kept,
  fixed Jackson 3 YAML features. The committed file must equal its canonical form; drift compares canonical trees.
- No `default` responses, no status ranges, no inline response schemas (keeps conformance matching exact).
- `info.version` is not bumped on changes (out of scope); breaking changes are governed by §6.

### 4. Backend conformance

- A test-support checker (`OpenApiContract`, networknt `json-schema-validator` **3.0.9**, Jackson 3) validates every
  response of a scenario table replayed over real HTTP against the **committed** document: documented operation,
  documented status, documented media type, required headers, empty body where none is documented, schema-valid body.
- The checker **closes** object schemas (`additionalProperties: false`) on an in-memory copy only: our backend must
  not emit undocumented fields, while the published contract keeps the usual "additive response field = non-breaking"
  semantics.
- Every documented `(operation, status)` must be exercised by a scenario, except 500 (not provokable over HTTP; the
  500 body stays covered by the SCRUM-2 `@WebMvcTest` tests). `/api/**` handler mappings must equal the documented
  operations (independent of springdoc).
- Jackson 2 arrives on the test classpath with springdoc 3.2.0 (swagger-core 2.2.x); a guard test asserts the
  application still serializes with Jackson 3.

### 5. Frontend

- `openapi-typescript` **7.13.0** generates `frontend/src/api/schema.d.ts` (committed; CI fails if stale). Its peer
  range `typescript ^5.x` is overridden to our TypeScript 6 via npm `overrides` (verified working).
- `types.ts` aliases response types to the generated ones and asserts at compile time that request types are
  assignable to the contract and that `TaskStatus` equals the documented enum.
- MSW default handlers and fixture builders are validated at runtime (Ajv 2020, closed schemas) in a Vitest test that
  reads `../api/openapi.yaml` via a Vite `?raw` import (file access outside `frontend/` allowed only under Vitest).
  `openapi-msw` (typed handlers) was considered and rejected: it requires rewriting every handler and override for
  little extra safety over runtime validation + generated types.

### 6. Breaking changes and acknowledgment

- **oasdiff 1.39.0** (binary pinned by version + SHA-256 in `install-tools.sh`) computes the changelog between the
  document at the base commit and the branch; level ERR = breaking. Base: PR → merge base with the target branch;
  push to a branch → merge base with `origin/main`; push to `main` → `HEAD^1`; no document at the base → pass with a
  notice.
- A small Node gate (unit-tested, exit 0/1/2 like `vuln-gate.mjs`) fails on every breaking change not listed in
  **`api/breaking-changes.ack`**: one line per change, `SCRUM-<n> <METHOD> <path> <oasdiff text> -- <justification>`,
  matched exactly on method, path and text; on feature branches and PRs only entries with the branch's Jira key
  count; malformed entries fail; unused entries warn. oasdiff runs outside the repo directory so no `.oasdiff.*`
  config can change severities, and such files are rejected.

| Acknowledgment option | Verdict |
|---|---|
| **Ack file in the repo** (chosen) | In the PR diff (reviewed with the contract change), identical in `push` and `pull_request` runs, survives squash/rebase merges, names the story and the exact change. |
| Commit trailer `API-Breaking: acknowledged` | Not visible in the PR diff; lost or rewritten by squash merges; acknowledges "everything" in the range. |
| PR label | Not available on `push` events; not versioned; anyone with triage rights can set it. |
| `info.version` major bump (`oasdiff --fail-on MISSING-VERSION-BUMP`) | Couples governance to a version number nobody consumes; still not tied to a specific change. |

## Consequences

- One reviewed contract file; backend, frontend types, test doubles and the breaking-change gate all key off it.
- Changing the API is: change code (+ annotations) → regenerate `api/openapi.yaml` (`-Dopenapi.update=true` or the
  CI artifact) → `npm run api:types` → fix frontend types/handlers → acknowledge if breaking. README documents it.
- Controller and DTOs carry documentation annotations (verbose but next to the code they describe; no runtime
  effect — the unchanged existing tests prove it).
- Backend CI gains one Spring context + PostgreSQL container; a new ~2-minute `api-contract` job runs in CI only
  (the Release workflow already runs the test-based checks through `mvn verify` / `npm run test:coverage`).
- **Upgrade path:** moving to Spring Boot 4.2 requires springdoc ≥ 3.2.1, which switches swagger-core to 3.0.0 /
  Jackson 3 and renames `swagger-annotations-jakarta` → `swagger-annotations`; the drift test will show any output
  change. Re-evaluate the `openapi-typescript` peer override when it declares TypeScript 6 support.
- The breaking-change gate becomes effective with the first story after SCRUM-12 (no baseline on `main` before).
