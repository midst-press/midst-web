import { Page, Route } from '@playwright/test'
import { test, expect } from './coverage'

// The publisher's page (docs/app-api.md, "Publisher"; #12, #110) against a stand-in for the API that
// keeps a published list and its ETag, and answers 409 when a change carries a stale one. Synthetic
// poems and people only.

const API = 'https://api.example.invalid'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PUT' }

const poem = (n: number) => ({ poemId: `id-${n}`, title: `Zq ${n}`, author: `Qz ${n}`, timelapseKey: `poems/id-${n}/t`, processNoteKey: null, publishDate: null as string | null, highlighted: false })

interface Person { username: string, name: string, email: string, groups: string[], status: string }
interface Store { etag: number, published: ReturnType<typeof poem>[], unpublished: ReturnType<typeof poem>[], writes: string[], failNext?: boolean, poets?: Person[] }

async function signedInAs(page: Page, groups: string[]) {
  const b64url = (text: string) => Buffer.from(text).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const idToken = `${b64url('{}')}.${b64url(JSON.stringify({ exp, email: 'qz@example.invalid', 'cognito:groups': groups }))}.sig`
  await page.addInitScript(session => window.sessionStorage.setItem('midst-app-session', session),
    JSON.stringify({ idToken, expiresAt: exp * 1000, email: 'qz@example.invalid', groups }))
}

async function standIn(page: Page, baseURL: string, store: Store) {
  const list = () => ({ listEtag: `e${store.etag}`, published: store.published, unpublished: store.unpublished })
  await page.route('**/*', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === new URL(baseURL).origin) return route.continue()
    if (url.origin !== API) return route.abort()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const reply = (status: number, body: unknown) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
    if (request.method() === 'GET' && url.pathname === '/publisher/poems') return reply(200, list())
    // The poet routes (docs/app-api.md, "Poets").
    const poets = store.poets ?? (store.poets = [])
    if (request.method() === 'GET' && url.pathname === '/publisher/poets') return reply(200, { poets })
    if (url.pathname.startsWith('/publisher/poets')) {
      store.writes.push(`${request.method()} ${url.pathname}`)
      if (url.pathname === '/publisher/poets') {
        const { name, email } = request.postDataJSON()
        if (poets.some(p => p.email === email)) return reply(409, { error: 'already_registered', message: 'Zq already has an account.' })
        const person = { username: `u-${poets.length + 1}`, name, email, groups: ['poet'], status: 'invited' }
        poets.push(person)
        return reply(200, person)
      }
      const [, , , username, action] = url.pathname.split('/')
      const person = poets.find(p => p.username === decodeURIComponent(username))!
      if (action === 'resend' && person.status !== 'invited') return reply(409, { error: 'already_signed_in', message: 'Zq has already signed in.' })
      if (action === 'disable') person.status = 'disabled'
      return reply(200, person)
    }
    const body = request.postDataJSON() as { poemId?: string, poemIds?: string[], listEtag: string, publishDate?: string | null, highlighted?: boolean }
    store.writes.push(`${request.method()} ${url.pathname}`)
    if (store.failNext) {
      store.failNext = false
      return reply(500, { error: 'server', message: 'Zq went wrong.' })
    }
    if (body.listEtag !== `e${store.etag}`) {
      return reply(409, { error: 'conflict', message: 'The published list changed since you loaded it.', listEtag: `e${store.etag}` })
    }
    store.etag += 1
    if (url.pathname === '/publisher/publish') {
      store.published.push(store.unpublished.find(p => p.poemId === body.poemId)!)
      store.unpublished = store.unpublished.filter(p => p.poemId !== body.poemId)
    } else if (url.pathname === '/publisher/unpublish') {
      store.unpublished.unshift(store.published.find(p => p.poemId === body.poemId)!)
      store.published = store.published.filter(p => p.poemId !== body.poemId)
    } else if (url.pathname === '/publisher/order') {
      store.published = body.poemIds!.map(id => store.published.find(p => p.poemId === id)!)
    } else if (url.pathname.startsWith('/publisher/poems/')) {
      const target = store.published.find(p => p.poemId === decodeURIComponent(url.pathname.split('/').pop()!))!
      Object.assign(target, { publishDate: body.publishDate, highlighted: body.highlighted })
    }
    return reply(200, { listEtag: `e${store.etag}`, published: store.published })
  })
}

const published = (page: Page) => page.getByRole('list', { name: 'Published poems' }).locator('strong')

test('publish, reorder, highlight and unpublish, each saved to the list', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1), poem(2)], unpublished: [poem(3)], writes: [] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await expect(published(page)).toHaveText(['Zq 1', 'Zq 2'])

  await page.getByRole('list', { name: 'Poems not published' }).getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('status')).toHaveText('Published Zq 3.')
  await expect(published(page)).toHaveText(['Zq 1', 'Zq 2', 'Zq 3'])
  await expect(page.getByText('There is nothing waiting to be published.')).toBeVisible()

  await page.getByRole('button', { name: 'Move Zq 3 up' }).click()
  await page.getByRole('button', { name: 'Move Zq 1 down' }).click()
  await expect(published(page)).toHaveText(['Zq 3', 'Zq 1', 'Zq 2'])
  expect(store.writes).toEqual(['POST /publisher/publish']) // reordering is local until saved
  await page.getByRole('button', { name: 'Save order' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved the new order.')
  expect(store.published.map(p => p.title)).toEqual(['Zq 3', 'Zq 1', 'Zq 2'])

  await page.getByRole('listitem').filter({ hasText: 'Zq 2' }).getByLabel('Highlighted').click()
  await expect(page.getByRole('status')).toHaveText('Highlighted Zq 2.')
  expect(store.published.find(p => p.poemId === 'id-2')!.highlighted).toBe(true)

  await page.getByRole('listitem').filter({ hasText: 'Zq 1' }).getByRole('button', { name: 'Unpublish' }).click()
  await expect(page.getByRole('status')).toHaveText('Unpublished Zq 1.')
  await expect(page.getByRole('list', { name: 'Poems not published' })).toContainText('Zq 1')
})

test('a change made with a stale list is refused, the list reloaded and the publisher told', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1)], unpublished: [poem(2)], writes: [] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await expect(published(page)).toHaveText(['Zq 1'])
  // Someone else publishes in the meantime.
  store.etag = 7
  store.published.push(store.unpublished.pop()!)
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await expect(page.getByRole('alert')).toContainText('Someone else changed the published list')
  await expect(published(page)).toHaveText(['Zq 1', 'Zq 2'])
})

test('a date that fails to save does not stay in the field: it shows what the server holds', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [{ ...poem(1), publishDate: '2026-01-02' }], unpublished: [], writes: [] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  const date = page.getByLabel('Publish date of Zq 1')
  await expect(date).toHaveValue('2026-01-02')
  // Someone else sets another date first, so this save carries a stale list and is refused.
  store.etag = 9
  store.published[0].publishDate = '2026-03-04'
  await date.fill('2026-05-06')
  await date.blur()
  await expect(page.getByRole('alert')).toContainText('Someone else changed the published list')
  await expect(page.getByLabel('Publish date of Zq 1')).toHaveValue('2026-03-04')
})

test('a date that fails to save for another reason is not left in the field either', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [{ ...poem(1), publishDate: '2026-01-02' }], unpublished: [], writes: [] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  store.failNext = true
  const date = page.getByLabel('Publish date of Zq 1')
  await date.fill('2026-05-06')
  await date.blur()
  await expect(page.getByRole('alert')).toHaveText('Zq went wrong.')
  await expect(page.getByLabel('Publish date of Zq 1')).toHaveValue('2026-01-02')
})

test('a 401 forgets the session and offers sign-in again', async ({ page, baseURL }) => {
  await signedInAs(page, ['publisher'])
  await page.route('https://api.example.invalid/**', route => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: '{"message":"Unauthorized"}' }))
  await page.goto('/publisher')
  await expect(page.getByRole('alert')).toHaveText('Please sign in again.')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('the publisher registers a poet, resends the invitation and disables them; never a password', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [], unpublished: [], writes: [], poets: [] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  const form = page.getByRole('form', { name: 'Register a poet' })
  await expect(form.locator('input[type=password]')).toHaveCount(0)
  await form.getByLabel('Name').fill('Qz Vb')
  await form.getByLabel('Email').fill('qz@example.invalid')
  await form.getByRole('button', { name: 'Register poet' }).click()
  await expect(page.getByRole('status')).toContainText('Registered Qz Vb.')
  const poets = page.getByRole('list', { name: 'Registered poets' })
  await expect(poets).toContainText('Invited, has not signed in yet')
  await expect(form.getByLabel('Email')).toHaveValue('')

  await poets.getByRole('button', { name: 'Resend invitation' }).click()
  await expect(page.getByRole('status')).toHaveText('Sent the invitation to Qz Vb again.')
  await poets.getByRole('button', { name: 'Disable' }).click()
  await expect(poets).toContainText('Disabled')
  await expect(poets.getByRole('button')).toHaveCount(0)
  expect(store.writes).toEqual(['POST /publisher/poets', 'POST /publisher/poets/u-1/resend', 'POST /publisher/poets/u-1/disable'])
})

test('registering an email that already has an account says so and keeps what was typed', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [], unpublished: [], writes: [],
    poets: [{ username: 'u-1', name: 'Qz', email: 'qz@example.invalid', groups: ['poet'], status: 'active' }] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  const form = page.getByRole('form', { name: 'Register a poet' })
  await form.getByLabel('Name').fill('Qz again')
  await form.getByLabel('Email').fill('qz@example.invalid')
  await form.getByRole('button', { name: 'Register poet' }).click()
  await expect(page.getByRole('alert')).toHaveText('Zq already has an account.')
  await expect(form.getByLabel('Email')).toHaveValue('qz@example.invalid')
  // A poet who has signed in has no invitation to resend.
  await expect(page.getByRole('list', { name: 'Registered poets' }).getByRole('button', { name: 'Resend invitation' })).toHaveCount(0)
})

test('Undo changes puts back the saved order, and nothing is written', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1), poem(2)], unpublished: [], writes: [] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await page.getByRole('button', { name: 'Move Zq 2 up' }).click()
  await expect(published(page)).toHaveText(['Zq 2', 'Zq 1'])
  await expect(page.getByRole('button', { name: 'Unpublish' }).first()).toBeDisabled()
  await page.getByRole('button', { name: 'Undo changes' }).click()
  await expect(published(page)).toHaveText(['Zq 1', 'Zq 2'])
  expect(store.writes).toEqual([])
})

test('someone who is not a publisher is told so, and the list is not asked for', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [], unpublished: [], writes: [] }
  let asked = false
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, store)
  page.on('request', request => { if (request.url().startsWith(API)) asked = true })
  await page.goto('/publisher')
  await expect(page.getByText('Your account cannot publish.')).toBeVisible()
  expect(asked).toBe(false)
})
