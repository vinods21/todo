// SCRUM-7 / ADR 0012: shared fixtures — API set-up client, browser-error guard, unique test data.
import { randomUUID } from 'node:crypto'
import { test as base, expect, type APIRequestContext } from '@playwright/test'
import { authHeader, clientToken } from './auth'
import { env } from './env'

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'

export interface Task {
  id: number
  title: string
  description: string | null
  status: TaskStatus
  createdAt: string
  dueDate: string | null
}

export interface TaskInput {
  title: string
  description?: string | null
  status?: TaskStatus
  dueDate?: string | null
}

/** ADR 0003: the exact top-level keys of every API error body. */
export const API_ERROR_KEYS = ['error', 'fieldErrors', 'message', 'path', 'status', 'timestamp']

const runId = randomUUID().slice(0, 8)
let counter = 0

/** NFR-09 / AC-18: unique per run and call, so tests are independent of pre-existing data. */
export function uniqueTitle(label: string): string {
  counter += 1
  return `e2e ${label} ${runId}-${counter}`
}

/**
 * API set-up/inspection client (compose: through the nginx proxy; dev: straight to the backend). SCRUM-13: every call
 * carries a `todo-e2e` service-account token (client credentials).
 */
export class TasksApi {
  constructor(private readonly request: APIRequestContext) {}

  async create(body: TaskInput): Promise<Task> {
    const response = await this.request.post(`${env.apiURL}/api/tasks`, { data: body, headers: await authHeader() })
    expect(response.status(), await response.text()).toBe(201)
    return (await response.json()) as Task
  }

  async setStatus(id: number, status: TaskStatus): Promise<Task> {
    const response = await this.request.patch(`${env.apiURL}/api/tasks/${id}/status`, {
      data: { status },
      headers: await authHeader(),
    })
    expect(response.status(), await response.text()).toBe(200)
    return (await response.json()) as Task
  }

  async get(id: number): Promise<Task> {
    const response = await this.request.get(`${env.apiURL}/api/tasks/${id}`, { headers: await authHeader() })
    expect(response.status(), await response.text()).toBe(200)
    return (await response.json()) as Task
  }

  async remove(id: number): Promise<void> {
    const response = await this.request.delete(`${env.apiURL}/api/tasks/${id}`, { headers: await authHeader() })
    expect([204, 404]).toContain(response.status())
  }

  async total(): Promise<number> {
    const response = await this.request.get(`${env.apiURL}/api/tasks?size=1`, { headers: await authHeader() })
    expect(response.status(), await response.text()).toBe(200)
    return ((await response.json()) as { totalElements: number }).totalElements
  }
}

export interface BuildIdentity {
  jira: string
  commit: string
  /** SCRUM-8-AC-04, AC-27: product/build version (ADR 0013). */
  version: string
}

/** CI passes the identity of the build under test; locally it is whatever /build-info.json of the frontend says. */
export async function expectedIdentity(request: APIRequestContext): Promise<BuildIdentity> {
  if (env.expectedJiraKey && env.expectedSha && env.expectedVersion) {
    return { jira: env.expectedJiraKey, commit: env.expectedSha, version: env.expectedVersion }
  }
  const response = await request.get(`${env.baseURL}/build-info.json`)
  expect(response.status()).toBe(200)
  const info = (await response.json()) as BuildIdentity
  return {
    jira: env.expectedJiraKey ?? info.jira,
    commit: env.expectedSha ?? info.commit,
    version: env.expectedVersion ?? info.version,
  }
}

// Chrome logs its own line for every deliberately provoked 4xx (e.g. the validation test, /favicon.ico).
const IGNORED_CONSOLE_ERRORS = [/Failed to load resource: the server responded with a status of 4\d\d/]

interface Fixtures {
  api: TasksApi
  browserErrors: string[]
}

/**
 * SCRUM-13 (design §10.1): project `http` — the built-in `request` fixture carries a `todo-e2e` bearer token on every
 * request (static files ignore it), so the existing HTTP smoke tests keep their assertions. Anonymous checks create
 * their own context (`playwright.request.newContext()`).
 */
export const apiTest = base.extend({
  request: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${await clientToken()}` },
    })
    await use(context)
    await context.dispose()
  },
})

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new TasksApi(request))
  },
  // Uncaught page errors and console errors (CSP violations included) fail the test (ADR 0012).
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() !== 'error') return
        const text = message.text()
        if (IGNORED_CONSOLE_ERRORS.some((pattern) => pattern.test(text))) return
        errors.push(`console: ${text}`)
      })
      await use(errors)
      expect(errors, 'browser errors during the test').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
