import { webcrypto } from 'crypto'
import { AuthDeps, AuthSettings, SignInError, base64url, challengeFor, claimsOf, completeSignIn, currentSession, forgetSession, forgotPasswordUrl, signInUrl, signOut } from '../app/auth'

// The beta app's sign-in (docs/app-api.md): authorisation code with PKCE against Cognito's managed login.

const settings: AuthSettings = { domain: 'https://auth.example.invalid', clientId: 'zqclient', origin: 'https://site.example.invalid' }

const sha256 = async (data: Uint8Array) => webcrypto.subtle.digest('SHA-256', data)

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value) },
    removeItem: (key: string) => { items.delete(key) },
  }
}

const tokenWith = (claims: Record<string, unknown>) =>
  `h.${base64url(new Uint8Array(Buffer.from(JSON.stringify(claims))))}.s`

const NOW = 1_800_000_000_000
const ID_TOKEN = tokenWith({ exp: NOW / 1000 + 3600, email: 'qz@example.invalid', 'cognito:groups': ['poet', 'publisher'] })

function deps(fetchResult: { ok: boolean, body: unknown } = { ok: true, body: { id_token: ID_TOKEN } }) {
  const storage = memoryStorage()
  const fetchFn = jest.fn(async () => ({ ok: fetchResult.ok, json: async () => fetchResult.body }))
  let counter = 0
  const d: AuthDeps = {
    storage,
    fetch: fetchFn as unknown as typeof fetch,
    randomBytes: (length: number) => new Uint8Array(length).fill(++counter),
    sha256,
    now: () => NOW,
  }
  return { d, storage, fetchFn }
}

async function startAndReturn(d: AuthDeps, returnTo = '/publisher') {
  const url = new URL(await signInUrl(settings, d, returnTo))
  return url.searchParams.get('state')!
}

describe('PKCE', () => {
  it('derives the challenge of RFC 7636 appendix B', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', { sha256 }))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('writes base64url with no padding', () => {
    expect(base64url(new Uint8Array([251, 255]))).toBe('-_8')
  })
})

describe('signInUrl', () => {
  it('asks the managed login for a code with an S256 challenge, and comes back to /signed-in', async () => {
    const { d } = deps()
    const url = new URL(await signInUrl(settings, d, '/publisher'))
    expect(url.origin + url.pathname).toBe('https://auth.example.invalid/oauth2/authorize')
    const q = url.searchParams
    expect(q.get('response_type')).toBe('code')
    expect(q.get('client_id')).toBe('zqclient')
    expect(q.get('redirect_uri')).toBe('https://site.example.invalid/signed-in')
    expect(q.get('scope')).toBe('openid email')
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(q.get('state')).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

// #243: the reset page takes the authorize endpoint's parameters, so the sign-in after a reset comes back here.
describe('forgotPasswordUrl', () => {
  it('asks the managed login\'s reset page for the same code as signing in', async () => {
    const { d } = deps()
    const reset = new URL(await forgotPasswordUrl(settings, d, '/me'))
    const signIn = new URL(await signInUrl(settings, deps().d, '/me'))
    expect(reset.origin + reset.pathname).toBe('https://auth.example.invalid/forgotPassword')
    const keys = (url: URL) => [...url.searchParams.keys()].sort()
    expect(keys(reset)).toEqual(keys(signIn))
    for (const key of ['response_type', 'client_id', 'redirect_uri', 'scope', 'code_challenge_method']) {
      expect([key, reset.searchParams.get(key)]).toEqual([key, signIn.searchParams.get(key)])
    }
  })

  it('remembers its state and verifier, so the sign-in after the reset completes', async () => {
    const { d, fetchFn } = deps()
    const reset = new URL(await forgotPasswordUrl(settings, d, '/me'))
    const state = reset.searchParams.get('state')!
    expect(await completeSignIn(settings, d, `?code=zqcode&state=${state}`)).toBe('/me')
    const sent = new URLSearchParams((fetchFn.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(await challengeFor(sent.get('code_verifier')!, { sha256 })).toBe(reset.searchParams.get('code_challenge'))
  })
})

describe('completeSignIn', () => {
  it('trades the code with the verifier, keeps the session, and goes back where the person was', async () => {
    const { d, fetchFn } = deps()
    const state = await startAndReturn(d)
    expect(await completeSignIn(settings, d, `?code=zqcode&state=${state}`)).toBe('/publisher')
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://auth.example.invalid/oauth2/token')
    const form = new URLSearchParams(init.body as string)
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('zqcode')
    expect(form.get('redirect_uri')).toBe('https://site.example.invalid/signed-in')
    expect(currentSession(d)).toEqual({ idToken: ID_TOKEN, expiresAt: NOW + 3_600_000, email: 'qz@example.invalid', groups: ['poet', 'publisher'] })
  })

  it('sends the verifier whose challenge went to the managed login', async () => {
    const { d, fetchFn } = deps()
    const url = new URL(await signInUrl(settings, d, '/me'))
    await completeSignIn(settings, d, `?code=c&state=${url.searchParams.get('state')}`)
    const form = new URLSearchParams((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(await challengeFor(form.get('code_verifier')!, { sha256 })).toBe(url.searchParams.get('code_challenge'))
  })

  it('refuses a state it did not issue, and keeps no session', async () => {
    const { d, fetchFn } = deps()
    await startAndReturn(d)
    await expect(completeSignIn(settings, d, '?code=c&state=zz')).rejects.toThrow(SignInError)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(currentSession(d)).toBeNull()
  })

  it('refuses a callback used twice', async () => {
    const { d } = deps()
    const state = await startAndReturn(d)
    await completeSignIn(settings, d, `?code=c&state=${state}`)
    await expect(completeSignIn(settings, d, `?code=c&state=${state}`)).rejects.toThrow('already been used')
  })

  it('says sign-in was not completed when the managed login returns an error', async () => {
    const { d } = deps()
    const state = await startAndReturn(d)
    await expect(completeSignIn(settings, d, `?error=access_denied&state=${state}`)).rejects.toThrow('not completed')
  })

  it('fails without a session when the token endpoint refuses', async () => {
    const { d } = deps({ ok: false, body: { error: 'invalid_grant' } })
    const state = await startAndReturn(d)
    await expect(completeSignIn(settings, d, `?code=c&state=${state}`)).rejects.toThrow(SignInError)
    expect(currentSession(d)).toBeNull()
  })

  it('goes to /me instead of following a returnTo that leaves the site', async () => {
    for (const returnTo of ['https://elsewhere.example.invalid/', '//elsewhere.example.invalid/']) {
      const { d } = deps()
      const state = await startAndReturn(d, returnTo)
      expect(await completeSignIn(settings, d, `?code=c&state=${state}`)).toBe('/me')
    }
  })
})

describe('the session', () => {
  it('is gone once it has expired', async () => {
    const { d, storage } = deps()
    const state = await startAndReturn(d)
    await completeSignIn(settings, d, `?code=c&state=${state}`)
    expect(currentSession({ storage, now: () => NOW + 3_600_000 })).toBeNull()
    expect(storage.items.size).toBe(0)
  })

  it('signing out forgets it and ends the managed login session too', async () => {
    const { d } = deps()
    const state = await startAndReturn(d)
    await completeSignIn(settings, d, `?code=c&state=${state}`)
    const url = new URL(signOut(settings, d))
    expect(url.origin + url.pathname).toBe('https://auth.example.invalid/logout')
    expect(url.searchParams.get('client_id')).toBe('zqclient')
    expect(url.searchParams.get('logout_uri')).toBe('https://site.example.invalid/')
    expect(currentSession(d)).toBeNull()
  })

  it('keeps a session whose token names no email or groups, with none', async () => {
    const { d } = deps({ ok: true, body: { id_token: tokenWith({ exp: NOW / 1000 + 60 }) } })
    const state = await startAndReturn(d)
    await completeSignIn(settings, d, `?code=c&state=${state}`)
    expect(currentSession(d)).toMatchObject({ email: '', groups: [] })
  })

  it('refuses a token it cannot read', () => {
    expect(() => claimsOf('nodots')).toThrow(SignInError)
  })

  it('refuses a callback when no sign-in was started in this tab', async () => {
    const { d } = deps()
    await expect(completeSignIn(settings, d, '?code=c&state=s')).rejects.toThrow('did not start here')
  })

  it('forgetting the session leaves the managed login alone', async () => {
    const { d } = deps()
    const state = await startAndReturn(d)
    await completeSignIn(settings, d, `?code=c&state=${state}`)
    forgetSession(d)
    expect(currentSession(d)).toBeNull()
  })

  it('reads non-ASCII claims', () => {
    expect(claimsOf(tokenWith({ name: 'Zoë' })).name).toBe('Zoë')
  })
})
