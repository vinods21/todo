# SCRUM-6 — Requirements Traceability Matrix

Jira: [SCRUM-6](https://suranagivinod.atlassian.net/browse/SCRUM-6) · Branch: `feature/SCRUM-6-task-status-management` ·
Requirements: [`docs/requirements/SCRUM-6.md`](../requirements/SCRUM-6.md) · Design: [`docs/architecture/SCRUM-6-design.md`](../architecture/SCRUM-6-design.md) ·
ADRs: [0008](../adr/0008-ci-derived-build-identity.md), [0009](../adr/0009-status-sub-resource-patch.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md) (as amended by 0008), [ADR 0007](../adr/0007-frontend-testing-msw.md)

**Status: TEMPLATE — Dev fills it** (replace every `TBD` / `<sha>`; add the CI run link after the first green run).

Backend "Test" = `Class#method` (paths relative to `src/test/java/com/vinods21/todo/`) whose `@DisplayName` starts with
the ID and which carries `@Tag("SCRUM-6")` (class- or method-level). Frontend "Test" = `<file> › <it name>` (paths
relative to `frontend/`) inside a `describe('SCRUM-6 <area>')`. "CI evidence" = the `CI` workflow run on `<sha>`:
job `build` → artifacts `todo-backend-SCRUM-6-<sha>` / `todo-backend-SCRUM-6-<sha>-reports`; job `frontend` →
`todo-frontend-SCRUM-6-<sha>` / `todo-frontend-SCRUM-6-<sha>-reports` (ADR 0008 names).

CI run: _TBD_ · Commit SHA: `<sha>` · Build identity checked: jar `X-Jira-Issue: SCRUM-6` _TBD_, `/actuator/info build.jira = SCRUM-6` _TBD_, `build-info.json "jira": "SCRUM-6"` _TBD_ ·
Coverage — backend lines (service + web*): _TBD_ (gate 80 %) · frontend: _TBD_ (gate 80/80/80/75)

> Verify AC coverage: `grep -hoE 'SCRUM-6-AC-[0-9]+' TEST-*.xml | sort -uV` (expect AC-01..AC-07, AC-17) and
> `grep -oE 'SCRUM-6-AC-[0-9]+' junit.xml | sort -uV` (expect AC-08..AC-16).

| ID | Requirement (short) | Code (file / symbol) | Test(s) | CI evidence |
|---|---|---|---|---|
| SCRUM-6-AC-01 | `PATCH /api/tasks/{id}/status` → 200 full task; only status changes; extra fields ignored | `web/TaskController#updateStatus`; `web/dto/TaskStatusUpdateRequest`; `service/TaskService#updateStatus` | TBD (`TaskControllerTest`, `TaskServiceTest`, `TaskStatusIntegrationTest`) | surefire, run `<sha>` |
| SCRUM-6-AC-02 | Any transition allowed (incl. backwards); same→same no-op 200 | `service/TaskService#updateStatus` (no rules) | TBD (`TaskServiceTest` parameterized 9 pairs; `TaskStatusIntegrationTest`) | surefire, run `<sha>` |
| SCRUM-6-AC-03 | PATCH errors: 400 missing/null/unknown/malformed/non-numeric id, 404, 415; task unchanged | `web/error/GlobalExceptionHandler` (existing mappings); `@Valid` on `TaskStatusUpdateRequest` | TBD (`TaskControllerTest`; `TaskStatusIntegrationTest` DB unchanged after 400) | surefire, run `<sha>` |
| SCRUM-6-AC-04 | CORS preflight allows `PATCH` for allowed origins only | `config/WebConfig#addCorsMappings` | TBD (`CorsConfigTest`) | surefire, run `<sha>` |
| SCRUM-6-AC-05 | `?status=` filters in DB with paging/ordering on the filtered set | `web/TaskController#list`; `service/TaskService#listByStatus`; `repository/TaskRepository#findByStatus`; `db/migration/V2__add_tasks_status_index.sql` | TBD (`TaskControllerTest`, `TaskServiceTest`, `TaskStatusIntegrationTest`) | surefire, run `<sha>` |
| SCRUM-6-AC-06 | No `status` = SCRUM-2 behaviour; no matches → empty page | `web/TaskController#list` (`list(int,int)` path) | TBD (`TaskControllerTest`) + existing SCRUM-2-AC-05 tests unchanged | surefire, run `<sha>` |
| SCRUM-6-AC-07 | Invalid/empty/repeated/comma `status` → 400 `Invalid value for parameter 'status'` | `web/TaskController#parseStatusFilter`; `web/InvalidQueryParameterException`; `GlobalExceptionHandler#handleInvalidQueryParameter` | TBD (`TaskControllerTest` parameterized; `TaskStatusIntegrationTest`) | surefire, run `<sha>` |
| SCRUM-6-AC-08 | Per-row status control, accessible name, current value | `src/components/StatusSelect.tsx`; `src/components/TaskTable.tsx` | TBD (`src/components/StatusSelect.test.tsx`, `src/pages/TaskListPage.test.tsx`) | junit, run `<sha>` |
| SCRUM-6-AC-09 | Change sends PATCH only, no navigation; row shows new status | `StatusSelect.tsx`; `src/api/tasks.ts` `updateTaskStatus`; `src/api/client.ts` (`PATCH`) | TBD (`StatusSelect.test.tsx`, `TaskListPage.test.tsx`, `src/api/tasks.test.ts`) | junit, run `<sha>` |
| SCRUM-6-AC-10 | Row disabled while in flight, others usable; filtered list reloads; clamp to last page | `StatusSelect.tsx` (`pending`, focus restore); `src/pages/TaskListPage.tsx` (reload, `clampAfterChange`) | TBD | junit, run `<sha>` |
| SCRUM-6-AC-11 | Error reverts row + alert (generic); 404 → "Task not found" + reload | `StatusSelect.tsx` (revert); `TaskListPage.tsx` (`rowError`) | TBD | junit, run `<sha>` |
| SCRUM-6-AC-12 | Filter control All/To do/In progress/Done drives `status` param | `src/components/StatusFilter.tsx`; `TaskListPage.tsx`; `src/api/tasks.ts` `listTasks` | TBD | junit, run `<sha>` |
| SCRUM-6-AC-13 | Filter in URL with page; direct entry/Back/Forward; invalid → All | `src/pages/params.ts` `parseStatusParam`, `parseListParams`, `listSearchParams`, `listPath` | TBD (`src/pages/params.test.ts`, `TaskListPage.test.tsx`, `src/routes.test.tsx`) | junit, run `<sha>` |
| SCRUM-6-AC-14 | Filter-aware empty state with "Show all tasks" | `TaskListPage.tsx` (empty-state precedence) | TBD | junit, run `<sha>` |
| SCRUM-6-AC-15 | Edit/cancel returns to same filter and page | `TaskListPage.tsx` (`returnTo = listPath(...)`); `params.ts` `returnTarget` | TBD (`src/pages/TaskEditPage.test.tsx`, `params.test.ts`) | junit, run `<sha>` |
| SCRUM-6-AC-16 | Create/edit still set status; quick change visible in edit form | unchanged `TaskForm`, `TaskEditPage`, `TaskCreatePage` | TBD (`TaskEditPage.test.tsx`) + existing SCRUM-1 tests | junit, run `<sha>` |
| SCRUM-6-AC-17 | Testcontainers PG16: PATCHed status persists, reflected by filter | full stack | TBD (`TaskStatusIntegrationTest`) | surefire, run `<sha>` |
| SCRUM-6-NFR-01 | Backward compatible; only deliberate test changes | `TaskService#list(int,int)` kept | All SCRUM-1/SCRUM-2 tests green; deliberate changes listed below | both jobs, run `<sha>` |
| SCRUM-6-NFR-02 | No V1 edit; index via V2 | `db/migration/V2__add_tasks_status_index.sql` | TBD (`TaskStatusIntegrationTest` V2 + index; `TaskPersistenceRestartTest`) | surefire, run `<sha>` |
| SCRUM-6-NFR-03 | Backend tests tagged, AC-prefixed; JaCoCo gate | test classes above | `./mvnw test -Dgroups=SCRUM-6` | JaCoCo in `todo-backend-SCRUM-6-<sha>-reports` |
| SCRUM-6-NFR-04 | Frontend Vitest/RTL/MSW, AC-prefixed; typed client; coverage gate | `src/api/types.ts` (`TaskStatusUpdateRequest`, `ListTasksParams`); `src/test/handlers.ts` | `npx vitest run -t 'SCRUM-6-'` | junit + coverage in `todo-frontend-SCRUM-6-<sha>-reports` |
| SCRUM-6-NFR-05 | CI `build` and `frontend` green | `.github/workflows/ci.yml` | n/a | run `<sha>` |
| SCRUM-6-NFR-06 | Accessible controls; announcements | `StatusSelect.tsx`, `StatusFilter.tsx`, `TaskListPage.tsx` (`role="status"`, `role="alert"`) | TBD | junit, run `<sha>` |
| SCRUM-6-NFR-07 | ADR 0004 conventions; build identity per ADR 0008 | `ci.yml` job `identity` + "Verify build identity" steps; `pom.xml` `jira.issue`; `frontend/vite.config.ts` | `TodoApplicationIntegrationTest#infoCarriesJiraKey`; `src/components/BuildInfo.test.tsx`; `src/routes.test.tsx` | artifact names `…-SCRUM-6-<sha>`; run summary "Build identity: SCRUM-6" |
| SCRUM-6-NFR-08 | Filtering in DB, never in memory | `TaskRepository#findByStatus`; V2 index; frontend never filters locally | TBD (`TaskServiceTest` verifies `findByStatus`, never `findAll`) | surefire, run `<sha>` |
| SCRUM-6-NFR-09 | README documents PATCH, `status` param, UI filter, ADR 0008 names | `README.md` | n/a | Reviewed in PR |

## Deliberate changes to existing tests (design §8.3)

| Test | Change | Done |
|---|---|---|
| `TodoApplicationIntegrationTest#infoCarriesJiraKey` | assert `build.jira` = `build.jira.expected` and matches the key pattern; `@Tag("SCRUM-6")` | TBD |
| `TaskPersistenceRestartTest#taskSurvivesRestart` | migration count unchanged across restart (instead of `== 1`) | TBD |
| `frontend/src/pages/TaskListPage.test.tsx › SCRUM-1-AC-01` | status read from the row combobox | TBD |
| `frontend/src/api/tasks.test.ts › SCRUM-1-AC-01, SCRUM-1-AC-02` | `listTasks({ page: 2 })` | TBD |
| `frontend/src/components/BuildInfo.test.tsx › SCRUM-1-NFR-09` | key pattern instead of `'SCRUM-1'` | TBD |
| `frontend/src/routes.test.tsx › SCRUM-1-AC-12, SCRUM-1-NFR-09` | `${__JIRA_KEY__} ·` instead of `'SCRUM-1 ·'` | TBD |

## Deviations from the design

| Item | Design | Implemented | Reason |
|---|---|---|---|
| _none yet_ | | | |

## Manual checks

| Check | Date | Result |
|---|---|---|
| Backend + `npm run dev`: change status from list, filter, edit round-trip, PATCH preflight in browser devtools | TBD | TBD |
