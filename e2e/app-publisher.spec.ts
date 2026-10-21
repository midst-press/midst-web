import { Page, Route } from '@playwright/test'
import { test, expect } from './coverage'

// The publisher's page (docs/app-api.md, "Publisher"; #12, #110) against a stand-in for the API that
// keeps a published list and its ETag, and answers 409 when a change carries a stale one. Synthetic
// poems and people only.

const API = 'https://api.example.invalid'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, PUT' }

const poem = (n: number) => ({ poemId: `id-${n}`, title: `Zq ${n}`, author: `Qz ${n}`, timelapseKey: `poems/id-${n}/t`, processNoteKey: null, publishDate: null as string | null, highlighted: false })

interface Person { username: string, name: string, email: string, groups: string[], status: string }
interface Store { etag: number, published: ReturnType<typeof poem>[], unpublished: ReturnType<typeof poem>[], writes: string[], failNext?: boolean, failReload?: boolean, reloadStatus?: number, poets?: Person[], edgeCleared?: boolean, edgeClearedEverywhere?: boolean, submissionStatuses?: string[], failSubmissions?: boolean, bodies?: Record<string, unknown>[], refuseReplaces?: string }

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
    if (request.method() === 'GET' && url.pathname === '/publisher/poems') {
      // The reload after a saved change fails once (#127): unavailable, or, with reloadStatus 401, a token no
      // longer accepted (#178).
      if (store.failReload && store.writes.length > 0) {
        store.failReload = false
        return store.reloadStatus === 401
          ? reply(401, { message: 'Unauthorized' })
          : reply(503, { error: 'unavailable', message: 'Zq is unavailable.' })
      }
      return reply(200, list())
    }
    // The count of submissions waiting on the review page (#289): one submission per status given.
    if (request.method() === 'GET' && url.pathname === '/review/submissions') {
      if (store.failSubmissions) return reply(503, { error: 'unavailable', message: 'Zq is unavailable.' })
      return reply(200, { submissions: (store.submissionStatuses ?? []).map((status, i) => ({ submissionId: `s-${i}`, origin: 'upload', title: `Sq ${i}`, author: 'Qz', poet: 'qz@example.invalid', submittedAt: '2026-10-20T00:00:00Z', status, note: null })) })
    }
    // The patrons section loads too (docs/app-api.md, "Patrons"); this spec does not edit it.
    if (request.method() === 'GET' && url.pathname === '/publisher/patrons') return reply(200, { patronsEtag: 'none', patrons: [], closing: null })
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
    const body = request.postDataJSON() as { poemId?: string, poemIds?: string[], listEtag: string, publishDate?: string | null, highlighted?: boolean, replaces?: string }
    store.writes.push(`${request.method()} ${url.pathname}`)
    store.bodies?.push(body)
    // #101, midst-infra #190: a replacement the server refuses (another poet's, say) is a 400 with a brief message.
    if (store.refuseReplaces && url.pathname === '/publisher/publish' && body.replaces) {
      return reply(400, { error: 'invalid', message: store.refuseReplaces })
    }
    if (store.failNext) {
      store.failNext = false
      return reply(500, { error: 'server', message: 'Zq went wrong.' })
    }
    if (body.listEtag !== `e${store.etag}`) {
      return reply(409, { error: 'conflict', message: 'The published list changed since you loaded it.', listEtag: `e${store.etag}` })
    }
    store.etag += 1
    if (url.pathname === '/publisher/publish' && body.replaces) {
      // The new poem takes the replaced one's place in the list (midst-infra #190).
      const at = store.published.findIndex(p => p.poemId === body.replaces)
      store.published[at] = store.unpublished.find(p => p.poemId === body.poemId)!
      store.unpublished = store.unpublished.filter(p => p.poemId !== body.poemId)
    } else if (url.pathname === '/publisher/publish') {
      store.published.push(Object.assign(store.unpublished.find(p => p.poemId === body.poemId)!,
        body.publishDate === undefined ? {} : { publishDate: body.publishDate, highlighted: body.highlighted }))
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
    // Publish and unpublish say whether withdrawn copies were cleared from CloudFront (#239); the others never do.
    // edgeClearedEverywhere sends it on every route, so a test can show the page itself keeps the note off a change
    // that withdraws nothing.
    const withdrew = url.pathname === '/publisher/publish' || url.pathname === '/publisher/unpublish'
    const edge = store.edgeClearedEverywhere ? { edgeCleared: false }
      : withdrew && store.edgeCleared !== undefined ? { edgeCleared: store.edgeCleared } : {}
    return reply(200, { listEtag: `e${store.etag}`, published: store.published, ...edge })
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

const UNPUBLISH_LEFT = 'Its copies could not be cleared from the site\'s cache, so anyone who already has their address may still open them for up to a day.'
const PUBLISH_LEFT = 'The copies of the version it replaced could not be cleared from the site\'s cache, so anyone who already has their address may still open them for up to a day.'

test('an unpublish whose copies were left in the cache says so (#239)', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1), poem(2)], unpublished: [], writes: [], edgeClearedEverywhere: true }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await page.getByRole('listitem').filter({ hasText: 'Zq 1' }).getByRole('button', { name: 'Unpublish' }).click()
  await expect(page.getByRole('status')).toHaveText(`Unpublished Zq 1. ${UNPUBLISH_LEFT}`)
  // A change that withdraws nothing never carries the note. The stand-in answers edgeCleared: false here too, so
  // only the page's choice keeps the note off it.
  await page.getByRole('listitem').filter({ hasText: 'Zq 2' }).getByLabel('Highlighted').click()
  await expect(page.getByRole('status')).toHaveText('Highlighted Zq 2.')
})

test('a publish whose replaced version was left in the cache says so (#239)', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1)], unpublished: [poem(2)], writes: [], edgeCleared: false }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await page.getByRole('list', { name: 'Poems not published' }).getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('status')).toHaveText(`Published Zq 2. ${PUBLISH_LEFT}`)
})

test('copies cleared from the cache add nothing to the notice (#239)', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1)], unpublished: [], writes: [], edgeCleared: true }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await page.getByRole('listitem').filter({ hasText: 'Zq 1' }).getByRole('button', { name: 'Unpublish' }).click()
  await expect(page.getByRole('status')).toHaveText('Unpublished Zq 1.')
})

test('copies left in the cache are said even when the list reload fails (#239)', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1)], unpublished: [], writes: [], failReload: true, edgeCleared: false }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await page.getByRole('listitem').filter({ hasText: 'Zq 1' }).getByRole('button', { name: 'Unpublish' }).click()
  await expect(page.getByRole('alert')).toHaveText(`The change was saved, but the list could not be refreshed. Reload the page to see it. ${UNPUBLISH_LEFT}`)
})

test('a saved change whose list reload fails is shown as saved, not as a failure (#127)', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1)], unpublished: [poem(2)], writes: [], failReload: true }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await expect(published(page)).toHaveText(['Zq 1'])
  await page.getByRole('list', { name: 'Poems not published' }).getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('alert')).toHaveText('The change was saved, but the list could not be refreshed. Reload the page to see it.')
  await expect(page.getByText('Zq is unavailable.')).toHaveCount(0)
  expect(store.writes).toEqual(['POST /publisher/publish'])
  expect(store.published.map(p => p.title)).toEqual(['Zq 1', 'Zq 2'])
})

test('a saved change whose list reload is refused with 401 is shown as saved, and sign-in is offered again (#178)', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1)], unpublished: [poem(2)], writes: [], failReload: true, reloadStatus: 401 }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await expect(published(page)).toHaveText(['Zq 1'])
  await page.getByRole('list', { name: 'Poems not published' }).getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('alert')).toHaveText('The change was saved, but the list could not be refreshed. Reload the page to see it.')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  expect(await page.evaluate(() => window.sessionStorage.getItem('midst-app-session'))).toBeNull()
  expect(store.writes).toEqual(['POST /publisher/publish'])
  expect(store.published.map(p => p.title)).toEqual(['Zq 1', 'Zq 2'])
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
  // Disable asks first (#122): declined, nothing is sent; accepted, the poet is disabled.
  const asked: string[] = []
  page.once('dialog', dialog => { asked.push(dialog.message()); return dialog.dismiss() })
  await poets.getByRole('button', { name: 'Disable' }).click()
  await expect.poll(() => asked).toEqual(['Disable Qz Vb\'s account? They won\'t be able to sign in until an admin turns it back on.'])
  await expect(poets.getByRole('button', { name: 'Disable' })).toBeEnabled()
  expect(store.writes).toEqual(['POST /publisher/poets', 'POST /publisher/poets/u-1/resend'])
  page.once('dialog', dialog => dialog.accept())
  await poets.getByRole('button', { name: 'Disable' }).click()
  await expect(poets).toContainText('Disabled')
  await expect(poets.getByRole('button')).toHaveCount(0)
  expect(store.writes).toEqual(['POST /publisher/poets', 'POST /publisher/poets/u-1/resend', 'POST /publisher/poets/u-1/disable'])
})

test('resend and disable are offered only for a poet-only account; the API refuses them for anyone else (#122)', async ({ page, baseURL }) => {
  const store: Store = {
    etag: 1, published: [], unpublished: [], writes: [],
    poets: [
      { username: 'u-1', name: 'Qz Poet', email: 'qz@example.invalid', groups: ['poet'], status: 'invited' },
      { username: 'u-2', name: 'Vb Both', email: 'vb@example.invalid', groups: ['poet', 'publisher'], status: 'invited' },
    ],
  }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  const row = (name: string) => page.getByRole('list', { name: 'Registered poets' }).getByRole('listitem').filter({ hasText: name })
  await expect(row('Qz Poet').getByRole('button', { name: 'Resend invitation' })).toBeVisible()
  await expect(row('Qz Poet').getByRole('button', { name: 'Disable' })).toBeVisible()
  await expect(row('Vb Both')).toContainText('Invited, has not signed in yet')
  await expect(row('Vb Both').getByRole('button')).toHaveCount(0)
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

test('a 401 in the Poets section signs the whole page out and offers sign-in', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1)], unpublished: [], writes: [], poets: [] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  // The list and the poets load; registering is refused with the gateway's own 401.
  await page.route('https://api.example.invalid/publisher/poets', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: '{"message":"Unauthorized"}' })
    : route.fallback())
  await page.goto('/publisher')
  await expect(published(page)).toHaveText(['Zq 1'])
  const form = page.getByRole('form', { name: 'Register a poet' })
  await form.getByLabel('Name').fill('Qz')
  await form.getByLabel('Email').fill('qz@example.invalid')
  await form.getByRole('button', { name: 'Register poet' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Published poems' })).toHaveCount(0)
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

test('the page links to Review with the number waiting, and puts the waiting poems before the published list (#289)', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1)], unpublished: [poem(2)], writes: [], submissionStatuses: ['received', 'accepted', 'received', 'declined', 'uploading'] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  const link = page.getByRole('link', { name: 'Review submissions (2 waiting)' })
  await expect(link).toBeVisible()
  const headings = await page.getByRole('heading', { level: 3 }).allTextContents()
  expect(headings.indexOf('Not published')).toBeLessThan(headings.indexOf('Published, in reading order'))
  await link.click()
  await expect(page).toHaveURL(/\/review$/)
  await expect(page.getByRole('heading', { name: 'Review', level: 2 })).toBeVisible()
  expect(store.writes).toEqual([])
})

test('when the submissions cannot be read, the link to Review is still there, without a count (#289)', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1)], unpublished: [], writes: [], failSubmissions: true }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await expect(page.getByRole('list', { name: 'Published poems' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review submissions', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
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

// #101 (Stuart, 21 Oct): a poem can be published as the replacement for a published poem by the same poet.
const byPoet = (n: number, author: string) => ({ ...poem(n), author })
// Today where the browser is, as the page fills a new poem's date in (#305).
const TODAY = (() => { const d = new Date(); const two = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}` })()
const notPublished = (page: Page) => page.getByRole('list', { name: 'Poems not published' })

test('a chosen replacement is sent, and the new poem takes the old one\'s place', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [byPoet(1, 'Qz Vel'), poem(2), byPoet(3, 'Qz Vel')], unpublished: [byPoet(4, 'Qz Vel')], writes: [], bodies: [] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await notPublished(page).getByLabel('Replaces, for Zq 4').selectOption('id-3')
  await notPublished(page).getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('status')).toHaveText('Published Zq 4.')
  expect(store.bodies).toEqual([{ poemId: 'id-4', listEtag: 'e1', publishDate: TODAY, highlighted: false, replaces: 'id-3' }])
  await expect(published(page)).toHaveText(['Zq 1', 'Zq 2', 'Zq 4'])
})

test('with None, publish sends no replaces key', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [byPoet(1, 'Qz Vel')], unpublished: [byPoet(2, 'Qz Vel')], writes: [], bodies: [] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await expect(notPublished(page).getByLabel('Replaces, for Zq 2')).toHaveValue('')
  await notPublished(page).getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('status')).toHaveText('Published Zq 2.')
  expect(store.bodies).toEqual([{ poemId: 'id-2', listEtag: 'e1', publishDate: TODAY, highlighted: false }])
  await expect(published(page)).toHaveText(['Zq 1', 'Zq 2'])
})

test('a refused replacement shows the server\'s message, keeps the choice, and changes nothing', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [byPoet(1, 'Qz Vel')], unpublished: [byPoet(2, 'Qz Vel')], writes: [], bodies: [], refuseReplaces: 'Zq cannot be replaced by that poem.' }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await notPublished(page).getByLabel('Replaces, for Zq 2').selectOption('id-1')
  await notPublished(page).getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('alert')).toHaveText('Zq cannot be replaced by that poem.')
  await expect(notPublished(page).getByLabel('Replaces, for Zq 2')).toHaveValue('id-1')
  await expect(published(page)).toHaveText(['Zq 1'])
  expect(store.etag).toBe(1)
})

test('a poem with nothing it could replace shows no Replaces choice', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [poem(1)], unpublished: [poem(2)], writes: [] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await expect(notPublished(page).getByRole('button', { name: 'Publish' })).toBeVisible()
  await expect(page.getByLabel(/^Replaces/)).toHaveCount(0)
})

test('a publish starts from the replaced poem\'s date and highlight, and sends what the publisher changes them to (#305)', async ({ page, baseURL }) => {
  const store: Store = { etag: 1, published: [{ ...byPoet(1, 'Qz Vel'), publishDate: '2019-05-06', highlighted: true }], unpublished: [byPoet(2, 'Qz Vel')], writes: [], bodies: [] }
  await signedInAs(page, ['publisher'])
  await standIn(page, baseURL!, store)
  await page.goto('/publisher')
  await expect(notPublished(page).getByLabel('Publish date of Zq 2')).toHaveValue(TODAY)
  await notPublished(page).getByLabel('Replaces, for Zq 2').selectOption('id-1')
  await expect(notPublished(page).getByLabel('Publish date of Zq 2')).toHaveValue('2019-05-06')
  await expect(notPublished(page).getByLabel('Highlighted, for Zq 2')).toBeChecked()
  await notPublished(page).getByLabel('Publish date of Zq 2').fill('2026-10-01')
  await notPublished(page).getByLabel('Highlighted, for Zq 2').uncheck()
  await notPublished(page).getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('status')).toHaveText('Published Zq 2.')
  expect(store.bodies).toEqual([{ poemId: 'id-2', listEtag: 'e1', publishDate: '2026-10-01', highlighted: false, replaces: 'id-1' }])
  await expect(published(page)).toHaveText(['Zq 2'])
})
