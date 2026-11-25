# todo

To-Do application (epic SCRUM-5):

- **Backend** (repo root) — a Spring Boot 4.1.2 / Java 21 REST service backed by PostgreSQL 16, delivered by Jira
  story [SCRUM-2](https://suranagivinod.atlassian.net/browse/SCRUM-2).
  Requirements: [`docs/requirements/SCRUM-2.md`](docs/requirements/SCRUM-2.md) · Design:
  [`docs/architecture/SCRUM-2-design.md`](docs/architecture/SCRUM-2-design.md) · Matrix:
  [`docs/traceability/SCRUM-2.md`](docs/traceability/SCRUM-2.md)
- **Frontend** ([`frontend/`](frontend)) — a React 19 + TypeScript + Vite single-page app that lists, creates and
  edits tasks, delivered by Jira story [SCRUM-1](https://suranagivinod.atlassian.net/browse/SCRUM-1). See
  [Frontend (SCRUM-1)](#frontend-scrum-1) below.
  Requirements: [`docs/requirements/SCRUM-1.md`](docs/requirements/SCRUM-1.md) · Design:
  [`docs/architecture/SCRUM-1-design.md`](docs/architecture/SCRUM-1-design.md) · Matrix:
  [`docs/traceability/SCRUM-1.md`](docs/traceability/SCRUM-1.md)
- **Task status management** (backend + frontend) — change a task's status from the list and filter the list by
  status, delivered by Jira story [SCRUM-6](https://suranagivinod.atlassian.net/browse/SCRUM-6).
  Requirements: [`docs/requirements/SCRUM-6.md`](docs/requirements/SCRUM-6.md) · Design:
  [`docs/architecture/SCRUM-6-design.md`](docs/architecture/SCRUM-6-design.md) · Matrix:
  [`docs/traceability/SCRUM-6.md`](docs/traceability/SCRUM-6.md)

- **Testing and deployment** — container images for backend and frontend, a Docker Compose stack with PostgreSQL,
  real-HTTP backend integration tests, component tests and a Playwright end-to-end suite run in CI, delivered by
  Jira story [SCRUM-7](https://suranagivinod.atlassian.net/browse/SCRUM-7). See
  [Run with Docker Compose](#run-with-docker-compose-scrum-7) and [Test layers](#test-layers-scrum-7).
  Requirements: [`docs/requirements/SCRUM-7.md`](docs/requirements/SCRUM-7.md) · Design:
  [`docs/architecture/SCRUM-7-design.md`](docs/architecture/SCRUM-7-design.md) · Matrix:
  [`docs/traceability/SCRUM-7.md`](docs/traceability/SCRUM-7.md)

- **SCRUM-8 — versioning and releases:** one SemVer product version from Git tags, build versions in CI, the
  `Release` workflow (dry-run on every PR/push), SBOMs, vulnerability gate, GHCR images — see [Releases](#releases).
  Requirements: [`docs/requirements/SCRUM-8.md`](docs/requirements/SCRUM-8.md) · Design:
  [`docs/architecture/SCRUM-8-design.md`](docs/architecture/SCRUM-8-design.md) · Matrix:
  [`docs/traceability/SCRUM-8.md`](docs/traceability/SCRUM-8.md)

- **SCRUM-12 — API contract:** the Task API is described by the committed OpenAPI 3.1 document
  [`api/openapi.yaml`](api/openapi.yaml) (generated code-first by springdoc in tests); CI checks backend conformance,
  drift, the frontend types/MSW handlers and breaking changes against `main` — see
  [Changing the API contract](#changing-the-api-contract-scrum-12). ADR:
  [0017](docs/adr/0017-api-contract-openapi.md) · Requirements: [`docs/requirements/SCRUM-12.md`](docs/requirements/SCRUM-12.md) ·
  Design: [`docs/architecture/SCRUM-12-design.md`](docs/architecture/SCRUM-12-design.md) · Matrix:
  [`docs/traceability/SCRUM-12.md`](docs/traceability/SCRUM-12.md)

- **SCRUM-13 — authentication:** Keycloak (realm `todo`) with a mock enterprise OIDC IdP (realm `mock-idp`, "Corp
  SSO") brokered into it; the SPA logs in with Authorization Code + PKCE and keeps tokens in memory; the backend is a
  JWT resource server (401/403, `GET /api/me`) — see [Authentication](#authentication-scrum-13) (**test credentials,
  local development only**). ADRs: [0018](docs/adr/0018-authentication-keycloak-oidc.md),
  [0019](docs/adr/0019-mock-enterprise-idp-brokering.md) · Requirements:
  [`docs/requirements/SCRUM-13.md`](docs/requirements/SCRUM-13.md) · Design:
  [`docs/architecture/SCRUM-13-design.md`](docs/architecture/SCRUM-13-design.md) · Matrix:
  [`docs/traceability/SCRUM-13.md`](docs/traceability/SCRUM-13.md)

Architecture decisions for all parts are in [`docs/adr/`](docs/adr).

## Authentication (SCRUM-13)

> **LOCAL DEVELOPMENT ONLY — NOT FOR PRODUCTION.** Keycloak runs in development mode with an embedded,
> throw-away database, over plain HTTP on `localhost`, with a bootstrap admin and **committed** secrets and passwords
> (all marked `dev-only`). None of them is baked into an image or used by a release. See
> [Production delta](#production-delta-not-in-this-repository) below.

The app sits behind a real login ([ADR 0018](docs/adr/0018-authentication-keycloak-oidc.md),
[ADR 0019](docs/adr/0019-mock-enterprise-idp-brokering.md), [design](docs/architecture/SCRUM-13-design.md)):

```
Browser (SPA, oidc-client-ts, tokens in memory)
  │ 1. no session → redirect (Authorization Code + PKCE S256)
  ▼
Keycloak http://localhost:8180  realm "todo"  (application realm: client todo-frontend, roles todo-user / todo-admin)
  │ 2. "Corp SSO" button → OIDC identity brokering
  ▼
Keycloak http://localhost:8180  realm "mock-idp"  (mock enterprise IdP: users alice / bob / carol, groups)
  │ 3. user signs in at the IdP → ID token with groups → realm "todo" creates the user, maps groups → roles
  ▼
SPA gets an access token (aud todo-api, 5 min, refreshed silently) → GET /api/** with Authorization: Bearer …
  ▼
Backend (Spring Security resource server): RS256 signature (JWKS of realm "todo"), iss, aud, exp/nbf (30 s skew),
role todo-user for /api/tasks/**, authentication only for /api/me → 401 / 403 with the ApiError body otherwise
```

One Keycloak hosts both realms; both are configuration as code in [`keycloak/realms/`](keycloak/realms) and imported
automatically by every **new** Keycloak container. The issuer is always `http://localhost:8180/realms/todo`
(`KC_HOSTNAME` is fixed), whether the token was requested by the browser, the backend container or `curl`.

### Start, stop, reset

```bash
docker compose up -d                                  # PostgreSQL + Keycloak (for ./mvnw spring-boot:run and npm run dev)
docker compose --profile app up --build -d --wait     # + backend + frontend → http://localhost:3000
docker compose --profile app down                     # stop; PostgreSQL data kept, Keycloak state (users, sessions) gone
docker compose --profile app down -v                  # … and delete the PostgreSQL volume
docker compose rm -sf keycloak && docker compose up -d keycloak   # reset Keycloak only (re-import the realms)
```

Since SCRUM-13 a plain `docker compose up -d` starts **PostgreSQL and Keycloak** (before: PostgreSQL only): a locally
run backend validates Keycloak tokens and the Vite dev server logs in there. Keycloak becomes healthy after
~20–40 s (`docker compose ps`); `--wait` waits for it. **Persistence:** Keycloak's state lives in its container — it
survives `stop`/`start`/`restart`, is gone after `down`, and the realms come back from the JSON files on the next
`up` (users are re-created at their next login).

### URLs and ports

| URL | What |
|---|---|
| <http://localhost:3000> | the app (redirects to the login) |
| <http://localhost:8180/realms/todo/account> | Keycloak, realm `todo` (application realm; its login page shows **Corp SSO**) |
| <http://localhost:8180/realms/mock-idp/account> | Keycloak, realm `mock-idp` (the mock enterprise IdP) |
| <http://localhost:8180/admin> | Keycloak admin console (both realms) |
| <http://localhost:8180/realms/todo/.well-known/openid-configuration> | OIDC discovery of the application realm |
| <http://localhost:3000/auth-config.json> | Keycloak settings the SPA reads at start-up (from the frontend container env) |
| <http://localhost:8080/api/me> | the signed-in user as the backend sees it (needs a token) |

Port `8180` is `TODO_KEYCLOAK_PORT`; it moves the published port, `KC_HOSTNAME`, the realm URLs, the backend's
issuer and the frontend's `AUTH_URL` together. Keycloak's management port 9000 (health) is not published.

### Test credentials (LOCAL DEVELOPMENT ONLY)

| Account | Where | Username / client ID | Password / secret | Result in the app |
|---|---|---|---|---|
| Alice | mock IdP user (log in via **Corp SSO**) | `alice` (alice@corp.example, group `todo-users`) | `alice-dev-only` | role `todo-user` — full access |
| Bob | mock IdP user (via **Corp SSO**) | `bob` (bob@corp.example, groups `todo-users`, `todo-admins`) | `bob-dev-only` | roles `todo-user`, `todo-admin` (admin grants nothing extra yet) |
| Carol | mock IdP user (via **Corp SSO**) | `carol` (carol@corp.example, no group) | `carol-dev-only` | no role — "You do not have access to this application" |
| Keycloak admin | <http://localhost:8180/admin> (master realm) | `admin` (`TODO_KC_ADMIN_USER`) | `admin-dev-only` (`TODO_KC_ADMIN_PASSWORD`) | administers both realms |
| Scripts / e2e | client of realm `todo` (client credentials) | `todo-e2e` | `dev-only-todo-e2e-secret` | service account with `todo-user` |
| Expiry tests | client of realm `todo` (client credentials) | `todo-e2e-short` | `dev-only-todo-e2e-short-secret` | `todo-user`, 5-second access tokens |
| Broker | client of realm `mock-idp`, used by realm `todo`'s identity provider `corp-sso` | `todo-broker` | `dev-only-todo-broker-secret` | — (not for humans) |
| SPA | public client of realm `todo` | `todo-frontend` | — (public, PKCE) | — |

Users exist only in the mock IdP; the application realm creates its user automatically at the first login ("first
broker login", no extra page) and re-applies the group → role mapping at **every** login. **Log out** ends the
session in both realms, so the next login asks for the IdP password again.

### Token lifetimes (realm `todo`)

| Setting | Value |
|---|---|
| Access token | **300 s** (`TODO_KC_ACCESS_TOKEN_LIFESPAN`, applied when a new container imports the realm); the SPA renews it 60 s before expiry with the refresh token |
| SSO session idle / max | 1800 s / 36000 s (a reload within that time needs no password) |
| Refresh tokens | rotate on every use (`revokeRefreshToken`, reuse 0) |
| `todo-e2e-short` access token | 5 s |
| Backend clock skew for `exp`/`nbf` | 30 s (`TODO_AUTH_CLOCK_SKEW` / `APP_AUTH_CLOCK_SKEW`, max 60 s; CI uses 5 s) |

### Call the API with curl

```bash
TOKEN=$(curl -s -d grant_type=client_credentials -d client_id=todo-e2e -d client_secret=dev-only-todo-e2e-secret \
  http://localhost:8180/realms/todo/protocol/openid-connect/token | jq -r .access_token)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/me
curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:8080/api/tasks?page=0&size=20'
curl -i http://localhost:8080/api/tasks          # no token → 401, ApiError body, WWW-Authenticate: Bearer …
```

The token is valid for 5 minutes; fetch a new one afterwards. Responses: missing/invalid/expired token → **401**
(`WWW-Authenticate: Bearer`, plus `error="invalid_token"` for a rejected token); valid token without `todo-user` →
**403** (`error="insufficient_scope"`); both with the standard `ApiError` body. `/actuator/health` and
`/actuator/info` stay public; anonymous requests to unknown paths also get 401 (no endpoint enumeration).
`GET /api/me` returns `{subject, username, email, name, roles}` and needs a token but not the role.

### Development workflows

- **Backend with `./mvnw spring-boot:run`:** `docker compose up -d` (PostgreSQL + Keycloak), then
  `./mvnw spring-boot:run`. The defaults (`APP_AUTH_ISSUER_URI=http://localhost:8180/realms/todo`,
  `APP_AUTH_JWK_SET_URI=http://localhost:8180/realms/todo/protocol/openid-connect/certs`, `APP_AUTH_AUDIENCE=todo-api`)
  match the Compose Keycloak. The backend starts even if Keycloak is not up yet (keys are fetched on the first
  request; until then requests are rejected with 401).
- **Vite dev server:** `cd frontend && npm run dev` → <http://localhost:5173>. Login uses `VITE_AUTH_URL`
  (default `http://localhost:8180`), `VITE_AUTH_REALM` (`todo`) and `VITE_AUTH_CLIENT_ID` (`todo-frontend`); the
  realm allows `http://localhost:5173` as redirect URI and web origin, the backend allows it via CORS.
- **Container image:** the frontend image reads its settings from `/auth-config.json`, rendered by nginx from the
  env vars `AUTH_URL`, `AUTH_REALM`, `AUTH_CLIENT_ID` (validated at start; Compose sets them). The CSP gains exactly
  one source, `connect-src 'self' <AUTH_URL>/` (token endpoint); login and logout are top-level navigations, so there
  is no `frame-src`.

### Change the realms

1. Edit [`keycloak/realms/todo-realm.json`](keycloak/realms/todo-realm.json) or
   [`mock-idp-realm.json`](keycloak/realms/mock-idp-realm.json) — or change a realm in the admin console and export it
   (`Realm settings → Action → Partial export`), then copy only the changed keys into the JSON (keep the
   `${TODO_…:default}` placeholders; `${CLAIM.preferred_username}` is a mapper template, not a placeholder).
2. Re-import: `docker compose rm -sf keycloak && docker compose up -d keycloak` (an existing realm is never
   overwritten — strategy `IGNORE_EXISTING` — so the container must be new).

### Troubleshooting

- *401 with `error="invalid_token"` and "issuer" in `WWW-Authenticate`:* the token's `iss` differs from the backend's
  `APP_AUTH_ISSUER_URI`. Use `localhost` (not `127.0.0.1`) and the same `TODO_KEYCLOAK_PORT` for Keycloak, backend and
  frontend; tokens fetched from `http://keycloak:8080` inside containers still say `http://localhost:8180`.
- *"Invalid parameter: redirect_uri" on the Keycloak page:* the app runs on an origin the realm does not know (only
  `http://localhost:3000` and `http://localhost:5173`, or `TODO_FRONTEND_PORT`). Open the app via `localhost`; after
  changing ports, reset Keycloak (`docker compose rm -sf keycloak && docker compose up -d keycloak`).
- *Expired tokens right after login / "Jwt expired" or "not before":* the clocks of the host and the containers
  differ by more than the 30 s skew — sync the system clock (WSL/VM sleep is a common cause).
- *Port 8180 already in use:* set `TODO_KEYCLOAK_PORT=8280` (everything follows) and reset Keycloak.
- *Old users, roles or sessions after a realm change:* Keycloak keeps its state until the container is removed —
  `docker compose rm -sf keycloak && docker compose up -d keycloak`.
- *Login loop or "Sign-in failed":* clear the site data of `localhost` (Keycloak's cookies are on `localhost`, the
  SPA keeps tokens only in memory) and reload.
- *CSP errors in the browser console (`connect-src`):* `AUTH_URL` of the frontend container does not match the
  Keycloak URL the browser uses.
- *Corp SSO login hangs or fails with "Unexpected error when authenticating with identity provider" behind a
  corporate proxy:* Keycloak's broker calls itself (`http://localhost:8080` inside the container); if the Docker
  daemon injects `HTTP_PROXY` into containers, add `localhost,127.0.0.1,keycloak` to `NO_PROXY`.

### Production delta (not in this repository)

HTTPS everywhere (`KC_HOSTNAME=https://…`, `sslRequired: all`, secure cookies); Keycloak `start --optimized` from a
built image with a production database, backups and HA; no bootstrap admin; secrets (broker client, any confidential
client) from a secret store; the real corporate IdP's endpoints and client instead of `mock-idp`; no service-account
test clients; token lifetimes per policy. The application side needs only configuration: `APP_AUTH_ISSUER_URI`,
`APP_AUTH_JWK_SET_URI`, `APP_AUTH_AUDIENCE` (backend) and `AUTH_URL`/`AUTH_REALM`/`AUTH_CLIENT_ID` (frontend).

## Run with Docker Compose (SCRUM-7)

The whole application — PostgreSQL, the backend and the frontend — runs from source with only Docker installed; no
JDK or Node.js is needed (SCRUM-7-AC-07, ADRs [0010](docs/adr/0010-container-images-and-build-identity.md),
[0011](docs/adr/0011-spa-hosting-nginx-reverse-proxy.md)).

**Prerequisites:** Docker Engine **≥ 25.0** and Docker Compose v2 **≥ 2.24** (`docker compose version`; needed for
healthcheck `start_interval` and `up --wait`).

**Build and start** (the backend and frontend services sit behind the Compose profile `app`):

```bash
docker compose --profile app up --build -d --wait
```

`--wait` returns once every service is healthy (PostgreSQL → backend → frontend start in that order, each gated on
the previous one's healthcheck; the frontend also waits for Keycloak — SCRUM-13) and fails if one does not become
healthy. The first build downloads the Maven and npm
dependencies and takes a few minutes; later builds reuse the cached layers.

| URL | What |
|---|---|
| <http://localhost:3000> | the app (nginx serves the SPA and proxies `/api/**` and `/actuator/health` to the backend — same origin, no CORS); sign in with **Corp SSO** → `alice` / `alice-dev-only` ([Authentication](#authentication-scrum-13)) |
| <http://localhost:8180> | Keycloak (realms `todo` and `mock-idp`, admin console `/admin`) — SCRUM-13 |
| <http://localhost:3000/actuator/health> | backend health through the proxy |
| <http://localhost:8080/api/tasks> | the API directly on the published backend port (curl with a bearer token, debugging, Vite dev mode) |
| <http://localhost:8080/actuator/info> | build identity of the backend (not proxied by the frontend) |

**Stop / reset:**

```bash
docker compose --profile app down        # stop and remove the containers; data is kept in volume todo-pgdata
docker compose --profile app down -v     # … and delete the data volume (fresh database on the next start)
```

Always pass `--profile app` (or set `COMPOSE_PROFILES=app`) when the app services may be running, so `down` also
removes them.

**Configuration** (SCRUM-7-AC-08): every value has a local-development default; override it in the shell or in a
git-ignored `.env` next to `docker-compose.yml` (copy [`.env.example`](.env.example)). The defaults are **not
secrets** — do not reuse them anywhere else.

| Variable | Default | Purpose |
|---|---|---|
| `TODO_DB_NAME`, `TODO_DB_USER`, `TODO_DB_PASSWORD` | `todo`, `todo`, `todo` | PostgreSQL database and credentials (also passed to the backend as `DB_URL`/`DB_USERNAME`/`DB_PASSWORD`) |
| `TODO_DB_PORT` | `5432` | host port of PostgreSQL |
| `TODO_BACKEND_PORT` | `8080` | host port of the backend |
| `TODO_FRONTEND_PORT` | `3000` | host port of the frontend (the app) |
| `TODO_CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | backend `APP_CORS_ALLOWED_ORIGINS` (the Vite dev server, see below) |
| `TODO_IMAGE_TAG` | `local` | tag of the images `todo-backend` / `todo-frontend` (CI: `<JIRA_KEY>-<sha>`) |
| `TODO_BACKEND_IMAGE`, `TODO_FRONTEND_IMAGE` | `todo-backend`, `todo-frontend` | image repositories — set to `ghcr.io/vinods21/todo-*` to run a published release ([Releases](#releases)) |
| `TODO_BACKEND_TAG`, `TODO_FRONTEND_TAG` | `TODO_IMAGE_TAG` | per-service tag, e.g. `0.1.0@sha256:<digest>` to pin a release by digest |
| `TODO_VERSION` | `0.0.0-SNAPSHOT` | version stamped into locally built images (releases come from Git tags, SCRUM-8) |
| `JIRA_KEY`, `GIT_COMMIT`, `GIT_BRANCH` | `UNKNOWN` | build identity baked into the images (labels, jar, `/actuator/info`, UI footer) |
| `COMPOSE_PROFILES` | — | `app` makes a plain `docker compose up -d` start the whole stack |
| `TODO_KEYCLOAK_PORT` | `8180` | SCRUM-13: host port of Keycloak; also the issuer host the backend validates and the frontend's `AUTH_URL` |
| `TODO_KC_ADMIN_USER`, `TODO_KC_ADMIN_PASSWORD` | `admin`, `admin-dev-only` | SCRUM-13: Keycloak bootstrap admin (dev only) |
| `TODO_KC_ACCESS_TOKEN_LIFESPAN` | `300` | SCRUM-13: access-token lifetime (s) of realm `todo`, applied at realm import |
| `TODO_AUTH_CLOCK_SKEW` | `30s` | SCRUM-13: backend `APP_AUTH_CLOCK_SKEW` for `exp`/`nbf` (max 60 s) |
| `TODO_KEYCLOAK_IMAGE` | pinned `quay.io/keycloak/keycloak:26.8.2@sha256:…` | SCRUM-13: override only to try another Keycloak version |

**Rebuild after code changes:** run the start command again (`docker compose --profile app up --build -d --wait`),
or rebuild one image with `docker compose build backend` / `docker compose build frontend`.

**Logs:** `docker compose logs -f backend` (or `frontend`, `postgres`); `docker compose --profile app ps` shows the
health of each service.

**Build identity for local images** (ADR 0008/0010) — without it labels and `/actuator/info` say `UNKNOWN`:

```bash
JIRA_KEY=SCRUM-7 GIT_COMMIT=$(git rev-parse HEAD) GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) \
  docker compose --profile app build
docker image inspect -f '{{json .Config.Labels}}' todo-backend:local   # OCI labels incl. revision and com.vinods21.todo.jira
```

Images built by Docker have no `.git` in their build context (by design), so `/actuator/info` of a container has
`build.*` (including `build.git-commit` and `build.jira`) but no `git` section.

**Images:** backend = JRE 21 (Alpine) + the Spring Boot jar, running as UID 10001, Java as PID 1 (clean `SIGTERM`
shutdown); frontend = unprivileged nginx (UID 101, container port 8080) + `dist/`. Both are multi-stage builds from
pinned base images with a Docker `HEALTHCHECK`; the containers run with a read-only root filesystem, all
capabilities dropped and `no-new-privileges`. The frontend image is built with a same-origin API base
(`VITE_API_BASE_URL=/`), so the same image works on any host or port; the proxy target is the container env var
`BACKEND_URL` (default `http://backend:8080`).

**Vite dev server against the containerised backend:** start the stack (or just `docker compose --profile app up -d
--wait backend`) and run `npm run dev` in `frontend/` — it calls `http://localhost:8080` cross-origin, which the
backend allows by default (SCRUM-7-AC-12).

**Troubleshooting**

- *Port already in use* (`bind: address already in use`): another process holds 3000/8080/5432 — e.g. a
  `./mvnw spring-boot:run` backend occupies 8080, so stop it or set `TODO_BACKEND_PORT=8081` (likewise
  `TODO_FRONTEND_PORT`, `TODO_DB_PORT`).
- *Stack does not become healthy* (`up --wait` fails): `docker compose --profile app ps` shows which service is
  unhealthy; `docker compose logs backend` explains why (typically the database). A slow machine may need
  `--wait-timeout 300`.
- *Backend fails after a schema change* (Flyway validation error against old data): the volume holds an older or
  modified schema — reset it with `docker compose --profile app down -v`.
- *The UI shows a network/server error*: the backend is down or restarting; nginx answers `502` until it is healthy
  again.

## Releases

Released versions are on the [GitHub Releases page](https://github.com/vinods21/todo/releases) (jar, frontend
bundle, four CycloneDX SBOMs, scan reports, `SHA256SUMS`, provenance attestations) and in GHCR as
`ghcr.io/vinods21/todo-backend` and `ghcr.io/vinods21/todo-frontend` (linux/amd64). The first release is `v0.1.0`,
cut after the SCRUM-8 merge.

**Version scheme** (SCRUM-8, [ADR 0013](docs/adr/0013-versioning-and-release-process.md)): one SemVer version
`MAJOR.MINOR.PATCH` for backend and frontend; the Git tag `vX.Y.Z` is the only source of truth and is created by the
`Release` workflow — `pom.xml` (`${revision}`) and `frontend/package.json` hold the placeholder `0.0.0-SNAPSHOT` and
are never edited for a release. Every other build gets a **build version** `X.Y.Z-<sha7>` (next patch after the
latest release, `0.1.0-<sha7>` before the first; `g<sha7>` if the SHA is all digits with a leading zero). Image tags
`X.Y.Z` and `X.Y.Z-<sha7>` are immutable; `X.Y` and `latest` move. Local builds say `0.0.0-SNAPSHOT`.

**Run a released version with Compose** (no build, no source needed beyond `docker-compose.yml` and — since
SCRUM-13 — the [`keycloak/realms/`](keycloak/realms) directory next to it, which Keycloak imports):

```bash
export TODO_BACKEND_IMAGE=ghcr.io/vinods21/todo-backend TODO_FRONTEND_IMAGE=ghcr.io/vinods21/todo-frontend
export TODO_IMAGE_TAG=0.1.0        # or pin by digest: TODO_BACKEND_TAG=0.1.0@sha256:… TODO_FRONTEND_TAG=0.1.0@sha256:…
docker compose --profile app pull backend frontend
docker compose --profile app up --no-build -d --wait
curl -s localhost:8080/actuator/info | jq -r .build.version    # → 0.1.0
```

The default local workflow (`docker compose --profile app up --build`) is unchanged.

**Runbooks:** [RELEASE.md](docs/release/RELEASE.md) (versioning rules, cutting a release, dry-run, what is produced,
verification, failure recovery, first release) · [ROLLBACK.md](docs/release/ROLLBACK.md) (redeploy a previous
version by digest, Flyway caveat, roll forward) · [vulnerability-policy.md](docs/release/vulnerability-policy.md)
(what blocks a release, allow-list). Cut a release:
`gh workflow run release.yml --ref main -f bump=patch -f dry_run=false`.

**Release tooling** (`.github/scripts/release/`, Node ≥ 20, no dependencies) — run its tests and lint locally:

```bash
node --test ".github/scripts/release/test/*.test.mjs"
.github/scripts/release/install-tools.sh shellcheck && .tools/bin/shellcheck .github/scripts/*.sh .github/scripts/release/*.sh
.github/scripts/release/install-tools.sh oasdiff   # SCRUM-12: breaking-change detection (pinned + checksum)
```

## Run locally (SCRUM-2-NFR-08)

Prerequisites: JDK 21, and Docker (for the local database and the integration tests). Maven is not needed;
the committed Maven Wrapper (`./mvnw`, `mvnw.cmd`) downloads Maven 3.9.11 on first use.

1. Start PostgreSQL 16 and Keycloak (SCRUM-13 — the backend validates its tokens; the containerised backend and
   frontend are behind the Compose profile `app`, see [Run with Docker Compose](#run-with-docker-compose-scrum-7)):

   ```bash
   docker compose up -d
   ```

2. Run the application (Flyway creates the schema on startup):

   ```bash
   ./mvnw spring-boot:run
   ```

   or build and run the executable jar:

   ```bash
   ./mvnw -DskipTests package
   java -jar target/todo-backend-0.0.0-SNAPSHOT.jar   # placeholder version for local builds (SCRUM-8)
   ```

3. Check it is up: `curl http://localhost:8080/actuator/health` returns `{"status":"UP"}`. API calls need a bearer
   token ([Call the API with curl](#call-the-api-with-curl)).

4. Run all tests and the coverage gate (needs Docker for Testcontainers):

   ```bash
   ./mvnw verify
   ```

   Reports: `target/surefire-reports/` (tests) and `target/site/jacoco/index.html` (coverage; the build fails
   below 80% line coverage on the `service` and `web` packages).

Stop the database with `docker compose down` (add `-v` to delete its data volume).

### Environment variables (SCRUM-2-NFR-05)

| Variable | Default (local development only) | Purpose |
|---|---|---|
| `DB_URL` | `jdbc:postgresql://localhost:5432/todo` | JDBC URL of the PostgreSQL database |
| `DB_USERNAME` | `todo` | Database user |
| `DB_PASSWORD` | `todo` | Database password (matches `docker-compose.yml`; not a real secret) |
| `SERVER_PORT` | `8080` | HTTP port |
| `APP_CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated list of origins allowed to call `/api/**` (CORS) |
| `APP_AUTH_ISSUER_URI` | `http://localhost:8180/realms/todo` | SCRUM-13: expected `iss` of access tokens (public Keycloak URL) |
| `APP_AUTH_JWK_SET_URI` | `http://localhost:8180/realms/todo/protocol/openid-connect/certs` | SCRUM-13: where the signing keys are fetched (Compose: `http://keycloak:8080/…`) |
| `APP_AUTH_AUDIENCE` | `todo-api` | SCRUM-13: required `aud` value |
| `APP_AUTH_CLOCK_SKEW` | `30s` | SCRUM-13: tolerance for `exp`/`nbf` (0–60 s) |

Example: `DB_URL=jdbc:postgresql://db:5432/todo DB_PASSWORD=... APP_CORS_ALLOWED_ORIGINS=http://localhost:3000 java -jar target/todo-backend-0.0.0-SNAPSHOT.jar`

## API

All endpoints consume and produce `application/json`. Since SCRUM-13 every `/api/**` call needs
`Authorization: Bearer <access token>` of the Keycloak realm `todo`; the Task endpoints also need the role `todo-user`
(401 / 403 otherwise — see [Authentication](#authentication-scrum-13)). The `curl` examples below assume
`-H "Authorization: Bearer $TOKEN"`.

| Method | Path | Description | Success |
|---|---|---|---|
| `GET` | `/api/me` | The authenticated user: `subject`, `username`, `email`, `name`, `roles` (SCRUM-13; token required, role not) | `200` |
| `POST` | `/api/tasks` | Create a task (`title` required, `description`, `status`, `dueDate` optional; `status` defaults to `TODO`) | `201` + `Location` |
| `GET` | `/api/tasks?page=0&size=20&status=DONE` | List tasks, newest first (`page` ≥ 0, `size` 1–100, larger sizes are clamped to 100); optional `status` filter (SCRUM-6, see below) | `200` |
| `GET` | `/api/tasks/{id}` | Get one task | `200` |
| `PUT` | `/api/tasks/{id}` | Replace `title`, `description`, `status` (required), `dueDate` | `200` |
| `PATCH` | `/api/tasks/{id}/status` | Change only the status: body `{"status": "IN_PROGRESS"}`; returns the full task (SCRUM-6) | `200` |
| `DELETE` | `/api/tasks/{id}` | Delete a task | `204` |
| `GET` | `/actuator/health` | Health (includes database connectivity) | `200` |
| `GET` | `/actuator/info` | Git and build information (incl. `build.jira`) | `200` |

Task JSON:

```json
{
  "id": 1,
  "title": "Write docs",
  "description": "optional, max 2000 chars",
  "status": "TODO",
  "createdAt": "2026-11-17T10:15:30.123456Z",
  "dueDate": "2026-12-01"
}
```

`status` is one of `TODO`, `IN_PROGRESS`, `DONE`. `id` and `createdAt` are server-assigned; values sent by the
client are ignored. List responses look like
`{"items": [...], "page": 0, "size": 20, "totalElements": 1, "totalPages": 1}`.

**Status changes and filtering (SCRUM-6, [ADR 0009](docs/adr/0009-status-sub-resource-patch.md)):**

- `PATCH /api/tasks/{id}/status` accepts `{"status": "TODO" | "IN_PROGRESS" | "DONE"}`; other fields in the body
  (e.g. `title`) are ignored. Any status may change to any other (no transition rules); setting the current status
  again is a successful no-op. Errors: missing/`null` status → 400 `Validation failed` with a `status` field error;
  unknown or wrong-case value (`"done"`) → 400 `Invalid value for field 'status'`; malformed JSON → 400; non-numeric
  id → 400; unknown id → 404; non-JSON content type → 415. A failed request never changes the task.
  `PATCH /api/tasks/{id}` (without `/status`) stays `405`.
- `GET /api/tasks?status=<STATUS>` returns only tasks with that status; `page`, `size`, `totalElements` and
  `totalPages` refer to the filtered set, ordering stays newest first, and filtering happens in PostgreSQL (index
  `ix_tasks_status_created_at_id`, Flyway V2). Without `status` the list is unfiltered. The value must be exactly one
  enum name: unknown, wrong-case, empty (`?status=`), comma-separated (`TODO,DONE`) or repeated
  (`status=TODO&status=DONE`) values → 400 `Invalid value for parameter 'status'`.
- CORS allows `PATCH` for the configured origins.

```bash
curl -i -X PATCH http://localhost:8080/api/tasks/1/status \
  -H 'Content-Type: application/json' -d '{"status": "DONE"}'
curl 'http://localhost:8080/api/tasks?status=DONE&page=0&size=20'
```

Every error (400, 401, 403, 404, 405, 415, 500) uses one body:

```json
{
  "timestamp": "2026-11-17T10:15:30.123Z",
  "status": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "path": "/api/tasks",
  "fieldErrors": [ { "field": "title", "message": "must not be blank" } ]
}
```

Example:

```bash
curl -i -X POST http://localhost:8080/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title": "Buy milk", "dueDate": "2026-12-01"}'
```

## Changing the API contract (SCRUM-12)

**Where it lives.** [`api/openapi.yaml`](api/openapi.yaml) (OpenAPI 3.1, canonical YAML) is the reviewed contract of
the Task API ([ADR 0017](docs/adr/0017-api-contract-openapi.md)). It is generated **code-first** from
`TaskController`, the DTO records and their documentation annotations (`@Operation`, `@ApiResponse`, `@Schema`,
JSpecify `@Nullable`) by springdoc — a **test-scope** dependency, so the released jar/image serves no
`/v3/api-docs` or Swagger UI (checked by `verify-jar.sh`, `OpenApiExposureIntegrationTest` and an e2e test). Every
consumer reads the committed file: the backend conformance tests, the generated frontend types
(`frontend/src/api/schema.d.ts`), the MSW handler validation and the breaking-change gate.

**Changing an endpoint** (path, parameter, body, status code):

1. Change the controller/DTO code **and** its annotations (every status an operation can return needs an
   `@ApiResponse`; `500` is declared once on the class). If the change adds a status, add a scenario to
   `TaskApiContractIntegrationTest.SCENARIOS`.
2. Regenerate the document (JDK 21 + Docker): `./mvnw -B test -Dtest=OpenApiDriftIntegrationTest -Dopenapi.update=true`,
   then review `git diff api/openapi.yaml`. Without a local build: push, and copy the generated document from the
   failing `build` job — the step *OpenAPI drift diff* prints it between `----- BEGIN generated api/openapi.yaml -----`
   and `----- END … -----` (also base64, and in the artifact `todo-backend-<key>-<sha>-reports`, `target/openapi/`).
3. Regenerate the frontend types: `npm --prefix frontend run api:types`; fix what `npm run typecheck` reports (the
   `ContractChecks` in `frontend/src/api/types.ts`), the API client and the MSW handlers/fixtures
   (`frontend/src/test/handlers.ts`, `fixtures.ts`) until `npm test` passes.
4. If the change is breaking for existing clients, acknowledge it (below). Commit code, `api/openapi.yaml`,
   `schema.d.ts` and the acknowledgment together.

**Reading a failure.**

| Check (CI job) | Message starts with | Meaning / fix |
|---|---|---|
| Drift (`build`) | `SCRUM-12-AC-05: contract drift` + unified diff (also in the job summary) | The code generates a different document than the committed one. Intended → step 2; otherwise fix the code/annotations. |
| Canonical form (`build`) | `SCRUM-12-NFR-03: api/openapi.yaml is not in canonical form` | Hand-edited formatting/order; regenerate (step 2). |
| Conformance (`build`) | `SCRUM-12-AC-03: response of <METHOD> <uri> does not conform` + `METHOD /template (operationId) status: …` lines with JSON pointers | The running app answered with an undocumented status, header, media type or property, or a wrong type/enum. |
| Endpoint parity / exercised pairs (`build`) | `SCRUM-12-AC-04: …` | An `/api/**` mapping is not documented (or vice versa), or a documented `(operation, status)` has no scenario. |
| Frontend types (`frontend`) | `npm run api:check` shows a diff of `schema.d.ts` | Run `npm --prefix frontend run api:types` and commit. |
| Frontend type assertions (`frontend`) | `Type 'false' does not satisfy the constraint 'true'` in `types.ts` | The contract changed incompatibly with the UI types: fix the UI types/code. |
| MSW validation (`frontend`) | `SCRUM-12-AC-07: default handler response conforms — …` with `METHOD /template (operationId) status: …` | A test double returns something the backend never would; fix `handlers.ts`/`fixtures.ts`. |
| Breaking change (`api-contract`) | `SCRUM-12-AC-08: [rule-id] METHOD /path: text` + `ack line: …` | An unacknowledged breaking change against `main` (merge base); job summary lists all changes. |

**Acknowledging an intended breaking change.** Add the line the gate prints to
[`api/breaking-changes.ack`](api/breaking-changes.ack) and replace the placeholder justification:
`<JIRA-KEY> <METHOD> <path> <oasdiff text, verbatim> -- <why this break is acceptable>` — one line per change, matched
exactly on method, path and text. On a feature branch/PR only entries with the branch's Jira key count; malformed
lines fail the job; entries that no longer match are reported as warnings — remove them in the next story. The file
is reviewed in the PR diff and works the same for `push` and `pull_request` runs and squash merges. When `main` has
no `api/openapi.yaml` yet (SCRUM-12 itself), the check passes with a notice.

**Run the checks locally.**

```bash
./mvnw verify                                             # drift, canonical form, conformance, parity, exposure (JDK 21 + Docker)
npm --prefix frontend run api:check                       # schema.d.ts up to date
(cd frontend && npm run typecheck && npm test)            # ContractChecks, MSW/fixture validation (src/test/contract.test.ts)
node --test ".github/scripts/api/test/*.test.mjs"         # breaking-change gate self-tests
.github/scripts/release/install-tools.sh oasdiff && PATH="$PWD/.tools/bin:$PATH" OUT=/tmp/api-contract \
  EVENT_NAME=push REF_NAME="$(git branch --show-current)" JIRA_KEY=SCRUM-<n> .github/scripts/api-contract.sh
```

## Test layers (SCRUM-7)

| Layer | Tool | What it covers | Run locally | Reports (local / CI artifact) |
|---|---|---|---|---|
| Backend unit + slice | JUnit 5, Mockito, MockMvc (`@WebMvcTest`) | service rules, controller contract, error mapping, CORS config | `./mvnw verify` | `target/surefire-reports/`, `target/site/jacoco/` / `todo-backend-<key>-<sha>-reports` |
| Backend integration | `@SpringBootTest(RANDOM_PORT)` + Testcontainers PostgreSQL 16 | CRUD, paging, status, Flyway, restart persistence; real-HTTP error contract, CORS and actuator exposure (SCRUM-7-AC-13..15) | `./mvnw verify` (needs Docker) | same |
| Frontend unit + component | Vitest, Testing Library, MSW | API client, pages, components (no backend) | `cd frontend && npm test` (`npm run test:coverage` for the gate) | `frontend/reports/` / `todo-frontend-<key>-<sha>-reports` |
| End-to-end (Compose) | Playwright (Chromium) | browser → nginx → backend → PostgreSQL: list, create, edit + deep-link reload, status change, filter, backend validation error, build identity; HTTP smoke of the stack (SCRUM-7-AC-18, AC-19); SCRUM-13: brokered login via Corp SSO (project `setup`, reused session), deep-link redirect, renewal, expired-token recovery, logout, no-access user (project `auth`), 401/CSP/issuer checks | see below | `e2e/reports/compose/` / `todo-e2e-<key>-<sha>-reports` |
| End-to-end (dev mode) | Playwright | Vite dev server on 5173 → backend on 8080 cross-origin (SCRUM-7-AC-21, SCRUM-1-AC-14) | see below | `e2e/reports/dev/` / same artifact |

End-to-end tests ([`e2e/`](e2e), ADR [0012](docs/adr/0012-end-to-end-testing-playwright.md)) have their own
`package.json`; Node.js 22 is needed:

```bash
docker compose --profile app up --build -d --wait     # the stack under test on :3000 / :8080
cd e2e
npm ci
npx playwright install --with-deps chromium           # once per Playwright version
npm test                                              # compose mode → reports/compose/
npm run test:dev                                      # dev mode: starts Vite on 5173 (or reuses yours) → reports/dev/
npx playwright show-report reports/compose/html
```

Since SCRUM-13 the suites authenticate: project `setup` logs alice in once through Corp SSO and saves the Keycloak
session cookies to `e2e/.auth/` (git-ignored; never uploaded); API set-up uses `todo-e2e` client-credentials tokens.
Keycloak must be reachable at `E2E_AUTH_URL` (default `http://localhost:8180`); the expiry tests wait for the backend's
clock skew (`E2E_AUTH_CLOCK_SKEW_SECONDS`, default 30 — CI runs the backend with 5 s). Playwright traces of failed
tests may contain dev-only tokens (5-minute lifetime).

The tests create their own uniquely named tasks, so they pass against a database that already has data; only the
empty-state test needs a fresh volume (`down -v`) and is skipped otherwise (CI enforces it with
`E2E_EXPECT_EMPTY_DB=1`). Override the targets with `E2E_BASE_URL` / `E2E_BACKEND_URL`; `npm run test:dev` uses POSIX
env syntax (on Windows use WSL or `set E2E_MODE=dev`).

Select one story's or one AC's tests in each layer: `./mvnw test -Dgroups=SCRUM-7`,
`npx vitest run -t 'SCRUM-7-'`, `npx playwright test -g 'SCRUM-7-AC-18'`.

**CI** (`.github/workflows/ci.yml`): jobs `build` (backend), `frontend` and `e2e` run in parallel after `identity`.
`e2e` lints the Dockerfiles (hadolint), builds both images with the derived Jira key and commit, starts the stack
with `docker compose up --wait`, checks image labels, non-root users, runtime contents and sizes, runs the compose and
dev-mode suites and a lifecycle/persistence script (clean `SIGTERM` stop, data kept across restarts, removed by
`down -v`), writes a summary to the run page and uploads `todo-e2e-<key>-<sha>-reports` (Playwright HTML/JUnit/JSON,
traces/screenshots/videos on failure, `docker compose logs`). Since SCRUM-8 every job stamps and checks the build
version `X.Y.Z-<sha7>` from `identity`. The separate workflow **`Release`** (`.github/workflows/release.yml`) runs in
parallel as a dry run: release tooling tests + shellcheck, `./mvnw verify` and the frontend gate again on the exact
commit, images built once from the tested artefacts, SBOMs, Trivy scans, the vulnerability gate and the pre-release
e2e gate against the exact release images (SCRUM-9, job `e2e-release`) ([Releases](#releases)).

## Traceability

Every artefact traces back to its Jira story and acceptance criteria (ADR
[0004](docs/adr/0004-traceability-conventions.md), build identity per ADR
[0008](docs/adr/0008-ci-derived-build-identity.md)):

- **Branch / commits:** `feature/SCRUM-<n>-<slug>`; commit subjects `SCRUM-<n>: [ROLE] ...` with a `Refs: SCRUM-<n>`
  trailer.
- **Tests:** every test class has `@Tag("SCRUM-<n>")` (methods added to an older story's class carry a method-level
  tag); every test's `@DisplayName` starts with the AC ID(s) it verifies. List covered ACs after a build with
  `grep -hoE 'SCRUM-[0-9]+-AC-[0-9]+' target/surefire-reports/TEST-*.xml | sort -uV`, or run only one story's tests
  with e.g. `./mvnw test -Dgroups=SCRUM-6`.
- **Build identity (ADR 0008):** the Jira key is not hard-coded. CI derives it once per run from the branch
  (`feature/SCRUM-<n>-…` → `SCRUM-<n>`, `main` → `main`, anything else → `NONE`) and passes it to Maven
  (`-Djira.issue=…`) and Vite (`JIRA_KEY`). Local builds say `UNKNOWN` unless you pass it yourself:
  `./mvnw verify -Djira.issue=SCRUM-6`, `JIRA_KEY=SCRUM-6 npm run build`.
- **Version (SCRUM-8, ADR 0013):** CI's `identity` job also computes the build version `X.Y.Z-<sha7>` from the Git
  tags and passes it to Maven (`-Drevision=…`), Vite (`APP_VERSION`) and both images (`VERSION`); a release stamps
  `X.Y.Z`; local builds say `0.0.0-SNAPSHOT`. One version per build appears in the jar name
  (`todo-backend-<version>.jar`), manifest `Implementation-Version`, `build-info` `build.version` (→ `/actuator/info`),
  `dist/build-info.json` `version`, the `<meta name="build-info">` tag and both images' `org.opencontainers.image.version`.
- **Jar:** the manifest carries `X-Jira-Issue`, `X-Git-Commit`, `X-Git-Branch` and `Implementation-Version`
  (`unzip -p target/todo-backend-0.0.0-SNAPSHOT.jar META-INF/MANIFEST.MF` locally); `build.jira` and `build.version`
  are in `META-INF/build-info.properties` at the jar root (Spring Boot 4 — not under `BOOT-INF/classes/`).
- **Runtime:** `GET /actuator/info` returns the git commit/branch, `build.version` and `build.jira` (the build's
  Jira key).
- **CI:** GitHub Actions workflow `CI` (`.github/workflows/ci.yml`): job `identity` derives the key (shown in the
  run summary), job `build` publishes the jar as artifact `todo-backend-<key>-<commit sha>` and test + coverage
  reports as `todo-backend-<key>-<commit sha>-reports`, after checking key, version and commit in the jar
  (`verify-jar.sh`); job `e2e` (SCRUM-7) tags the images `todo-backend:<key>-<sha>` / `todo-frontend:<key>-<sha>`
  and additionally with the build version (`todo-backend:<build version>`), asserts the version label and uploads
  `todo-e2e-<key>-<commit sha>-reports`.
- **Release workflow (SCRUM-8):** `.github/workflows/release.yml` runs as a dry run on every PR and push and uploads
  `todo-release-candidate-<key>-<sha>` (would-be release assets, SBOMs, scan reports, `SHA256SUMS`, notes) plus
  `todo-release-{backend,frontend,images,sbom,scan}-<key>-<sha>` and `todo-release-tooling-<key>-<sha>-reports`.
- **Matrices:** [`docs/traceability/`](docs/traceability) maps each story's AC/NFR to code, tests and CI evidence.

## Frontend (SCRUM-1)

React 19 + TypeScript (strict) + Vite 8 + React Router 8 in [`frontend/`](frontend) (SCRUM-1-NFR-01). It calls the
backend's `/api/tasks` endpoints directly from the browser (cross-origin, relying on the backend's CORS default; no
dev proxy). In the container image it is served by nginx, which proxies the API on the same origin (SCRUM-7,
ADR 0011).

### Prerequisites (SCRUM-1-NFR-02)

- Node.js **22** (`>=22.22.2`; `frontend/.nvmrc` → `nvm use`) and npm 10.
- Dependencies are pinned exactly and locked in `frontend/package-lock.json`; install with `npm ci`.

### Environment variables (SCRUM-1-AC-13)

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | `frontend/.env.local`, shell or CI env | `http://localhost:8080` | Origin of the backend (no trailing slash, no `/api` suffix); `/` = same-origin (`<page origin>/api/…`, used by the container image behind nginx — SCRUM-7-AC-17) |
| `VITE_AUTH_URL`, `VITE_AUTH_REALM`, `VITE_AUTH_CLIENT_ID` | `frontend/.env.local` or shell | `http://localhost:8180`, `todo`, `todo-frontend` | SCRUM-13: Keycloak for the login (dev mode) |
| `VITE_AUTH_CONFIG_URL` | image build (`Dockerfile`) | — | SCRUM-13: load the Keycloak settings at run time from this URL instead (image: `/auth-config.json`) |
| `JIRA_KEY` | CI (`identity` job) or shell | `UNKNOWN` | Jira key embedded in the build identity (ADR 0008) |
| `GITHUB_SHA`, `GITHUB_REF_NAME`, `GITHUB_HEAD_REF` | set by GitHub Actions | `git` CLI fallback | Commit/branch embedded in the build identity |

`VITE_API_BASE_URL` is read when the dev server starts or the build runs (Vite inlines it), so changing it needs no
code change: copy [`frontend/.env.example`](frontend/.env.example) to `frontend/.env.local`, or run e.g.
`VITE_API_BASE_URL=http://localhost:8081 npm run dev`.

### Run against the local backend (SCRUM-1-AC-14)

1. Start the database and backend as described in [Run locally](#run-locally-scrum-2-nfr-08)
   (`docker compose up -d`, `./mvnw spring-boot:run`) with the default configuration.
2. Start the frontend:

   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

3. Open <http://localhost:5173>. The dev server always uses port 5173 (`strictPort`) because
   `http://localhost:5173` is the backend's default allowed CORS origin (`APP_CORS_ALLOWED_ORIGINS`); if the port is
   busy it fails instead of moving to another port.

Views: `/` (task list, `?status=<STATUS>&page=N`), `/tasks/new` (create), `/tasks/:id/edit` (edit).

**Status management (SCRUM-6):** each list row has a "Status for <title>" select that changes the task's status in
place with `PATCH /api/tasks/{id}/status` (the row is disabled with "Saving…" while the request runs; failures revert
the row and show an alert). The "Status" filter above the list (All / To do / In progress / Done) is kept in the URL,
e.g. `/?status=IN_PROGRESS` or `/?status=DONE&page=2`, so refresh, bookmarks and Back/Forward restore it; changing
the filter starts at page 1, paging keeps it, and an unknown `?status` value is treated as "All". An empty filtered
list says "No tasks with status …" with a "Show all tasks" link. Editing a task returns to the same filter and page.

### Test, lint, type-check and build (SCRUM-1-NFR-03, NFR-04)

```bash
cd frontend
npm run lint            # ESLint (react-hooks rules, no explicit any), zero warnings
npm run typecheck       # tsc -b --noEmit (strict)
npm test                # Vitest + Testing Library + MSW, non-watch; no backend needed
npm run test:coverage   # same, plus coverage gate (lines/statements/functions 80 %, branches 75 %)
npm run build           # type-check + production build to frontend/dist
npm run preview         # serve the production build on http://localhost:4173
```

Reports: `frontend/reports/junit.xml` (tests), `frontend/reports/coverage/index.html` (coverage),
`frontend/dist/build-info.json` (build identity). Run a single AC's tests with `npx vitest run -t 'SCRUM-1-AC-11'`,
or one story's with `npx vitest run -t 'SCRUM-6-'`.

### Frontend traceability (ADR 0004 / 0007)

- **Commits:** `SCRUM-<n>: [ROLE] ...` with a `Refs: SCRUM-<n>` trailer, on `feature/SCRUM-<n>-<slug>`.
- **Tests:** each test file has one top-level `describe('SCRUM-<n> <area>')` per story; every test name starts with
  the AC/NFR ID(s) it verifies. After `npm run test:coverage`,
  `grep -oE 'SCRUM-[0-9]+-AC-[0-9]+' reports/junit.xml | sort -uV` lists the covered ACs.
- **Build (ADR 0008, SCRUM-8):** `dist/build-info.json` holds `{ jira, commit, branch, version, builtAt }`,
  `dist/index.html` carries `<meta name="build-info" content="<key> <commit> <version>">`, and the app footer shows
  `<key> · <short commit>`, where `<key>` is `JIRA_KEY` (derived from the branch in CI, `UNKNOWN` locally) and
  `<version>` is `APP_VERSION` (CI build version or release, `0.0.0-SNAPSHOT` locally); `builtAt` follows
  `SOURCE_DATE_EPOCH` when set (reproducible release bundles). `package.json` `version` is a placeholder.
- **CI:** job `frontend` in `.github/workflows/ci.yml` (lint, typecheck, tests + coverage gate, build, build-identity
  check) uploads `todo-frontend-<key>-<commit sha>` (dist) and `todo-frontend-<key>-<commit sha>-reports` (junit +
  coverage).
- **Matrices:** [`docs/traceability/SCRUM-1.md`](docs/traceability/SCRUM-1.md),
  [`docs/traceability/SCRUM-6.md`](docs/traceability/SCRUM-6.md).
