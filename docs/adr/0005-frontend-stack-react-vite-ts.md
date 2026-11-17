# ADR 0005 — Frontend stack: React 19 + TypeScript (strict) + Vite 8 + React Router 8, in `frontend/`

- Status: Accepted
- Date: 2026-11-17
- Jira: [SCRUM-1](https://suranagivinod.atlassian.net/browse/SCRUM-1) — SCRUM-1-NFR-01, NFR-02, NFR-03, NFR-05, AC-12, AC-14; assumptions A-08, A-09

## Context

SCRUM-1 needs a browser UI for the SCRUM-2 `/api/tasks` backend. NFR-01 mandates React (current major),
TypeScript in `strict` mode and Vite, located in `frontend/` without changing the backend layout. NFR-02 mandates
Node 22 and a committed lockfile. A-08 asks for minimal dependencies; A-09 says no UI component library is needed.
AC-12 requires distinct, refresh-safe URLs for list, create and edit. AC-14 requires the dev server on port 5173
(the backend's default CORS origin). Current stable versions were checked with `npm view` on 2026-11-17 and the
combination was verified in a throwaway spike (install, `tsc -b`, ESLint, Vitest, `vite build`).

## Decision

- Self-contained npm project in **`frontend/`** (own `package.json`, `package-lock.json`, `.nvmrc` = `22`,
  `engines.node` `>=22.22.2 <23`). Backend stays at the repo root.
- **Runtime deps (exact pins):** `react` 19.3.1, `react-dom` 19.3.1, `react-router` 8.5.1. Nothing else.
- **Build/dev:** `vite` 8.3.8 + `@vitejs/plugin-react` 6.3.0; dev server `port: 5173, strictPort: true`, no proxy
  (A-02).
- **TypeScript 6.0.3**, not 7.x: `typescript-eslint` 8.73.0 (the current release) declares
  `typescript >=4.8.4 <6.1.0`. `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`; `tsc -b` project
  references (app + node configs).
- **Routing: `react-router` 8 data-router API** (`createBrowserRouter` / `createMemoryRouter` in tests) over one
  exported `routes` array, using `element` only — no loaders/actions (data loading per ADR 0006). The list page
  number lives in the URL (`?page=N`). Chosen over hand-rolled `history` routing (Back/refresh/link handling is
  easy to get wrong) and over TanStack Router (extra concepts and codegen for three routes).
- **Lint:** ESLint 10.15.0 flat config with `@eslint/js` 10.0.1, `typescript-eslint` 8.73.0
  (`no-explicit-any: error`), `eslint-plugin-react-hooks` 7.1.1, `eslint-plugin-react-refresh` 0.5.8,
  `globals` 17.14.0; `--max-warnings 0`.
- **Styling:** one hand-written `index.css`; no component library, no CSS framework.
- Install with `npm install --save-exact`. Any additional dependency must be added to this ADR with a reason.

## Consequences

- Small, auditable dependency tree; runtime `npm audit --omit=dev` is clean. A dev-only transitive advisory
  (`picomatch` via `tinyglobby`/`@typescript-eslint/*`) exists on 2026-11-17; CI gates on runtime deps only and
  `npm audit fix --force` must not be used (it downgrades vitest).
- Newer majors than most online examples (Vite 8, React Router 8, ESLint 10, MSW 3): the SCRUM-1 design gives
  verified snippets; examples from older majors must be checked against installed types.
- TypeScript 7 adoption is blocked on typescript-eslint support; revisit in a later story.
- Exact pins mean upgrades are deliberate PRs (Renovate/Dependabot can be added later).
- Hosting/SPA fallback routing for production is deferred to SCRUM-7 (Q-02).
