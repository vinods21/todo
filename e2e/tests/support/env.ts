// SCRUM-7 / ADR 0012: one place for the e2e environment (config + fixtures).
const mode: 'compose' | 'dev' = process.env.E2E_MODE === 'dev' ? 'dev' : 'compose'
const backendURL = process.env.E2E_BACKEND_URL ?? 'http://localhost:8080'
const baseURL = process.env.E2E_BASE_URL ?? (mode === 'dev' ? 'http://localhost:5173' : 'http://localhost:3000')

export const env = {
  mode,
  baseURL,
  backendURL,
  /** API set-up: through the nginx proxy (compose) or straight to the backend (dev — no proxy on 5173). */
  apiURL: process.env.E2E_API_URL ?? (mode === 'dev' ? backendURL : baseURL),
  /** CI sets these to the identity of the build under test; locally they are read from /build-info.json. */
  expectedJiraKey: process.env.E2E_JIRA_KEY,
  expectedSha: process.env.E2E_GIT_SHA,
  /** SCRUM-8-AC-04: CI sets the build version the images were stamped with. */
  expectedVersion: process.env.E2E_VERSION,
  expectEmptyDb: process.env.E2E_EXPECT_EMPTY_DB === '1',
  /** SCRUM-13 (ADR 0018 §1): public Keycloak URL = the issuer host the backend validates. */
  authURL: process.env.E2E_AUTH_URL ?? 'http://localhost:8180',
  realm: process.env.E2E_AUTH_REALM ?? 'todo',
  /** SCRUM-13: backend clock skew in seconds (CI sets TODO_AUTH_CLOCK_SKEW=5s and this to 5; default as Compose). */
  clockSkewSeconds: Number(process.env.E2E_AUTH_CLOCK_SKEW_SECONDS ?? '30'),
} as const

/**
 * SCRUM-13 (ADR 0019): LOCAL DEVELOPMENT ONLY credentials from keycloak/realms/*.json — the same values the README
 * documents. Service-account clients for API set-up/scripts; mock IdP users for the brokered browser logins.
 */
export const credentials = {
  e2eClient: {
    id: process.env.E2E_CLIENT_ID ?? 'todo-e2e',
    secret: process.env.E2E_CLIENT_SECRET ?? 'dev-only-todo-e2e-secret',
  },
  /** 5-second access tokens (expiry tests). */
  shortClient: {
    id: process.env.E2E_SHORT_CLIENT_ID ?? 'todo-e2e-short',
    secret: process.env.E2E_SHORT_CLIENT_SECRET ?? 'dev-only-todo-e2e-short-secret',
  },
  users: {
    alice: { username: 'alice', password: 'alice-dev-only', email: 'alice@corp.example', roles: ['todo-user'] },
    bob: { username: 'bob', password: 'bob-dev-only', email: 'bob@corp.example', roles: ['todo-admin', 'todo-user'] },
    carol: { username: 'carol', password: 'carol-dev-only', email: 'carol@corp.example', roles: [] as string[] },
  },
} as const

export type TestUser = (typeof credentials.users)[keyof typeof credentials.users]

/** storageState of alice's brokered login (project `setup`); git-ignored, never under reports/ (not uploaded). */
export const ALICE_STATE = '.auth/alice.json'
