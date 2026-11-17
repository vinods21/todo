# SCRUM-1 — Requirements Traceability Matrix

Jira: [SCRUM-1](https://suranagivinod.atlassian.net/browse/SCRUM-1) · Branch: `feature/SCRUM-1-react-frontend-setup` ·
Requirements: [`docs/requirements/SCRUM-1.md`](../requirements/SCRUM-1.md) · Design: [`docs/architecture/SCRUM-1-design.md`](../architecture/SCRUM-1-design.md) ·
ADRs: [0005](../adr/0005-frontend-stack-react-vite-ts.md), [0006](../adr/0006-frontend-api-client-and-state.md), [0007](../adr/0007-frontend-testing-msw.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md)

**Status: TEMPLATE — filled in by Dev.** Replace every `TBD`; do not delete rows. If an ID is not covered by an
automated test, say why and what evidence replaces it (e.g. config file, manual check with date/result).

"Test" = `<file> › <it name>` where the file's top-level `describe` is `SCRUM-1 <area>` and the `it` name starts
with the ID (design §9). "CI evidence" = the GitHub Actions run of the `frontend` job in `.github/workflows/ci.yml`
on the given commit and its artifacts `todo-frontend-SCRUM-1-<sha>` (dist incl. `build-info.json`) and
`todo-frontend-SCRUM-1-<sha>-reports` (`junit.xml` + coverage).

CI run: _TBD (link after first green run)_ · Commit SHA: `<sha>` · Artifacts: `todo-frontend-SCRUM-1-<sha>`, `todo-frontend-SCRUM-1-<sha>-reports` ·
Coverage (lines): _TBD_ %

> Verify AC coverage from the reports artifact with `grep -o 'SCRUM-1-AC-[0-9]*' junit.xml | sort -u`
> (expected: AC-01..AC-13). Build identity: `cat build-info.json` in the dist artifact.

Paths below are relative to `frontend/`.

| ID | Requirement (short) | Code (file / symbol) | Test(s) | CI evidence |
|---|---|---|---|---|
| SCRUM-1-AC-01 | List shows title, status label, dueDate in API order | TBD | TBD | TBD |
| SCRUM-1-AC-02 | Paging controls drive `page` param; disabled/hidden at bounds | TBD | TBD | TBD |
| SCRUM-1-AC-03 | Empty state with create call to action | TBD | TBD | TBD |
| SCRUM-1-AC-04 | Create form posts trimmed/nullable fields; returns to list | TBD | TBD | TBD |
| SCRUM-1-AC-05 | Edit form loads and prefills task | TBD | TBD | TBD |
| SCRUM-1-AC-06 | Edit submit PUTs all fields; cancel sends nothing | TBD | TBD | TBD |
| SCRUM-1-AC-07 | Client-side validation mirrors backend rules | TBD | TBD | TBD |
| SCRUM-1-AC-08 | Server `fieldErrors` shown inline; form-level fallback | TBD | TBD | TBD |
| SCRUM-1-AC-09 | Loading indicators; submit disabled while in flight | TBD | TBD | TBD |
| SCRUM-1-AC-10 | Network/5xx error state with retry; input preserved | TBD | TBD | TBD |
| SCRUM-1-AC-11 | 404 on edit shows "Task not found" | TBD | TBD | TBD |
| SCRUM-1-AC-12 | Distinct URLs for list/create/edit; refresh & Back work | TBD | TBD | TBD |
| SCRUM-1-AC-13 | API base URL from `VITE_API_BASE_URL` | TBD | TBD | TBD |
| SCRUM-1-AC-14 | Dev server on 5173 works with backend CORS default | TBD | TBD (manual smoke check — record date, backend commit, result) | TBD |
| SCRUM-1-NFR-01 | React + TypeScript (strict) + Vite in `frontend/` | TBD | n/a | TBD |
| SCRUM-1-NFR-02 | Node 22; lockfile; `npm ci` | TBD | n/a | TBD |
| SCRUM-1-NFR-03 | dev/build/test/lint/typecheck scripts | TBD | n/a | TBD |
| SCRUM-1-NFR-04 | Vitest + Testing Library + MSW; AC-prefixed test names | TBD | TBD | TBD |
| SCRUM-1-NFR-05 | ESLint + `tsc --noEmit` clean; typed API client | TBD | TBD | TBD |
| SCRUM-1-NFR-06 | CI frontend job; `todo-frontend-SCRUM-1-<sha>` artifact | TBD | n/a | TBD |
| SCRUM-1-NFR-07 | Accessibility basics (labels, keyboard, announcements) | TBD | TBD | TBD |
| SCRUM-1-NFR-08 | README frontend section | TBD | n/a | TBD |
| SCRUM-1-NFR-09 | Build embeds Jira key + commit | TBD | TBD | TBD |

## Follow-ups raised by this story

| Item | Owner / target | Status |
|---|---|---|
| Workflow still named `SCRUM-2 CI`; backend artifacts `todo-backend-SCRUM-2-<sha>` — rename/re-scheme (design §13) | SCRUM-7 or new story | TBD |
| Delete in UI (Q-01) | New story | TBD |
| Serve/host SPA, SPA fallback routing (Q-02) | SCRUM-7 | TBD |
| Adopt TypeScript 7 once typescript-eslint supports it (ADR 0005) | Later story | TBD |
