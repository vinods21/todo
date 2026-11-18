# ADR 0011 — SPA hosted by nginx in its own container, reverse-proxying the API (same origin); `VITE_API_BASE_URL=/` means same-origin

- Status: Accepted
- Date: 2026-11-18
- Jira: [SCRUM-7](https://suranagivinod.atlassian.net/browse/SCRUM-7) — SCRUM-7-AC-05, AC-06, AC-12, AC-17, NFR-07, NFR-12; assumptions A-01, A-02, A-09; open question Q-05
- **Resolves:** SCRUM-1 Q-02 ("how is the SPA hosted?", deferred in [ADR 0005](0005-frontend-stack-react-vite-ts.md))
- Amends: [ADR 0006](0006-frontend-api-client-and-state.md) — base-URL resolution gains a same-origin value
- Design: [SCRUM-7 design §4–§5](../architecture/SCRUM-7-design.md)

## Context

The SPA is static (`dist/`). It needs history-API fallback for deep links (`/tasks/42/edit`), sensible caching
(fingerprinted `/assets/*` vs `index.html`), and a way to reach `/api/**`. Today it calls the backend
cross-origin (`VITE_API_BASE_URL`, default `http://localhost:8080`, inlined at build time) and the backend allows
the dev origin via CORS. Options:

| Option | Assessment |
|---|---|
| **A. nginx container serves `dist/` and reverse-proxies `/api/**` + `/actuator/health` to the backend** | Browser sees one origin → no CORS in the deployed topology; one frontend image for every environment (nothing environment-specific inlined); independent images/lifecycles; nginx is good at fallback, caching, headers |
| B. Backend serves `dist/` from `classpath:/static` (single jar) | Couples frontend and backend builds and releases; SPA fallback needs a custom controller/filter in the API; Maven build would need Node |
| C. nginx serves `dist/`, browser calls the backend cross-origin | Needs the API URL inlined per environment (one image per environment) and CORS configuration everywhere |
| D. Object storage / CDN | Out of scope (no cloud deployment) |

## Decision

Option **A** (confirms A-01).

- **Image:** `nginxinc/nginx-unprivileged:1.30.7-alpine3.24` (ADR 0010), listening on container port **8080**,
  UID 101. Config is an envsubst template `frontend/nginx/default.conf.template` rendered by the image's
  entrypoint into `/etc/nginx/conf.d/default.conf` (overwriting the base image's default server) with
  `NGINX_ENVSUBST_FILTER=^(BACKEND_URL|NGINX_LOCAL_RESOLVERS)$` so nginx's own `$variables` are never touched.
- **Proxy target configurable at start:** env `BACKEND_URL` (scheme://host:port, no path; image default
  `http://backend:8080`). `proxy_pass` uses a variable plus `resolver ${NGINX_LOCAL_RESOLVERS} valid=10s`
  (the entrypoint's `15-local-resolvers.envsh`, enabled by `NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1`, fills it from
  `/etc/resolv.conf`, i.e. Docker's DNS) so a re-created backend container with a new IP is found again and
  nginx starts even if the backend name is not resolvable yet; an unreachable backend yields **502** (AC-06).
  Without a URI part in `proxy_pass`, the original request URI (path + query) is forwarded unchanged.
- **Routes** (location precedence matters and is part of the decision):

  | Location | Behaviour |
  |---|---|
  | `= /healthz` | `200 ok` (container healthcheck; nginx only — NFR-07) |
  | `^~ /api/` | proxied; method, path, query, body, `Content-Type`, status and error bodies pass through (`proxy_intercept_errors off`) |
  | `= /actuator/health` | proxied (readiness/diagnostics) |
  | `^~ /actuator/` | **404** — nothing else under `/actuator` is exposed through the frontend (Q-05: `info` is checked on the backend port) |
  | `^~ /assets/` | `try_files $uri =404`; `Cache-Control: public, max-age=31536000, immutable` |
  | `~ \.[^/]+$` (any other path whose last segment has an extension) | `try_files $uri =404` (missing files → 404, never `index.html`); `no-cache` |
  | `= /index.html` | `Cache-Control: no-cache` |
  | `/` | `try_files $uri /index.html` — SPA fallback (deep links, refresh, `/?status=DONE&page=2`) |

- **Forwarded headers:** `Host $http_host` (keeps the client's host **and port**, e.g. `localhost:3000`),
  `X-Forwarded-For/Proto/Host`. The backend builds `Location` with `ServletUriComponentsBuilder.fromCurrentRequest()`,
  which uses the `Host` header, so `Location` is `http://localhost:3000/api/tasks/{id}` through the proxy and
  `http://localhost:8080/…` directly. **`server.forward-headers-strategy` stays unset** (A-09 confirmed): it is
  not needed for correct `Location` URLs, and enabling it would make the backend trust `X-Forwarded-*` from any
  client that can reach port 8080 directly. The UI does not use `Location` anyway (it reads the body).
- **Headers** (NFR-12): `server_tokens off`; on every response `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and
  `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`
  (the Vite build has no inline scripts/styles — checked on the current `dist/index.html`); headers live in one
  snippet `security-headers.conf` included at server level **and** in every location that sets its own
  `add_header` (nginx does not inherit `add_header` into such locations). `gzip` for text assets.
- **Same-origin API base (A-02, AC-17):** the image is built with `VITE_API_BASE_URL=/`. In
  `src/api/config.ts`, `/` (any value that is only slashes) normalises to `''` = **same-origin**; `buildUrl`
  resolves `API_BASE_URL + path` against `window.location.origin`, so requests go to `<page origin>/api/…`.
  Unset/blank keeps the default `http://localhost:8080`; absolute URLs and trailing-slash trimming are
  unchanged (SCRUM-1-AC-13). `VITE_API_BASE_URL` stays the mechanism for dev mode and non-proxied hosting.
- **CORS stays** on the backend with default `http://localhost:5173` for dev mode (Vite dev server → published
  backend port, AC-12/AC-21); the composed stack itself needs no CORS.

## Consequences

- One frontend image runs on any host/port; changing where the API lives is a container env var, not a rebuild.
- Deep links and refresh work; asset caching is safe because `index.html` is always revalidated.
- The proxy is part of the system under test: AC-19 (HTTP smoke) pins fallback, 404s, cache headers, security
  headers, error pass-through and `Location`.
- Two images to build and run instead of one; nginx config is code reviewed and linted only by running it
  (the e2e job is its test).
- Resolver behaviour depends on the nginx entrypoint helper; fallback if it ever misbehaves: a static
  `proxy_pass` to an `upstream` (resolved once at start) — documented in the design risks.
- SCRUM-1 Q-02 is closed; ADR 0005's "deferred to SCRUM-7" note is answered here.
