/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// SCRUM-1-NFR-09: build identity (Jira key, git commit, branch, build time); SCRUM-8: + version.
function git(args: string): string | undefined {
  try {
    const out = execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return out || undefined
  } catch {
    return undefined
  }
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => v !== undefined && v.trim() !== '')
}

// ADR 0008: CI derives JIRA_KEY from the branch (identity job); local builds without it say UNKNOWN.
const jira = firstNonEmpty(process.env.JIRA_KEY) ?? 'UNKNOWN'
const commit = firstNonEmpty(process.env.GITHUB_SHA, git('rev-parse HEAD')) ?? 'unknown'
const branch =
  firstNonEmpty(
    process.env.GITHUB_HEAD_REF,
    process.env.GITHUB_REF_NAME,
    git('rev-parse --abbrev-ref HEAD'),
  ) ?? 'unknown'
// SCRUM-8-AC-04 (ADR 0013): product/build version from CI (APP_VERSION); local builds say 0.0.0-SNAPSHOT.
const version = firstNonEmpty(process.env.APP_VERSION) ?? '0.0.0-SNAPSHOT'
// SCRUM-8-NFR-03: reproducible bundles — the Release workflow sets SOURCE_DATE_EPOCH to the commit time.
const epoch = process.env.SOURCE_DATE_EPOCH
const builtAt =
  epoch && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000).toISOString() : new Date().toISOString()

function buildInfo(): Plugin {
  return {
    name: 'todo-build-info',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { name: 'build-info', content: `${jira} ${commit} ${version}` },
          injectTo: 'head',
        },
      ]
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: `${JSON.stringify({ jira, commit, branch, version, builtAt }, null, 2)}\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), buildInfo()],
  define: {
    __JIRA_KEY__: JSON.stringify(jira),
    __GIT_SHA__: JSON.stringify(commit),
  },
  // SCRUM-1-AC-14: the backend's default CORS origin is http://localhost:5173 — fail rather than drift to 5174.
  // No proxy (A-02): the browser calls VITE_API_BASE_URL cross-origin.
  server: { port: 5173, strictPort: true },
  preview: { port: 4173 },
  build: { sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: './reports/junit.xml' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './reports/coverage',
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
  },
})
