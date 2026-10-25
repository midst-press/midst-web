import { Page, Route } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { test, expect } from './coverage'
import { SUBMIT_TEXT, renderContent } from '../src/content'

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

interface Submission { submissionId: string, title: string, author: string, origin: 'archive' | 'upload', submittedAt: string | null, status: string, note: string | null, recordedBy?: string }
interface Store { submissions: Submission[], uploaded: string[], processNotes?: string[], uploadFails?: boolean, listFailsAfterComplete?: boolean }

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
    if (request.method() === 'GET' && url.pathname === '/submissions/mine') {
      if (store.listFailsAfterComplete && store.submissions.some(x => x.status === 'received')) return reply(503, { message: 'Service Unavailable' })
      return reply(200, { submissions: store.submissions })
    }
    if (request.method() === 'POST' && url.pathname === '/submissions') {
      const body = request.postDataJSON()
      ;(store.processNotes ??= []).push(body.processNote)
      store.submissions.unshift({ submissionId: 'sub-9', title: body.title, author: body.author, origin: 'upload', submittedAt: '2026-10-15T09:30:00Z', status: 'uploading', note: null })
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
  const store: Store = { submissions: [{ submissionId: 'sub-1', title: 'Xv', author: 'Qz', origin: 'upload', submittedAt: '2026-10-01T09:00:00Z', status: 'declined', note: 'Zq note' }], uploaded: [] }
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, store)
  await page.goto('/submit')
  await expect(page.getByRole('list', { name: 'Your submissions' })).toContainText('Not taken this time: Zq note')
  await page.getByLabel('Title').fill('Zq vb')
  await page.getByLabel('Your name as it should appear').fill('Qz')
  await page.getByLabel('Process Note', { exact: true }).fill('Zq *xv*')
  await page.getByLabel('The poem, as a Midst file (.midst)').setInputFiles(midstFile)
  await page.getByRole('button', { name: 'Submit poem' }).click()
  await expect(page.getByRole('status')).toContainText('We have received “Zq vb”')
  expect(store.uploaded).toEqual(['/submissions/sub-9/zq.midst application/octet-stream zq synthetic'])
  expect(store.processNotes).toEqual(['Zq *xv*'])
  await expect(page.getByRole('list', { name: 'Your submissions' }).getByRole('listitem').first()).toContainText('Received, waiting to be read')
  await expect(page.getByLabel('Title')).toHaveValue('')
  await expect(page.getByLabel('Process Note', { exact: true })).toHaveValue('')
})

test('the Process Note is required: with no note the form is not sent (#292)', async ({ page, baseURL }) => {
  const store: Store = { submissions: [], uploaded: [] }
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, store)
  await page.goto('/submit')
  await page.getByLabel('Title').fill('Zq')
  await page.getByLabel('Your name as it should appear').fill('Qz')
  await page.getByLabel('The poem, as a Midst file (.midst)').setInputFiles(midstFile)
  await page.getByRole('button', { name: 'Submit poem' }).click()
  await expect(page.getByLabel('Process Note', { exact: true })).toBeFocused()
  expect(store.submissions).toEqual([])
  await expect(page.getByLabel('Process Note', { exact: true })).toHaveAttribute('maxlength', '20000')
})

test('Bold, Italic and Link wrap the selection, and Preview shows the note as the poem page will (#292)', async ({ page, baseURL }) => {
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, { submissions: [], uploaded: [] })
  await page.goto('/submit')
  const box = page.getByLabel('Process Note', { exact: true })
  await box.fill('zq xv vb')
  await box.evaluate((b: HTMLTextAreaElement) => b.setSelectionRange(3, 5))
  await page.getByRole('button', { name: 'Bold' }).click()
  await expect(box).toHaveValue('zq **xv** vb')
  await expect(box).toBeFocused()
  await box.evaluate((b: HTMLTextAreaElement) => b.setSelectionRange(10, 12))
  await page.getByRole('button', { name: 'Italic' }).click()
  await expect(box).toHaveValue('zq **xv** *vb*')
  await box.evaluate((b: HTMLTextAreaElement) => b.setSelectionRange(0, 2))
  await page.getByRole('button', { name: 'Link' }).click()
  await page.keyboard.type('https://example.invalid/')
  await expect(box).toHaveValue('[zq](https://example.invalid/) **xv** *vb*')
  await box.press('End')
  await box.pressSequentially('\n\n<img src="https://example.invalid/t.png"><script>x()</script>')
  await page.getByRole('button', { name: 'Preview' }).click()
  const preview = page.getByRole('region', { name: 'Process Note preview' })
  await expect(preview.locator('strong')).toHaveText('xv')
  await expect(preview.locator('em')).toHaveText('vb')
  await expect(preview.locator('a')).toHaveAttribute('href', 'https://example.invalid/')
  await expect(preview.locator('script')).toHaveCount(0)
  await expect(preview.locator('img')).toHaveCount(0)
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(preview).toHaveCount(0)
})

test('an archive record in the poet\'s list says it is from the archive, and shows no 1970', async ({ page, baseURL }) => {
  const store: Store = { submissions: [{ submissionId: 'sub-2', title: 'Zq xv', author: 'Qz', origin: 'archive', submittedAt: null, status: 'accepted', note: null }], uploaded: [] }
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, store)
  await page.goto('/submit')
  const item = page.getByRole('list', { name: 'Your submissions' }).getByRole('listitem').filter({ hasText: 'Zq xv' })
  await expect(item).toContainText('from the archive')
  await expect(item).not.toContainText('1970')
})

test('when the poem is received but the list cannot be refreshed, it does not say the poem failed', async ({ page, baseURL }) => {
  const store: Store = { submissions: [], uploaded: [], listFailsAfterComplete: true }
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, store)
  await page.goto('/submit')
  await page.getByLabel('Title').fill('Zq')
  await page.getByLabel('Your name as it should appear').fill('Qz')
  await page.getByLabel('Process Note', { exact: true }).fill('Zq *xv*')
  await page.getByLabel('The poem, as a Midst file (.midst)').setInputFiles(midstFile)
  await page.getByRole('button', { name: 'Submit poem' }).click()
  await expect(page.getByRole('status')).toContainText('We have received')
  await expect(page.getByRole('alert')).toHaveText('Your poem was received, but the list below could not be refreshed. Reload the page to see it.')
  expect(store.submissions[0].status).toBe('received')
})

test('a file that is not .midst is refused before anything is sent', async ({ page, baseURL }) => {
  const store: Store = { submissions: [], uploaded: [] }
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, store)
  await page.goto('/submit')
  await page.getByLabel('Title').fill('Zq')
  await page.getByLabel('Your name as it should appear').fill('Qz')
  await page.getByLabel('Process Note', { exact: true }).fill('Zq *xv*')
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
  await page.getByLabel('Process Note', { exact: true }).fill('Zq *xv*')
  await page.getByLabel('The poem, as a Midst file (.midst)').setInputFiles(midstFile)
  await page.getByRole('button', { name: 'Submit poem' }).click()
  await expect(page.getByRole('alert')).toContainText('could not be uploaded')
  expect(store.submissions[0].status).toBe('uploading')
})

// #253: the portal forms, at a desktop and a phone size.
const SIZES = [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }]
const contrast = (fg: string, bg: string) => {
  const lum = (css: string) => {
    const [r, g, b] = (css.match(/\d+/g) ?? []).slice(0, 3).map(Number).map(v => v / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

for (const size of SIZES) {
  test(`the submit form has its labels above the fields, and one button style with a legible disabled state (${size.name}, #253)`, async ({ page, baseURL }) => {
    await page.setViewportSize(size)
    await signedInAs(page, ['poet'])
    await standIn(page, baseURL!, { submissions: [], uploaded: [] })
    await page.goto('/submit')
    if (size.width < 600) await page.locator('.window-size-popup').click()
    for (const name of ['Title', 'Your name as it should appear', 'The poem, as a Midst file (.midst)']) {
      const field = page.getByLabel(name)
      const label = page.locator('label', { has: field })
      const [f, l] = [(await field.boundingBox())!, (await label.boundingBox())!]
      // The field starts on its own line under the label's words, at the label's left edge.
      expect([name, f.y > l.y + 10, Math.abs(f.x - l.x) < 2]).toEqual([name, true, true])
    }
    const button = page.getByRole('button', { name: 'Submit poem' })
    await expect(button).toBeDisabled()
    const look = await button.evaluate(b => { const c = getComputedStyle(b); return { color: c.color, background: c.backgroundColor } })
    expect(look.background).toBe('rgb(255, 211, 223)')
    expect(contrast(look.color, look.background)).toBeGreaterThanOrEqual(3)
    await page.getByLabel('The poem, as a Midst file (.midst)').setInputFiles(midstFile)
    await expect(button).toHaveCSS('background-color', 'rgb(255, 145, 175)')
  })

  test(`a file problem is shown beside the file field, and a failed send beside the button (${size.name}, #253)`, async ({ page, baseURL }) => {
    await page.setViewportSize(size)
    const store: Store = { submissions: [], uploaded: [], uploadFails: true }
    await signedInAs(page, ['poet'])
    await standIn(page, baseURL!, store)
    await page.goto('/submit')
    if (size.width < 600) await page.locator('.window-size-popup').click()
    await page.getByLabel('Title').fill('Zq')
    await page.getByLabel('Your name as it should appear').fill('Qz')
  await page.getByLabel('Process Note', { exact: true }).fill('Zq *xv*')
    const file = page.getByLabel('The poem, as a Midst file (.midst)')
    const button = page.getByRole('button', { name: 'Submit poem' })
    const between = async (above: number, below: number) => {
      const a = (await page.getByRole('alert').boundingBox())!
      return a.y >= above && a.y + a.height <= below
    }
    await file.setInputFiles({ ...midstFile, name: 'zq.txt' })
    await button.click()
    await expect(page.getByRole('alert')).toContainText('ends in .midst')
    let [f, b] = [(await file.boundingBox())!, (await button.boundingBox())!]
    expect(await between(f.y + f.height, b.y)).toBe(true)
    await file.setInputFiles(midstFile)
    await button.click()
    await expect(page.getByRole('alert')).toContainText('could not be uploaded')
    ;[f, b] = [(await file.boundingBox())!, (await button.boundingBox())!]
    expect(await between(b.y + b.height, Infinity)).toBe(true)
    await expect(page.getByRole('alert')).toHaveCount(1)
  })
}

test('someone who is not a poet is told so, and nothing is asked for', async ({ page, baseURL }) => {
  let asked = false
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, { submissions: [], uploaded: [] })
  page.on('request', request => { if (request.url().startsWith(API)) asked = true })
  await page.goto('/submit')
  await expect(page.getByText('Your account cannot submit poems.')).toBeVisible()
  expect(asked).toBe(false)
})

// #326 (Annelyse, GitHub #88): the Submit page is her text, for everyone, in the main nav; the form is for signed-in poets.
// Her text is content/submit.md (#281), hers to change on GitHub, so the page is compared with what that file renders
// to rather than with her words: an edit of hers must not turn this red when the return path brings it in.
test('anyone reading Submit sees her text from content/, and no form', async ({ page, baseURL }) => {
  await standIn(page, baseURL!, { submissions: [], uploaded: [] })
  await page.goto('/')
  await page.locator('.nav-links-wrapper').getByRole('link', { name: 'Submit', exact: true }).click()
  await expect(page).toHaveURL(/\/submit$/)
  const text = page.locator('.submit-text')
  // DOMPurify needs a window, and here, outside the page, there is none: so a jsdom one, while rendering.
  const global = globalThis as { window?: unknown }
  global.window = new JSDOM('').window
  let html: string
  try {
    html = renderContent(SUBMIT_TEXT)
  } finally {
    delete global.window
  }
  expect(SUBMIT_TEXT.trim()).not.toBe('')
  expect(await text.innerHTML()).toBe(html)
  await expect(page.locator('#newsletter .campaign-monitor-form')).toHaveCount(1)
  await expect(page.locator('form.submit-form')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test("a link in her text to one of the site's pages goes through the router, without reloading the site", async ({ page, baseURL }) => {
  await standIn(page, baseURL!, { submissions: [], uploaded: [] })
  await page.goto('/submit')
  const own = page.locator('.submit-text a[href^="/"]:not([href^="//"])')
  test.skip((await own.count()) === 0, "her text has no link to one of the site's own pages just now")
  const href = await own.first().getAttribute('href')
  await page.evaluate(() => { (window as unknown as { zqStayed: boolean }).zqStayed = true })
  await own.first().click()
  await expect(page).toHaveURL(new RegExp(`${href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  expect(await page.evaluate(() => (window as unknown as { zqStayed?: boolean }).zqStayed)).toBe(true)
})

test('a signed-in poet sees her text first and the form under it', async ({ page, baseURL }) => {
  await signedInAs(page, ['poet'])
  await standIn(page, baseURL!, { submissions: [], uploaded: [] })
  await page.goto('/submit')
  await expect(page.locator('form.submit-form')).toBeVisible()
  const order = await page.locator('.submit-text, form.submit-form').evaluateAll(els => els.map(el => el.className))
  expect(order).toEqual(['submit-text', 'submit-form'])
})
