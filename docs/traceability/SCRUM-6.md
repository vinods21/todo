# SCRUM-6 — Requirements Traceability Matrix

Jira: [SCRUM-6](https://suranagivinod.atlassian.net/browse/SCRUM-6) · Branch: `feature/SCRUM-6-task-status-management` ·
Requirements: [`docs/requirements/SCRUM-6.md`](../requirements/SCRUM-6.md) · Design: [`docs/architecture/SCRUM-6-design.md`](../architecture/SCRUM-6-design.md) ·
ADRs: [0008](../adr/0008-ci-derived-build-identity.md), [0009](../adr/0009-status-sub-resource-patch.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md) (as amended by 0008), [ADR 0007](../adr/0007-frontend-testing-msw.md)

**Status: Filled by Dev** — code and tests complete; CI run link, commit SHA and backend coverage are added after the
first push/green run (the backend cannot be built in the authoring workspace — design §0; frontend verified locally).

Backend "Test" = `Class#method` (paths relative to `src/test/java/com/vinods21/todo/`) whose `@DisplayName` starts with
the ID and which carries `@Tag("SCRUM-6")` (class- or method-level). Frontend "Test" = `<file> › <it name>` (paths
relative to `frontend/`) inside a `describe('SCRUM-6 <area>')`. "CI evidence" = the `CI` workflow run on `<sha>`:
job `build` → artifacts `todo-backend-SCRUM-6-<sha>` / `todo-backend-SCRUM-6-<sha>-reports`; job `frontend` →
`todo-frontend-SCRUM-6-<sha>` / `todo-frontend-SCRUM-6-<sha>-reports` (ADR 0008 names).

CI run: _pending first push_ · Commit SHA: `<sha of the pushed head>` · Build identity checked: jar `X-Jira-Issue: SCRUM-6` and
`build-info.properties build.jira=SCRUM-6` — CI step "Verify build identity" (job `build`), `/actuator/info build.jira = SCRUM-6`
— `TodoApplicationIntegrationTest#infoCarriesJiraKey` (equals `build.jira.expected`), `build-info.json "jira": "SCRUM-6"` —
CI step "Verify build identity" (job `frontend`); locally `JIRA_KEY=SCRUM-6 npm run build` → `"jira": "SCRUM-6"`, default `"UNKNOWN"` ✔ ·
Coverage — backend lines (service + web*): _from the first CI run_ (gate 80 %) · frontend (local, 116 tests): lines 100 %,
statements 98.5 %, functions 100 %, branches 94.5 % (gate 80/80/80/75)

> Verify AC coverage: `grep -hoE 'SCRUM-6-AC-[0-9]+' TEST-*.xml | sort -uV` (expect AC-01..AC-07, AC-17) and
> `grep -oE 'SCRUM-6-AC-[0-9]+' junit.xml | sort -uV` (expect AC-08..AC-16).

| ID | Requirement (short) | Code (file / symbol) | Test(s) | CI evidence |
|---|---|---|---|---|
| SCRUM-6-AC-01 | `PATCH /api/tasks/{id}/status` → 200 full task; only status changes; extra fields ignored | `web/TaskController#updateStatus`; `web/dto/TaskStatusUpdateRequest`; `service/TaskService#updateStatus` | `web/TaskControllerTest#patchStatusReturns200AndIgnoresExtraFields`; `service/TaskServiceTest#updateStatusChangesOnlyStatus`; `TaskStatusIntegrationTest#patchedStatusPersistsAndIsFiltered` | surefire, run `<sha>` |
| SCRUM-6-AC-02 | Any transition allowed (incl. backwards); same→same no-op 200 | `service/TaskService#updateStatus` (no rules) | `service/TaskServiceTest#everyTransitionAllowed` (9 pairs); `TaskStatusIntegrationTest#backwardsAndSameTransitionsAllowed` | surefire, run `<sha>` |
| SCRUM-6-AC-03 | PATCH errors: 400 missing/null/unknown/malformed/non-numeric id, 404, 415; task unchanged | `web/error/GlobalExceptionHandler` (existing mappings); `@Valid` on `TaskStatusUpdateRequest` | `web/TaskControllerTest#patchMissingStatusReturns400`, `#patchUnknownStatusReturns400`, `#patchMalformedJsonReturns400`, `#patchNonObjectBodyReturns400`, `#patchNonNumericIdReturns400`, `#patchUnknownIdReturns404`, `#patchNonJsonReturns415`; `service/TaskServiceTest#updateStatusThrowsWhenMissing`; `TaskStatusIntegrationTest#invalidPatchLeavesRowUnchanged` | surefire, run `<sha>` |
| SCRUM-6-AC-04 | CORS preflight allows `PATCH` for allowed origins only | `config/WebConfig#addCorsMappings` | `web/CorsConfigTest#patchPreflightAllowed`, `#patchPreflightForeignOriginRejected` | surefire, run `<sha>` |
| SCRUM-6-AC-05 | `?status=` filters in DB with paging/ordering on the filtered set | `web/TaskController#list`; `service/TaskService#listByStatus`; `repository/TaskRepository#findByStatus`; `db/migration/V2__add_tasks_status_index.sql` | `web/TaskControllerTest#listFiltersByStatus`, `#listFilterKeepsPagingRules`, `#listFilterNegativePageReturns400`; `service/TaskServiceTest#listByStatusFiltersInDatabase`; `TaskStatusIntegrationTest#filterPagesOverFilteredSet` | surefire, run `<sha>` |
| SCRUM-6-AC-06 | No `status` = SCRUM-2 behaviour; no matches → empty page | `web/TaskController#list` (`list(int,int)` path) | `web/TaskControllerTest#listWithoutStatusIsUnfiltered`, `#listFilterWithoutMatchesReturnsEmptyPage` + existing SCRUM-2-AC-05 tests unchanged | surefire, run `<sha>` |
| SCRUM-6-AC-07 | Invalid/empty/repeated/comma `status` → 400 `Invalid value for parameter 'status'` | `web/TaskController#parseStatusFilter`; `web/InvalidQueryParameterException`; `GlobalExceptionHandler#handleInvalidQueryParameter` | `web/TaskControllerTest#listInvalidStatusReturns400` (6 queries: `DONEE`, `done`, empty, `TODO,DONE`, repeated ×2), `#parseStatusFilterRules`; `TaskStatusIntegrationTest#invalidFilterReturns400` | surefire, run `<sha>` |
| SCRUM-6-AC-08 | Per-row status control, accessible name, current value | `src/components/StatusSelect.tsx`; `src/components/TaskTable.tsx` | `src/components/StatusSelect.test.tsx › SCRUM-6-AC-08, SCRUM-6-NFR-06: a combobox named after the task …`; `src/pages/TaskListPage.test.tsx › SCRUM-6-AC-08, SCRUM-6-NFR-06: every row has a status control …` | junit, run `<sha>` |
| SCRUM-6-AC-09 | Change sends PATCH only, no navigation; row shows new status | `StatusSelect.tsx`; `src/api/tasks.ts` `updateTaskStatus`; `src/api/client.ts` (`PATCH`) | `StatusSelect.test.tsx › SCRUM-6-AC-09: choosing a status sends one PATCH …`; `TaskListPage.test.tsx › SCRUM-6-AC-09, SCRUM-6-NFR-06: changing a status sends only a PATCH …`; `src/api/tasks.test.ts › SCRUM-6-AC-09, SCRUM-6-NFR-04: updateTaskStatus PATCHes only { status } …` | junit, run `<sha>` |
| SCRUM-6-AC-10 | Row disabled while in flight, others usable; filtered list reloads; clamp to last page | `StatusSelect.tsx` (`pending`, focus restore); `src/pages/TaskListPage.tsx` (reload, `clampAfterChange`, `clampedFrom` state) | `StatusSelect.test.tsx › SCRUM-6-AC-10, SCRUM-6-NFR-06: while in flight …`; `TaskListPage.test.tsx › SCRUM-6-AC-10: only the row being saved is disabled …`, `› SCRUM-6-AC-10: in a filtered list a changed task is reloaded out of the view`, `› SCRUM-6-AC-10: when the change empties the last filtered page …`, `› SCRUM-6-AC-10, SCRUM-6-AC-14: when the change empties the whole filtered set …` | junit, run `<sha>` |
| SCRUM-6-AC-11 | Error reverts row + alert (generic); 404 → "Task not found" + reload | `StatusSelect.tsx` (revert); `TaskListPage.tsx` (`rowError`) | `StatusSelect.test.tsx › SCRUM-6-AC-11: a 500 reverts …`, `› a network error reverts …`, `› a 200 with an unreadable body …`; `TaskListPage.test.tsx › SCRUM-6-AC-11: a 500 reverts the row …` (incl. retry), `› a network error …`, `› a 400 …`, `› a 404 (deleted elsewhere) …`, `› SCRUM-6-AC-11, SCRUM-6-AC-13: messages are cleared when the filter changes`; `tasks.test.ts › SCRUM-6-AC-11: … 404` | junit, run `<sha>` |
| SCRUM-6-AC-12 | Filter control All/To do/In progress/Done drives `status` param | `src/components/StatusFilter.tsx`; `TaskListPage.tsx`; `src/api/tasks.ts` `listTasks` | `TaskListPage.test.tsx › SCRUM-6-AC-12: the Status filter offers All/To do/In progress/Done …`; `tasks.test.ts › SCRUM-6-AC-12: listTasks adds status …` | junit, run `<sha>` |
| SCRUM-6-AC-13 | Filter in URL with page; direct entry/Back/Forward; invalid → All | `src/pages/params.ts` `parseStatusParam`, `parseListParams`, `listSearchParams`, `listPath` | `src/pages/params.test.ts › SCRUM-6-AC-13: …` (3 tests); `TaskListPage.test.tsx › SCRUM-6-AC-13: the filter is reflected in the URL …`, `› direct entry restores filter and page; paging keeps the filter`, `› an invalid ?status is treated as All …`; `src/routes.test.tsx › SCRUM-6-AC-13: Back and Forward restore …` | junit, run `<sha>` |
| SCRUM-6-AC-14 | Filter-aware empty state with "Show all tasks" | `TaskListPage.tsx` (empty-state precedence) | `TaskListPage.test.tsx › SCRUM-6-AC-14: an empty filtered result names the filter …`, `› SCRUM-6-AC-14: the unfiltered empty list still says "No tasks yet." …`, `› SCRUM-6-AC-10, SCRUM-6-AC-14: …` | junit, run `<sha>` |
| SCRUM-6-AC-15 | Edit/cancel returns to same filter and page | `TaskListPage.tsx` (`returnTo = listPath(...)`); `params.ts` `returnTarget` | `src/pages/TaskEditPage.test.tsx › SCRUM-6-AC-15: Edit then Cancel …`, `› SCRUM-6-AC-15: Edit then Save …`; `params.test.ts › SCRUM-6-AC-15: a filtered, paged list path round-trips …` | junit, run `<sha>` |
| SCRUM-6-AC-16 | Create/edit still set status; quick change visible in edit form | unchanged `TaskForm`, `TaskEditPage`, `TaskCreatePage` | `TaskEditPage.test.tsx › SCRUM-6-AC-16: a status changed from the list is prefilled …`, `› SCRUM-6-AC-16: the create form still sends the chosen status` + existing SCRUM-1 tests | junit, run `<sha>` |
| SCRUM-6-AC-17 | Testcontainers PG16: PATCHed status persists, reflected by filter | full stack | `TaskStatusIntegrationTest#patchedStatusPersistsAndIsFiltered` | surefire, run `<sha>` |
| SCRUM-6-NFR-01 | Backward compatible; only deliberate test changes | `TaskService#list(int,int)` kept | All SCRUM-1/SCRUM-2 tests green; deliberate changes listed below | both jobs, run `<sha>` |
| SCRUM-6-NFR-02 | No V1 edit; index via V2 | `db/migration/V2__add_tasks_status_index.sql` | `TaskStatusIntegrationTest#flywayV2CreatedStatusIndex`; `TaskPersistenceRestartTest#taskSurvivesRestart` | surefire, run `<sha>` |
| SCRUM-6-NFR-03 | Backend tests tagged, AC-prefixed; JaCoCo gate | test classes above | `./mvnw test -Dgroups=SCRUM-6` | JaCoCo in `todo-backend-SCRUM-6-<sha>-reports` |
| SCRUM-6-NFR-04 | Frontend Vitest/RTL/MSW, AC-prefixed; typed client; coverage gate | `src/api/types.ts` (`TaskStatusUpdateRequest`, `ListTasksParams`); `src/test/handlers.ts` | `npx vitest run -t 'SCRUM-6-'` | junit + coverage in `todo-frontend-SCRUM-6-<sha>-reports` |
| SCRUM-6-NFR-05 | CI `build` and `frontend` green | `.github/workflows/ci.yml` | n/a | run `<sha>` |
| SCRUM-6-NFR-06 | Accessible controls; announcements | `StatusSelect.tsx`, `StatusFilter.tsx`, `TaskListPage.tsx` (`role="status"`, `role="alert"`) | tests named `SCRUM-6-AC-xx, SCRUM-6-NFR-06: …` in `StatusSelect.test.tsx` and `TaskListPage.test.tsx`; all queries by role/label | junit, run `<sha>` |
| SCRUM-6-NFR-07 | ADR 0004 conventions; build identity per ADR 0008 | `ci.yml` job `identity` + "Verify build identity" steps; `pom.xml` `jira.issue` + surefire `build.jira.expected`; `frontend/vite.config.ts` | `TodoApplicationIntegrationTest#infoCarriesJiraKey`; `src/components/BuildInfo.test.tsx › SCRUM-1-NFR-09, SCRUM-6-NFR-07: …`; `src/routes.test.tsx › SCRUM-1-AC-12, SCRUM-1-NFR-09: …`; branch→key dry run (below) | artifact names `…-SCRUM-6-<sha>`; run summary "Build identity: SCRUM-6" |
| SCRUM-6-NFR-08 | Filtering in DB, never in memory | `TaskRepository#findByStatus`; V2 index; frontend never filters locally | `service/TaskServiceTest#listByStatusFiltersInDatabase`; `TaskControllerTest#listFiltersByStatus` (`list` never called); frontend tests assert the `status` query in `requestLog` | surefire, run `<sha>` |
| SCRUM-6-NFR-09 | README documents PATCH, `status` param, UI filter, ADR 0008 names | `README.md` | n/a | Reviewed in PR |

## Deliberate changes to existing tests (design §8.3)

| Test | Change | Done |
|---|---|---|
| `TodoApplicationIntegrationTest#infoCarriesJiraKey` | assert `build.jira` = `build.jira.expected` and matches the key pattern; `@Tag("SCRUM-6")` | Done |
| `TaskPersistenceRestartTest#taskSurvivesRestart` | migration count unchanged across restart (instead of `== 1`) | Done |
| `frontend/src/pages/TaskListPage.test.tsx › SCRUM-1-AC-01` | status read from the row combobox | Done |
| `frontend/src/api/tasks.test.ts › SCRUM-1-AC-01, SCRUM-1-AC-02` | `listTasks({ page: 2 })` | Done |
| `frontend/src/components/BuildInfo.test.tsx › SCRUM-1-NFR-09` | key pattern instead of `'SCRUM-1'` | Done |
| `frontend/src/routes.test.tsx › SCRUM-1-AC-12, SCRUM-1-NFR-09` | `${__JIRA_KEY__} ·` instead of `'SCRUM-1 ·'` | Done |

## Deviations from the design

| Item | Design | Implemented | Reason |
|---|---|---|---|
| `StatusSelect` props | `{ task, onChanged, onFailed }` | adds optional `onStarted(task)`; `TaskTable` passes `onStatusStarted` | §4.6 "New change started → clear `rowError`" needs a start signal from the row |
| Clamp after a filtered change (§4.6) | `setSearchParams(…, { replace: true })` | additionally passes location state `{ clampedFrom: <previous view> }`; messages are keyed to the view they were raised in and stay visible on the clamped page | Otherwise the success announcement would vanish with the page change that the clamp itself causes |
| Row error styling | `<div role="alert">` | `<div role="alert" className="error-panel">` | Reuse the existing error styling |
| `isTaskStatus` location (§4.2) | add to `api/types.ts` | moved from `components/taskForm.ts` to `api/types.ts`; `taskForm.ts` re-exports it so existing imports are unchanged | Single definition |
| `domain/TaskStatus.java` | unchanged | Javadoc only: "transition rules belong to SCRUM-6" → "no transition rules (SCRUM-6 A-01)" | Stale comment; no code change |
| CI "Verify build identity" (backend) | `grep -qx` | `grep -x … >/dev/null` | `grep -q` exits early and could SIGPIPE `unzip`, failing the step if `pipefail` is active |
| Extra backend cases | §8.1 | additionally: `patchNonObjectBodyReturns400` (bare string, empty body, array), `parseStatusFilterRules` (unit), `"Done"`/`"BLOCKED"` in the PATCH enum cases | Pin §2.2/§2.4 behaviour; bare-string message not pinned (only 400) because it depends on Jackson's creator detection |

## Manual checks

| Check | Date | Result |
|---|---|---|
| Branch → key derivation (`identity` job script, extracted from `ci.yml`, run with bash): `feature/SCRUM-6-task-status-management` → `SCRUM-6`; `main` → `main`; `$(echo hi)` → `NONE`; `feature/SCRUM-6-$(echo hi)` → `SCRUM-6` (no command executed); `` feature/SCRUM-6-`touch /tmp/pwned` `` → `SCRUM-6`, no file created; `feature/SCRUM-6x-foo`, `feature/scrum-6-lower`, `dependabot/…` → `NONE` | 2026-11-17 | ✔ |
| Frontend `npm ci && npm run lint && npm run typecheck && npm run test:coverage && npm run build`; `JIRA_KEY=SCRUM-6 npm run build` → `dist/build-info.json` `"jira": "SCRUM-6"` and `<meta name="build-info" content="SCRUM-6 …">`; without `JIRA_KEY` → `"UNKNOWN"` | 2026-11-17 | ✔ (116 tests) |
| `ci.yml` parses (Python `yaml.safe_load`); `pom.xml` well-formed | 2026-11-17 | ✔ |
| Backend + `npm run dev`: change status from list, filter, edit round-trip, PATCH preflight in browser devtools | — | Not run: no Maven/Docker access in the authoring workspace; to be done by a reviewer |
