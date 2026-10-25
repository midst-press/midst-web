/*
 * Sign-in for the beta app: Cognito's managed login, authorisation code with PKCE (RFC 7636), no
 * client secret and no library. Tokens live in sessionStorage, so a reload keeps you signed in and
 * closing the tab signs you out; never in localStorage (docs/app-api.md).
 *
 * Everything the browser provides (storage, fetch, randomness, hashing) is passed in, so the flow is
 * tested without a browser.
 */
import { isSitePath } from '../sitePath'

export interface AuthSettings {
  domain: string // the managed login domain, no trailing slash
  clientId: string
  origin: string // this site's origin; /signed-in on it is the registered callback
}

export interface AuthDeps {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  fetch: typeof fetch
  randomBytes: (length: number) => Uint8Array
  // An ArrayBuffer-backed array, as crypto.subtle.digest requires (TypeScript 6's DOM types say so).
  sha256: (data: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>
  now: () => number // milliseconds
}

export interface Session {
  idToken: string
  expiresAt: number // milliseconds
  email: string
  groups: string[]
}

export class SignInError extends Error {}

const PENDING = 'midst-app-sign-in' // { state, verifier, returnTo } while the managed login is open
const SESSION = 'midst-app-session'

export const CALLBACK_PATH = '/signed-in'
// What the site client allows (midst-infra beta/app.yaml); asking for more is refused with invalid_scope.
export const SCOPES = 'openid email'

export function base64url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function challengeFor(verifier: string, deps: Pick<AuthDeps, 'sha256'>): Promise<string> {
  const ascii = new Uint8Array(Array.from(verifier, ch => ch.charCodeAt(0)))
  return base64url(new Uint8Array(await deps.sha256(ascii)))
}

/** The claims of a JWT, read without checking its signature: for display and expiry only. The API checks it. */
export function claimsOf(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) throw new SignInError('The sign-in token could not be read.')
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4)
  const json = decodeURIComponent(Array.from(atob(base64), ch => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''))
  return JSON.parse(json)
}

/** Where to send the browser to sign in. Remembers where to come back to. */
export const signInUrl = (settings: AuthSettings, deps: AuthDeps, returnTo: string): Promise<string> =>
  managedLoginUrl('/oauth2/authorize', settings, deps, returnTo)

/** Where to send the browser to reset a forgotten password (#243): the managed login's reset page, which takes "the
 *  same parameters as /oauth2/authorize" (AWS, managed login endpoints). After the reset it asks the person to sign in,
 *  and that sign-in comes back here like any other. */
export const forgotPasswordUrl = (settings: AuthSettings, deps: AuthDeps, returnTo: string): Promise<string> =>
  managedLoginUrl('/forgotPassword', settings, deps, returnTo)

async function managedLoginUrl(path: string, settings: AuthSettings, deps: AuthDeps, returnTo: string): Promise<string> {
  const state = base64url(deps.randomBytes(16))
  const verifier = base64url(deps.randomBytes(48))
  deps.storage.setItem(PENDING, JSON.stringify({ state, verifier, returnTo }))
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: settings.clientId,
    redirect_uri: settings.origin + CALLBACK_PATH,
    scope: SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier, deps),
  })
  return `${settings.domain}${path}?${query}`
}

/**
 * Finish sign-in on the callback page: check the state, trade the code for tokens, keep the session.
 * Returns the path to go on to. Throws SignInError with a sentence a person can read.
 */
export async function completeSignIn(settings: AuthSettings, deps: AuthDeps, search: string): Promise<string> {
  const params = new URLSearchParams(search)
  const raw = deps.storage.getItem(PENDING)
  deps.storage.removeItem(PENDING)
  if (params.get('error')) throw new SignInError('Sign-in was not completed. Please try again.')
  const pending = raw ? JSON.parse(raw) as { state: string, verifier: string, returnTo: string } : null
  const code = params.get('code')
  if (!pending || !code || params.get('state') !== pending.state) {
    throw new SignInError('This sign-in did not start here, or has already been used. Please sign in again.')
  }
  const response = await deps.fetch(`${settings.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: settings.clientId,
      code,
      redirect_uri: settings.origin + CALLBACK_PATH,
      code_verifier: pending.verifier,
    }).toString(),
  })
  if (!response.ok) throw new SignInError('Sign-in could not be completed. Please sign in again.')
  const tokens = await response.json() as { id_token?: string }
  if (!tokens.id_token) throw new SignInError('Sign-in could not be completed. Please sign in again.')
  const claims = claimsOf(tokens.id_token)
  const session: Session = {
    idToken: tokens.id_token,
    expiresAt: Number(claims.exp) * 1000,
    email: typeof claims.email === 'string' ? claims.email : '',
    groups: Array.isArray(claims['cognito:groups']) ? claims['cognito:groups'] as string[] : [],
  }
  deps.storage.setItem(SESSION, JSON.stringify(session))
  // Only a path on this site: a returnTo that names another origin would make this an open redirect.
  return isSitePath(pending.returnTo) ? pending.returnTo : '/me'
}

/** The current session, or null when there is none or it has expired. */
export function currentSession(deps: Pick<AuthDeps, 'storage' | 'now'>): Session | null {
  const raw = deps.storage.getItem(SESSION)
  if (!raw) return null
  const session = JSON.parse(raw) as Session
  if (!(session.expiresAt > deps.now())) {
    deps.storage.removeItem(SESSION)
    return null
  }
  return session
}

/** Forget the session here only: for a 401, which means the token is no longer accepted (docs/app-api.md). */
export function forgetSession(deps: Pick<AuthDeps, 'storage'>): void {
  deps.storage.removeItem(SESSION)
}

/** Forget the session here, and return the managed login's sign-out address so its own session ends too. */
export function signOut(settings: AuthSettings, deps: Pick<AuthDeps, 'storage'>): string {
  deps.storage.removeItem(SESSION)
  deps.storage.removeItem(PENDING)
  const query = new URLSearchParams({ client_id: settings.clientId, logout_uri: settings.origin + '/' })
  return `${settings.domain}/logout?${query}`
}
