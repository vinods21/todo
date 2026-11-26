# ADR 0018 — Authentication: Keycloak (own origin, fixed issuer) as OIDC provider; SPA uses Authorization Code + PKCE with in-memory tokens (oidc-client-ts); backend is a stateless JWT resource server

- Status: Accepted
- Date: 2026-11-25
- Jira: [SCRUM-13](https://suranagivinod.atlassian.net/browse/SCRUM-13) — SCRUM-13-AC-01..AC-03, AC-09..AC-30, AC-32..AC-34,
  NFR-01..NFR-09; questions Q-01..Q-06, Q-08..Q-10
- **Amends:** [ADR 0003](0003-error-response-format.md) (401/403 now use the same `ApiError` body, plus
  `WWW-Authenticate`), [ADR 0006](0006-frontend-api-client-and-state.md) (`client.ts` attaches the bearer token and
  owns the 401 retry), [ADR 0007](0007-frontend-testing-msw.md) (tests run with a stubbed, authenticated auth module),
  [ADR 0011](0011-spa-hosting-nginx-reverse-proxy.md) (CSP `connect-src` gains the Keycloak origin; nginx serves
  `/auth-config.json` from env), [ADR 0012](0012-end-to-end-testing-playwright.md) / [ADR 0015](0015-pre-release-e2e-gate.md)
  (e2e authenticates; Keycloak is a third service in the e2e stacks), [ADR 0017](0017-api-contract-openapi.md)
  (security scheme in the contract; first acknowledged breaking change).
- Related: [ADR 0019](0019-mock-enterprise-idp-brokering.md) (mock enterprise IdP and brokering)
- Design: [SCRUM-13 design](../architecture/SCRUM-13-design.md)

## Context

The To-Do API and SPA have no authentication. SCRUM-13 asks for Keycloak as the application's identity provider,
brokering to a (mock) enterprise OIDC IdP, a React login/logout, and a Spring Boot OAuth2 resource server that
validates JWTs, maps roles, and handles expiry and anonymous access — all runnable with Docker Compose and tested
in CI (`e2e`) and before release (`e2e-release`) against release images.

Forces:

- **Issuer consistency.** The browser reaches Keycloak at a host address, the backend container at a Compose
  service address; the token's `iss` must be a single value the backend checks.
- **Environment-agnostic frontend image** (ADR 0010/0011, SCRUM-7-AC-17): one image for every host/port.
- **Strict CSP** (`default-src 'self'`, no inline, `frame-ancestors 'none'`); third-party-cookie restrictions make
  hidden-iframe techniques (silent `prompt=none` iframes, Keycloak's session-status iframe) fragile.
- **No token persistence in the browser** (XSS blast radius), yet reloads must not ask for credentials again.
- **Backend tests must not need Keycloak**; the backend must not have a hard start-up dependency on Keycloak.
- Boot 4.1.2 / Spring Security 7.1.2 / Jackson 3; the contract is code-first (ADR 0017).

## Decision

### 1. Topology: Keycloak on its own origin with a fixed public hostname (single issuer)

Keycloak runs as Compose service `keycloak`, published on `http://localhost:8180` (`TODO_KEYCLOAK_PORT`), with
`KC_HOSTNAME=http://localhost:8180` **fixed**. Every token therefore has `iss = http://localhost:8180/realms/todo`,
no matter whether Keycloak was reached as `localhost:8180` (browser, e2e runner, curl) or `keycloak:8080`
(containers) — verified in the spike (design §2.3): discovery and a client-credentials token fetched via the
internal name both report the public issuer.

The backend validates `iss` against that public URL but fetches keys from the internal URL:

```yaml
spring.security.oauth2.resourceserver.jwt:
  issuer-uri: ${APP_AUTH_ISSUER_URI:http://localhost:8180/realms/todo}                                  # validated only
  jwk-set-uri: ${APP_AUTH_JWK_SET_URI:http://localhost:8180/realms/todo/protocol/openid-connect/certs}  # used for keys
```

When both are set, Boot 4.1.2 builds the decoder from `jwk-set-uri` (`IssuerUriCondition` does not match if
`jwk-set-uri` is present) and still adds a `JwtIssuerValidator(issuer-uri)` (`JwtDecoderConfiguration#getValidator`)
— no custom validator and **no discovery call**, so the backend starts without Keycloak and fetches the JWKS lazily
(NFR-06). Compose sets `APP_AUTH_JWK_SET_URI=http://keycloak:8080/realms/todo/protocol/openid-connect/certs`.

| Option | For | Against |
|---|---|---|
| **A. Own origin `:8180`, fixed hostname** (chosen) | One issuer everywhere (Compose, Vite dev mode, backend via `mvnw`, e2e runner, curl); Keycloak's pages keep Keycloak's own security headers; separate trust boundary (an XSS in the SPA cannot script Keycloak's pages); mirrors real deployments (`sso.corp.example` ≠ `app.corp.example`); `localhost:3000` and `localhost:8180` are **same-site**, so cookies are not third-party. | CSP `connect-src` must list the Keycloak origin → the frontend image needs it at run time (§3); CORS on Keycloak's token endpoint (`webOrigins`). |
| B. Same origin, nginx proxies `/auth` → Keycloak (`KC_HTTP_RELATIVE_PATH=/auth`) | CSP unchanged; SPA config relative. | Vite dev mode (`:5173`) and a backend run via `mvnw` see a different origin → either a fixed hostname that requires nginx to be running for every workflow, or dynamic hostnames and **several accepted issuers**; Keycloak's login pages would inherit or fight our strict CSP/`X-Frame-Options`; admin console must be fenced off in nginx; app and IdP share one origin (cookies, XSS scope). |
| C. Dynamic hostname (`hostname-strict=false`), backend accepts a list of issuers | No fixed config. | Issuer depends on the `Host` header (Keycloak warns against it); multi-issuer validation weakens the check; still needs CSP per origin. |

### 2. Frontend: `oidc-client-ts` 3.5.0 + `react-oidc-context` 3.3.1, Authorization Code + PKCE, tokens in memory

- `UserManager` (one module-level instance, `frontend/src/auth/`) with `response_type=code` (PKCE S256 is the
  library default), `userStore = InMemoryWebStorage` (access, refresh and ID token **only in JS memory**),
  `stateStore = sessionStorage` (only the transient `state`/`code_verifier` across the redirect; removed by the
  callback — spike: storage empty after login), `automaticSilentRenew: true` using the **refresh-token grant** (no
  iframe; refresh tokens rotate, `revokeRefreshToken: true` in the realm), `monitorSession: false` (no session
  iframe), `redirect_uri = <origin>/oidc/callback`, `post_logout_redirect_uri = <origin>/signed-out`.
- **Reload:** the in-memory user is gone, so the app performs a top-level `signinRedirect` with the current route
  as `state`; Keycloak's SSO cookie answers immediately (spike: bounce without login page, route preserved). No
  hidden iframe, so no third-party-cookie or `frame-src` dependency.
- `react-oidc-context` provides `AuthProvider`/`useAuth` (passed our `UserManager`); the non-React API client gets
  the token through a small provider interface (`auth/token.ts`), so `client.ts` stays the only `fetch` caller.
- **API calls:** `Authorization: Bearer` only for the API base origin; on **401** renew once (`signinSilent` =
  refresh grant) and retry once, else `signinRedirect` to the current route; **403** → "no access" page.
- **Logout:** `signoutRedirect({ id_token_hint })` → Keycloak end-session (propagated to the mock IdP, ADR 0019) →
  `/signed-out` (public page with "Sign in again").

| Option | For | Against |
|---|---|---|
| **oidc-client-ts + react-oidc-context** (chosen) | Standards-based OIDC client (works against Keycloak or any corporate IdP directly); explicit storage control (`InMemoryWebStorage`); refresh-token renewal without iframes; React hooks; small (one transitive dependency, `jwt-decode`); MIT / Apache-2.0; spike-verified against Keycloak 26.8.2 under the target CSP with zero console errors. | Two packages; Keycloak-specific conveniences (account console link, `kc_idp_hint` helper) are plain URL parameters instead. |
| `keycloak-js` 26.2.5 | Maintained by Keycloak, zero dependencies, `updateToken(minValidity)`. | Keycloak-only; default `check-sso`/login-status iframe paths need `frame-src` and third-party cookies (disable-able, but then it offers nothing extra); token handling is less explicit about storage; no React bindings. |
| Hand-written PKCE client | No dependency. | Security-sensitive code (state, nonce, PKCE, token rotation, clock handling) we would own and test ourselves. |

### 3. Runtime auth configuration of the frontend image

The image stays environment-agnostic: nginx renders, from env vars `AUTH_URL` (default `http://localhost:8180`),
`AUTH_REALM` (`todo`), `AUTH_CLIENT_ID` (`todo-frontend`):

- `GET /auth-config.json` → `{"url": …, "realm": …, "clientId": …}` (`return 200` in the template, `no-cache`);
- CSP `connect-src 'self' ${AUTH_URL}/` (trailing slash = path-prefix match; the only CSP change; no `frame-src`,
  `form-action` unchanged — the SPA navigates to Keycloak with `location.assign`, not forms).

A new entrypoint script validates the three values (strict regexes) and refuses to start on anything else
(header/JSON injection guard). The SPA reads `/auth-config.json` before rendering when built with
`VITE_AUTH_CONFIG_URL=/auth-config.json` (Dockerfile, like `VITE_API_BASE_URL=/`); Vite dev mode uses
`VITE_AUTH_URL`/`VITE_AUTH_REALM`/`VITE_AUTH_CLIENT_ID` with the same defaults.

### 4. Backend: Spring Security resource server, configuration-driven, ADR 0003 bodies

- Starter **`spring-boot-starter-security-oauth2-resource-server`** (Boot 4 name; the old
  `spring-boot-starter-oauth2-resource-server` is deprecated in 4.1.2), test starter
  `spring-boot-starter-security-oauth2-resource-server-test`. Spring Security 7.1.2, Nimbus JOSE+JWT 10.9.1
  (transitive).
- Validation: signature (RS256, JWKS with Nimbus' cache + refetch on unknown `kid`), `typ` (`JWT` or absent —
  Keycloak sends `JWT`), `iss`, `aud ∋ todo-api` (`spring.security.oauth2.resourceserver.jwt.audiences`),
  `exp`/`nbf` with a **30 s** clock skew (own `JwtTimestampValidator` bean replaces the 60 s default;
  `APP_AUTH_CLOCK_SKEW`), `alg=none` impossible (Nimbus JWS only).
- Roles: `authorities-claim-expressions: "['realm_access']['roles']"`, `authority-prefix: ROLE_`,
  `principal-claim-name: preferred_username` (Boot 4.1 properties; no custom converter).
- Rules: `/api/me` authenticated; `/api/**` `hasRole('todo-user')`; `/actuator/health/**`, `/actuator/info`,
  `/error` permitted; everything else authenticated (anonymous → 401, so no endpoint enumeration). Stateless
  (`SessionCreationPolicy.STATELESS`), CSRF disabled (bearer tokens are never sent automatically by the browser),
  `cors(withDefaults())` (uses `WebConfig`'s MVC CORS mappings; preflight without token), no form/basic login, no
  request cache.
- 401/403: entry point and access-denied handler delegate to Spring's `BearerTokenAuthenticationEntryPoint` /
  `BearerTokenAccessDeniedHandler` (RFC 6750 `WWW-Authenticate`) and write the ADR 0003 `ApiError` body with fixed
  messages (`Authentication required` / `Invalid or expired access token` / `Access denied`).
- `GET /api/me` → `{subject, username, email|null, name|null, roles[]}` (roles = realm roles ∩ configured app roles).
- Tasks remain **global** (no ownership) — follow-up.

### 5. Contract

`@SecurityScheme(name = "bearerAuth", type = HTTP, scheme = "bearer", bearerFormat = "JWT")` +
`@SecurityRequirement(name = "bearerAuth")` on the controllers; 401 (all `/api/**`), 403 (Task operations) with a
required `WWW-Authenticate` header; `/api/me`. oasdiff 1.39.0 reports exactly **6 ERR** changes
(`api-security-anonymous-access-removed`, one per Task operation; verified against a mock-up of the new document) —
acknowledged in `api/breaking-changes.ack` with `SCRUM-13` entries. Conformance tests mint tokens with a test RSA
key served by an in-test JWKS endpoint (JDK `HttpServer`), so the real decoder path (JWKS fetch, `kid`) is exercised.

### 6. Keycloak in Compose, CI and Release

`quay.io/keycloak/keycloak:26.8.2@sha256:<digest>` (pinned by tag and digest), `start-dev --import-realm` (embedded
dev-file database inside the container; realms re-imported on every new container), healthcheck on the management
port via bash `/dev/tcp` (the image has no curl/wget). No profile: `docker compose up -d` now starts PostgreSQL **and**
Keycloak (a locally run backend and Vite need it). The image is a third-party dev/CI dependency like `postgres`: not
built, not scanned by the release gate, never published; `e2e-release` pulls it together with `postgres`.

## Consequences

- Positive: one issuer and one set of URLs for every workflow; strict CSP keeps `default-src 'self'` and gains only
  the exact Keycloak origin; no tokens in browser storage; no iframes; backend fully testable without Keycloak;
  configuration-only Spring Security (small code surface).
- Negative: each full page load costs a redirect round-trip to Keycloak (SSO bounce, ~ tens of ms locally); the
  frontend image gains runtime configuration (validated env) — a deployment must set `AUTH_URL`; a Keycloak with a
  different public URL needs `KC_HOSTNAME`, `APP_AUTH_ISSUER_URI` and the realm's redirect URIs changed together.
- Breaking API change for anonymous clients (acknowledged; only the SPA and repository scripts consume the API).
- Not production-ready by design: HTTP, dev-mode Keycloak, committed dev secrets (design §12 lists what changes).
- Follow-ups: per-user task ownership; admin-only operations; production Keycloak (TLS, DB, `start --optimized`,
  secrets); optional informational Trivy scan of the Keycloak image.
