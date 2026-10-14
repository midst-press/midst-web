import { Page, Route } from '@playwright/test'
import { test, expect } from './coverage'

// The poet's page (docs/app-api.md, "Poet"; #110) against stand-ins for the API and for the bucket the
// file is uploaded to. Synthetic poems, files and people only.

const API = 'https://api.example.invalid'
const UPLOAD = 'https://upload.example.invalid'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PUT' }

async function signedInAs(page: Page, groups: string[]) {
  const b64url = (text: string) => Buffer.from(text).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const idToken = `${b64url('{}')}.${b64url(JSON.stringify({ exp, email: 'qz@example.invalid', 'cognito:groups': groups }))}.sig`
  await page.addInitScript(session => window.sessionStorage.setItem('midst-app-session', session),
    JSON.stringify({ idToken, expiresAt: exp * 1000, email: 'qz@example.invalid', groups }))
}

interface Store { submissions: { submissionId: string, title: string, author: string, submittedAt: string, status: string, note: string | null }[], uploaded: string[], uploadFails?: boolean }

async function standIn(page: Page, baseURL: string, store: Store) {
  await page.route('**/*', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === new URL(baseURL).origin) return route.continue()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, PUT' } })
    const reply = (status: number, body: unknown) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.origin === UPLOAD) {
      if (store.uploadFails) return route.fulfill({ status: 403, headers: cors, body: '' })
      store.uploaded.push(`${url.pathname} ${request.headers()['content-type']} ${request.postDataBuffer()?.toString()}`)
      return route.fulfill({ status: 200, headers: cors, body: '' })
    }
    if (url.origin !== API) return route.abort()
    if (request.method() === 'GET' && url.pathname === '/submissions/mine') return reply(200, { submissions: store.submissions })
    if (request.method() === 'POST' && url.pathname === '/submissions') {
      const body = request.postDataJSON()
      store.submissions.unshift({ submissionId: 'sub-9', title: body.title, author: body.author, submittedAt: '2026-10-15T09:30:00Z', status: 'uploading', note: null })
      return reply(200, { submissionId: 'sub-9', uploadUrl: `${UPLOAD}/submissions/sub-9/zq.midst`, uploadHeaders: { 'Content-Type': 'application/octet-stream' }, expiresAt: 'x' })
    }
    if (request.method() === 'POST' && url.pathname === '/submissions/sub-9/complete') {
      store.submissions[0].status = 'received'
      return reply(200, store.submissions[0])
    }
    return reply(404, { error: 'not_found', message: 'There is nothing here.' })
  })
}

const midstFile = { name: 'zq.midst', mimeType: 'application/octet-stream', buffer: Buffer.from('zq synthetic') }

test('a poet sends a .midst file, is thanked, and sees it received', async ({ page, baseURL }) => {
  const store: Store = { submissions: [{ submissionId: 'sub-1', title: 'Xv', author: 'Qz', submittedAt: '2026-10-01T09:00:00Z', status: 'declined', note: 'Zq note' }], uploaded: [] }
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, store)
  await page.goto('/submit')
  await expect(page.getByRole('list', { name: 'Your submissions' })).toContainText('Not taken this time: Zq note')
  await page.getByLabel('Title').fill('Zq vb')
  await page.getByLabel('Your name as it should appear').fill('Qz')
  await page.getByLabel('The poem, as a Midst file (.midst)').setInputFiles(midstFile)
  await page.getByRole('button', { name: 'Submit poem' }).click()
  await expect(page.getByRole('status')).toContainText('We have received “Zq vb”')
  expect(store.uploaded).toEqual(['/submissions/sub-9/zq.midst application/octet-stream zq synthetic'])
  await expect(page.getByRole('list', { name: 'Your submissions' }).getByRole('listitem').first()).toContainText('Received, waiting to be read')
  await expect(page.getByLabel('Title')).toHaveValue('')
})

test('a file that is not .midst is refused before anything is sent', async ({ page, baseURL }) => {
  const store: Store = { submissions: [], uploaded: [] }
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, store)
  await page.goto('/submit')
  await page.getByLabel('Title').fill('Zq')
  await page.getByLabel('Your name as it should appear').fill('Qz')
  await page.getByLabel('The poem, as a Midst file (.midst)').setInputFiles({ ...midstFile, name: 'zq.txt' })
  await page.getByRole('button', { name: 'Submit poem' }).click()
  await expect(page.getByRole('alert')).toContainText('ends in .midst')
  expect(store.submissions).toEqual([])
})

test('an upload that fails is said, and the submission is not completed', async ({ page, baseURL }) => {
  const store: Store = { submissions: [], uploaded: [], uploadFails: true }
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, store)
  await page.goto('/submit')
  await page.getByLabel('Title').fill('Zq')
  await page.getByLabel('Your name as it should appear').fill('Qz')
  await page.getByLabel('The poem, as a Midst file (.midst)').setInputFiles(midstFile)
  await page.getByRole('button', { name: 'Submit poem' }).click()
  await expect(page.getByRole('alert')).toContainText('could not be uploaded')
  expect(store.submissions[0].status).toBe('uploading')
})

test('someone who is not a poet is told so, and nothing is asked for', async ({ page, baseURL }) => {
  let asked = false
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, { submissions: [], uploaded: [] })
  page.on('request', request => { if (request.url().startsWith(API)) asked = true })
  await page.goto('/submit')
  await expect(page.getByText('Your account cannot submit poems.')).toBeVisible()
  expect(asked).toBe(false)
})
