import { InMemoryWebStorage, UserManager, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts'
import type { AuthConfig } from './config'

// SCRUM-13 (ADR 0018 §2, design §7.3): Authorization Code + PKCE (S256, the library default) against the Keycloak
// realm; tokens in memory only.

export const CALLBACK_PATH = '/oidc/callback'
export const SIGNED_OUT_PATH = '/signed-out'

export function userManagerSettings(config: AuthConfig, origin: string = window.location.origin): UserManagerSettings {
  return {
    authority: `${config.url}/realms/${config.realm}`,
    client_id: config.clientId,
    redirect_uri: `${origin}${CALLBACK_PATH}`,
    post_logout_redirect_uri: `${origin}${SIGNED_OUT_PATH}`,
    response_type: 'code',
    scope: 'openid', // profile and email are default client scopes of the Keycloak client
    // SCRUM-13-AC-10: access, refresh and ID token live only in JS memory (never localStorage/sessionStorage/cookies).
    userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
    // Only the transient state + PKCE verifier survive the redirect to Keycloak; the callback removes them.
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    // SCRUM-13-AC-13: renew 60 s before expiry with the refresh-token grant — no iframe (strict CSP, no frame-src).
    automaticSilentRenew: true,
    accessTokenExpiringNotificationTimeInSeconds: 60,
    monitorSession: false, // no check_session iframe
    loadUserInfo: false, // claims come from GET /api/me
  }
}

export function createUserManager(config: AuthConfig): UserManager {
  return new UserManager(userManagerSettings(config))
}
