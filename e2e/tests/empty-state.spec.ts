// SCRUM-7-AC-18 (items 1 and 5, empty parts) — project `empty-state`, which every other compose project depends on.
// Needs an empty database (A-08): skipped with a reason on a used database, but a failure when E2E_EXPECT_EMPTY_DB=1
// (CI, fresh volume).
import { env } from './support/env'
import { expect, test, uniqueTitle } from './support/fixtures'

test('SCRUM-7-AC-18: on an empty database the list shows its empty states and fills once a task is created', async ({
  page,
  api,
}) => {
  const total = await api.total()
  if (env.expectEmptyDb) {
    expect(total, 'E2E_EXPECT_EMPTY_DB=1 but the database already has tasks').toBe(0)
  }
  test.skip(total > 0, `database is not empty (${total} tasks) — empty states need a fresh volume (A-08)`)

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible()
  await expect(page.getByText('No tasks yet.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create your first task' })).toBeVisible()

  // AC-18.5: filter-aware empty state and "Show all tasks".
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('DONE')
  await expect(page).toHaveURL(/[?&]status=DONE(&|$)/)
  await expect(page.getByText('No tasks with status Done.')).toBeVisible()
  await page.getByRole('link', { name: 'Show all tasks' }).click()
  await expect(page).toHaveURL(new RegExp(`^${env.baseURL}/$`))
  await expect(page.getByText('No tasks yet.')).toBeVisible()

  // AC-18.1 populated: the first task created through the form is the only row.
  const title = uniqueTitle('first task')
  await page.getByRole('link', { name: 'Create your first task' }).click()
  await page.getByLabel('Title').fill(title)
  const created = page.waitForResponse(
    (response) => response.url().endsWith('/api/tasks') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Create task' }).click()
  expect((await created).status()).toBe(201)
  await expect(page).toHaveURL(new RegExp(`^${env.baseURL}/$`))
  const rows = page.getByRole('table', { name: 'Tasks' }).getByRole('row')
  await expect(rows).toHaveCount(2) // header + the new task
  await expect(rows.nth(1)).toContainText(title)
})
