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
  expectEmptyDb: process.env.E2E_EXPECT_EMPTY_DB === '1',
} as const
