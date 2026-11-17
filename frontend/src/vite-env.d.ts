/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SCRUM-1-AC-13: origin of the SCRUM-2 backend, default http://localhost:8080. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** SCRUM-1-NFR-09: Jira key embedded at build time (vite.config.ts `define`). */
declare const __JIRA_KEY__: string
/** SCRUM-1-NFR-09: git commit embedded at build time (vite.config.ts `define`). */
declare const __GIT_SHA__: string
