# SCRUM-13 — Requirements Traceability Matrix

Jira: [SCRUM-13](https://suranagivinod.atlassian.net/browse/SCRUM-13) · Branch: `feature/SCRUM-13-keycloak-oidc-auth` ·
Requirements: [`docs/requirements/SCRUM-13.md`](../requirements/SCRUM-13.md) · Design: [`docs/architecture/SCRUM-13-design.md`](../architecture/SCRUM-13-design.md) ·
ADRs: [0018](../adr/0018-authentication-keycloak-oidc.md) (new), [0019](../adr/0019-mock-enterprise-idp-brokering.md) (new), amended: [0003](../adr/0003-error-response-format.md), [0006](../adr/0006-frontend-api-client-and-state.md), [0007](../adr/0007-frontend-testing-msw.md), [0011](../adr/0011-spa-hosting-nginx-reverse-proxy.md), [0012](../adr/0012-end-to-end-testing-playwright.md), [0015](../adr/0015-pre-release-e2e-gate.md), [0017](../adr/0017-api-contract-openapi.md) ·
Conventions: [ADR 0004](../adr/0004-traceability-conventions.md)

**Status: template (Architect), 2026-11-25 — Dev fills every `TODO` with test names, run links and evidence.**

Baseline (before): `main` `682ea5f` — `CI` run TODO, `Release` run TODO.
Evidence runs: `CI` run TODO · `Release` dry-run TODO · commit TODO.
Keycloak image digest pinned from CI run TODO: `quay.io/keycloak/keycloak:26.8.2@sha256:TODO`.
Contract bootstrap iterations (`api/openapi.yaml` regenerated from the CI job log, design §6.1): TODO (run → drift diff → action).
Architect spike (design §2.3): native Keycloak 26.8.2, results S-01..S-19 — not CI evidence, recorded for context.

## 1. Requirements

| ID | Requirement | Design | Code / config / doc | Verification (test / check) | CI evidence |
|---|---|---|---|---|---|
| SCRUM-13-AC-01 | Pinned Keycloak image, realms imported from repo, no manual steps | §4, §11.1 | `docker-compose.yml` (`keycloak`), `keycloak/realms/*.json` | `up --wait` healthy; `check-compose-images.sh` pin check; e2e setup login | TODO |
| SCRUM-13-AC-02 | App realm: public PKCE client, restricted URIs, roles, audience | §4.1, App. A | `todo-realm.json` | HTTP tests (no PKCE → `invalid_request`; password grant → `unauthorized_client`); `/api/me` + captured-token claims (`aud`, `azp`) | TODO |
| SCRUM-13-AC-03 | Explicit token lifetimes, access ≤ 5 min | §4.1, ADR 0019 §3 | `todo-realm.json` | HTTP test `exp-iat == 300`; review | TODO |
| SCRUM-13-AC-04 | Mock IdP realm, broker client, ≥ 3 test users | §4.1, App. A.2 | `mock-idp-realm.json` | e2e logins alice / bob / carol | TODO |
| SCRUM-13-AC-05 | Mock IdP ID-token claims incl. groups | ADR 0019 §1 | `mock-idp-realm.json` (group mapper) | e2e `/api/me` roles per user (derived from `groups`) | TODO |
| SCRUM-13-AC-06 | OIDC IdP `corp-sso`, Corp SSO button → IdP → back | §3.1, ADR 0019 §2 | `todo-realm.json` (`identityProviders`) | e2e `auth.setup.ts` › `SCRUM-13-AC-06, AC-07, AC-09: …` | TODO |
| SCRUM-13-AC-07 | First broker login auto-creates, profile imported | ADR 0019 §2 | built-in flow, `trustEmail` | e2e setup (no intermediate page; e-mail in `/api/me`) | TODO |
| SCRUM-13-AC-08 | Group → role mappers, FORCE sync, no-entitlement user | ADR 0019 §2 | `identityProviderMappers` | e2e bob roles, carol 403 page; (optional: FORCE demotion via admin API) | TODO |
| SCRUM-13-AC-09 | Unauthenticated deep link → login → back to the route | §3.1, §7.2 | `auth/AuthGate.tsx`, `main.tsx` | `AuthGate.test.tsx` › `SCRUM-13-AC-09: …`; e2e deep-link test | TODO |
| SCRUM-13-AC-10 | Tokens in memory only; reload via SSO | §7.3 | `auth/userManager.ts` | `userManager.test.ts`, storage test; e2e storage + reload | TODO |
| SCRUM-13-AC-11 | Bearer on every API request, never to other origins | §7.4 | `api/client.ts`, `auth/token.ts` | `client.test.ts` › `SCRUM-13-AC-11: …`; e2e header assertion | TODO |
| SCRUM-13-AC-12 | Username + Log out; RP-initiated logout (propagated) | §3.4, §7.2 | `components/UserMenu.tsx`, `auth/SignedOutPage.tsx` | `UserMenu.test.tsx`; e2e logout test | TODO |
| SCRUM-13-AC-13 | Silent renewal before expiry; failure → login | §3.3, §7.3 | `auth/userManager.ts`, `AuthGate.tsx` | e2e renewal (`page.clock`); `AuthGate.test.tsx` renew error | TODO |
| SCRUM-13-AC-14 | 401 → renew + retry once → login; 403 → no-access page | §3.3, §7.4 | `api/client.ts`, `api/errors.ts`, `auth/NoAccessPage.tsx` | `client.test.ts`; e2e expired-token recovery; e2e carol | TODO |
| SCRUM-13-AC-15 | Roles available to UI code | §7.2 | `auth/session.ts` | `session.test.ts` › `SCRUM-13-AC-15: …` | TODO |
| SCRUM-13-AC-16 | Config not code; env-agnostic image; strict CSP | §8, ADR 0018 §3 | `nginx/*`, `16-todo-auth-config.sh`, `Dockerfile`, `auth/config.ts` | `config.test.ts`; HTTP test `/auth-config.json` + CSP; e2e `browserErrors` | TODO |
| SCRUM-13-AC-17 | Frontend tests without Keycloak; coverage gate | §7.5 | `src/test/*`, new tests | Vitest suite; coverage summary | TODO (coverage before → after) |
| SCRUM-13-AC-18 | JWT validation: signature, iss, aud, exp/nbf, skew | §5.2, §5.3 | `application.yml`, `SecurityConfig.java`, `AuthProperties.java` | `SecurityIntegrationTest` › `SCRUM-13-AC-18: …` (expired, nbf, rogue key, unknown kid, wrong iss, wrong aud, alg none, skew); e2e expired short token | TODO |
| SCRUM-13-AC-19 | All `/api/**` need auth + role; health public; preflight; stateless | §5.3 | `SecurityConfig.java`, `WebConfig.java` | `SecurityIntegrationTest` matrix; `CorsIntegrationTest`; e2e dev-smoke | TODO |
| SCRUM-13-AC-20 | 401/403 `ApiError` + `WWW-Authenticate`; anonymous unknown path 401 | §5.4 | `web/security/*` | `SecurityIntegrationTest`; `*EntryPointTest`, `*AccessDeniedHandlerTest`; e2e HTTP 401 | TODO |
| SCRUM-13-AC-21 | `GET /api/me` | §5.5 | `MeController.java`, `MeResponse.java` | `MeControllerTest`; IT `/api/me` | TODO |
| SCRUM-13-AC-22 | Role → authority mapping, missing claim = no roles, principal name | §5.2 | `application.yml` | IT (no `realm_access` → 403 on tasks, `/api/me` roles `[]`) | TODO |
| SCRUM-13-AC-23 | Backend tests mint tokens, full negative matrix, coverage | §6.2 | `support/TestJwtIssuer.java`, `support/AuthTestConfiguration.java` | backend suites `@Tag("SCRUM-13")` | TODO (tests run, coverage before → after) |
| SCRUM-13-AC-24 | Contract: security scheme, 401/403, `/api/me`; conformance exercised | §6 | `api/openapi.yaml`, annotations, `schema.d.ts` | `OpenApiDriftIntegrationTest`; `TaskApiContractIntegrationTest` (N scenarios); `npm run api:check`; `contract.test.ts` | TODO |
| SCRUM-13-AC-25 | Breaking changes acknowledged | §6.3 | `api/breaking-changes.ack` | CI `api-contract` | TODO (6 ERR acknowledged, link) |
| SCRUM-13-AC-26 | E2E: redirect, 401, expiry, renewal, logout, 403 | §10.3 | `e2e/tests/ui-auth/*`, `stack.http.spec.ts` | tests listed in design §10.3 | TODO (per sub-item a–f) |
| SCRUM-13-AC-27 | `--profile app up --wait` incl. Keycloak, ordered | §4.2, §9 | `docker-compose.yml` | CI `e2e` step "Start stack" | TODO (Keycloak time to healthy) |
| SCRUM-13-AC-28 | `mvnw` and Vite dev workflows; plain `up -d` change documented | §9 | `docker-compose.yml`, README | CI dev-mode suite; README review | TODO |
| SCRUM-13-AC-29 | `TODO_*` variables, no extra privileges, persistence documented | §4.2, §9 | `.env.example`, README | `check-compose-images.sh` port-follow check; review | TODO |
| SCRUM-13-AC-30 | Published-release Compose mode incl. auth | §9, §11.3 | README, `RELEASE.md` | `check-compose-images.sh`; Release `e2e-release` | TODO |
| SCRUM-13-AC-31 | README: setup, URLs, credentials, curl, troubleshooting, not-for-production | §14 | `README.md` | review | — |
| SCRUM-13-AC-32 | ADRs | — | ADR 0018, 0019 | review | — |
| SCRUM-13-AC-33 | CI `e2e` with Keycloak; scripts authenticate; logs | §11.2 | `ci.yml`, `verify-lifecycle.sh` | CI `e2e` | TODO |
| SCRUM-13-AC-34 | `e2e-release` with candidate images + Keycloak; `@critical` gate; Keycloak not published/scanned | §11.3 | `release.yml`, `vulnerability-policy.md` | Release `e2e-release` (gate `--min 19`), release assets unchanged | TODO |
| SCRUM-13-AC-35 | Regression: assertions unchanged, gates met, CI + Release green | §13 | — | diff review of existing tests (auth set-up only); runs | TODO |
| SCRUM-13-AC-36 | Traceability | — | this file, commits, job summaries | review | §3 below |
| SCRUM-13-NFR-01 | Dev-only secrets labelled, not in images/releases | §12, ADR 0019 §4 | realm JSON, compose, `verify-images.sh` (`secret_re`) | `verify-images.sh` in CI `e2e` / Release `e2e-release` | TODO |
| SCRUM-13-NFR-02 | No tokens in logs/URLs/storage | §12 | — | storage tests; log review of an e2e artifact | TODO |
| SCRUM-13-NFR-03 | Runtime deps limited, gated scans pass | §5.1, §7.1 | `pom.xml`, `package.json` | CI "Runtime dependencies" step; Release `scan` (`backend-runtime`, `frontend-prod`) | TODO |
| SCRUM-13-NFR-04 | Keycloak pinned by tag + digest; actions SHA-pinned | §11.1 | `docker-compose.yml`, workflows | `check-compose-images.sh` | TODO |
| SCRUM-13-NFR-05 | CSP not weaker except Keycloak origin | §8.1 | `security-headers.conf` | HTTP test (exact `connect-src`) | TODO |
| SCRUM-13-NFR-06 | Fail closed; no hard start-up dependency on Keycloak | §5.2 | `SecurityConfig.java`, `AuthProperties.java` | `SecurityIntegrationTest` › JWKS unreachable → 401; `AuthProperties` validation (blank issuer → start fails); ITs start without contacting the JWKS | TODO |
| SCRUM-13-NFR-07 | CI cost bounds | §11.2 | — | job durations before → after | TODO |
| SCRUM-13-NFR-08 | Deterministic realm import / e2e | §4.2, §10 | — | fresh CI runs; local re-run tolerance | TODO |
| SCRUM-13-NFR-09 | HTTP-only-local caveat and production delta documented | §12 | README | review | — |
| SCRUM-13-NFR-10 | Accessible user display / Log out / 403 page | §7.2 | components | Testing Library role queries in tests | TODO |
| SCRUM-13-NFR-11 | Minimal diff; no behaviour change for authorised users | §14 | — | `git diff --stat origin/main` vs design §14 | TODO |

## 2. Versions in effect

| Component | Version | Source of truth |
|---|---|---|
| Keycloak image | 26.8.2 @ `sha256:TODO` | `docker-compose.yml` |
| `spring-boot-starter-security-oauth2-resource-server` (+ `-test`) | Boot BOM 4.1.2 → Spring Security 7.1.2 | `pom.xml` / resolved tree: TODO |
| Nimbus JOSE+JWT (transitive) | 10.9.1 expected | resolved tree: TODO |
| `oidc-client-ts` / `react-oidc-context` | 3.5.0 / 3.3.1 | `frontend/package.json` |
| Playwright | 1.65.1 (unchanged) | `e2e/package.json` |
| oasdiff | 1.39.0 (unchanged) | `install-tools.sh` |

## 3. Commits

| Commit | Role | Summary |
|---|---|---|
| `8bc119e` | PM | requirements |
| (this commit) | ARCH | design, ADRs 0018–0019, this template |
| TODO | DEV | … |
