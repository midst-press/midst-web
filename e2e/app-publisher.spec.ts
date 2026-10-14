import { Page, Route } from '@playwright/test'
import { test, expect } from './coverage'

// The publisher's page (docs/app-api.md, "Publisher"; #12, #110) against a stand-in for the API that
// keeps a published list and its ETag, and answers 409 when a change carries a stale one. Synthetic
// poems and people only.

const API = 'https://api.example.invalid'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PUT' }

const poem = (n: number) => ({ poemId: `id-${n}`, title: `Zq ${n}`, author: `Qz ${n}`, timelapseKey: `poems/id-${n}/t`, processNoteKey: null, publishDate: null as string | null, highlighted: false })

interface Store { etag: number, published: ReturnType<typeof poem>[], unpublished: ReturnType<typeof poem>[], writes: string[] }

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
    const body = request.postDataJSON() as { poemId?: string, poemIds?: string[], listEtag: string, publishDate?: string | null, highlighted?: boolean }
    store.writes.push(`${request.method()} ${url.pathname}`)
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
