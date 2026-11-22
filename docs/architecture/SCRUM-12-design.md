# SCRUM-12 — Design: OpenAPI contract for the Task API, backend/frontend contract tests, drift and breaking-change gates

| Field | Value |
|---|---|
| Jira | [SCRUM-12](https://suranagivinod.atlassian.net/browse/SCRUM-12) |
| Requirements | [`docs/requirements/SCRUM-12.md`](../requirements/SCRUM-12.md) (SCRUM-12-AC-01..AC-14, NFR-01..NFR-10, Q-01..Q-08) |
| ADRs | **new [ADR 0017](../adr/0017-api-contract-openapi.md)**; [0003](../adr/0003-error-response-format.md) (error body), [0004](../adr/0004-traceability-conventions.md), [0006](../adr/0006-frontend-api-client-and-state.md), [0007](../adr/0007-frontend-testing-msw.md), [0009](../adr/0009-status-sub-resource-patch.md), [0011](../adr/0011-spa-hosting-nginx-reverse-proxy.md), [0014](../adr/0014-vulnerability-scanning-policy.md) |
| Author role | Architect |
| Inputs | `main` `1fde974`; upstream sources read on 2026-11-22 (GitHub; Maven Central not reachable from the sandbox): `springdoc/springdoc-openapi` tags `v3.2.0` (`863836989e`), `v3.2.1` (`01d19d2d3e`); `swagger-api/swagger-core` `v2.2.55` (`528cd88594`); `spring-projects/spring-boot` `v4.1.2` (`gradle.properties`); `networknt/json-schema-validator` `3.0.9` (`75c95ecaec`); `java-diff-utils/java-diff-utils` `java-diff-utils-parent-4.18`; `FasterXML/jackson-dataformats-text` `jackson-dataformats-text-3.1.7`; `oasdiff/oasdiff` `v1.39.0` (`21b8a57a0a`, release assets downloaded and checksum-verified); npm registry (`npm view`). |

## 1. Decisions at a glance

| Topic (question) | Decision | Why (short) |
|---|---|---|
| Source of truth (Q-01, AC-02) | **Code-first, snapshot committed.** springdoc-openapi generates the document from the controller/DTOs **in tests only**; the canonical YAML snapshot `api/openapi.yaml` is committed and is the reviewed contract every consumer (frontend, oasdiff, conformance tests) reads. | Behaviour lives in Spring MVC + Jackson; generating from it cannot silently diverge, and drift is a cheap tree diff. Spec-first would need a second, hand-written description of 6 operations × ~4 statuses kept in sync with code — the very problem SCRUM-12 removes. ADR 0017 |
| Where the generator runs (Q-01, AC-10, NFR-01) | `springdoc-openapi-starter-webmvc-api` **3.2.0** in **`test` scope**. Production classpath gains only `swagger-annotations-jakarta` **2.2.55** (annotations, zero dependencies). | Exposure is ruled out **structurally**: there is no generator in the jar. Fail-safe property defaults (`springdoc.api-docs.enabled: false`) in `application.yml` as a second line. Verified by `verify-jar.sh` and an e2e test against the real image. |
| OpenAPI version (Q-02) | **3.1.0** (springdoc 3.x default). | JSON Schema 2020-12 semantics end to end: nullability `type: [T, "null"]` maps 1:1 to TypeScript `T \| null`; networknt (OpenAPI 3.1 dialect) and Ajv 2020 validate the same schemas; oasdiff 1.39.0 detects 3.1 nullability changes (verified, §2.3). |
| Java response validator (Q-03, NFR-09) | **networknt `json-schema-validator` 3.0.9** (Jackson **3**, OpenAPI 3.1 dialect) behind a small test-support class `OpenApiContract` (path/status/media-type matching + schema validation). | Atlassian `swagger-request-validator` is OpenAPI 3.0-oriented and brings Jackson 2 + swagger-parser; networknt is Jackson 3, actively released (2026-11-03) and loads `#/components/schemas/X` fragments of the document directly. |
| Undocumented response properties (Q-03) | The **checker** closes every object schema (`additionalProperties: false`) on an in-memory copy; the committed document stays open. | Our backend must not emit fields the contract does not declare; other consumers keep the standard "additive field = non-breaking" semantics (oasdiff agrees). |
| `status` filter, `Location`, nullability (Q-04, NFR-08) | Annotations only: `@Parameter(schema = @Schema(implementation = TaskStatus.class))` on the `String[] status` argument; `@ApiResponse(201, headers = @Header(name = "Location", required = true))`; JSpecify `@Nullable` (already on the classpath via Spring 7) + springdoc's opt-in `java-nullable-property-customizer`; `@Schema(requiredMode = REQUIRED)` on response record components. | Zero runtime effect; existing tests stay unchanged (AC-11). |
| Normalisation (Q-05, NFR-03) | Parse both sides to a tree; recursively sort object keys (top level in a fixed OpenAPI order), sort every `required` array; keep all other array orders; serialize as YAML with fixed Jackson 3 YAML features. Nothing is stripped — the only variable inputs (server URL, `info.version`) are pinned in `@OpenAPIDefinition`. The committed file must be byte-identical to the canonical form (separate check). | Semantic drift and "formatting only" are reported by different tests with different messages. |
| Drift diff (AC-05, NFR-04) | `java-diff-utils` **4.18** (no dependencies) renders a unified diff in the assertion message; also written to `target/openapi/openapi.diff` (job summary) and the generated file to `target/openapi/openapi.generated.yaml` (uploaded artifact). Update: `./mvnw … -Dopenapi.update=true`. | Readable in the IDE, in Surefire output and on the run page. |
| Frontend types (Q-06, AC-06) | **`openapi-typescript` 7.13.0** → committed `frontend/src/api/schema.d.ts`; CI regenerates and `git diff --exit-code`s it. `types.ts` aliases response types to the generated ones and asserts the (narrower) request types are assignable — compile-time. Peer dependency `typescript@^5.x` vs our 6.0.3 resolved with an npm **`overrides`** entry (verified: install, generation, `tsc -b`, ESLint pass with TS 6.0.3). | Single source (NFR-05), contract changes that break UI code fail `npm run typecheck`. |
| MSW handlers (Q-06, AC-07) | **Runtime validation** with **Ajv 8.20.0** (`ajv/dist/2020`) + `ajv-formats` 3.0.1 + `yaml` 2.9.1 in `src/test/contract.test.ts`: every default handler maps to a documented operation; each handler response for representative requests and each fixture builder output is validated (closed schemas). **No `openapi-msw`.** | Catches what types cannot (status codes, headers, extra properties, enum values at runtime) without rewriting `handlers.ts`; `openapi-msw` 2.1.1 would add compile-time path typing but means a rewrite of every handler and `server.use` override — not worth it for 5 handlers (ADR 0017 alternatives). |
| Reading `../api/openapi.yaml` from Vitest (Q-06) | `import specText from '../../../api/openapi.yaml?raw'` + `server.fs.allow` extended **only when `process.env.VITEST` is set**. | Typed by `vite/client` (`*?raw`), no `node:fs` (tsconfig.app has no Node types), dev server unchanged, Docker build context unchanged (the test is type-checked there, never run). Verified locally. |
| Breaking-change tool (Q-07, AC-08) | **oasdiff 1.39.0** (Go binary, GitHub release, SHA-256 pinned in `install-tools.sh`), `oasdiff changelog --format json` → our Node gate `breaking-gate.mjs` (level 3 = ERR = breaking). | Mature rule set incl. 3.1 (`response-property-became-nullable`, `response-property-enum-value-added` = ERR …); our gate owns matching/acknowledgment logic and is unit-tested. |
| Acknowledgment (Q-07, AC-09) | Committed file **`api/breaking-changes.ack`**: one line per accepted change, `SCRUM-<n> <METHOD> <path> <oasdiff text> -- <justification>`; exact match on method + path + text; on feature branches/PRs the entry's key must equal the branch's Jira key; malformed → ERROR; unused → warning. | Visible in the PR diff, identical in `push` and `pull_request`, survives squash/rebase, ties the break to a story and to the exact change. Commit trailers vanish on squash and are not in the diff; labels do not exist on `push`. |
| Base commit (AC-08) | PR: `merge-base(origin/$GITHUB_BASE_REF, HEAD)`; push to a branch: `merge-base(origin/main, HEAD)`; push to `main`: `HEAD^1`. No `api/openapi.yaml` at the base → notice, pass (this story, A-04). | "What does this change introduce", never "what is main ahead of us". |
| Release workflow (Q-08, NFR-10) | **Unchanged.** Its `backend`/`frontend` jobs run `./mvnw verify` / `npm run test:coverage`, so conformance, drift and handler tests run there too; the breaking-change gate is a PR-time governance check (`main` already passed it). `verify-jar.sh` (shared) gains the "no generator in the jar" check, so the Release `backend` job enforces AC-10 too. | Minimal diff; no second copy of governance logic. |
| nginx | **Unchanged.** It proxies only `/api/` and `/actuator/health`; `/v3/api-docs` falls through to the SPA fallback (`index.html`, 200, HTML), `/v3/api-docs.yaml` and `/swagger-ui.html` hit the "file extension → file or 404" location. Asserted by e2e. | Nothing to block — the backend has no such endpoint and nginx never forwards it. (Note: the brief said nginx "404s them"; for `/v3/api-docs` it serves the SPA shell, which is harmless; documented in the e2e test.) |

No API behaviour changes (AC-11): only documentation annotations, test code, a fail-safe property, CI and docs.

## 2. Evidence (versions and compatibility)

### 2.1 Backend libraries

| Library | Version | Verified how | Compatibility facts |
|---|---|---|---|
| `org.springdoc:springdoc-openapi-bom` / `springdoc-openapi-starter-webmvc-api` | **3.2.0** (2026-10-24) | `git ls-remote` + shallow clone of tag `v3.2.0`: parent `spring-boot-starter-parent` **4.1.2**, `swagger-api.version` 2.2.55, CHANGELOG "Upgrade spring-boot to version **4.1.2**"; README compatibility table "Spring Boot 4.x → springdoc 3.x". Starter-common depends on `swagger-core-jakarta` with Jackson 2 **excluded and re-declared without version** → Boot-managed `jackson2Version` 2.21.7 (Boot `gradle.properties` @ v4.1.2). | Built and tested against our exact Boot. **Not 3.2.1:** tag exists (2026-11-20, CHANGELOG undated) but is built on **Boot 4.2.0**, moves to swagger-core **3.0.0 / Jackson 3** and **renames** the annotation artifact to `swagger-annotations` — adopt together with a Boot 4.2 upgrade (follow-up, §12 R-02). `springdoc.api-docs.version` default `OPENAPI_3_1` (`SpringDocConfigProperties` line 1585). `override-with-generic-response`, `default-produces-media-type`, `writer-with-order-by-keys`, `paths-to-match`, `model-converters.java-nullable-property-customizer.enabled` exist in 3.2.0. Class-level `@ApiResponse` is merged into every operation (`GenericResponseService#getApiResponses`); when an operation has explicit responses springdoc adds **no** implicit `200` (only a `@ResponseStatus` code) → every operation declares its 2xx explicitly. |
| `io.swagger.core.v3:swagger-annotations-jakarta` | **2.2.55** (managed by the springdoc BOM) | swagger-core tag `v2.2.55`, `modules/swagger-annotations/pom.xml`: only `test`-scope dependencies. | The only new **runtime** jar (annotations, no transitive deps) → `backend-runtime` SBOM/gate impact: +1 component. |
| `com.networknt:json-schema-validator` | **3.0.9** (2026-11-03) | tag `3.0.9` pom: `tools.jackson.core:jackson-databind` + `tools.jackson.dataformat:jackson-dataformat-yaml` 3.1.8, `com.ethlo.time:itu` 1.17.0, `slf4j-api`; `Dialects.getOpenApi31()`; `SchemaRegistry.withDialect(dialect, b -> b.schemas(Map<String,String>))`, `getSchema(SchemaLocation.of(iri + "#/components/schemas/X"))`, `Schema#validate(String, InputFormat.JSON) → List<Error>` (source read). `doc/openapi.md`: loading by fragment treats unknown document-root fields (`openapi`, `paths`, …) as annotations. | **Jackson 3** — same stack as the app. Boot 4.1.2 manages `tools.jackson` at **3.1.7** (`jacksonVersion`), so Maven resolves 3.1.7 instead of 3.1.8 (same minor; R-04). |
| `io.github.java-diff-utils:java-diff-utils` | **4.18** (tag 2026-10-18) | tag `java-diff-utils-parent-4.18`: module pom has only test-scope deps. | Pure Java. |
| `tools.jackson.dataformat:jackson-dataformat-yaml` | Boot-managed (3.1.7) | `jackson-dataformats-text-3.1.7`: `YAMLMapper`, `YAMLWriteFeature.{WRITE_DOC_START_MARKER, MINIMIZE_QUOTES, ALWAYS_QUOTE_NUMBERS_AS_STRINGS, SPLIT_LINES, INDENT_ARRAYS_WITH_INDICATOR}`; uses `snakeyaml-engine` 3.0.1. | Declared explicitly (test) because test code uses it directly. |
| `org.jspecify:jspecify` (`@Nullable`) | transitive from `spring-core` 7 | Spring Framework 7 is JSpecify-annotated. springdoc 3.2.0 `JavaNullablePropertyCustomizer` matches annotation simple name `Nullable` on field / getter / ctor parameter incl. `getAnnotatedType()` (TYPE_USE) — source read. | No new dependency. |

**Classpath implications (NFR-09).** springdoc in test scope puts **Jackson 2** (`com.fasterxml.jackson.core:jackson-databind` 2.21.7, `jackson-dataformat-yaml`, `jackson-datatype-jsr310`, `snakeyaml` 2.6) and `swagger-core-jakarta`/`swagger-models-jakarta` on the **test** classpath only. Spring Boot 4 auto-configures HTTP message conversion from Jackson 3 (`spring-boot-jackson`); Jackson 2 auto-configuration lives in the separate, absent `spring-boot-jackson2` module, so the app under test still serializes with Jackson 3. A guard test asserts it (§4.5, `servesJsonWithJackson3`). Annotations shared by both stacks (`com.fasterxml.jackson.annotation.*`, used on our DTOs) are read by springdoc's Jackson 2 introspection and by the runtime Jackson 3 identically. Production jar: unchanged except `swagger-annotations-jakarta`.

### 2.2 Frontend packages (`npm view`, 2026-11-22)

| Package | Version | Notes |
|---|---|---|
| `openapi-typescript` | **7.13.0** (latest; `next` = old 7.0.0-rc.1) | peer `typescript: ^5.x` → `npm install` fails with ERESOLVE against `typescript@6.0.3`. Verified fix: `"overrides": { "openapi-typescript": { "typescript": "$typescript" } }` → `npm ls` shows `typescript@6.0.3 deduped`, generation of the Appendix A document works, generated file passes `eslint --max-warnings 0`, and `tsc -b` passes with the derived/asserted types (§6.2) — and fails as intended when `Task.description` is changed to `string`. |
| `ajv` | **8.20.0** | `import { Ajv2020 } from 'ajv/dist/2020'`; `strict: true`, `formats: { int32: true, int64: true }` (OpenAPI formats). Verified: compiles `$defs` rewritten from `#/components/schemas/`, rejects missing required / wrong enum. |
| `ajv-formats` | **3.0.1** | `date`, `date-time`, `uri` formats. |
| `yaml` | **2.9.1** | parses the committed YAML. |
| `openapi-msw` | 2.1.1 (peer `msw ^2.10.5 \|\| ^3.0.0`) | considered, **not used** (§1). |

All exact versions, dev dependencies only (`npm audit --omit=dev` and the `frontend-prod` SBOM are unaffected; they appear in the *reported* `frontend-all` scan target).

### 2.3 oasdiff 1.39.0

- Tag `v1.39.0` → `21b8a57a0a192e7478b764ec0164b5694cce3393`. Asset `oasdiff_1.39.0_linux_amd64.tar.gz`, SHA-256
  **`71a85930728f367a2086077b7ae1411319421549d18473a3e8258b6451520433`** — from the release's `checksums.txt` and
  re-computed with `sha256sum` on the downloaded file; archive contains `LICENSE`, `oasdiff`; `oasdiff --version` →
  `oasdiff version 1.39.0`.
- Verified behaviour on 3.1 documents: new required query parameter, response property type change and removal of a
  required response property → `error` (level 3); response property **became nullable** → error; request property
  became not nullable / request enum value removed → error; response field became non-null → not breaking; identical
  documents → "No changes detected"; `oasdiff validate` on the Appendix A document → "No findings detected".
  `--allow-external-refs=false` exists (no SSRF on untrusted specs). Never use `--open` (uploads to oasdiff.com).
- JSON output fields used by the gate: `id`, `text`, `level` (3 ERR / 2 WARN / 1 INFO), `operation`, `path`,
  `operationId`. Example (removing `dueDate` from `TaskResponse`): 5 × `response-required-property-removed`, e.g.
  `PUT /api/tasks/{id}` "removed the required property `dueDate` from the response with the `200` status".
- oasdiff auto-loads `.oasdiff.*` from the working directory (`--config` help) — the script runs it from an empty temp
  directory and refuses such files in the repo (§7.4).

## 3. The contract document (AC-01)

- Path: **`api/openapi.yaml`** (repo root, next to `src/` and `frontend/`; neither build context copies it —
  `.dockerignore` files are allow-lists). OpenAPI **3.1.0**, canonical YAML (§4.4), LF, trailing newline.
- Content (intended; exact bytes come from the generator — Appendix A is the reviewed target):
  - `info`: title `To-Do Task API`, `version: "1"` (fixed contract version, not the build version — NFR-03);
    `servers: [{url: /}]` (pinned; otherwise springdoc emits `http://localhost:<random port>`).
  - 6 operations, `operationId`s `listTasks`, `createTask`, `getTask`, `updateTask`, `updateTaskStatus`,
    `deleteTask`; tag `Tasks`.
  - Parameters: `page` (int32, min 0, default 0), `size` (int32, min 1, default 20, clamping in the description),
    `status` (`$ref TaskStatus`, single value, optional), `id` (path, int64, required).
  - Responses per §1 of the requirements: 201 + required `Location` header (`format: uri`), 204 without content,
    400/404/415 as applicable, **500 on every operation** (class-level annotation); every error response references
    `#/components/schemas/ApiError`.
  - Components: `ApiError`, `FieldErrorItem`, `PageResponseTaskResponse`, `TaskResponse`, `TaskCreateRequest`,
    `TaskUpdateRequest`, `TaskStatusUpdateRequest`, `TaskStatus` (enum `TODO, IN_PROGRESS, DONE`, as `$ref`).
  - All response properties `required`; `TaskResponse.description`/`.dueDate` `type: [string, "null"]`; request
    optionals nullable (the UI sends `null`).
- Not documented (requirements §3 out of scope): 405/406 for undeclared methods/media types, actuator endpoints.
- Not used anywhere in the document: `default` responses, status ranges (`4XX`), inline response body schemas — the
  checker rejects them (keeps matching exact; AC-04).

## 4. Backend

### 4.1 `pom.xml`

```xml
<properties>
    <!-- SCRUM-12 / ADR 0017 (design §2.1): OpenAPI generation is test-scope only -->
    <springdoc.version>3.2.0</springdoc.version>                       <!-- built on Boot 4.1.2; NOT 3.2.1 (Boot 4.2) -->
    <json-schema-validator.version>3.0.9</json-schema-validator.version> <!-- Jackson 3, OpenAPI 3.1 dialect -->
    <java-diff-utils.version>4.18</java-diff-utils.version>
    <!-- SCRUM-12-AC-05: -Dopenapi.update=true rewrites api/openapi.yaml from the generated document -->
    <openapi.update>false</openapi.update>
</properties>

<dependencyManagement>
    <dependencies>
        <!-- manages springdoc-* and swagger-annotations-jakarta (2.2.55) in lockstep -->
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-bom</artifactId>
            <version>${springdoc.version}</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>

<!-- dependencies -->
<!-- SCRUM-12-NFR-01: annotations only (no transitive dependencies) — the only runtime addition -->
<dependency>
    <groupId>io.swagger.core.v3</groupId>
    <artifactId>swagger-annotations-jakarta</artifactId>
</dependency>
<!-- SCRUM-12 (test): generator, response validator, YAML, diff -->
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-api</artifactId>   <!-- -api: no Swagger UI webjar -->
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>com.networknt</groupId>
    <artifactId>json-schema-validator</artifactId>
    <version>${json-schema-validator.version}</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>tools.jackson.dataformat</groupId>
    <artifactId>jackson-dataformat-yaml</artifactId>                <!-- version: Spring Boot BOM (Jackson 3) -->
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>io.github.java-diff-utils</groupId>
    <artifactId>java-diff-utils</artifactId>
    <version>${java-diff-utils.version}</version>
    <scope>test</scope>
</dependency>
```

Surefire `systemPropertyVariables` (existing block) gains `<openapi.update>${openapi.update}</openapi.update>`.
JaCoCo rules unchanged (annotations add no executable lines; `config.OpenApiDefinitionConfig` is outside the gated
packages). Dev checks the resolved tree once in CI (`./mvnw -B dependency:tree -Dscope=runtime | grep -iE
'swagger|springdoc|jackson'` in the job log of the first run, pasted into the matrix): runtime must show
`swagger-annotations-jakarta` and **no** `springdoc`/`swagger-core`/`com.fasterxml.jackson.core:jackson-databind`.

### 4.2 Configuration

`src/main/resources/application.yml` (fail-safe, NFR-01):

```yaml
# SCRUM-12 / ADR 0017: springdoc-openapi is a TEST-scope dependency and never in the jar. Should it ever reach the
# runtime classpath, these defaults keep the OpenAPI endpoints and the UI off. Contract tests enable profile "openapi".
springdoc:
  api-docs:
    enabled: false
  swagger-ui:
    enabled: false
```

`src/test/resources/application-openapi.yml` (new; generator settings are a test concern):

```yaml
# SCRUM-12 (design §4.2): generator settings for the contract tests (@ActiveProfiles("openapi")).
springdoc:
  api-docs:
    enabled: true
    version: openapi_3_1
  paths-to-match: /api/**
  default-produces-media-type: application/json   # default */* would document "*/*" content
  default-consumes-media-type: application/json
  override-with-generic-response: false           # no generic responses from @RestControllerAdvice
  writer-with-order-by-keys: true
  model-converters:
    java-nullable-property-customizer:
      enabled: true                               # JSpecify @Nullable → type: [T, "null"]
```

Main config class (annotations only; `swagger-annotations` imports, no springdoc):

```java
// src/main/java/com/vinods21/todo/config/OpenApiDefinitionConfig.java
/** SCRUM-12 / ADR 0017: fixed document metadata — no build version, no host (deterministic, NFR-03). */
@Configuration(proxyBeanMethods = false)
@OpenAPIDefinition(
        info = @Info(title = "To-Do Task API", version = "1",
                description = "Task REST API of the To-Do application (SCRUM-2, SCRUM-6). Every error response uses "
                        + "the ApiError body (ADR 0003). Contract: ADR 0017."),
        servers = @Server(url = "/", description = "Same origin: nginx proxies /api/** to the backend (ADR 0011)"))
public class OpenApiDefinitionConfig {
}
```

### 4.3 Documentation annotations (no behaviour change)

`TaskController` (sketch; descriptions as in Appendix A):

```java
@RestController
@RequestMapping("/api/tasks")
@Tag(name = "Tasks", description = "Create, read, list, update, change the status of and delete tasks")
@ApiResponse(responseCode = "500", description = "Unexpected error",                   // every operation (A-03)
        content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ApiError.class)))
public class TaskController {

    @PostMapping
    @Operation(operationId = "createTask", summary = "Create a task")
    @ApiResponse(responseCode = "201", description = "Task created",
            headers = @Header(name = HttpHeaders.LOCATION, description = "URL of the created task", required = true,
                    schema = @Schema(type = "string", format = "uri")),
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = TaskResponse.class)))
    @ApiResponse(responseCode = "400", description = "Validation failed, malformed JSON or invalid field value", content = @Content(/* ApiError */))
    @ApiResponse(responseCode = "415", description = "Content type is not application/json", content = @Content(/* ApiError */))
    public ResponseEntity<TaskResponse> create(@Valid @RequestBody TaskCreateRequest request) { … unchanged … }

    @GetMapping
    @Operation(operationId = "listTasks", summary = "List tasks", description = "…clamped… (ADR 0009)")
    @ApiResponse(responseCode = "200", …PageResponse…) @ApiResponse(responseCode = "400", …)
    public PageResponse<TaskResponse> list(
            @Parameter(description = "0-based page index") @RequestParam(name = "page", defaultValue = "0") @Min(0) int page,
            @Parameter(description = "Page size; values above 100 are clamped to 100") @RequestParam(name = "size", defaultValue = "20") @Min(1) int size,
            // ADR 0009: bound as String[] on purpose; documented as ONE optional enum value
            @Parameter(description = "Only tasks with this status (single value)", schema = @Schema(implementation = TaskStatus.class))
            @RequestParam(name = "status", required = false) String[] status) { … unchanged … }
    // getTask: 200, 400, 404 · updateTask: 200, 400, 404, 415 · updateTaskStatus: 200, 400, 404, 415 · deleteTask: 204, 400, 404
}
```

- `@ApiResponse` is `@Repeatable` (container `@ApiResponses`) — stack them. Reuse is not possible in annotations
  (constants only); a private `static final String` for the media type and descriptions keeps it readable.
- For `PageResponse<TaskResponse>` use `@Schema(implementation = PageResponse.class)` **only if** springdoc keeps
  the generic resolution; otherwise omit `content` on the 200 of `list` and let springdoc infer it from the return
  type (it names the schema `PageResponseTaskResponse`). The drift diff shows which; the target is Appendix A.
- If springdoc still renders `status` as an array despite the `schema` override, move the parameter to a method-level
  `@Parameter(name = "status", in = ParameterIn.QUERY, schema = @Schema(implementation = TaskStatus.class))` and mark
  the argument `@Parameter(hidden = true)` (R-05).
- DTOs / domain:
  - `TaskResponse`, `PageResponse`, `ApiError`, `FieldErrorItem`: `@Schema(requiredMode = Schema.RequiredMode.REQUIRED)`
    on every record component (records propagate it to field/accessor/parameter).
  - `TaskResponse.description`, `.dueDate`; `TaskCreateRequest.description`, `.status`, `.dueDate`;
    `TaskUpdateRequest.description`, `.dueDate`: JSpecify `@Nullable` (type-use position: `@Nullable String
    description`). Bean Validation annotations already give `required`, `minLength`/`maxLength`.
  - `TaskStatus`: `@Schema(enumAsRef = true)` → one `TaskStatus` component.
  - `ApiError`: `@Schema(description = "Standard error body of every error response (ADR 0003)")`.
- **Behaviour check:** none of these annotations is read by Spring MVC, Bean Validation or Jackson 3 (`@Nullable`
  is not a Jackson or validation annotation). Proof: the existing tests are unchanged and green (AC-11).

### 4.4 Normalisation and canonical form (`support/OpenApiDocuments`)

```java
// src/test/java/com/vinods21/todo/support/OpenApiDocuments.java — SCRUM-12-AC-05, NFR-03
public final class OpenApiDocuments {
    public static final Path COMMITTED = Path.of("api", "openapi.yaml");   // Surefire cwd = ${basedir}
    private static final List<String> TOP_LEVEL = List.of("openapi", "info", "jsonSchemaDialect", "servers",
            "security", "tags", "paths", "webhooks", "components", "externalDocs");
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final YAMLMapper YAML = YAMLMapper.builder()
            .disable(YAMLWriteFeature.WRITE_DOC_START_MARKER)
            .enable(YAMLWriteFeature.MINIMIZE_QUOTES)
            .enable(YAMLWriteFeature.ALWAYS_QUOTE_NUMBERS_AS_STRINGS)  // "200", "1" stay strings
            .disable(YAMLWriteFeature.SPLIT_LINES)                     // no folded long descriptions
            .build();

    public static JsonNode readYaml(Path file) { … }
    public static JsonNode readJson(String json) { … }
    /** Keys sorted recursively (top level in TOP_LEVEL order, then alphabetical); every "required" array sorted. */
    public static JsonNode canonical(JsonNode node) { … }   // pure function, unit-tested
    /** Canonical YAML, LF line ends, exactly one trailing newline. */
    public static String toYaml(JsonNode canonical) { … }
}
```

- Nothing is stripped. Array order is meaningful (parameters, enum order → `TASK_STATUSES` order) and deterministic in
  springdoc; only `required` (a set) is sorted.
- **Canonical committed file:** `Files.readString(COMMITTED)` must equal `toYaml(canonical(readYaml(COMMITTED)))` —
  a separate test with a "formatting only, run the update command" message (NFR-03), so the drift test itself
  reports only semantic differences (AC-05). Appendix A is written in this form by hand; the first CI run replaces
  it with the generator's bytes (§4.7).

### 4.5 Test classes

All new classes `@Tag("SCRUM-12")`; display names start with AC IDs (ADR 0004). Meta-annotation for the two
generator-backed classes so they share **one** Spring context / PostgreSQL container (NFR-06):

```java
// src/test/java/com/vinods21/todo/support/OpenApiIntegrationTest.java
@Target(ElementType.TYPE) @Retention(RetentionPolicy.RUNTIME) @Documented
@Tag("SCRUM-12")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("openapi")
@Import(PostgresTestcontainersConfiguration.class)
public @interface OpenApiIntegrationTest { }
```

**(1) `contract/OpenApiDriftIntegrationTest`** (`@OpenApiIntegrationTest`)

| Test | `@DisplayName` | Logic |
|---|---|---|
| `generatedDocumentEqualsCommitted` | `SCRUM-12-AC-05: the OpenAPI document the backend generates equals the committed api/openapi.yaml` | `GET /v3/api-docs` via `RealHttp` (200) → `canonical` → `toYaml` → always write `target/openapi/openapi.generated.yaml`. If `Boolean.getBoolean("openapi.update")`: write it to `api/openapi.yaml`, log, return. Else compare with `toYaml(canonical(readYaml(COMMITTED)))`; on difference write `target/openapi/openapi.diff` (`UnifiedDiffUtils.generateUnifiedDiff("api/openapi.yaml (committed)", "generated by the backend", …, 3)`) and `fail("SCRUM-12-AC-05: contract drift …\n" + diff + HOW_TO_UPDATE)`. |
| `committedFileIsCanonical` | `SCRUM-12-NFR-03: api/openapi.yaml is in canonical form` | text equality (above). |
| `servedEndpointsEqualDocumentedOperations` | `SCRUM-12-AC-04: every /api/** handler mapping is documented and every documented operation is served` | `@Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping` → `getHandlerMethods().keySet()` → `getPathPatternsCondition().getPatternValues()` starting with `/api/` × `getMethodsCondition().getMethods()` → `"GET /api/tasks/{id}"`; equals the set from the committed `paths` (`containsExactlyInAnyOrderElementsOf`). Independent of springdoc (a `@Hidden` or `paths-to-match` mistake cannot hide an endpoint). |
| `servesJsonWithJackson3` | `SCRUM-12-NFR-09: with Jackson 2 on the test classpath the API is still served by Jackson 3` | `RequestMappingHandlerAdapter#getMessageConverters()` contains an `org.springframework.http.converter.json.JacksonJsonHttpMessageConverter` and no converter whose class name contains `Jackson2`. |

`HOW_TO_UPDATE` text: "If the change is intended: `./mvnw -B test -Dtest=OpenApiDriftIntegrationTest
-Dopenapi.update=true`, or take `openapi.generated.yaml` from the CI artifact `todo-backend-<key>-<sha>-reports`;
review the diff, then `npm --prefix frontend run api:types` and commit both (README → Changing the API contract)."

**(2) `contract/TaskApiContractIntegrationTest`** (`@OpenApiIntegrationTest`) — AC-03, AC-04

```java
static final OpenApiContract CONTRACT = OpenApiContract.load(OpenApiDocuments.COMMITTED);

record Scenario(String name, String operationId, int status, HttpMethod method, String uriTemplate,
                String contentType, String body) {
    @Override public String toString() { return name; }        // parameterized display name
}

static Stream<Scenario> scenarios() { return SCENARIOS.stream(); }   // "{id}" in uriTemplate = a fresh task

@ParameterizedTest(name = "SCRUM-12-AC-03: {0}")
@MethodSource("scenarios")
@DisplayName("SCRUM-12-AC-03: responses of the running application conform to api/openapi.yaml")
void responseConformsToContract(Scenario s) {
    long id = http.createTask("SCRUM-12 contract " + s.name());
    String uri = s.uriTemplate().replace("{id}", Long.toString(id));
    ResponseEntity<String> response = http.exchange(s.method(), uri, s.contentType(), s.body(), Map.of());
    assertThat(response.getStatusCode().value()).as("status of %s", s).isEqualTo(s.status());
    CONTRACT.assertConforms(s.method(), uri, response);          // AssertionError listing every violation
    assertThat(CONTRACT.operationId(s.method(), uri)).isEqualTo(s.operationId());
}

@Test
@DisplayName("SCRUM-12-AC-04: every documented (operation, status) is exercised by a scenario; 500 exempt (A-03)")
void everyDocumentedResponseIsExercised() {
    Set<String> documented = CONTRACT.documentedResponses();       // "createTask 201", …
    documented.removeIf(r -> r.endsWith(" 500"));
    Set<String> exercised = SCENARIOS.stream().map(s -> s.operationId() + " " + s.status()).collect(toSet());
    assertThat(exercised).containsAll(documented);
    assertThat(documented).containsAll(exercised);
}
```

Scenario table (≥ 1 per documented non-500 pair; error scenarios mirror `ErrorContractIntegrationTest` /
`TaskStatusIntegrationTest` inputs):

| operationId | statuses → inputs |
|---|---|
| `createTask` | 201 `{"title":"x","description":null,"status":"DONE","dueDate":"2026-12-01"}` · 400 blank title · 400 malformed JSON `{"title":` · 400 `"status":"NOPE"` · 415 `text/plain` |
| `getTask` | 200 `/api/tasks/{id}` · 400 `/api/tasks/abc` · 404 `/api/tasks/999999999` |
| `listTasks` | 200 no params · 200 `?page=0&size=500&status=TODO` (clamped) · 400 `?page=-1` · 400 `?size=0` · 400 `?status=done` · 400 `?page=abc` |
| `updateTask` | 200 full body · 400 missing `status` · 404 unknown id · 415 `text/plain` |
| `updateTaskStatus` | 200 `{"status":"IN_PROGRESS"}` · 400 `{"status":"done"}` · 404 unknown id · 415 `text/plain` |
| `deleteTask` | 204 · 400 `/api/tasks/abc` · 404 unknown id |

**(3) `support/OpenApiContract`** (test support) — the checker

```java
public final class OpenApiContract {
    private static final String IRI = "https://contract.todo.invalid/openapi.json";   // never fetched
    public static OpenApiContract load(Path yaml);
    OpenApiContract(JsonNode document);   // package-private: unit tests pass tampered documents
    public String operationId(HttpMethod method, String uri);
    public Set<String> documentedResponses();
    public List<String> violations(HttpMethod method, String uri, int status, HttpHeaders headers, String body);
    public void assertConforms(HttpMethod method, String uri, ResponseEntity<String> response); // fail(join(violations))
}
```

- Construction: deep-copy the document; **close** every object schema that has `properties` and neither
  `additionalProperties` nor `unevaluatedProperties` (`additionalProperties: false`), recursively under
  `components.schemas` (and nested `properties`/`items`); register the copy as JSON under `IRI` with
  `SchemaRegistry.withDialect(Dialects.getOpenApi31(), b -> b.schemas(Map.of(IRI, json)))`; build an operation table
  from `paths` (template → regex `[^/]+` per `{param}`; literal segments win; method lower-case keys).
- Reject (violations) document constructs the matcher does not support: `default` responses, status ranges, inline
  (non-`$ref`) response body schemas.
- `violations(...)`, in order, each message prefixed `METHOD /template (operationId) status:`:
  1. no operation for method + path (query string ignored) → `undocumented operation GET /api/nope`;
  2. status not in `responses` → `undocumented status 405 (documented: 200, 400, 404, 500)`;
  3. documented header with `required: true` missing → `missing required header Location`;
  4. no documented `content` → body must be empty → `undocumented response body`;
  5. else `Content-Type` (type/subtype, parameters ignored) must be a documented media type;
  6. body validated against `IRI + "#/components/schemas/<Name>"` (from the `$ref`) → each networknt `Error` as
     `<instanceLocation>: <message>` (e.g. `$.items[0].status: does not have a value in the enumeration [TODO, IN_PROGRESS, DONE]`).

**(4) Unit tests without Spring** (fast, prove the gates fail — AC-13)

| Class | Tests (`@DisplayName` prefix `SCRUM-12-AC-13:` unless noted) |
|---|---|
| `support/OpenApiContractTest` | valid `TaskResponse` 200 passes · extra property rejected · missing required property rejected · wrong type (`"id":"1"`) rejected · unknown enum rejected · status 418 rejected as undocumented · `GET /api/nope` rejected · `text/plain` content type rejected · 204 with body rejected · 201 without `Location` rejected · `SCRUM-12-AC-04:` a document with a `default` response is rejected. Uses the committed document plus small JSON bodies. |
| `support/OpenApiDocumentsTest` | `canonical` sorts keys and `required`, keeps `enum`/`parameters` order · reordered-but-equal documents canonicalise to identical text (`SCRUM-12-AC-05:` formatting does not count as drift) · a changed `maxLength` produces a unified diff containing the `-`/`+` lines (`SCRUM-12-AC-13:` drift is reported). |

**(5) `OpenApiExposureIntegrationTest`** (package `com.vinods21.todo`) — AC-10, fail-safe default

Same annotations as `ErrorContractIntegrationTest` (`@SpringBootTest(RANDOM_PORT)` + `@Import(Postgres…)`, **no**
profile) → shares that cached context; springdoc is on the test classpath but disabled by `application.yml`:

```java
@ParameterizedTest(name = "SCRUM-12-AC-10: GET {0} returns 404 with the ApiError body")
@ValueSource(strings = {"/v3/api-docs", "/v3/api-docs.yaml", "/v3/api-docs/swagger-config", "/swagger-ui.html",
        "/swagger-ui/index.html"})
void openApiEndpointsAreOffByDefault(String path) { assertApiErrorShape(http.get(path), 404, path); }
```

### 4.6 Production exposure (AC-10) — three layers

1. **Structural:** generator test-scope only → `.github/scripts/verify-jar.sh` (CI `build` and Release `backend`):

   ```bash
   # SCRUM-12-AC-10 / NFR-01 (ADR 0017): the OpenAPI generator is test-scope only — never in the jar.
   libs=$(unzip -Z1 "$jar" | grep -E '^BOOT-INF/lib/' || true)
   if grep -E '^BOOT-INF/lib/(springdoc-|swagger-(core|models|ui)|webjars-locator)' <<<"$libs"; then
     echo "::error::SCRUM-12-AC-10: OpenAPI generator/UI jars found in $jar (must be test scope)"; failures=$((failures + 1))
   fi
   ```
2. **Fail-safe default:** `springdoc.api-docs.enabled: false` / `swagger-ui.enabled: false` (§4.2), proven by
   `OpenApiExposureIntegrationTest`.
3. **Real image:** e2e test in `e2e/tests/stack.http.spec.ts` (CI `e2e` and Release `e2e-release` on the candidate
   images; not `@critical`, so the release gate minimum is unaffected):

   ```ts
   test('SCRUM-12-AC-10: no OpenAPI document or UI is served by the backend image or through the frontend', async ({ request }) => {
     for (const path of ['/v3/api-docs', '/v3/api-docs.yaml', '/swagger-ui.html', '/swagger-ui/index.html']) {
       await expectApiError(await request.get(`${env.backendURL}${path}`), 404, path)
     }
     // nginx forwards only /api/ and /actuator/health: /v3/api-docs is an SPA route (index.html), never JSON
     const spa = await request.get('/v3/api-docs')
     expectHtmlIndex(spa, await spa.text())
     for (const path of ['/v3/api-docs.yaml', '/swagger-ui.html']) expect((await request.get(path)).status(), path).toBe(404)
   })
   ```

### 4.7 Updating the document, and bootstrapping without a local build (A-05)

- Normal flow (developer with JDK + Docker): change code → `./mvnw -B test -Dtest=OpenApiDriftIntegrationTest
  -Dopenapi.update=true` → review `git diff api/openapi.yaml` → `npm --prefix frontend run api:types` → fix
  type errors / handlers → commit all.
- **Dev agent (no Maven Central):** commit Appendix A as `api/openapi.yaml` and generate `schema.d.ts` from it
  (npm works), push; if the `build` job reports drift, download `target/openapi/openapi.generated.yaml` from the
  reports artifact (`gh run download <run> -n todo-backend-SCRUM-12-<sha>-reports`), **review the diff against
  Appendix A** (differences in wording/ordering are fine; differences in required/nullable/status codes mean an
  annotation is wrong — fix the annotation, not the file), commit it, regenerate `schema.d.ts`, push. Repeat until
  green. Record the iterations in the matrix.

## 5. API behaviour

Unchanged: no controller logic, exception mapping, validation, Jackson, CORS, service, repository or migration
change. The only main-code edits are documentation annotations, one annotation-only `@Configuration` class and the
fail-safe `springdoc` property block (§4.2–4.3).

## 6. Frontend

### 6.1 `package.json`

```jsonc
"scripts": {
  // … existing …
  "api:types": "openapi-typescript ../api/openapi.yaml -o src/api/schema.d.ts",
  "api:check": "npm run api:types && git diff --exit-code -- src/api/schema.d.ts"
},
"devDependencies": {
  // … existing …
  "ajv": "8.20.0",
  "ajv-formats": "3.0.1",
  "openapi-typescript": "7.13.0",
  "yaml": "2.9.1"
},
// SCRUM-12 (design §2.2): openapi-typescript 7.13.0 declares peer typescript ^5.x; it works with our 6.0.3
"overrides": { "openapi-typescript": { "typescript": "$typescript" } }
```

`package-lock.json` regenerated with `npm install` (Node 22 / npm 10). `eslint.config.js`: add
`'src/api/schema.d.ts'` to `globalIgnores` (generated; it passes today, but future generator output must not be
subject to our lint rules).

### 6.2 `src/api/schema.d.ts` and `src/api/types.ts`

- `schema.d.ts`: generated, committed, never edited (header says so).
- `types.ts` (runtime exports unchanged, so no import elsewhere changes):

```ts
// SCRUM-1-NFR-05, SCRUM-6-NFR-04, SCRUM-12-AC-06: contract types come from api/openapi.yaml (schema.d.ts, ADR 0017).
import type { components } from './schema'

type Schemas = components['schemas']

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const satisfies readonly Schemas['TaskStatus'][]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export function isTaskStatus(value: string): value is TaskStatus { … unchanged … }

// Responses: exactly the contract.
export type Task = Schemas['TaskResponse']
export type FieldErrorItem = Schemas['FieldErrorItem']
export type ApiErrorBody = Schemas['ApiError']
export interface Page<T> { items: T[]; page: number; size: number; totalElements: number; totalPages: number }

// Requests: what the UI sends — narrower than the contract (SCRUM-1-AC-06: all four fields always sent).
export interface TaskCreateRequest { title: string; description: string | null; status: TaskStatus; dueDate: string | null }
export type TaskUpdateRequest = TaskCreateRequest
export interface TaskStatusUpdateRequest { status: TaskStatus }
export interface ListTasksParams { page: number; status?: TaskStatus }

// SCRUM-12-AC-06: compile-time contract checks. A "Type 'false' does not satisfy the constraint 'true'" error here
// means api/openapi.yaml changed incompatibly with the UI: fix the UI types (and code), not this list.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T
export type ContractChecks = [
  Assert<Same<TaskStatus, Schemas['TaskStatus']>>,                         // TASK_STATUSES complete and exact
  Assert<Same<Page<Task>, Schemas['PageResponseTaskResponse']>>,
  Assert<TaskCreateRequest extends Schemas['TaskCreateRequest'] ? true : false>,   // what we send is accepted
  Assert<TaskUpdateRequest extends Schemas['TaskUpdateRequest'] ? true : false>,
  Assert<TaskStatusUpdateRequest extends Schemas['TaskStatusUpdateRequest'] ? true : false>,
]
```

Verified locally against the Appendix A document: `tsc -b` passes; changing `description` to non-nullable in the UI
types fails it (and the call sites).

### 6.3 `vite.config.ts`

```ts
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite'
// …
// SCRUM-12 (ADR 0017): Vitest imports the committed contract ../api/openapi.yaml (?raw). Test runs only — the dev
// server keeps Vite's default fs.allow, and neither the Docker build nor `vite build` reads the file.
server: {
  port: 5173,
  strictPort: true,
  ...(process.env.VITEST ? { fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../api'] } } : {}),
},
```

### 6.4 `src/test/contract.ts` (helper) and `src/test/contract.test.ts`

```ts
// src/test/contract.ts — SCRUM-12-AC-07 (ADR 0017)
import specText from '../../../api/openapi.yaml?raw'
import { Ajv2020 } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { parse } from 'yaml'

export const spec = parse(specText) as OpenApiDocument               // minimal local interface, no `any`
// Closed copy of components.schemas, "#/components/schemas/X" → "openapi#/$defs/X"; addSchema({ $id: 'openapi', $defs })
const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { int32: true, int64: true } })
addFormats(ajv)

export function findOperation(method: string, url: string): { template: string; operationId: string } | undefined
export function contractViolations(method: string, url: string, status: number, headers: Headers, body: unknown): string[]
export function schemaViolations(schemaName: string, value: unknown): string[]   // for fixtures
```

Same rules and messages as the Java checker (§4.5 (3)). `contract.test.ts`:

| Test name | What |
|---|---|
| `SCRUM-12-AC-07: every default MSW handler maps to a documented operation` | `handlers.map(h => h.info)` (`{ method, path }` — verified for MSW 3.0.6) → `:id` → `{id}`, strip `API` origin → `findOperation` defined. |
| `SCRUM-12-AC-07: default handler response conforms — <scenario>` (`test.each`) | seed store → `fetch` (MSW intercepts) → `contractViolations(...)` is `[]`. Scenarios: list 200 (seeded), list `?status=DONE` 200, list `?status=done` 400, get 200, get 404, create 201, create blank title 400, update 200, update 404, update blank 400, patch 200, patch 404, patch invalid 400. |
| `SCRUM-12-AC-07: fixture builders conform` | `makeTask()` → `TaskResponse`; `makePage([makeTask()])` → `PageResponseTaskResponse`; `errorBody(400/404/500)` → `ApiError`. |
| `SCRUM-12-AC-06: TASK_STATUSES equals the documented TaskStatus enum (order included)` | runtime check. |
| `SCRUM-12-AC-13: the validator rejects …` (`test.each`) | extra property, missing required, wrong enum, undocumented status (418), unknown operation, `text/plain`, 201 without `Location`. |

**Handler fidelity fix (expected):** the default `POST /tasks` handler returns 201 without `Location`; the contract
marks it required → add `headers: { Location: \`${API}/tasks/${task.id}\` }`. This changes a test double, not a
test assertion. Per-test `server.use(...)` overrides that simulate infrastructure failures (502 HTML, `HttpResponse.error()`,
"not json") are intentionally **not** validated — they model the proxy/network, not the backend contract.

### 6.5 Coverage

`src/test/**` is excluded from coverage; `schema.d.ts` and the type-only additions in `types.ts` emit no code.
Thresholds unchanged.

## 7. CI

### 7.1 `install-tools.sh` (NFR-02)

```bash
OASDIFF_VERSION=1.39.0
OASDIFF_SHA256=71a85930728f367a2086077b7ae1411319421549d18473a3e8258b6451520433
# usage line: tools: trivy cyclonedx-cli shellcheck oasdiff
    oasdiff)
      fetch "https://github.com/oasdiff/oasdiff/releases/download/v${OASDIFF_VERSION}/oasdiff_${OASDIFF_VERSION}_linux_amd64.tar.gz" \
        "$OASDIFF_SHA256" oasdiff.tar.gz
      tar -xzf "$root/dl/oasdiff.tar.gz" -C "$bin" oasdiff
      echo "oasdiff ${OASDIFF_VERSION} ($("$bin/oasdiff" --version))"
      ;;
```

### 7.2 `ci.yml` — job `build` (backend)

- After "Build, test, coverage gate" (which now runs drift + conformance + exposure + unit tests):

```yaml
      - name: OpenAPI drift diff (SCRUM-12-AC-05)
        if: failure() && hashFiles('target/openapi/openapi.diff') != ''
        run: |
          {
            echo "### OpenAPI drift (SCRUM-12-AC-05): committed \`api/openapi.yaml\` vs generated"
            echo '```diff'; cat target/openapi/openapi.diff; echo '```'
            echo "Intended? Take \`openapi.generated.yaml\` from the reports artifact or run \`./mvnw -B test -Dtest=OpenApiDriftIntegrationTest -Dopenapi.update=true\` (README → Changing the API contract)."
          } >> "$GITHUB_STEP_SUMMARY"
```

- "Upload test & coverage reports": add `target/openapi/` to `path`.
- Existing steps keep `actions/*@v4` tags (unchanged lines); the new step uses no action.

### 7.3 `ci.yml` — job `frontend`

After "Install":

```yaml
      - name: Contract types up to date (SCRUM-12-AC-06)
        run: npm run api:check   # regenerates src/api/schema.d.ts from ../api/openapi.yaml; prints the diff and fails if stale
```

`npm run typecheck` (AC-06 assertions) and `npm run test:coverage` (AC-07 tests) are existing steps.

### 7.4 `ci.yml` — new job `api-contract` (AC-08, AC-09, AC-13, AC-14)

```yaml
  # SCRUM-12 (ADR 0017): validate api/openapi.yaml and gate breaking changes against main. New job → SHA-pinned (NFR-02).
  api-contract:
    needs: identity
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      JIRA_KEY: ${{ needs.identity.outputs.jira_key }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0            # merge-base with origin/main
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: frontend/.nvmrc
      - name: Install oasdiff (pinned + checksum)
        run: .github/scripts/release/install-tools.sh oasdiff
      - name: Breaking-change gate self-tests (SCRUM-12-AC-13)
        run: >
          mkdir -p reports &&
          node --test --test-reporter=spec --test-reporter-destination=stdout
          --test-reporter=junit --test-reporter-destination=reports/api-contract-junit.xml
          ".github/scripts/api/test/*.test.mjs"
      - name: Validate the contract and gate breaking changes vs main (SCRUM-12-AC-08, AC-09)
        env:
          EVENT_NAME: ${{ github.event_name }}
          BASE_REF: ${{ github.base_ref }}       # PRs only; untrusted → env, quoted in the script
          REF_NAME: ${{ github.ref_name }}
        run: .github/scripts/api-contract.sh
      - name: AC summary
        if: always()
        run: |
          if [ -f reports/api-contract-junit.xml ]; then
            echo "### API contract gate tests (${JIRA_KEY} build)" >> "$GITHUB_STEP_SUMMARY"
            { grep -oE 'SCRUM-[0-9]+-(AC|NFR)-[0-9]+' reports/api-contract-junit.xml || true; } | sort -uV | tr '\n' ' ' >> "$GITHUB_STEP_SUMMARY"
            echo >> "$GITHUB_STEP_SUMMARY"
          fi
      - name: Upload reports
        if: always()
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: todo-api-contract-${{ env.JIRA_KEY }}-${{ github.sha }}-reports
          path: reports/
          if-no-files-found: warn
```

`.github/scripts/api-contract.sh` (shellcheck-clean; linted by the Release `tooling` job glob `.github/scripts/*.sh`):

```bash
#!/usr/bin/env bash
# SCRUM-12-AC-08, AC-09 (ADR 0017, design §7.4): validate api/openapi.yaml; gate breaking changes against main.
# Env: EVENT_NAME, BASE_REF (pull_request only), REF_NAME, JIRA_KEY, OUT (default reports/api-contract), GITHUB_STEP_SUMMARY.
# Exit: 0 pass · 1 unacknowledged breaking change · 2 error (invalid spec, malformed ack file, missing tool).
set -euo pipefail
spec=api/openapi.yaml
ack=api/breaking-changes.ack
out="${OUT:-reports/api-contract}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
root="$PWD"
mkdir -p "$out"
work=$(mktemp -d)   # oasdiff runs here, so no repo-level .oasdiff.* config can change severities
for f in .oasdiff.yaml .oasdiff.yml .oasdiff.json; do
  if [ -e "$f" ]; then echo "::error::SCRUM-12-AC-09: $f is not allowed (it would bypass the reviewed gate)"; exit 2; fi
done

(cd "$work" && oasdiff validate "$root/$spec" --allow-external-refs=false --fail-on ERR --format githubactions) || exit 2

case "${EVENT_NAME:-push}" in
  pull_request) base=$(git merge-base "origin/${BASE_REF:?BASE_REF required for pull_request}" HEAD) ;;
  *)
    if [ "${REF_NAME:-}" = main ]; then base=$(git rev-parse --verify --quiet 'HEAD^1' || true)
    else base=$(git merge-base origin/main HEAD); fi
    ;;
esac

gate=(node "$root/.github/scripts/api/breaking-gate.mjs" --ack "$ack" --jira-key "${JIRA_KEY:-UNKNOWN}" --summary "$summary")
if [ -z "$base" ] || ! git cat-file -e "${base}:${spec}" 2>/dev/null; then
  echo "::notice::SCRUM-12-AC-08: no ${spec} at base ${base:-<none>}; breaking-change check skipped (first introduction)"
  exec "${gate[@]}" --no-base
fi
git show "${base}:${spec}" > "$work/base.yaml"
echo "Comparing ${spec} with ${base} (${EVENT_NAME:-push} ${REF_NAME:-})"
(cd "$work" && oasdiff changelog base.yaml "$root/$spec" --allow-external-refs=false --format json) > "$out/changes.json"
(cd "$work" && oasdiff changelog base.yaml "$root/$spec" --allow-external-refs=false --format markdown) > "$out/changelog.md"
exec "${gate[@]}" --base "$base" --changes "$out/changes.json" --changelog "$out/changelog.md" --out "$out/verdict.json"
```

### 7.5 The breaking-change gate (`.github/scripts/api/breaking-gate.mjs`) and the acknowledgment file

Node ≥ 22 built-ins only (like the release tooling). Arguments as above. Exit codes **0 PASS / 1 BLOCKED /
2 ERROR** (fail closed, as `vuln-gate.mjs`).

- **Ack file** `api/breaking-changes.ack` (committed now with a header only):

  ```text
  # SCRUM-12 / ADR 0017: acknowledged breaking changes of api/openapi.yaml against main.
  # One line per change: <JIRA-KEY> <METHOD> <path> <oasdiff text, verbatim> -- <why this break is acceptable>
  # The gate prints the exact line to add. On feature branches / PRs only entries of the branch's Jira key count.
  # Remove entries once the change is on main (they are then reported as unused).
  ```

  Example:
  `SCRUM-15 GET /api/tasks/{id} removed the required property \`dueDate\` from the response with the \`200\` status -- due dates moved to /api/tasks/{id}/schedule; the only client (frontend) is updated in the same PR`
- **Parsing:** skip blank lines and `#` comments; entry = `^(SCRUM-\d+) (GET|PUT|POST|DELETE|OPTIONS|HEAD|PATCH|TRACE) (/\S*) (.+) -- (.+)$`
  splitting on the **last** ` -- `; justification ≥ 10 characters. Anything else → ERROR with line number.
- **Classification:** level 3 = breaking (ERR); 2 = warning (reported); 1 = info (counted). A breaking change is
  acknowledged iff an entry has `method === change.operation && path === change.path && text === change.text`
  (exact) **and** (`JIRA_KEY` is not `SCRUM-\d+` — i.e. `main` — or `entry.key === JIRA_KEY`).
- **Output:** markdown table (level, rule id, `METHOD path`, text, acknowledged by) + oasdiff changelog in a
  `<details>` block → `$GITHUB_STEP_SUMMARY`; `::error::` per unacknowledged change with the exact line to add
  (`${JIRA_KEY} ${operation} ${path} ${text} -- <justification>`); `::warning::` per unused/foreign entry;
  `verdict.json` `{ verdict, base, breaking, acknowledged, unacknowledged, unusedEntries }`.
- `--no-base`: validates the ack file format, writes a notice, PASS.

Tests `.github/scripts/api/test/breaking-gate.test.mjs` (`node:test`; fixtures under `.github/scripts/api/test/fixtures/`
captured from real oasdiff 1.39.0 output, e.g. the `dueDate` removal in §2.3 and a non-breaking-only changelog):

| Test name | Expectation |
|---|---|
| `SCRUM-12-AC-08: no changes → PASS` | exit 0 |
| `SCRUM-12-AC-08: only non-breaking (info/warn) changes → PASS, listed in the summary` | exit 0, rows present |
| `SCRUM-12-AC-08, SCRUM-12-AC-13: unacknowledged breaking change → BLOCKED with the line to add` | exit 1, `::error::` contains the exact ack line |
| `SCRUM-12-AC-09: all breaking changes acknowledged by the branch's key → PASS` | exit 0 |
| `SCRUM-12-AC-09: entry with another story's key does not acknowledge on a feature branch` | exit 1 + warning |
| `SCRUM-12-AC-09: on main any key acknowledges` | exit 0 |
| `SCRUM-12-AC-09: partial text / other path / other method does not acknowledge` | exit 1 |
| `SCRUM-12-AC-09: malformed entry (no justification, bad method, no key) → ERROR with line number` | exit 2 |
| `SCRUM-12-AC-09: unused entry → warning, verdict unchanged` | exit 0 + `::warning::` |
| `SCRUM-12-AC-08: --no-base → PASS with notice` | exit 0 |
| `SCRUM-12-AC-08: missing/unparsable changes file → ERROR` | exit 2 |

### 7.6 What runs where

| Check | CI job | Release job |
|---|---|---|
| Drift, canonical form, endpoint parity, Jackson 3 guard | `build` | `backend` |
| Conformance + exercised-pairs + checker unit tests | `build` | `backend` |
| Fail-safe exposure test (test context) | `build` | `backend` |
| No generator in jar (`verify-jar.sh`) | `build` | `backend` |
| No OpenAPI endpoint on the real images (e2e) | `e2e` | `e2e-release` |
| `schema.d.ts` up to date | `frontend` | — (CI on the same commit) |
| Type assertions, MSW/fixture validation | `frontend` | `frontend` |
| oasdiff validate + breaking-change gate + gate self-tests | `api-contract` | — (Q-08) |
| shellcheck of `api-contract.sh`, `install-tools.sh` | — | `tooling` (existing glob) |

## 8. Documentation

- **README:** new top-level bullet "SCRUM-12 — API contract" (links) and section **"Changing the API contract
  (SCRUM-12)"**: where the contract is; the update flow (§4.7) incl. the CI-artifact path; frontend regeneration
  (`npm run api:types`, `npm run api:check`); reading failures (drift diff in the job summary, conformance messages,
  type-assertion errors in `types.ts`, MSW validator messages); acknowledging a breaking change (ack line format,
  printed by the gate, key rule, cleanup); local commands (`./mvnw verify`, `npm run test`, `install-tools.sh
  oasdiff` + `OUT=/tmp/x EVENT_NAME=push REF_NAME=$(git branch --show-current) JIRA_KEY=SCRUM-n .github/scripts/api-contract.sh`).
  Also add `oasdiff` to the "Release tooling" install line example.
- **ADR 0007:** status line "Amended by ADR 0017 (SCRUM-12): MSW default handlers and fixtures are validated
  against `api/openapi.yaml`" (closes its "until contract tests exist" consequence). **ADR 0006:** one line "the
  contract trusted in `client.ts` is now `api/openapi.yaml`, enforced by ADR 0017". No other ADR changes.
- `docs/traceability/SCRUM-12.md`: Dev fills the template committed with this design.

## 9. Files Dev changes (NFR-08)

| File | Change |
|---|---|
| `pom.xml` | §4.1 |
| `src/main/resources/application.yml` | fail-safe `springdoc` block (§4.2) |
| `src/main/java/com/vinods21/todo/config/OpenApiDefinitionConfig.java` | **new** (§4.2) |
| `src/main/java/com/vinods21/todo/web/TaskController.java` | annotations only (§4.3) |
| `src/main/java/com/vinods21/todo/web/dto/{TaskResponse,PageResponse,TaskCreateRequest,TaskUpdateRequest,TaskStatusUpdateRequest}.java` | `@Schema`/`@Nullable` only |
| `src/main/java/com/vinods21/todo/web/error/{ApiError,FieldErrorItem}.java` | `@Schema` only |
| `src/main/java/com/vinods21/todo/domain/TaskStatus.java` | `@Schema(enumAsRef = true)` |
| `src/test/resources/application-openapi.yml` | **new** |
| `src/test/java/com/vinods21/todo/support/{OpenApiIntegrationTest,OpenApiDocuments,OpenApiContract}.java` | **new** (meta-annotation, canonicaliser, checker) |
| `src/test/java/com/vinods21/todo/support/{OpenApiContractTest,OpenApiDocumentsTest}.java` | **new** (unit tests, no Spring) |
| `src/test/java/com/vinods21/todo/contract/{OpenApiDriftIntegrationTest,TaskApiContractIntegrationTest}.java` | **new** |
| `src/test/java/com/vinods21/todo/OpenApiExposureIntegrationTest.java` | **new** |
| `api/openapi.yaml` | **new** (Appendix A → generator output, §4.7) |
| `api/breaking-changes.ack` | **new** (header only) |
| `frontend/package.json`, `frontend/package-lock.json` | §6.1 |
| `frontend/eslint.config.js` | ignore `src/api/schema.d.ts` |
| `frontend/vite.config.ts` | §6.3 |
| `frontend/src/api/schema.d.ts` | **new**, generated |
| `frontend/src/api/types.ts` | §6.2 |
| `frontend/src/test/contract.ts`, `frontend/src/test/contract.test.ts` | **new** |
| `frontend/src/test/handlers.ts` | `Location` header on 201 (and any other fidelity fix the validator finds — list them in the matrix) |
| `e2e/tests/stack.http.spec.ts` | one new test (§4.6) |
| `.github/workflows/ci.yml` | §7.2–7.4 |
| `.github/scripts/release/install-tools.sh` | `oasdiff` (§7.1) |
| `.github/scripts/verify-jar.sh` | §4.6 |
| `.github/scripts/api-contract.sh` | **new** |
| `.github/scripts/api/breaking-gate.mjs`, `.github/scripts/api/test/breaking-gate.test.mjs`, `.github/scripts/api/test/fixtures/*.json` | **new** |
| `README.md`, `docs/adr/0006-…md`, `docs/adr/0007-…md` (one status line each) | §8 |
| `docs/traceability/SCRUM-12.md` | fill |

**Not changed:** `GlobalExceptionHandler`, `WebConfig`, any service/repository/migration, existing test classes
(`TaskControllerTest`, `ErrorContractIntegrationTest`, …) and frontend tests, `release.yml`, `Dockerfile`s, nginx
config, `.dockerignore`s, security allow-list.

## 10. Test → AC mapping

| AC / NFR | Tests / checks |
|---|---|
| AC-01 | `api/openapi.yaml` review against Appendix A; `oasdiff validate` (api-contract); `OpenApiDriftIntegrationTest.generatedDocumentEqualsCommitted` (document = code) |
| AC-02 | ADR 0017 (review) |
| AC-03 | `TaskApiContractIntegrationTest.responseConformsToContract` (25 scenarios) |
| AC-04 | `TaskApiContractIntegrationTest.everyDocumentedResponseIsExercised`; `OpenApiDriftIntegrationTest.servedEndpointsEqualDocumentedOperations`; checker rule "undocumented status" (scenarios + `OpenApiContractTest`) |
| AC-05 | `OpenApiDriftIntegrationTest.generatedDocumentEqualsCommitted` + CI step "OpenAPI drift diff"; `OpenApiDocumentsTest` (formatting ≠ drift) |
| AC-06 | `npm run api:check` (CI step); `types.ts` `ContractChecks` via `npm run typecheck`; `contract.test.ts` › `SCRUM-12-AC-06: TASK_STATUSES …` |
| AC-07 | `contract.test.ts` › handler mapping, handler scenarios, fixtures |
| AC-08 | `api-contract.sh` + `breaking-gate.mjs` in job `api-contract`; `breaking-gate.test.mjs` |
| AC-09 | `breaking-gate.test.mjs` (`SCRUM-12-AC-09: …`); ack file in PR diff |
| AC-10 | `verify-jar.sh` (CI `build`, Release `backend`); `OpenApiExposureIntegrationTest`; e2e `SCRUM-12-AC-10` (CI `e2e`, Release `e2e-release`) |
| AC-11 | all existing suites unchanged and green; `git diff origin/main --stat -- src/test/java/com/vinods21/todo/{web,service}/ src/test/java/com/vinods21/todo/*IntegrationTest.java frontend/src/**/*.test.tsx` shows only new files; CI + Release dry-run links |
| AC-12 | README section (review) |
| AC-13 | `OpenApiContractTest`, `OpenApiDocumentsTest`, `breaking-gate.test.mjs`, `contract.test.ts` › `SCRUM-12-AC-13` |
| AC-14 | tags/names; job summaries; matrix |
| NFR-01 | `verify-jar.sh`; `dependency:tree -Dscope=runtime` evidence; Release `scan` (`backend-runtime` +1 component, no new findings) |
| NFR-02 | workflow review (SHA pins on the new job), `install-tools.sh` checksum, exact npm versions |
| NFR-03 | `committedFileIsCanonical`; re-running the update command yields no diff |
| NFR-04 | message formats (unit tests assert key fragments) |
| NFR-05 | `types.ts` derives/asserts; no other copy |
| NFR-06 | job durations in the matrix |
| NFR-07 | README local commands |
| NFR-08 | §9 list vs `git diff --stat origin/main` |
| NFR-09 | `servesJsonWithJackson3` |
| NFR-10 | Release dry-run: `repro-jar.sh`, SBOM floors, image sizes |

## 11. Requirement → design coverage and answers to Q-01..Q-08

| Q | Answer | § |
|---|---|---|
| Q-01 | Code-first; springdoc 3.2.0 test scope; snapshot committed; structural non-exposure + fail-safe property + e2e | 1, 4, ADR 0017 |
| Q-02 | OpenAPI 3.1.0 | 1, 2.3 |
| Q-03 | networknt 3.0.9 (Jackson 3); checker closes object schemas in memory | 2.1, 4.5 |
| Q-04 | `@Parameter(schema = TaskStatus)` on `String[]`; `@ApiResponse(201, headers = Location)` | 4.3 |
| Q-05 | sort keys + `required`; nothing stripped; canonical file enforced separately | 4.4 |
| Q-06 | openapi-typescript 7.13.0 + npm `overrides`; Ajv runtime validation; `?raw` + test-only `fs.allow` | 6 |
| Q-07 | oasdiff 1.39.0; `--fail-on`-free JSON + own gate; base per event; ack file | 7.4, 7.5 |
| Q-08 | Release unchanged; its jobs already run the test-based checks | 1, 7.6 |

## 12. Risks

| ID | Risk | Mitigation |
|---|---|---|
| R-01 | springdoc output differs from Appendix A in details (descriptions, `required: false` on params, `minLength: 0`, generic schema name, `status` as array) | Expected; drift test + CI artifact (§4.7). Rule for Dev: semantic differences → fix annotations; cosmetic → accept generator output. Budget 1–3 CI round-trips. |
| R-02 | Boot 4.2 upgrade later needs springdoc 3.2.1+ (swagger-core 3 / Jackson 3, artifact renamed to `swagger-annotations`) | Recorded in ADR 0017 consequences; the drift test will show any output change at that time. |
| R-03 | springdoc introspects DTOs with Jackson 2 while the app serializes with Jackson 3 → a property naming/visibility difference (Jackson 3 defaults differ, e.g. acronym getters) | Conformance tests validate real Jackson 3 output against the generated document with closed schemas → any mismatch fails. Our DTOs are records with plain names. |
| R-04 | Boot manages Jackson 3.1.7; networknt 3.0.9 is built against 3.1.8 | Same minor; conformance unit tests exercise the validator; bump with the next Boot patch. |
| R-05 | `@Parameter(schema=…)` on `String[]` might still yield `type: array` | Fallback in §4.3 (method-level `@Parameter` + hidden argument). |
| R-06 | Extra Spring context + container slows the backend job | One context for both generator-backed classes; exposure test shares the existing default context; expected +15–25 s. |
| R-07 | `openapi-typescript` peer range excludes TS 6; a future TS 6.x API change breaks generation | `overrides` is explicit and commented; `api:check` fails loudly; alternative is a separate tools package with TS 5 (not needed today). |
| R-08 | oasdiff rule set changes between versions (new ERR rules) | Version pinned + checksum; bump is a reviewed change; gate self-tests use captured fixtures. |
| R-09 | Ack entries accumulate | Unused entries → `::warning::`; README asks the next story to prune; entries of other keys never count on feature branches. |
| R-10 | First CI run on this branch: no baseline on `main` → breaking check skipped | Intended (A-04); gate self-tests still prove the logic. After merge, the push to `main` compares `HEAD^1` (no file) → skipped once more; effective from the next story. |
| R-11 | `/v3/api-docs` through nginx returns the SPA shell (200) — could confuse a scanner | Documented in the e2e test; not an exposure (no backend content). Explicit `location ^~ /v3/ { return 404; }` deliberately not added (NFR-08); revisit if a scanner flags it. |

## Appendix A — target content of `api/openapi.yaml` (canonical form)

Validated locally with `oasdiff validate` (no findings), `openapi-typescript` 7.13.0 (generates; `tsc -b` passes with
§6.2 types) and Ajv 2020. Descriptions may be shortened by Dev; status codes, required/nullable, formats, limits and
`operationId`s are the contract.

```yaml
openapi: 3.1.0
info:
  description: "Task REST API of the To-Do application (SCRUM-2, SCRUM-6). Every error response uses the ApiError body (ADR 0003). Contract: ADR 0017."
  title: To-Do Task API
  version: "1"
servers:
- description: "Same origin: nginx proxies /api/** to the backend (ADR 0011)"
  url: /
tags:
- description: Create, read, list, update, change the status of and delete tasks
  name: Tasks
paths:
  /api/tasks:
    get:
      description: "Newest first (createdAt DESC, id DESC). size > 100 is clamped to 100. status filters by exactly one exact, case-sensitive enum name; empty, repeated, comma-separated, unknown or wrong-case values are rejected (ADR 0009)."
      operationId: listTasks
      parameters:
      - description: 0-based page index
        in: query
        name: page
        required: false
        schema: {default: 0, format: int32, minimum: 0, type: integer}
      - description: Page size; values above 100 are clamped to 100
        in: query
        name: size
        required: false
        schema: {default: 20, format: int32, minimum: 1, type: integer}
      - description: Only tasks with this status (single value)
        in: query
        name: status
        required: false
        schema: {$ref: "#/components/schemas/TaskStatus"}
      responses:
        "200": {description: One page of tasks, content: {application/json: {schema: {$ref: "#/components/schemas/PageResponseTaskResponse"}}}}
        "400": {description: "Invalid page, size or status", content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "500": {description: Unexpected error, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
      summary: List tasks
      tags: [Tasks]
    post:
      operationId: createTask
      requestBody: {required: true, content: {application/json: {schema: {$ref: "#/components/schemas/TaskCreateRequest"}}}}
      responses:
        "201":
          description: Task created
          headers:
            Location: {description: URL of the created task, required: true, schema: {format: uri, type: string}}
          content: {application/json: {schema: {$ref: "#/components/schemas/TaskResponse"}}}
        "400": {description: "Validation failed, malformed JSON or invalid field value", content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "415": {description: Content type is not application/json, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "500": {description: Unexpected error, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
      summary: Create a task
      tags: [Tasks]
  /api/tasks/{id}:
    delete:
      operationId: deleteTask
      parameters:
      - {in: path, name: id, required: true, schema: {format: int64, type: integer}}
      responses:
        "204": {description: Task deleted}
        "400": {description: Non-numeric id, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "404": {description: Task not found, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "500": {description: Unexpected error, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
      summary: Delete a task
      tags: [Tasks]
    get:
      operationId: getTask
      parameters:
      - {in: path, name: id, required: true, schema: {format: int64, type: integer}}
      responses:
        "200": {description: The task, content: {application/json: {schema: {$ref: "#/components/schemas/TaskResponse"}}}}
        "400": {description: Non-numeric id, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "404": {description: Task not found, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "500": {description: Unexpected error, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
      summary: Get a task
      tags: [Tasks]
    put:
      description: Full replacement of title, description, status and dueDate; id and createdAt are unchanged.
      operationId: updateTask
      parameters:
      - {in: path, name: id, required: true, schema: {format: int64, type: integer}}
      requestBody: {required: true, content: {application/json: {schema: {$ref: "#/components/schemas/TaskUpdateRequest"}}}}
      responses:
        "200": {description: The updated task, content: {application/json: {schema: {$ref: "#/components/schemas/TaskResponse"}}}}
        "400": {description: "Validation failed, malformed JSON, invalid field value or non-numeric id", content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "404": {description: Task not found, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "415": {description: Content type is not application/json, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "500": {description: Unexpected error, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
      summary: Replace a task
      tags: [Tasks]
  /api/tasks/{id}/status:
    patch:
      description: Changes only the status (any transition) and returns the full task (ADR 0009).
      operationId: updateTaskStatus
      parameters:
      - {in: path, name: id, required: true, schema: {format: int64, type: integer}}
      requestBody: {required: true, content: {application/json: {schema: {$ref: "#/components/schemas/TaskStatusUpdateRequest"}}}}
      responses:
        "200": {description: The updated task, content: {application/json: {schema: {$ref: "#/components/schemas/TaskResponse"}}}}
        "400": {description: "Missing, null or invalid status, malformed JSON or non-numeric id", content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "404": {description: Task not found, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "415": {description: Content type is not application/json, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
        "500": {description: Unexpected error, content: {application/json: {schema: {$ref: "#/components/schemas/ApiError"}}}}
      summary: Change the status of a task
      tags: [Tasks]
components:
  schemas:
    ApiError:
      description: Standard error body of every error response (ADR 0003)
      properties:
        error: {description: HTTP reason phrase, type: string}
        fieldErrors: {description: Invalid fields; empty when the error is not a validation failure, items: {$ref: "#/components/schemas/FieldErrorItem"}, type: array}
        message: {type: string}
        path: {type: string}
        status: {format: int32, type: integer}
        timestamp: {format: date-time, type: string}
      required: [error, fieldErrors, message, path, status, timestamp]
      type: object
    FieldErrorItem:
      properties: {field: {type: string}, message: {type: string}}
      required: [field, message]
      type: object
    PageResponseTaskResponse:
      properties:
        items: {items: {$ref: "#/components/schemas/TaskResponse"}, type: array}
        page: {format: int32, type: integer}
        size: {format: int32, type: integer}
        totalElements: {format: int64, type: integer}
        totalPages: {format: int32, type: integer}
      required: [items, page, size, totalElements, totalPages]
      type: object
    TaskCreateRequest:
      properties:
        description: {maxLength: 2000, minLength: 0, type: [string, "null"]}
        dueDate: {format: date, type: [string, "null"]}
        status: {oneOf: [{$ref: "#/components/schemas/TaskStatus"}, {type: "null"}]}
        title: {maxLength: 200, minLength: 1, type: string}
      required: [title]
      type: object
    TaskResponse:
      properties:
        createdAt: {format: date-time, type: string}
        description: {type: [string, "null"]}
        dueDate: {format: date, type: [string, "null"]}
        id: {format: int64, type: integer}
        status: {$ref: "#/components/schemas/TaskStatus"}
        title: {type: string}
      required: [createdAt, description, dueDate, id, status, title]
      type: object
    TaskStatus:
      enum: [TODO, IN_PROGRESS, DONE]
      type: string
    TaskStatusUpdateRequest:
      properties: {status: {$ref: "#/components/schemas/TaskStatus"}}
      required: [status]
      type: object
    TaskUpdateRequest:
      properties:
        description: {maxLength: 2000, minLength: 0, type: [string, "null"]}
        dueDate: {format: date, type: [string, "null"]}
        status: {$ref: "#/components/schemas/TaskStatus"}
        title: {maxLength: 200, minLength: 1, type: string}
      required: [status, title]
      type: object
```

(Shown in YAML flow style for readability; the committed file uses the block style produced by `OpenApiDocuments.toYaml`.)
