import { Page, Route } from '@playwright/test'
import { test, expect } from './coverage'

// The admin's page (docs/app-api.md, "Admin") against a stand-in for the API that keeps a list of people
// and refuses to leave the pool with no admin. Synthetic people only.

const API = 'https://api.example.invalid'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PUT' }

interface Person { username: string, name: string, email: string, groups: string[], status: 'invited' | 'active' | 'disabled' }
interface Store { people: Person[], writes: string[], bodies: unknown[], resendMissing?: boolean }

const person = (username: string, name: string, groups: string[], status: Person['status'] = 'active'): Person =>
  ({ username, name, email: `${username}@example.invalid`, groups, status })

async function signedInAs(page: Page, groups: string[]) {
  const b64url = (text: string) => Buffer.from(text).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const idToken = `${b64url('{}')}.${b64url(JSON.stringify({ exp, email: 'qz@example.invalid', 'cognito:groups': groups }))}.sig`
  await page.addInitScript(session => window.sessionStorage.setItem('midst-app-session', session),
    JSON.stringify({ idToken, expiresAt: exp * 1000, email: 'qz@example.invalid', groups }))
}

async function standIn(page: Page, baseURL: string, store: Store) {
  const activeAdmins = () => store.people.filter(p => p.groups.includes('admin') && p.status !== 'disabled').length
  await page.route('**/*', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === new URL(baseURL).origin) return route.continue()
    if (url.origin !== API) return route.abort()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const reply = (status: number, body: unknown) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
    if (request.method() === 'GET' && url.pathname === '/admin/users') return reply(200, { users: store.people })
    store.writes.push(`${request.method()} ${url.pathname}`)
    const body = request.postData() ? request.postDataJSON() as { name?: string, email?: string, groups?: string[] } : {}
    store.bodies.push(body)
    const lastAdmin = () => reply(409, { error: 'last_admin', message: 'Zq is the last admin; make someone else an admin first.' })
    if (request.method() === 'POST' && url.pathname === '/admin/users') {
      const created = person(`new${store.people.length}`, body.name!, body.groups!, 'invited')
      created.email = body.email!
      store.people.push(created)
      return reply(200, created)
    }
    const [, , , username, action] = url.pathname.split('/')
    const target = store.people.find(p => p.username === decodeURIComponent(username))!
    if (action === 'groups') {
      if (target.groups.includes('admin') && !body.groups!.includes('admin') && activeAdmins() === 1) return lastAdmin()
      target.groups = body.groups!
    } else if (action === 'disable') {
      if (target.groups.includes('admin') && activeAdmins() === 1) return lastAdmin()
      target.status = 'disabled'
    } else if (action === 'enable') {
      target.status = 'active'
    } else if (action === 'resend') {
      // A deployed API without the route: API Gateway's own 404, not the API's error shape (#241).
      if (store.resendMissing) return reply(404, { message: 'Not Found' })
      if (target.status !== 'invited') return reply(409, { error: 'already_signed_in', message: 'Zq has already chosen a password.' })
    }
    return reply(200, target)
  })
}

const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name })

test('invite someone and see them listed as invited', async ({ page, baseURL }) => {
  const store: Store = { people: [person('a1', 'Qz Vb', ['admin'])], writes: [], bodies: [] }
  await signedInAs(page, ['admin'])
  await standIn(page, baseURL!, store)
  await page.goto('/admin')
  await expect(row(page, 'Qz Vb')).toContainText('active')
  const form = page.getByRole('form', { name: 'Invite someone' })
  await form.getByLabel('Name').fill('Zq Xv')
  await form.getByLabel('Email to invite').fill('zq@example.invalid')
  await page.getByRole('group', { name: 'Groups for the invitation' }).getByLabel('publisher').check()
  await page.getByRole('button', { name: 'Invite' }).click()
  await expect(page.getByRole('status')).toContainText('Invited zq@example.invalid')
  await expect(row(page, 'zq@example.invalid')).toContainText('Zq Xv')
  await expect(row(page, 'zq@example.invalid')).toContainText('invited')
  expect(store.writes).toEqual(['POST /admin/users'])
  expect(store.bodies).toEqual([{ name: 'Zq Xv', email: 'zq@example.invalid', groups: ['poet', 'publisher'] }])
})

test('resend the invitation to an invited admin; nobody who has signed in, or is disabled, is offered it', async ({ page, baseURL }) => {
  const store: Store = {
    people: [person('a1', 'Qz Vb', ['admin']), person('b2', 'Zq Xv', ['admin'], 'invited'), person('c3', 'Vb Qz', ['publisher'], 'disabled')],
    writes: [],
    bodies: [],
  }
  await signedInAs(page, ['admin'])
  await standIn(page, baseURL!, store)
  await page.goto('/admin')
  await expect(row(page, 'Zq Xv')).toContainText('invited')
  await expect(row(page, 'Qz Vb').getByRole('button', { name: 'Resend invitation' })).toHaveCount(0)
  await expect(row(page, 'Vb Qz').getByRole('button', { name: 'Resend invitation' })).toHaveCount(0)
  await row(page, 'Zq Xv').getByRole('button', { name: 'Resend invitation' }).click()
  // In the row, beside the button, where the admin is looking (#241).
  await expect(row(page, 'Zq Xv').getByRole('status')).toHaveText('Sent the invitation to Zq Xv again.')
  await expect(page.getByRole('status')).toHaveCount(1)
  expect(store.writes).toEqual(['POST /admin/users/b2/resend'])
})

test('a resend the API cannot do says so in the row, with the status (#241)', async ({ page, baseURL }) => {
  const store: Store = {
    people: [person('a1', 'Qz Vb', ['admin']), person('b2', 'Zq Xv', ['admin'], 'invited')], writes: [], bodies: [], resendMissing: true,
  }
  await signedInAs(page, ['admin'])
  await standIn(page, baseURL!, store)
  await page.goto('/admin')
  await row(page, 'Zq Xv').getByRole('button', { name: 'Resend invitation' }).click()
  await expect(row(page, 'Zq Xv').getByRole('alert')).toHaveText('Something went wrong on our side. Please try again. (HTTP 404)')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(1)
})

test('change a person’s groups', async ({ page, baseURL }) => {
  const store: Store = { people: [person('a1', 'Qz Vb', ['admin']), person('b2', 'Zq Xv', ['poet'])], writes: [], bodies: [] }
  await signedInAs(page, ['admin'])
  await standIn(page, baseURL!, store)
  await page.goto('/admin')
  await expect(row(page, 'Zq Xv').getByRole('button', { name: 'Save groups' })).toBeDisabled()
  await row(page, 'Zq Xv').getByLabel('publisher').check()
  await row(page, 'Zq Xv').getByRole('button', { name: 'Save groups' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved the groups of Zq Xv.')
  expect(store.writes).toEqual(['PUT /admin/users/b2/groups'])
  expect(store.people[1].groups).toEqual(['poet', 'publisher'])
  await expect(row(page, 'Zq Xv').getByLabel('publisher')).toBeChecked()
})

for (const size of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`each group checkbox stays on one line with its word (${size.name}, #253)`, async ({ page, baseURL }) => {
    await page.setViewportSize(size)
    const store: Store = { people: [person('a1', 'Qz Vb', ['admin']), person('b2', 'Zq Xv', ['poet'])], writes: [], bodies: [] }
    await signedInAs(page, ['admin'])
    await standIn(page, baseURL!, store)
    await page.goto('/admin')
    if (size.width < 600) await page.locator('.window-size-popup').click()
    await expect(row(page, 'Zq Xv')).toContainText('active')
    const boxes = page.locator('[role="group"] label:has(input[type="checkbox"])')
    expect(await boxes.count()).toBeGreaterThan(0)
    // A label on one line is no taller than its box; one that wraps between the box and its word is about twice.
    const broken = await boxes.evaluateAll(labels => labels.filter(label => {
      const box = label.querySelector('input')!.getBoundingClientRect()
      const r = label.getBoundingClientRect()
      return label.getClientRects().length > 1 || r.height > box.height * 1.6
    }).map(label => label.textContent))
    expect(broken).toEqual([])
  })
}

test('disable then enable', async ({ page, baseURL }) => {
  const store: Store = { people: [person('a1', 'Qz Vb', ['admin']), person('b2', 'Zq Xv', ['poet'])], writes: [], bodies: [] }
  await signedInAs(page, ['admin'])
  await standIn(page, baseURL!, store)
  await page.goto('/admin')
  await row(page, 'Zq Xv').getByRole('button', { name: 'Disable' }).click()
  await expect(page.getByRole('status')).toHaveText('Disabled Zq Xv.')
  await expect(row(page, 'Zq Xv')).toContainText('disabled')
  await row(page, 'Zq Xv').getByRole('button', { name: 'Enable' }).click()
  await expect(page.getByRole('status')).toHaveText('Enabled Zq Xv.')
  await expect(row(page, 'Zq Xv')).toContainText('active')
  expect(store.writes).toEqual(['POST /admin/users/b2/disable', 'POST /admin/users/b2/enable'])
})

test('last_admin is shown in the API’s words and the list is reloaded', async ({ page, baseURL }) => {
  const store: Store = { people: [person('a1', 'Qz Vb', ['admin']), person('b2', 'Zq Xv', ['poet'])], writes: [], bodies: [] }
  await signedInAs(page, ['admin'])
  await standIn(page, baseURL!, store)
  await page.goto('/admin')
  await expect(row(page, 'Zq Xv')).toContainText('active')
  // Someone else is added in the meantime; only a reload shows it.
  store.people.push(person('c3', 'Vb Qz', ['poet']))
  await row(page, 'Qz Vb').getByRole('button', { name: 'Disable' }).click()
  // In the row whose button was refused, not above the invite form (#253).
  await expect(row(page, 'Qz Vb').getByRole('alert')).toHaveText('Zq is the last admin; make someone else an admin first.')
  await expect(row(page, 'Vb Qz')).toBeVisible()
  await expect(row(page, 'Qz Vb')).toContainText('active')
  // The same refusal for taking away the admin group.
  await row(page, 'Qz Vb').getByLabel('admin').uncheck()
  await row(page, 'Qz Vb').getByRole('button', { name: 'Save groups' }).click()
  await expect(row(page, 'Qz Vb').getByRole('alert')).toHaveText('Zq is the last admin; make someone else an admin first.')
  await expect(row(page, 'Qz Vb').getByLabel('admin')).toBeChecked()
})

test('someone who is not an admin is told so, and nothing is asked for', async ({ page, baseURL }) => {
  const store: Store = { people: [], writes: [], bodies: [] }
  let asked = false
  await signedInAs(page, ['poet', 'publisher'])
  await standIn(page, baseURL!, store)
  page.on('request', request => { if (request.url().startsWith(API)) asked = true })
  await page.goto('/admin')
  await expect(page.getByText('Your account cannot administer.')).toBeVisible()
  expect(asked).toBe(false)
})

test('a 401 forgets the session and offers sign-in again', async ({ page }) => {
  await signedInAs(page, ['admin'])
  await page.route('https://api.example.invalid/**', route => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: '{"message":"Unauthorized"}' }))
  await page.goto('/admin')
  await expect(page.getByRole('alert')).toHaveText('Please sign in again.')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})
