// SCRUM-7-AC-18 (items 1–7) and SCRUM-7-AC-21 (@dev-smoke subset) — through the real UI, no mocks (ADR 0012).
// compose: browser → nginx (frontend container) → backend container → PostgreSQL container.
// dev:     browser → Vite dev server :5173, API cross-origin to the backend container :8080 (SCRUM-1-AC-14).
import type { Page } from '@playwright/test'
import { env } from '../support/env'
import { expect, expectedIdentity, test, uniqueTitle } from '../support/fixtures'

const listURL = new RegExp(`^${env.baseURL}/$`)

function tasksTable(page: Page) {
  return page.getByRole('table', { name: 'Tasks' })
}

/** First data row (row 0 is the header row). */
function firstRow(page: Page) {
  return tasksTable(page).getByRole('row').nth(1)
}

function apiResponse(page: Page, method: string, path: RegExp) {
  return page.waitForResponse(
    (response) => response.request().method() === method && path.test(new URL(response.url()).pathname),
  )
}

test('SCRUM-7-AC-18, SCRUM-7-AC-21: the task list loads with the tasks from the backend', { tag: '@dev-smoke' }, async ({
  page,
  api,
}) => {
  const title = uniqueTitle('listed')
  await api.create({ title })

  await page.goto('/')
  await expect(tasksTable(page)).toBeVisible()
  await expect(firstRow(page)).toContainText(title)
})

test('SCRUM-7-AC-18, SCRUM-7-AC-21: a task created via the form appears first in the list', { tag: '@dev-smoke' }, async ({
  page,
}) => {
  const title = uniqueTitle('created via form')
  await page.goto('/')
  await page.getByRole('link', { name: 'New task' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'New task' })).toBeVisible()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Description').fill('created by the e2e suite')
  await page.getByLabel('Due date').fill('2026-12-24')

  const created = apiResponse(page, 'POST', /^\/api\/tasks$/)
  await page.getByRole('button', { name: 'Create task' }).click()
  expect((await created).status()).toBe(201)

  await expect(page).toHaveURL(listURL)
  await expect(firstRow(page)).toContainText(title)
  await expect(firstRow(page)).toContainText('2026-12-24')
})

test('SCRUM-7-AC-18: editing title, description and due date is shown in the list; the edit deep link survives a reload', async ({
  page,
  api,
}) => {
  const task = await api.create({ title: uniqueTitle('to edit'), description: 'before', dueDate: '2026-12-01' })
  const newTitle = uniqueTitle('edited')

  await page.goto('/')
  await page.getByRole('link', { name: `Edit ${task.title}` }).click()
  await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}/edit$`))

  // AC-05: the deep link is served by the nginx SPA fallback (compose) on a full reload.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Edit task' })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue(task.title)
  await expect(page.getByLabel('Description')).toHaveValue('before')
  await expect(page.getByLabel('Due date')).toHaveValue('2026-12-01')

  await page.getByLabel('Title').fill(newTitle)
  await page.getByLabel('Description').fill('after')
  await page.getByLabel('Due date').fill('2027-01-15')
  const saved = apiResponse(page, 'PUT', new RegExp(`^/api/tasks/${task.id}$`))
  await page.getByRole('button', { name: 'Save changes' }).click()
  expect((await saved).status()).toBe(200)

  await expect(page).toHaveURL(listURL)
  const row = tasksTable(page).getByRole('row').filter({ hasText: newTitle })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('2027-01-15')
  await expect(tasksTable(page).getByRole('row').filter({ hasText: task.title })).toHaveCount(0)
  const stored = await api.get(task.id)
  expect(stored).toMatchObject({ title: newTitle, description: 'after', dueDate: '2027-01-15' })
})

test('SCRUM-7-AC-18, SCRUM-7-AC-21: a status changed from the list row is shown and persists after a reload', { tag: '@dev-smoke' }, async ({
  page,
  api,
}) => {
  // In dev mode this PATCH is a real cross-origin request with a browser preflight (closes the SCRUM-6 manual check).
  const task = await api.create({ title: uniqueTitle('status change') })

  await page.goto('/')
  const select = page.getByRole('combobox', { name: `Status for ${task.title}` })
  await expect(select).toHaveValue('TODO')
  const patched = apiResponse(page, 'PATCH', new RegExp(`^/api/tasks/${task.id}/status$`))
  await select.selectOption('DONE')
  expect((await patched).status()).toBe(200)
  await expect(page.getByRole('status')).toHaveText(`Status of "${task.title}" changed to Done.`)
  await expect(select).toHaveValue('DONE')

  await page.reload()
  await expect(page.getByRole('combobox', { name: `Status for ${task.title}` })).toHaveValue('DONE')
  expect((await api.get(task.id)).status).toBe('DONE')
})

test('SCRUM-7-AC-18: filtering by status shows only matching tasks, keeps ?status= in the URL and survives a refresh', async ({
  page,
  api,
}) => {
  const todo = await api.create({ title: uniqueTitle('filter todo') })
  const inProgress = await api.create({ title: uniqueTitle('filter in progress') })
  await api.setStatus(inProgress.id, 'IN_PROGRESS')

  await page.goto('/')
  await expect(tasksTable(page)).toBeVisible()
  const listed = apiResponse(page, 'GET', /^\/api\/tasks$/)
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('IN_PROGRESS')
  await listed
  await expect(page).toHaveURL(/[?&]status=IN_PROGRESS(&|$)/)

  const assertFiltered = async () => {
    await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('IN_PROGRESS')
    await expect(page.getByRole('combobox', { name: `Status for ${inProgress.title}` })).toBeVisible()
    await expect(page.getByRole('combobox', { name: `Status for ${todo.title}` })).toHaveCount(0)
    // Robust on a non-empty database: every visible row must be IN_PROGRESS.
    const rowStatuses = tasksTable(page).getByRole('combobox')
    const count = await rowStatuses.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i += 1) await expect(rowStatuses.nth(i)).toHaveValue('IN_PROGRESS')
  }

  await assertFiltered()
  await page.reload()
  await expect(page).toHaveURL(/[?&]status=IN_PROGRESS(&|$)/)
  await assertFiltered()
})

test('SCRUM-7-AC-18, SCRUM-7-AC-06: a backend validation error is shown in the form', async ({ page }) => {
  // The only interception (ADR 0012): the outgoing create request's title is rewritten to blanks to bypass the
  // client-side check; the response is the backend's real 400 ApiError through the proxy.
  await page.route('**/api/tasks', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') return route.continue()
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
    return route.continue({ postData: JSON.stringify({ ...body, title: '   ' }) })
  })

  await page.goto('/tasks/new')
  await page.getByLabel('Title').fill(uniqueTitle('valid on the client'))
  const rejected = apiResponse(page, 'POST', /^\/api\/tasks$/)
  await page.getByRole('button', { name: 'Create task' }).click()
  const response = await rejected
  expect(response.status()).toBe(400)
  expect(await response.json()).toMatchObject({ status: 400, message: 'Validation failed' })

  const title = page.getByLabel('Title')
  await expect(title).toHaveAttribute('aria-invalid', 'true')
  await expect(title).toHaveAccessibleDescription('must not be blank')
  await expect(page.getByText('Title is required.')).toHaveCount(0)
  await expect(page).toHaveURL(/\/tasks\/new$/)
})

test('SCRUM-7-AC-18: the footer shows the build identity of the build under test', async ({ page, request }) => {
  const identity = await expectedIdentity(request)
  await page.goto('/')
  await expect(page.getByRole('contentinfo')).toHaveText(`${identity.jira} · ${identity.commit.slice(0, 7)}`)
})
