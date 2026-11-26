// SCRUM-13-AC-06, AC-07, AC-09, AC-12 (design §10.2): project `setup` — the one brokered login of the run (alice via
// Corp SSO). Its Keycloak SSO cookies (storageState) are reused by empty-state, ui and dev-smoke.
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { expectAppRealmLogin, loginViaCorpSso } from './support/auth'
import { ALICE_STATE, credentials, env } from './support/env'
import { expect, test } from './support/fixtures'

test('SCRUM-13-AC-06, SCRUM-13-AC-07, SCRUM-13-AC-09: alice logs in through Corp SSO and lands in the app', { tag: '@critical' }, async ({
  page,
}) => {
  const visited: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url().split('?')[0] ?? '')
  })

  await page.goto('/')
  // AC-09: no session → the application realm's login page (Authorization Code + PKCE), not the app.
  await expectAppRealmLogin(page)
  await expect(page).toHaveTitle(/To-Do \(LOCAL DEVELOPMENT ONLY\)/)
  const authRequest = new URL(page.url())
  expect(authRequest.pathname).toMatch(/\/protocol\/openid-connect\/auth$|\/login-actions\//)

  await loginViaCorpSso(page, credentials.users.alice)

  // AC-07: the first broker login created the user without showing a page (review profile / link account): after the
  // IdP form, no application-realm page was displayed — only redirects (not committed) until the app.
  await expect(page).toHaveURL(new RegExp(`^${env.baseURL}/$`))
  const afterIdp = visited.slice(visited.findIndex((url) => url.startsWith(`${env.authURL}/realms/mock-idp/`)) + 1)
  expect(afterIdp.filter((url) => url.startsWith(env.authURL)), `pages after the IdP form: ${afterIdp}`).toEqual([])
  // AC-12 (display): the header shows the signed-in user and Log out.
  const banner = page.getByRole('banner')
  await expect(banner.getByText('alice', { exact: true })).toBeVisible()
  await expect(banner.getByRole('button', { name: 'Log out' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible()

  mkdirSync(dirname(ALICE_STATE), { recursive: true })
  await page.context().storageState({ path: ALICE_STATE })
})
