/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// SCRUM-1-NFR-09: build identity (Jira key, git commit, branch, build time).
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

const jira = firstNonEmpty(process.env.JIRA_KEY) ?? 'SCRUM-1'
const commit = firstNonEmpty(process.env.GITHUB_SHA, git('rev-parse HEAD')) ?? 'unknown'
const branch =
  firstNonEmpty(
    process.env.GITHUB_HEAD_REF,
    process.env.GITHUB_REF_NAME,
    git('rev-parse --abbrev-ref HEAD'),
  ) ?? 'unknown'
const builtAt = new Date().toISOString()

function buildInfo(): Plugin {
  return {
    name: 'todo-build-info',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { name: 'build-info', content: `${jira} ${commit}` },
          injectTo: 'head',
        },
      ]
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: `${JSON.stringify({ jira, commit, branch, builtAt }, null, 2)}\n`,
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
