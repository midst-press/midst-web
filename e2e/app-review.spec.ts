import { Page, Route } from '@playwright/test'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { test, expect } from './coverage'

// The publisher's review page (docs/app-api.md, "Review"; #110) against a stand-in for the API that keeps
// the submissions, and for the host the pre-signed review copy is fetched from. Synthetic poems, files and
// people only. The review copy is one of the synthetic timelapses tools/make-e2e-fixtures.mjs writes.

const API = 'https://api.example.invalid'
const FILES = 'https://files.example.invalid'
const ZIP_JS = 'https://d3nlqr52a31o6y.cloudfront.net/midst-press/site/scripts/zip.js'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PUT' }
const TYPED = 'the quick brown fox'

async function signedInAs(page: Page, groups: string[]) {
  const b64url = (text: string) => Buffer.from(text).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const idToken = `${b64url('{}')}.${b64url(JSON.stringify({ exp, email: 'qz@example.invalid', 'cognito:groups': groups }))}.sig`
  await page.addInitScript(session => window.sessionStorage.setItem('midst-app-session', session),
    JSON.stringify({ idToken, expiresAt: exp * 1000, email: 'qz@example.invalid', groups }))
}

// Any one synthetic .midst.zip the fixture step wrote; the web server has made them before a test runs.
function fixtureZip(): Buffer {
  const find = (dir: string): string | undefined => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) { const found = find(path); if (found) return found } else if (entry.name.endsWith('.midst.zip')) return path
    }
  }
  const path = find(join(__dirname, 'fixtures', 'poems'))
  if (!path) throw new Error('no synthetic .midst.zip under e2e/fixtures/poems')
  return readFileSync(path)
}

interface Submission { submissionId: string, title: string, author: string, poet: string | null, origin: 'archive' | 'upload', submittedAt: string | null, status: string, note: string | null, recordedBy?: string }
interface Store { submissions: Submission[], decisions: unknown[], failNext?: boolean, expired?: boolean, unauthorised?: boolean, listReads: number, listFailsAfterDecision?: boolean }

const submission = (n: number, over: Partial<Submission> = {}): Submission =>
  ({ submissionId: `sub-${n}`, title: `Zq ${n}`, author: `Qz ${n}`, poet: `qz${n}@example.invalid`, origin: 'upload', submittedAt: `2026-10-0${n}T09:00:00Z`, status: 'received', note: null, ...over })

async function standIn(page: Page, baseURL: string, store: Store) {
  await page.route('**/*', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === new URL(baseURL).origin) return route.continue()
    if (request.url() === ZIP_JS) return route.fulfill({ path: join(__dirname, '..', 'static/static/scripts/zip.js'), contentType: 'application/javascript' })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const reply = (status: number, body: unknown) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.origin === FILES) {
      if (store.expired) return route.fulfill({ status: 403, headers: cors, contentType: 'application/xml', body: '<Error>Request has expired</Error>' })
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/zip', body: fixtureZip() })
    }
    if (url.origin !== API) return route.abort()
    if (store.unauthorised) return route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: JSON.stringify({ message: 'Unauthorized' }) })
    if (request.method() === 'GET' && url.pathname === '/review/submissions') {
      if (store.listFailsAfterDecision && store.decisions.length > 0) return reply(503, { message: 'Service Unavailable' })
      store.listReads += 1
      return reply(200, { submissions: store.submissions })
    }
    const timelapse = /^\/review\/submissions\/([^/]+)\/timelapse$/.exec(url.pathname)
    if (request.method() === 'GET' && timelapse) return reply(200, { url: `${FILES}/review/${timelapse[1]}/timelapse.midst.zip`, expiresAt: 'x' })
    const decision = /^\/review\/submissions\/([^/]+)\/decision$/.exec(url.pathname)
    if (request.method() === 'POST' && decision) {
      if (store.failNext) {
        store.failNext = false
        return reply(409, { error: 'conflict', message: 'Zq was already decided.' })
      }
      const body = request.postDataJSON() as { decision: string, note: string }
      store.decisions.push({ id: decision[1], ...body })
      const target = store.submissions.find(s => s.submissionId === decision[1])!
      Object.assign(target, { status: body.decision === 'accept' ? 'accepted' : 'declined', note: body.note || null })
      return reply(200, target)
    }
    return reply(404, { error: 'not_found', message: 'There is nothing here.' })
  })
}

const row = (page: Page, title: string) => page.getByRole('list', { name: 'Submissions' }).getByRole('listitem').filter({ hasText: title })

test('the list shows each submission, newest first, with poet, date, status and note', async ({ page, baseURL }) => {
  const store: Store = { submissions: [submission(2), submission(1, { status: 'declined', note: 'Zq note' })], decisions: [], listReads: 0 }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/review')
  const items = page.getByRole('list', { name: 'Submissions' }).getByRole('listitem')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText('Zq 2')
  await expect(items.first()).toContainText('by Qz 2')
  await expect(items.first()).toContainText('qz2@example.invalid')
  await expect(items.first()).toContainText('Received, waiting to be read')
  await expect(items.last()).toContainText('Not taken this time: Zq note')
})

test('a decided submission offers no decision, and an unfinished upload offers nothing to play', async ({ page, baseURL }) => {
  const store: Store = { submissions: [submission(3, { status: 'uploading' }), submission(2, { status: 'accepted' }), submission(1)], decisions: [], listReads: 0 }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/review')
  await expect(row(page, 'Zq 1').getByRole('button', { name: 'Accept Zq 1' })).toBeVisible()
  await expect(row(page, 'Zq 2').getByRole('button', { name: /Accept|Decline/ })).toHaveCount(0)
  await expect(row(page, 'Zq 2').getByRole('button', { name: 'Play Zq 2' })).toBeVisible()
  await expect(row(page, 'Zq 3').getByRole('button')).toHaveCount(0)
})

test('an archive record says it is from the archive, with no date, no stray comma, and nothing to play or decide', async ({ page, baseURL }) => {
  const archive = submission(2, { origin: 'archive', poet: null, submittedAt: null, status: 'accepted' })
  const store: Store = { submissions: [submission(1), archive], decisions: [], listReads: 0 }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/review')
  const archived = row(page, 'Zq 2')
  await expect(archived).toContainText('from the archive')
  await expect(archived).not.toContainText('1970')
  await expect(archived).not.toContainText(', ,')
  await expect(archived.getByRole('button', { name: /Play/ })).toHaveCount(0)
  await expect(archived.getByRole('button', { name: /Accept|Decline/ })).toHaveCount(0)
  const uploaded = row(page, 'Zq 1')
  await expect(uploaded).toContainText('qz1@example.invalid')
  await expect(uploaded).toContainText(/2026/)
  await expect(uploaded).not.toContainText('from the archive')
  await expect(uploaded.getByRole('button', { name: 'Play Zq 1' })).toBeVisible()
})

test('a saved decision whose list reload fails is still shown as saved, and offers no second decision', async ({ page, baseURL }) => {
  const store: Store = { submissions: [submission(1)], decisions: [], listReads: 0, listFailsAfterDecision: true }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/review')
  await page.getByRole('button', { name: 'Accept Zq 1' }).click()
  await expect(page.getByRole('status')).toContainText('Accepted “Zq 1”')
  await expect(page.getByRole('alert')).toHaveText('The decision was saved, but the list could not be refreshed. Reload the page to see it.')
  await expect(row(page, 'Zq 1').getByRole('button', { name: /Accept|Decline/ })).toHaveCount(0)
})

test('accepting with a note, then declining, each saves and reloads the list', async ({ page, baseURL }) => {
  const store: Store = { submissions: [submission(2), submission(1)], decisions: [], listReads: 0 }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/review')
  await expect(row(page, 'Zq 2')).toBeVisible()
  expect(store.listReads).toBe(1)

  await page.getByLabel('Note on Zq 2').fill('Zq welcome')
  await page.getByRole('button', { name: 'Accept Zq 2' }).click()
  await expect(page.getByRole('status')).toContainText('Accepted “Zq 2”')
  await expect(row(page, 'Zq 2')).toContainText('Accepted: Zq welcome')
  expect(store.listReads).toBe(2)

  await page.getByRole('button', { name: 'Decline Zq 1' }).click()
  await expect(page.getByRole('status')).toContainText('Declined “Zq 1”')
  await expect(row(page, 'Zq 1')).toContainText('Not taken this time')
  expect(store.listReads).toBe(3)
  expect(store.decisions).toEqual([{ id: 'sub-2', decision: 'accept', note: 'Zq welcome' }, { id: 'sub-1', decision: 'decline', note: '' }])
})

test('an error from the API is shown in its words, and nothing is claimed saved', async ({ page, baseURL }) => {
  const store: Store = { submissions: [submission(1)], decisions: [], failNext: true, listReads: 0 }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/review')
  await page.getByRole('button', { name: 'Accept Zq 1' }).click()
  await expect(page.getByRole('alert')).toHaveText('Zq was already decided.')
  await expect(page.getByRole('status')).toHaveCount(0)
  expect(store.decisions).toEqual([])
})

test('someone who is not a publisher is told so, and nothing is asked for', async ({ page, baseURL }) => {
  let asked = false
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, { submissions: [], decisions: [], listReads: 0 })
  page.on('request', request => { if (request.url().startsWith(API)) asked = true })
  await page.goto('/review')
  await expect(page.getByText('Your account cannot review submissions.')).toBeVisible()
  expect(asked).toBe(false)
})

test('a 401 forgets the session and offers Sign in', async ({ page, baseURL }) => {
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, { submissions: [], decisions: [], unauthorised: true, listReads: 0 })
  await page.goto('/review')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Please sign in again.')
})

test('Play fetches the review copy and shows the player; Close removes it', async ({ page, baseURL }) => {
  const store: Store = { submissions: [submission(1)], decisions: [], listReads: 0 }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/review')
  await page.getByRole('button', { name: 'Play Zq 1' }).click()
  const editor = page.getByRole('dialog', { name: 'Playing Zq 1' }).locator('.editor')
  await expect(editor).toBeVisible()
  await expect(editor).toContainText(TYPED)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(editor).toHaveCount(0)
})

test('Play with an expired link says so in words, and shows no player', async ({ page, baseURL }) => {
  const store: Store = { submissions: [submission(1)], decisions: [], expired: true, listReads: 0 }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/review')
  await page.getByRole('button', { name: 'Play Zq 1' }).click()
  await expect(page.getByRole('alert')).toContainText('may have expired')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
