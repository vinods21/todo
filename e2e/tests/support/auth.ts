// SCRUM-13 (design §10.1): tokens for API set-up (client credentials) and the brokered browser login (Corp SSO).
import { expect, type Page } from '@playwright/test'
import { credentials, env, type TestUser } from './env'

export const issuer = `${env.authURL}/realms/${env.realm}`
export const tokenEndpoint = `${issuer}/protocol/openid-connect/token`

export interface TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

/** Payload of a JWT (no verification — the backend verifies). */
export function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('not a JWT')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
}

/** Client-credentials grant (service accounts todo-e2e / todo-e2e-short — LOCAL DEVELOPMENT ONLY secrets). */
export async function clientCredentials(kind: 'e2e' | 'short' = 'e2e'): Promise<TokenResponse> {
  const client = kind === 'short' ? credentials.shortClient : credentials.e2eClient
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: client.id, client_secret: client.secret }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`client_credentials for ${client.id}: HTTP ${response.status} ${text}`)
  return JSON.parse(text) as TokenResponse
}

let cached: { token: string; refreshAt: number } | undefined

/** A `todo-e2e` access token, cached until 30 s before it expires. */
export async function clientToken(): Promise<string> {
  if (cached && Date.now() < cached.refreshAt) return cached.token
  const response = await clientCredentials('e2e')
  cached = { token: response.access_token, refreshAt: Date.now() + (response.expires_in - 30) * 1000 }
  return response.access_token
}

/** Authorization header for API set-up calls. */
export async function authHeader(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await clientToken()}` }
}

/** The application realm's login page (Keycloak, not the app). */
export async function expectAppRealmLogin(page: Page): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`^${issuer}/`))
  await expect(page.getByRole('link', { name: 'Corp SSO' })).toBeVisible()
}

/** The mock enterprise IdP's login form (realm mock-idp). */
export async function expectMockIdpForm(page: Page): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`^${env.authURL}/realms/mock-idp/`))
  await expect(page.getByLabel(/username/i)).toBeVisible()
}

/**
 * SCRUM-13-AC-06, AC-07: on the application realm's login page choose "Corp SSO", sign in at the mock IdP, and land
 * back in the app (first broker login creates the user without an extra page).
 */
export async function loginViaCorpSso(page: Page, user: TestUser): Promise<void> {
  await expectAppRealmLogin(page)
  await page.getByRole('link', { name: 'Corp SSO' }).click()
  await expectMockIdpForm(page)
  await page.getByLabel(/username/i).fill(user.username)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => url.origin === new URL(env.baseURL).origin && !url.pathname.startsWith('/oidc/'))
}

/** No JSON Web Token (they all start with "eyJ") in localStorage or sessionStorage of the app origin. */
export async function webStorageTokens(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = []
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i) ?? ''
        const value = storage.getItem(key) ?? ''
        if (/eyJ[A-Za-z0-9_-]+\.eyJ/.test(value)) found.push(key)
      }
    }
    return found
  })
}
