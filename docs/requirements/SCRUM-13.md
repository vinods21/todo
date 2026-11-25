# SCRUM-13 — Integrate Keycloak Authentication with Mock OIDC SSO Provider: Refined Requirements

| Field | Value |
|---|---|
| Jira key | [SCRUM-13](https://suranagivinod.atlassian.net/browse/SCRUM-13) |
| Type | Story (security / platform) |
| Parent epic | SCRUM-5 — Build a To-Do Application (Spring Boot, React, PostgreSQL, REST APIs) |
| Depends on | SCRUM-2 (REST API, error body [ADR 0003](../adr/0003-error-response-format.md)), SCRUM-1/SCRUM-6 (frontend, [ADR 0006](../adr/0006-frontend-api-client-and-state.md), [ADR 0007](../adr/0007-frontend-testing-msw.md)), SCRUM-7 (images, Compose, nginx proxy + CSP [ADR 0011](../adr/0011-spa-hosting-nginx-reverse-proxy.md), Playwright [ADR 0012](../adr/0012-end-to-end-testing-playwright.md)), SCRUM-8/9/11 (Release workflow, Trivy gate [ADR 0014](../adr/0014-vulnerability-scanning-policy.md), `e2e-release` [ADR 0015](../adr/0015-pre-release-e2e-gate.md)), SCRUM-12 (OpenAPI contract and breaking-change gate [ADR 0017](../adr/0017-api-contract-openapi.md)) — all merged; `main` = `682ea5f` |
| Branch | `feature/SCRUM-13-keycloak-oidc-auth` |
| Author role | Product Manager (PM → Architect → Dev pipeline) |
| Status | Draft — ready for architecture |

**Jira description (verbatim):** "Integrate Keycloak for application authentication and configure a mock OIDC Identity
Provider (IdP) to simulate enterprise SSO integration." Acceptance criteria in Jira:

1. Set up Keycloak with application realm and client configuration.
2. Configure a separate Keycloak realm as a mock OIDC Identity Provider.
3. Configure OIDC identity brokering between the application realm and mock IdP.
4. Integrate React UI with Keycloak for login and logout.
5. Configure Spring Boot as an OAuth2 Resource Server.
6. Validate JWT tokens and secure backend APIs.
7. Support basic user claims (username, email, roles).
8. Handle token expiry and unauthenticated access.
9. Provide Docker Compose configuration for local development.
10. Document local authentication setup and test credentials.

**Traceability:** Requirements carry stable IDs (`SCRUM-13-AC-xx`, `SCRUM-13-NFR-xx`). Design, code, tests
(`@Tag("SCRUM-13")`, `@DisplayName`/test names starting with the AC IDs), commits (`SCRUM-13: [ROLE] …` +
`Refs: SCRUM-13`) and CI evidence reference them per [ADR 0004](../adr/0004-traceability-conventions.md) (as amended
by ADR 0008 / 0013). Dev fills `docs/traceability/SCRUM-13.md`.

**Requirement keywords:** "must" = mandatory for acceptance; "should" = expected unless the design justifies a
deviation; "may" = Architect's option.

---

## 1. Problem statement

The application has **no authentication at all**. Every `/api/**` operation (create, list, get, update, change status,
delete) is callable anonymously through the nginx proxy (`http://localhost:3000/api/**`) and on the published backend
port (`http://localhost:8080/api/**`); the SPA has no notion of a user. The enterprise target environment
authenticates users through a corporate SSO (OIDC) identity provider; the product needs to demonstrate — locally and
in CI, without access to a real corporate IdP — that the application:

- delegates login to **Keycloak** (the application's identity broker), which in turn **brokers** the login to an
  enterprise OIDC IdP (here: a **mock** IdP, a second Keycloak realm),
- receives a standards-based access token (JWT) in the browser and sends it to the backend,
- has a backend that **rejects** unauthenticated, expired, forged or mis-addressed tokens and enforces a role,
- knows who the user is (username, e-mail, roles) and can log out.

Facts the Architect needs (from the code on `main` `682ea5f`, not decisions):

| Area | Today |
|---|---|
| Backend | Spring Boot **4.1.2** / Spring Framework 7 / Jackson 3 / Java 21; starters `webmvc`, `data-jpa`, `validation`, `actuator`, `flyway`; **no Spring Security** on the classpath. CORS via `WebConfig` (`/api/**`, origins from `APP_CORS_ALLOWED_ORIGINS`, default `http://localhost:5173`). Every error body is `ApiError` (ADR 0003, `GlobalExceptionHandler`). Actuator exposes only `health` and `info` (`show-details: never`). |
| API contract | `api/openapi.yaml` (OpenAPI 3.1, code-first via springdoc in **test scope**, ADR 0017): 6 Task operations, no security scheme, no 401/403. CI: drift + canonical form + conformance (`TaskApiContractIntegrationTest.SCENARIOS`, every documented `(operation, status)` must be exercised, 500 exempt) in `build`; generated `frontend/src/api/schema.d.ts` + MSW handler validation in `frontend`; **oasdiff breaking-change gate** against `main` in `api-contract`, acknowledged per line in `api/breaking-changes.ack`. |
| Frontend | React 19 / Vite 8 / TypeScript 6 / react-router 8; one fetch module `frontend/src/api/client.ts` (ADR 0006) with `API_BASE_URL` from `VITE_API_BASE_URL` (image: `/` = same origin); `toApiError` maps 400/404/5xx, everything else → kind `http`. Tests: Vitest + Testing Library + MSW 3 (unhandled request fails the test). No auth library. |
| nginx (frontend image) | `nginx-unprivileged`, read-only root FS; proxies only `/api/` and `/actuator/health`; strict CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'` + `X-Frame-Options: DENY`. The image is environment-agnostic (same image for every host/port; only `BACKEND_URL` is a runtime env var). |
| Compose | `postgres` (no profile) + `backend`, `frontend` (profile `app`); host ports 5432 / 8080 / 3000; `docker compose up -d` = PostgreSQL only (backend run with `./mvnw spring-boot:run` or Vite dev mode against it). |
| E2E | Playwright (`e2e/`, Chromium): projects `empty-state` → `http`, `ui` (compose mode, `:3000`) and `dev-smoke` (Vite `:5173` → backend `:8080` cross-origin). API set-up via `TasksApi` (Playwright request context, no credentials). Browser console errors (incl. CSP violations) fail a test. CI job `e2e` builds images, `docker compose up --wait`, runs compose + dev suites and `verify-lifecycle.sh` (curl `POST /api/tasks` without credentials). Release job `e2e-release` loads the candidate OCI archives, pulls **only** `postgres`, `up --no-build --pull never`, runs the compose suite and gates on ≥ 12 `@critical` tests (`e2e-gate.mjs --tag critical --min 12`). |
| Release / scan | Only `todo-backend` and `todo-frontend` are release artefacts (GHCR, SBOMs, Trivy gate on `backend-runtime`, `frontend-prod`, `backend-image`, `frontend-image`); PostgreSQL is a third-party runtime dependency that is not scanned or published. |
| Environment | The agent sandbox has no Docker daemon and no Maven Central access (backend is built/tested in CI only); GitHub release downloads, npm, Java 21, Node 22, Playwright + Chromium are available. CI runners can pull `quay.io/keycloak/keycloak`. |

## 2. Goal

A developer runs one Compose command and gets the application **behind a real login**: the SPA redirects to the
application's Keycloak realm, the user chooses "Corp SSO", authenticates at the mock enterprise IdP with a documented
test account, lands back in the app with their name shown, can use the To-Do features, and can log out. The backend
accepts only valid access tokens issued for it and requires the application role. Everything (realms, clients,
brokering, test users) is configuration-as-code in the repository, reproducible in CI, and exercised by automated
backend, frontend and end-to-end tests — including token expiry and unauthenticated access.

## 3. Scope

### In scope
- Keycloak (pinned official image) as a local-development / CI service in Compose; realms imported from JSON files
  committed to the repository.
- Application realm: SPA client (public, Authorization Code + PKCE), backend audience, application roles, identity
  provider "Corp SSO" (OIDC) pointing at the mock IdP realm, first-login behaviour, claim/role mappers.
- Mock IdP realm: confidential client used by the broker, test users with passwords, e-mails and group/role
  information.
- Frontend: login, logout, token handling (in memory), silent renewal, attaching the token to API calls, reaction to
  401/403, user display; configuration; CSP adjustments; tests.
- Backend: Spring Security OAuth2 Resource Server (JWT), validation rules, role → authority mapping, endpoint
  protection, 401/403 in the ADR 0003 body, `WWW-Authenticate`, a "current user" endpoint, CORS for dev mode; tests
  with locally minted tokens (no Keycloak needed for backend tests).
- API contract: security scheme, 401/403 responses, new endpoint; acknowledged breaking change.
- E2E: brokered login, unauthenticated access, token expiry/renewal, logout, existing suites authenticated; CI `e2e`
  and Release `e2e-release`.
- Documentation (README + linked doc): setup, URLs, test credentials, troubleshooting, "not for production" notes.
- ADRs for the authentication architecture and the mock-IdP brokering.

### Out of scope (explicit)
- **Per-user data / multi-tenancy:** tasks stay global (every authenticated user with the application role sees and
  edits all tasks). No `owner` column, no Flyway migration, no filtering by user. → follow-up story.
- **Fine-grained authorization:** no admin-only operations; a second (admin) role may be defined and exposed in
  claims for future use but grants nothing extra in this story. → follow-up.
- Production Keycloak deployment (HA, production database, TLS, hostname, secrets management, backups, upgrades),
  Kubernetes/EKS manifests, a real corporate IdP integration.
- User self-registration, password reset, e-mail verification, MFA, consent screens, account console customisation,
  custom login themes.
- SAML identity providers, social logins, LDAP/AD user federation.
- Machine-to-machine API clients for third parties (beyond what tests/scripts need), API keys, token exchange.
- Backchannel/front-channel logout propagation to other applications; session management UI.
- Publishing, scanning or gating the Keycloak image as a release artefact (it is a third-party dev/CI dependency,
  like PostgreSQL).
- Auditing / login event dashboards.

## 4. Acceptance criteria

Jira ACs are split into verifiable criteria. "Jira" = the Jira AC number (1–10) above.

### 4.1 Keycloak and application realm (Jira 1)

| ID | Criterion (must) | Jira |
|---|---|---|
| SCRUM-13-AC-01 | Keycloak runs from an **exact pinned version** of the official image (tag and digest recorded) in Docker Compose and imports its realms from JSON files committed to the repository at start-up; a fresh start (no prior state) yields a fully configured system without manual admin-console steps. | 1, 9 |
| SCRUM-13-AC-02 | The **application realm** defines: a **public** SPA client using **Authorization Code + PKCE (S256)** only (implicit flow, direct access grants / password grant and front-end client secrets disabled), with redirect URIs, post-logout redirect URIs and web origins restricted to the documented local origins (no wildcards beyond path suffixes); the application roles (at least a "user" role that grants API access, plus an "admin" role reserved for future use); and access tokens whose **audience** identifies the backend API. | 1, 5, 7 |
| SCRUM-13-AC-03 | Access-token, SSO-session and refresh-token lifetimes of the application realm are set explicitly (not left to defaults) and documented; the access token is short-lived (≤ 5 minutes). | 1, 8 |

### 4.2 Mock enterprise IdP (Jira 2)

| ID | Criterion (must) | Jira |
|---|---|---|
| SCRUM-13-AC-04 | A **separate** Keycloak realm acts as the mock enterprise OIDC IdP. It has a **confidential** client used exclusively by the application realm's broker (Authorization Code flow; redirect URI = the application realm's broker endpoint only) and **at least three test users** with password, e-mail, first/last name and group membership: one with the application "user" entitlement, one with "user" + "admin", and one **without** any application entitlement. | 2, 7, 10 |
| SCRUM-13-AC-05 | The mock IdP issues ID tokens carrying `preferred_username`, `email`, `email_verified`, name claims and the user's **groups** (or roles) as a claim the broker can map. | 2, 7 |

### 4.3 Identity brokering (Jira 3)

| ID | Criterion (must) | Jira |
|---|---|---|
| SCRUM-13-AC-06 | The application realm has an **OIDC identity provider** ("Corp SSO") pointing at the mock IdP realm (authorization, token, JWKS, logout endpoints; signature validation on; PKCE on; client secret from the mock realm's broker client). The application realm's login page shows a "Corp SSO" option; selecting it redirects to the mock IdP's login page; after successful authentication the user is returned to the application. | 3 |
| SCRUM-13-AC-07 | **First broker login** creates the local (application-realm) user automatically, without an extra "update profile" or "link account" page for the documented test users. Username, e-mail (trusted/verified), first and last name are imported from the IdP. | 3, 7 |
| SCRUM-13-AC-08 | IdP **group → application role** mappers assign the application roles from the mock IdP's group claim; they are re-evaluated on **every** login (a user removed from the IdP group loses the role at the next login). The user without entitlement can log in but receives no application role. | 3, 7 |

### 4.4 Frontend (Jira 4, 7, 8)

| ID | Criterion (must) | Jira |
|---|---|---|
| SCRUM-13-AC-09 | Opening any application route (incl. deep links such as `/tasks/42/edit` and `/?status=DONE&page=2`) without a session starts the login (redirect to Keycloak, Authorization Code + PKCE); after login the user lands on the **originally requested** route. No application data is requested and no task UI is rendered before authentication. | 4, 8 |
| SCRUM-13-AC-10 | Tokens are held **in memory only** — never written to `localStorage`, `sessionStorage`, cookies set by the SPA or IndexedDB; a full page reload re-establishes the session via Keycloak's SSO session without asking for credentials again (while the SSO session is valid). | 4, 8, NFR |
| SCRUM-13-AC-11 | Every API request from the SPA carries `Authorization: Bearer <access token>`; no token is ever sent to any other origin or put into a URL. | 4, 6 |
| SCRUM-13-AC-12 | The header shows the signed-in user's **username** (or display name) and a **Log out** control. Log out ends the application-realm session (RP-initiated logout at Keycloak's end-session endpoint), clears the in-memory tokens and returns to the app's signed-out state; afterwards, using the back button or reloading does not show task data without logging in again. Whether the mock IdP session is also ended is decided and documented by the Architect (and tested accordingly). | 4 |
| SCRUM-13-AC-13 | The access token is **renewed silently before it expires** while the app is open (no user interaction, no page reload, no loss of form input); renewal failure (e.g. SSO session ended) leads to the login flow, not to a broken UI. | 8 |
| SCRUM-13-AC-14 | When an API call is answered **401**, the SPA attempts one token renewal and retries the request once; if that fails it starts the login flow (returning to the current route afterwards). A **403** is shown as a clear "You do not have access to this application" message (with the username and a Log out control), not as a generic error and not as a login loop. | 8 |
| SCRUM-13-AC-15 | The user's roles from the token are available to UI code through the auth module (for future role-based UI); no UI element depends on them in this story beyond AC-14. | 7 |
| SCRUM-13-AC-16 | Keycloak URL, realm and client ID are configuration, not code. The **released frontend image remains environment-agnostic** (same image runs on any host/port; auth settings supplied at container run time or derived from the origin), and Vite dev mode works with documented defaults. The nginx **CSP stays strict** — any relaxation is limited to the exact Keycloak origin and directives needed, and is documented. | 4, 9 |
| SCRUM-13-AC-17 | Frontend unit/component tests cover the auth module (login redirect trigger, token attachment, renewal, 401 retry → login, 403 page, logout, in-memory storage) **without a real Keycloak** (auth mocked/stubbed; MSW for HTTP); existing tests keep passing with an authenticated test default; the frontend coverage gate (80/80/80/75) stays met. | 4, 8 |

### 4.5 Backend (Jira 5, 6, 7, 8)

| ID | Criterion (must) | Jira |
|---|---|---|
| SCRUM-13-AC-18 | The backend is an **OAuth2 Resource Server** validating JWT access tokens: **signature** against the application realm's JWKS (RS256; keys fetched and cached; key rotation handled by re-fetch on unknown `kid`), **issuer** = the application realm's public issuer URL, **audience** contains the backend's audience value, **`exp`/`nbf`** with an explicit, documented clock skew (≤ 60 s). Tokens failing any check are rejected. Configuration via environment variables with local-development defaults. | 5, 6, 8 |
| SCRUM-13-AC-19 | **All `/api/**` operations require authentication and the application "user" role.** Missing/invalid/expired token → **401**; valid token without the role → **403**. `/actuator/health` stays public (container healthchecks, nginx proxy); `/actuator/info` stays as today (decision on its protection recorded). CORS preflight (`OPTIONS`) for allowed origins succeeds without a token (Vite dev mode, SCRUM-7-AC-12 keeps working). The service is **stateless** (no HTTP session, no session cookie); CSRF protection is not applied to bearer-token requests (justified in the design). | 6, 8 |
| SCRUM-13-AC-20 | 401 and 403 responses use the **standard `ApiError` body** (ADR 0003, `application/json`, no stack trace / token content / internal detail) and carry a `WWW-Authenticate: Bearer …` header per RFC 6750 (`error="invalid_token"` for invalid/expired tokens, `error="insufficient_scope"` or equivalent for 403). A 401 is also produced (same body) for requests to unknown `/api/**` paths when unauthenticated — no endpoint enumeration for anonymous callers. | 6, 8 |
| SCRUM-13-AC-21 | **`GET /api/me`** returns the authenticated user's `username` (`preferred_username`), `email` (nullable), and application `roles` (from `realm_access.roles`, filtered to the application roles or documented otherwise), plus the subject id; requires authentication (401 without), **not** the application role (so the 403 page can show who is signed in). | 7 |
| SCRUM-13-AC-22 | Realm roles from the token are mapped to Spring authorities (documented prefix); missing `realm_access` claim = no roles (no error). The principal name is `preferred_username`. | 7 |
| SCRUM-13-AC-23 | Backend tests do **not need Keycloak**: tokens are minted in tests with a test key pair / JWKS. Automated tests (unit/slice and real-HTTP integration) prove: valid token → 200; missing token, malformed token, **expired** token, token **not yet valid**, **bad signature** (other key), unknown `kid`, **wrong issuer**, **wrong audience**, `alg=none` → 401 with body + header; valid token **without role** → 403; `/actuator/health` public; preflight without token works; `/api/me` claims mapping; no `Set-Cookie`/session. Existing behaviour tests (`TaskControllerTest`, ITs) keep their assertions, authenticated. Backend coverage gate (80 % lines on `service`, `web*`) stays met. | 5, 6, 8 |

### 4.6 API contract (Jira 6, 7)

| ID | Criterion (must) | Jira |
|---|---|---|
| SCRUM-13-AC-24 | `api/openapi.yaml` declares the bearer/JWT (or OpenID Connect) **security scheme**, applies it to every `/api/**` operation, documents **401** on every operation and **403** where the role is required (ADR 0003 body, `WWW-Authenticate` header documented), and documents `GET /api/me` and its response schema. Drift, canonical-form and conformance tests stay green; the conformance scenarios authenticate and **exercise every new `(operation, status)` pair**. Frontend `schema.d.ts`, `ContractChecks` and MSW handler validation updated. | 6, 7 |
| SCRUM-13-AC-25 | The breaking change(s) reported by the oasdiff gate (new security requirement, new response statuses as classified by the tool) are **acknowledged** in `api/breaking-changes.ack` with `SCRUM-13` entries and a justification; no other breaking change is introduced. | 6 |

### 4.7 Token expiry and unauthenticated access, end to end (Jira 8)

| ID | Criterion (must) | Jira |
|---|---|---|
| SCRUM-13-AC-26 | E2E (real Keycloak, real backend) proves: (a) unauthenticated browser access to a deep link redirects to the Keycloak login and returns to that link after login; (b) an unauthenticated API request through the proxy and on the backend port gets 401 + `ApiError` + `WWW-Authenticate`; (c) a token past its lifetime is rejected by the backend (401) and the SPA recovers (renewal or re-login) without showing an error; (d) the SPA renews the access token before expiry while open; (e) after logout, the app no longer shows data and requires login; (f) the user without entitlement sees the 403 page. | 4, 6, 8 |

### 4.8 Compose and local development (Jira 9)

| ID | Criterion (must) | Jira |
|---|---|---|
| SCRUM-13-AC-27 | `docker compose --profile app up --build -d --wait` starts PostgreSQL, Keycloak, backend and frontend, in dependency order with healthchecks (Keycloak readiness before the backend/frontend depend on it); `--wait` succeeds only when all are healthy. The app is reachable at the documented URL and fully usable after login. | 9 |
| SCRUM-13-AC-28 | The non-container development workflows keep working with one documented extra command at most: backend via `./mvnw spring-boot:run` (PostgreSQL + Keycloak from Compose) and the Vite dev server against the backend (SCRUM-7-AC-12 / SCRUM-1-AC-14). The plain `docker compose up -d` behaviour is either unchanged or its change is documented and justified. | 9 |
| SCRUM-13-AC-29 | All new ports, URLs and settings are configurable via `TODO_*` variables with local defaults (documented in `.env.example` and README); Keycloak runs without extra privileges where the image allows (`cap_drop`, `no-new-privileges`), with its persistence choice documented (what survives `down` / `down -v`). | 9 |
| SCRUM-13-AC-30 | Running a **published release** with Compose (SCRUM-8-AC-15, `TODO_*_IMAGE`/`TAG` overrides, `--no-build`) still works and includes authentication; `check-compose-images.sh` stays green. | 9 |

### 4.9 Documentation (Jira 10)

| ID | Criterion (must) | Jira |
|---|---|---|
| SCRUM-13-AC-31 | README (or a doc linked from it) documents: architecture overview (browser → app realm → mock IdP; backend token validation); start/stop/reset commands; all URLs (app, Keycloak, admin console) and ports; **test credentials** (each mock IdP user with password and resulting roles; Keycloak admin; broker client) in one table; how to get a token for `curl`; how to call the API; how to change realms (export/edit JSON, re-import, reset); token lifetimes; troubleshooting (issuer mismatch, clock skew, port conflicts, stale Keycloak state, cookies/CSP); and a prominent **"local development only — not for production"** warning. | 10 |
| SCRUM-13-AC-32 | ADRs record the decisions on: authentication architecture (Keycloak as broker, token flow, frontend library, token storage, issuer/hostname topology, backend validation) and the mock-IdP brokering setup (realm-as-code, first-login flow, mappers, logout propagation, dev secrets). | 10 |

### 4.10 CI, Release and regression (all)

| ID | Criterion (must) | Jira |
|---|---|---|
| SCRUM-13-AC-33 | CI job `e2e` starts Keycloak (pinned image) with the stack and runs the compose and dev-mode suites authenticated; `verify-lifecycle.sh` (and any other script calling the API) authenticates; diagnostics/teardown include Keycloak logs. | 9 |
| SCRUM-13-AC-34 | Release job `e2e-release` starts the **candidate** backend/frontend images plus the pinned Keycloak image (the only additional image fetched besides PostgreSQL; still no build) and runs the authenticated compose suite; the `@critical` gate keeps its semantics (the brokered login and the existing To-Do workflows are `@critical`; `--min` adjusted only upward or justified). The Keycloak image is **not** published, not part of the release assets, and its relation to the Trivy release scan is decided and documented. | 9 |
| SCRUM-13-AC-35 | Regression: all existing tests keep their assertions (only authentication set-up added); coverage gates unchanged and met; `CI` (identity, build, frontend, api-contract, e2e) and the `Release` dry-run (tooling, backend, frontend, images, sbom, scan, e2e-release, release-gate) are green on the branch head. | all |
| SCRUM-13-AC-36 | Traceability per ADR 0004: test classes tagged `SCRUM-13`, test names start with AC IDs, commits `SCRUM-13: [ROLE] …` + `Refs: SCRUM-13`, `docs/traceability/SCRUM-13.md` filled with CI run links; job summaries list the SCRUM-13 IDs exercised. | all |

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| SCRUM-13-NFR-01 | **Dev-only secrets, clearly labelled.** Every password/secret committed (Keycloak admin, broker client secret, test-user passwords, any test client secret) is marked as a local-development value in the file where it appears and in the README; none is baked into an image; none is used by the Release workflow for anything that is published. Test key pairs for backend tests live in test sources only. |
| SCRUM-13-NFR-02 | **No secrets or tokens in logs, URLs or storage:** tokens never logged by backend, SPA, nginx access logs (query strings) or e2e reports beyond what Playwright traces inevitably capture on failure (documented); no token in `localStorage`/`sessionStorage`. |
| SCRUM-13-NFR-03 | **Production footprint:** new runtime dependencies limited to Spring Security's resource-server stack (+ its JOSE library) and one frontend OIDC library (+ its transitive dependencies); all are in the gated Trivy targets (`backend-runtime`, `frontend-prod`) and must pass the release gate. Versions exact (npm) or Boot-BOM-managed (Maven) and verified compatible with Boot 4.1.2 / Spring Security 7, React 19 / TypeScript 6 (evidence in the design). |
| SCRUM-13-NFR-04 | **Supply chain (SCRUM-8-NFR-02):** the Keycloak image is pinned by tag **and digest**; new workflow steps use SHA-pinned actions; any downloaded tool is version + checksum pinned. |
| SCRUM-13-NFR-05 | **Security headers:** the frontend CSP remains at least as strict as today except for documented, origin-exact additions; `X-Frame-Options`/`frame-ancestors` unchanged for the app's own pages; no `unsafe-inline`/`unsafe-eval`. |
| SCRUM-13-NFR-06 | **Fail closed:** if the backend cannot obtain the JWKS it rejects requests (401/5xx as designed) rather than accepting tokens; misconfiguration (missing issuer/audience) fails start-up. The backend must start and pass `/actuator/health` even when Keycloak is temporarily unreachable (no hard start-up dependency on Keycloak), unless the design justifies otherwise. |
| SCRUM-13-NFR-07 | **CI cost:** CI `e2e` and Release `e2e-release` stay within their 20-minute job timeouts; Keycloak start-up adds ≤ 90 s to stack start; the authenticated suites add ≤ 2 minutes; at most one full brokered browser login per test project (others reuse the session). |
| SCRUM-13-NFR-08 | **Determinism:** realm import is idempotent and order-independent; e2e tests do not depend on state left by earlier runs (fresh Keycloak state per CI run; tests tolerate an existing Keycloak user locally). |
| SCRUM-13-NFR-09 | **Local HTTP caveat:** HTTP (no TLS) is acceptable for localhost only; the design states which settings would have to change for any non-local deployment (TLS, hostname, secure cookies, secrets, production DB, start mode). |
| SCRUM-13-NFR-10 | **Accessibility & UX:** the user display, Log out control and 403 page are keyboard-accessible with accessible names (Testing Library role queries work); no layout regression in the header. |
| SCRUM-13-NFR-11 | **Minimal, reviewable diff:** only files listed in the design change; no change to Task API behaviour for authenticated users with the role (same statuses, bodies, headers as before). |

## 6. Assumptions

| ID | Assumption |
|---|---|
| A-01 | The latest Keycloak release (26.8.x at the time of writing) is used; its official image `quay.io/keycloak/keycloak:<version>` is available to GitHub runners. The image is a third-party dev/CI dependency (like `postgres:16-alpine`), not a release artefact. |
| A-02 | Keycloak in "development mode" with its embedded dev database is acceptable for local development and CI, because realms are imported from code on every fresh start; Keycloak state need not survive `docker compose down`. (Architect may choose otherwise.) |
| A-03 | One Keycloak instance hosts both realms (application realm and mock IdP realm); a second Keycloak container is not required to "simulate" an external IdP as long as the brokering uses only standard OIDC endpoints and a confidential client. |
| A-04 | All users and tasks are global (see out of scope); any authenticated user with the application role may perform every Task operation, as any anonymous caller could before. |
| A-05 | Requiring authentication on all `/api/**` operations is an intentional breaking change for API clients; there are no external API consumers besides the SPA and the repository's tests/scripts. |
| A-06 | The Dev agent cannot run Keycloak in Docker locally; the design may rely on a native Keycloak distribution spike and CI round-trips for final verification. |
| A-07 | Browsers used in e2e (Chromium) treat `http://localhost` as a secure context; cookies on different `localhost` ports are same-site. |

## 7. Questions for the Architect

| ID | Question |
|---|---|
| Q-01 | **Issuer/hostname topology:** the browser and the backend container reach Keycloak via different addresses, but the token's `iss` must be one stable value the backend validates. Keycloak on its own origin (e.g. `http://localhost:8180`) with a fixed hostname, or behind the nginx proxy on the app's origin (e.g. `/auth`)? Consider CSP (`connect-src`, `frame-src`), cookies/third-party-cookie restrictions for any silent iframe, Vite dev mode, backend run locally, the environment-agnostic frontend image (AC-16) and e2e/e2e-release. |
| Q-02 | **Frontend library:** `keycloak-js` vs. a generic OIDC client (`oidc-client-ts` + `react-oidc-context`) vs. hand-written; how are in-memory storage, silent renewal (refresh token vs. iframe), RP-initiated logout and testability achieved? |
| Q-03 | How does the runtime-configurable SPA get its auth settings without rebuilding the image (AC-16)? |
| Q-04 | **Backend:** which Spring Boot 4 starter, which validators (issuer, audience, timestamps, `typ`), role-mapping mechanism (property-based vs. custom converter), how is the ADR 0003 body produced for 401/403 (entry point / access-denied handler), and how does `/actuator/info` behave? Is there a start-up dependency on Keycloak (issuer discovery vs. explicit JWKS URL)? |
| Q-05 | **Contract:** how is the security scheme generated code-first (springdoc annotations), how do conformance scenarios authenticate (minted tokens), which oasdiff changes must be acknowledged? |
| Q-06 | **Compose:** Keycloak start mode (`start-dev` vs. `start --optimized`), database (embedded dev DB vs. PostgreSQL), healthcheck in an image without curl/wget, profiles (`app` must include Keycloak; does plain `docker compose up -d` now also start Keycloak because a local backend needs it?), ports, read-only FS feasibility. |
| Q-07 | **Logout:** end only the application-realm session, or propagate logout to the mock IdP (so the next login asks for credentials again)? What does the e2e test assert? |
| Q-08 | **E2E:** how do tests authenticate quickly (reusing a brokered session), how do API set-up calls and `verify-lifecycle.sh` obtain tokens (which client/grant), how are expiry and renewal tested deterministically within the CI budget, and how is the `@critical` gate adjusted? |
| Q-09 | **Trivy / release scope:** is the Keycloak image scanned (informational) or explicitly out of scope; how is it prevented from ever being published? |
| Q-10 | Which claims does `/api/me` return exactly, and are the application roles filtered from Keycloak's default realm roles (`offline_access`, `uma_authorization`, `default-roles-*`)? |
