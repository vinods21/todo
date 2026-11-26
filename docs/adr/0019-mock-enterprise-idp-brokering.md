# ADR 0019 — Mock enterprise SSO: a second realm (`mock-idp`) in the same Keycloak, brokered by the application realm (`todo`) over standard OIDC; realms as code with dev-only secrets

- Status: Accepted
- Date: 2026-11-25
- Jira: [SCRUM-13](https://suranagivinod.atlassian.net/browse/SCRUM-13) — SCRUM-13-AC-01, AC-02, AC-04..AC-08,
  AC-12, AC-31, AC-32, NFR-01, NFR-08, NFR-09; questions Q-06, Q-07
- Related: [ADR 0018](0018-authentication-keycloak-oidc.md) (authentication architecture)
- Design: [SCRUM-13 design](../architecture/SCRUM-13-design.md) §4, Appendix A (spike-validated realm files)

## Context

The application must demonstrate enterprise SSO: users authenticate at the corporate IdP, never at the application.
No corporate IdP is reachable from developer machines or CI, so an IdP must be simulated — reproducibly, with known
test users and entitlements, and without the application or its tests knowing it is a simulation (the broker must
use only what a real corporate OIDC IdP offers: discovery-equivalent endpoints, a confidential client, signed ID
tokens with standard and group claims).

## Decision

### 1. One Keycloak, two realms, standard OIDC between them

- **`todo`** — the application realm (ADR 0018): SPA client `todo-frontend` (public, PKCE S256), roles `todo-user`,
  `todo-admin`, service-account client `todo-e2e` (tests/scripts), identity provider **`corp-sso`** ("Corp SSO").
- **`mock-idp`** — the mock enterprise IdP: confidential client **`todo-broker`** (Authorization Code + PKCE S256,
  redirect URI = `…/realms/todo/broker/corp-sso/endpoint` only, post-logout redirect URI = the broker's
  `…/endpoint/logout_response`), groups `todo-users`, `todo-admins`, a group-membership mapper emitting `groups`
  (short names) in ID/access tokens and userinfo, and the test users:

| User (mock IdP) | Password (dev only) | Groups | Resulting app roles |
|---|---|---|---|
| `alice` / alice@corp.example | `alice-dev-only` | `todo-users` | `todo-user` |
| `bob` / bob@corp.example | `bob-dev-only` | `todo-users`, `todo-admins` | `todo-user`, `todo-admin` |
| `carol` / carol@corp.example | `carol-dev-only` | — | none → 403 page |

A second Keycloak container would be closer to "external", but adds ~40 s start-up, memory and a second image
lifecycle for no behavioural gain: brokering between realms of one server goes through the same HTTP endpoints
(browser redirects to `mock-idp`'s authorization endpoint; the broker calls `mock-idp`'s token and JWKS endpoints over
the back channel at `http://localhost:8080` inside the container). Swapping the mock for a real IdP is a change of the
`corp-sso` URLs, client ID and secret only.

### 2. Brokering configuration (`corp-sso`)

- Endpoints: `authorizationUrl` and `logoutUrl` on the **public** URL (browser), `tokenUrl` and `jwksUrl` on the
  **internal** URL (back channel); `issuer` = public `mock-idp` issuer (Keycloak's fixed hostname makes it constant);
  `validateSignature` + `useJwksUrl`; `pkceEnabled` (S256); `clientAuthMethod=client_secret_post`;
  `defaultScope=openid profile email`; `disableUserInfo` (claims come from the ID token).
- **First login:** the built-in `first broker login` flow. With `trustEmail=true` and complete profiles from the IdP
  (username, e-mail, first/last name), its "Review Profile" step (`update.profile.on.first.login=missing`) shows
  nothing and "Create User If Unique" creates the user — spike: no page between the IdP login and the redirect back.
  No auto-link flow: the application realm has **no local human users**, so there is nothing to link to, and
  auto-linking by e-mail is an account-takeover pattern we do not want to model.
- **Mappers** (all `syncMode=FORCE`, re-applied at every login): username ← `${CLAIM.preferred_username}`;
  `groups` contains `todo-users` → `todo-user`; `groups` contains `todo-admins` → `todo-admin`. Spike: removing bob from
  `todo-admins` at the IdP removed `todo-admin` from his next token.
- **Scope of roles in tokens:** `fullScopeAllowed=false` on every client plus explicit realm scope mappings
  (`todo-frontend` → `todo-user`, `todo-admin`; `todo-e2e` → `todo-user`), so `realm_access.roles` contains only
  application roles (no `offline_access`, `uma_authorization`, `default-roles-todo`) and no `account` audience; users
  without a role get **no** `realm_access` claim (spike: carol). Keycloak 26.8 logs "Full scope allowed … deprecated",
  so this is also the forward-compatible setting.
- **Logout propagation:** `logoutUrl` + `sendIdTokenOnLogout=true`: RP-initiated logout at `todo` redirects through
  `mock-idp`'s end-session endpoint and back (spike chain: `todo/logout → mock-idp/logout →
  todo/broker/corp-sso/endpoint/logout_response → app /signed-out`; both realms' sessions 0 afterwards; the old refresh
  token is `invalid_grant`). The next login asks for credentials again — what users of real SSO expect after "Log out"
  on a shared machine, and what the e2e test asserts.

### 3. Realms as code

- `keycloak/realms/todo-realm.json`, `keycloak/realms/mock-idp-realm.json`: partial realm representations (only what
  differs from defaults), imported by `start-dev --import-realm` from `/opt/keycloak/data/import` (bind mount, read
  only). Strategy `IGNORE_EXISTING`: an existing realm is never overwritten; a new container (`down`, CI) starts fresh.
- Environment-dependent values use Keycloak's import placeholders `${VAR:default}` (spike: resolved from the container
  env; unresolved names such as `${CLAIM.preferred_username}` stay verbatim): `TODO_KC_PUBLIC_URL`,
  `TODO_KC_INTERNAL_URL`, `TODO_APP_URL`, `TODO_DEV_URL`, `TODO_KC_ACCESS_TOKEN_LIFESPAN`.
- Token lifetimes (explicit, SCRUM-13-AC-03): access token 300 s, SSO idle 1800 s, SSO max 36000 s, refresh tokens
  rotate (`revokeRefreshToken`, max reuse 0); e2e expiry client `todo-e2e-short`: 5 s access tokens.
- Changing a realm: edit the JSON (or export from the admin console, then reduce to the relevant keys), `docker
  compose rm -sf keycloak && docker compose up -d keycloak`.

### 4. Dev-only secrets, never released

All committed secrets are prefixed or suffixed `dev-only` (`dev-only-todo-broker-secret`,
`dev-only-todo-e2e-secret`, user passwords `*-dev-only`, admin `admin` / `admin-dev-only` via
`KC_BOOTSTRAP_ADMIN_*`), the realm display names say "LOCAL DEVELOPMENT ONLY", and the README carries the warning.
They live only in the realm JSON, `docker-compose.yml`/`.env.example` and e2e/scripts — never in an image (`.dockerignore`
already excludes everything but the build inputs; the frontend image only gets the public client ID). Release
artefacts are unaffected: the Release workflow uses them only inside the ephemeral `e2e-release` stack.

## Consequences

- Positive: the full SSO path (button → IdP login → auto-provisioning → role mapping → logout propagation) runs on a
  laptop and in CI with known users; replacing the mock by a real IdP is configuration of one identity provider.
- Positive: entitlements are owned by the IdP (groups) and enforced by the application realm's mappers on every login.
- Negative: the mock IdP shares the Keycloak instance (a Keycloak outage takes both down — irrelevant locally); the
  login page of `todo` still renders Keycloak's username/password form even though no local user can use it
  (customising the browser flow / theme is out of scope).
- Negative: Keycloak state is ephemeral (dev-file DB in the container); brokered users are re-created on the next
  login after `down`. Intended (determinism, NFR-08).
- Production would need: a real IdP's endpoints/metadata and secret from a secret store, HTTPS everywhere,
  `start --optimized` with a production DB, its own user lifecycle — out of scope.
