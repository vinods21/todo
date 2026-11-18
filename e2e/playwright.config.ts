// SCRUM-7-AC-18..AC-21, SCRUM-7-NFR-09 — ADR 0012. E2E_MODE=compose (default) | dev.
import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'
import { env } from './tests/support/env'

const CI = !!process.env.CI
const reportDir = `reports/${env.mode}`
const chromium = { ...devices['Desktop Chrome'], locale: 'en-US', timezoneId: 'UTC' }

const composeProjects: PlaywrightTestConfig['projects'] = [
  // Runs first (every other project depends on it): needs an empty database (A-08).
  { name: 'empty-state', testMatch: /empty-state\.spec\.ts$/, use: chromium },
  { name: 'http', testMatch: /\.http\.spec\.ts$/, dependencies: ['empty-state'] },
  { name: 'ui', testMatch: /ui\/.*\.spec\.ts$/, dependencies: ['empty-state'], use: chromium },
]
// AC-21: SCRUM-1-AC-14 automated — Vite dev server on 5173 → backend on 8080, cross-origin (CORS default).
const devProjects: PlaywrightTestConfig['projects'] = [
  { name: 'dev-smoke', testMatch: /ui\/.*\.spec\.ts$/, grep: /@dev-smoke/, use: chromium },
]

export default defineConfig({
  testDir: './tests',
  outputDir: `${reportDir}/test-results`,
  fullyParallel: false,
  workers: 1, // "newest first" assertions on a shared list (ADR 0012)
  retries: CI ? 1 : 0, // NFR-09: at most one; flaky tests listed in the run summary
  forbidOnly: CI,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: `${reportDir}/html`, open: 'never' }],
    ['junit', { outputFile: `${reportDir}/junit.xml` }],
    ['json', { outputFile: `${reportDir}/results.json` }],
  ],
  use: {
    baseURL: env.baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  metadata: { ...env },
  projects: env.mode === 'dev' ? devProjects : composeProjects,
  webServer:
    env.mode === 'dev'
      ? {
          command: 'npm --prefix ../frontend run dev', // VITE_API_BASE_URL unset → http://localhost:8080
          url: 'http://localhost:5173',
          reuseExistingServer: !CI,
          timeout: 120_000,
          stdout: 'pipe',
        }
      : undefined,
})
