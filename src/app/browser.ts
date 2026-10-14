// What the sign-in flow needs from a real browser (see auth.ts, which takes these as arguments).
import { AuthDeps, AuthSettings } from './auth'
import { APP_AUTH_DOMAIN, APP_CLIENT_ID } from './config'

export const browserDeps = (): AuthDeps => ({
  storage: window.sessionStorage,
  fetch: window.fetch.bind(window),
  randomBytes: (length: number) => window.crypto.getRandomValues(new Uint8Array(length)),
  sha256: (data: Uint8Array) => window.crypto.subtle.digest('SHA-256', data),
  now: () => Date.now(),
})

export const authSettings = (): AuthSettings => ({
  domain: APP_AUTH_DOMAIN,
  clientId: APP_CLIENT_ID,
  origin: window.location.origin,
})
