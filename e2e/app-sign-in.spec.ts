import { Page, Route } from '@playwright/test'
import { test, expect } from './coverage'

// Sign-in to the beta app and the /me page (docs/app-api.md, #110). Cognito's managed login and the
// app's API are both stood in for here: the e2e build points MIDST_APP_AUTH_DOMAIN and MIDST_APP_API_URL
// at .invalid hosts, and these routes answer for them. Synthetic people only.

const AUTH = 'https://auth.example.invalid'
const API = 'https://api.example.invalid'

const b64url = (text: string) => Buffer.from(text).toString('base64url')
const idToken = (claims: Record<string, unknown>) => `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify(claims))}.sig`

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PUT' }

async function standIns(page: Page, baseURL: string, me: { status: number, body: unknown }) {
  const seen = { token: [] as URLSearchParams[], api: [] as string[], managedLogin: [] as string[] }
  await page.route('**/*', (route: Route) => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL).origin) return route.continue()
    // The reset page (#243) stands in as reset-then-sign-in: like Cognito's, it asks for sign-in once the password is
    // reset, and that sign-in goes back with a code for the state it was given.
    if (url.origin === AUTH && (url.pathname === '/oauth2/authorize' || url.pathname === '/forgotPassword')) {
      seen.managedLogin.push(url.pathname)
      // The managed login signs the person in and sends the browser back with a code.
      const back = new URL(url.searchParams.get('redirect_uri')!)
      back.searchParams.set('code', 'zqcode')
      back.searchParams.set('state', url.searchParams.get('state')!)
      return route.fulfill({ status: 302, headers: { Location: back.toString() } })
    }
    if (url.origin === AUTH && url.pathname === '/oauth2/token') {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
      seen.token.push(new URLSearchParams(route.request().postData() ?? ''))
      const token = idToken({ exp: Math.floor(Date.now() / 1000) + 3600, email: 'qz@example.invalid', 'cognito:groups': ['publisher'] })
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ id_token: token }) })
    }
    if (url.origin === AUTH && url.pathname === '/logout') {
      return route.fulfill({ status: 302, headers: { Location: url.searchParams.get('logout_uri')! } })
    }
    if (url.origin === API) {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
      seen.api.push(`${route.request().headers().authorization ?? ''} ${url.pathname}`)
      return route.fulfill({ status: me.status, headers: cors, contentType: 'application/json', body: JSON.stringify(me.body) })
    }
    return route.abort()
  })
  return seen
}

test('signing in on /me comes back to /me showing who you are and your roles', async ({ page, baseURL }) => {
  const seen = await standIns(page, baseURL!, { status: 200, body: { username: 'u1', email: 'qz@example.invalid', groups: ['publisher'] } })
  await page.goto('/me')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByText('You are signed in as qz@example.invalid.')).toBeVisible()
  await expect(page.getByText('Your roles: publisher.')).toBeVisible()
  // The code went back with a verifier, and the API was called with the ID token.
  expect(seen.token).toHaveLength(1)
  expect(seen.token[0].get('code')).toBe('zqcode')
  expect(seen.token[0].get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43,}$/)
  expect(seen.api).toEqual([expect.stringMatching(/^Bearer [^ ]+\.[^ ]+\.sig \/me$/)])
  // Nothing of the session is kept in localStorage.
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0)
})

test('the forgotten-password link sits beside Sign in, and the reset comes back to /me signed in (#243)', async ({ page, baseURL }) => {
  const seen = await standIns(page, baseURL!, { status: 200, body: { username: 'u1', email: 'qz@example.invalid', groups: ['publisher'] } })
  await page.goto('/me')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('If you have never signed in, a reset will not work: ask for your invitation to be sent again.')).toBeVisible()
  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await expect(page.getByText('You are signed in as qz@example.invalid.')).toBeVisible()
  await expect(page).toHaveURL(/\/me$/)
  expect(seen.managedLogin).toEqual(['/forgotPassword'])
  expect(seen.token[0].get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43,}$/)
  // Signed in, neither the link nor its note is offered.
  await expect(page.getByRole('link', { name: 'Forgot your password?' })).toHaveCount(0)
  await expect(page.getByText('If you have never signed in')).toHaveCount(0)
})

test('signing out forgets the session', async ({ page, baseURL }) => {
  await standIns(page, baseURL!, { status: 200, body: { username: 'u1', email: 'qz@example.invalid', groups: [] } })
  await page.goto('/me')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('You have no roles yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.goto('/me')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('an error from the API is shown in its own words', async ({ page, baseURL }) => {
  await standIns(page, baseURL!, { status: 403, body: { error: 'forbidden', message: 'Zq is not allowed here.' } })
  await page.goto('/me')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Zq is not allowed here.')
})

test('a 401 from the API gateway forgets the session and offers sign-in again', async ({ page, baseURL }) => {
  await standIns(page, baseURL!, { status: 401, body: { message: 'Unauthorized' } })
  await page.goto('/me')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Please sign in again.')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  expect(await page.evaluate(() => window.sessionStorage.getItem('midst-app-session'))).toBeNull()
})

test('a callback nobody started is refused, and no session is kept', async ({ page, baseURL }) => {
  await standIns(page, baseURL!, { status: 200, body: {} })
  await page.goto('/signed-in?code=zq&state=forged')
  await expect(page.getByRole('alert')).toContainText('did not start here')
  expect(await page.evaluate(() => window.sessionStorage.length)).toBe(0)
})
