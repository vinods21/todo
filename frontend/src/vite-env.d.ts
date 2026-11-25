/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SCRUM-1-AC-13: origin of the SCRUM-2 backend, default http://localhost:8080. */
  readonly VITE_API_BASE_URL?: string
  /** SCRUM-13-AC-16: URL of a runtime auth config JSON (container image: /auth-config.json); wins over VITE_AUTH_*. */
  readonly VITE_AUTH_CONFIG_URL?: string
  /** SCRUM-13-AC-16: Keycloak base URL, default http://localhost:8180. */
  readonly VITE_AUTH_URL?: string
  /** SCRUM-13-AC-16: Keycloak realm, default todo. */
  readonly VITE_AUTH_REALM?: string
  /** SCRUM-13-AC-16: OIDC client ID, default todo-frontend. */
  readonly VITE_AUTH_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** SCRUM-1-NFR-09: Jira key embedded at build time (vite.config.ts `define`). */
declare const __JIRA_KEY__: string
/** SCRUM-1-NFR-09: git commit embedded at build time (vite.config.ts `define`). */
declare const __GIT_SHA__: string
