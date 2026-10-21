import { test, expect } from './coverage'
// Bare specifiers, not `node:fs`/`node:path`: see the note in poem-plays.spec.ts (#11).
import { readFileSync } from 'fs'
import { join } from 'path'
import names from '../src/poems/poem-names.js'

// The site built with MIDST_POEM_LIST=published (#110), against the synthetic fixtures that
// tools/make-e2e-fixtures.mjs writes with a published.json beside them. Run by playwright.published.config.ts
// (npm run test:e2e:published); the bundled suite ignores this file.
//
// Nothing here types a poem's name or key: the expectations are read from the list the fixtures wrote, and the
// routes are derived with the site's own poem-names module, as poem-plays.spec.ts does.

const TYPED = 'the quick brown fox'
const LIST_PATH = '/archive/published.json'

interface Entry { poemId: string, title: string, author: string, timelapse: string, processNote: string | null }
const published = (): Entry[] => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'published', 'published.json'), 'utf8')).poems
const routeOf = (entry: Entry) => `/poem/${names.poemUrl(entry.title)}/`
const scopeOf = (entry: Entry) => `.sliding-poems__poem--${names.poemId(entry.author, entry.title)}`
// The key the site must ask for: the recorded one, with the leading poems/ removed, under /archive/.
const pathOf = (key: string) => '/archive/' + key.replace(/^poems\//, '')

// Every same-origin path the page asked for, in order.
const requested = new WeakMap<object, string[]>()

test.beforeEach(async ({ page, baseURL }) => {
  requested.set(page, [])
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === new URL(baseURL!).origin) requested.get(page)!.push(decodeURIComponent(url.pathname))
  })
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    if (url.origin === 'https://d3nlqr52a31o6y.cloudfront.net') {
      if (url.pathname.startsWith('/midst-press/site/shapes/')) {
        return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' })
      }
    }
    if (url.origin === 'https://js.createsend1.com' && url.pathname === '/javascript/copypastesubscribeformlogic.js') {
      return route.fulfill({ contentType: 'application/javascript', body: '' })
    }
    return route.abort()
  })
})

test.describe('the published list', () => {
  test('fixtures are as this suite assumes: several poems, one without a note', () => {
    const entries = published()
    expect(entries.length).toBeGreaterThanOrEqual(3)
    expect(entries.filter(entry => entry.processNote === null)).toHaveLength(1)
  })

  test('the Table of Contents lists the list\'s poems newest first, fetching the list once', async ({ page }) => {
    // The page sorts by publish date, newest first (midst-web #309). Served with dates that make the list's own
    // order newest first, and so differ from the bundled poems' dates (the next test), the order on the page can
    // only have come from the list.
    const entries = published().map((entry, i) => ({ ...entry, publishDate: `2030-01-${String(20 - i).padStart(2, '0')}` }))
    await page.route('**' + LIST_PATH, route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ version: 1, poems: entries }),
    }))
    await page.goto('/read')
    const expected = entries.map(routeOf)
    const links = page.locator('a.poem-line')
    await expect(links).toHaveCount(expected.length)
    expect(await links.evaluateAll(anchors => anchors.map(anchor => new URL((anchor as HTMLAnchorElement).href).pathname))).toEqual(expected)
    expect(requested.get(page)!.filter(path => path === LIST_PATH)).toHaveLength(1)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('the list\'s order is not the bundle\'s', () => {
    // Guards the premise of the test above: if a bundled site opened on the same order, newest first by the
    // poems' own dates, that test could pass without the list being read at all.
    const listed = published().map(entry => entry.poemId)
    const bundled = ['Margaret_Yapp', 'Madeleine_Mori', 'Jared_Harél', 'Mónica_de_la_Torre']
      .map(file => JSON.parse(readFileSync(join(__dirname, '..', 'src', 'poems', `${file}.json`), 'utf8')))
    const bundledNewestFirst = bundled
      .map((poem, position) => ({ id: poem.id, date: String(poem.publishDate ?? ''), position }))
      .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.position - y.position))
      .map(poem => poem.id)
    expect(listed).not.toEqual(bundledNewestFirst)
    expect([...listed].sort()).toEqual(bundled.map(poem => poem.id).sort())
  })

  test('a poem plays through its recorded key, and asks for nothing derived', async ({ page }) => {
    const entry = published().find(candidate => candidate.processNote !== null)!
    await page.goto(routeOf(entry))

    const editor = page.locator(`${scopeOf(entry)} .editor`)
    await expect(editor, 'the player did not mount').toBeVisible()
    await expect(editor).toContainText(TYPED)
    await expect(editor).toContainText('and again')

    const paths = requested.get(page)!
    expect(paths).toContain(pathOf(entry.timelapse))
    expect(paths).toContain(pathOf(entry.processNote!))
    // The legacy name would be <author folder>/<author>--<title>.midst.zip: never asked for.
    expect(paths.filter(path => path.endsWith('.midst.zip')), 'only the recorded key').toEqual([pathOf(entry.timelapse)])

    // The title and author in the nav come from the list.
    await expect(page.locator('.poem-credit')).toContainText(entry.author)
  })

  test('every listed poem plays', async ({ page }) => {
    for (const entry of published()) {
      await page.goto(routeOf(entry))
      await expect(page.locator(`${scopeOf(entry)} .editor`)).toContainText('and again')
    }
  })

  test('a null process note is no note: not requested, and the poem still plays', async ({ page }) => {
    const entry = published().find(candidate => candidate.processNote === null)!
    const bad: string[] = []
    page.on('response', (response) => { if (response.status() >= 400) bad.push(`${response.status()} ${new URL(response.url()).pathname}`) })
    await page.goto(routeOf(entry))

    await expect(page.locator(`${scopeOf(entry)} .editor`)).toContainText('and again')
    expect(requested.get(page)!.filter(path => /\.md$/.test(path)), 'no note was recorded, so none may be asked for').toEqual([])
    expect(bad).toEqual([])
  })

  test('reaching a poem route directly, before the list has arrived, still loads that poem', async ({ page }) => {
    // Delay the list so the poem page renders with no poems first: it must neither throw nor stay empty.
    await page.route('**' + LIST_PATH, async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1500))
      await route.fallback()
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const entry = published()[1]
    await page.goto(routeOf(entry))
    await expect(page.locator(`${scopeOf(entry)} .editor`)).toContainText('and again')
    expect(errors).toEqual([])
  })
})

test.describe('when the list cannot be used', () => {
  const failures: Array<[string, (route: any) => Promise<void>]> = [
    ['answers 500', route => route.fulfill({ status: 500, body: 'no' })],
    ['is absent (404)', route => route.fulfill({ status: 404, body: '' })],
    ['cannot be reached', route => route.abort()],
    ['is not JSON', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{ not json' })],
    ['has no poems array', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"version":1}' })],
    ['has an entry that is not a key under poems/', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 1, poems: [{ ...published()[0], timelapse: 'elsewhere/t.zip' }] }),
    })],
  ]

  for (const [name, fulfil] of failures) {
    test(`says the poems could not be loaded when published.json ${name}, and shows no other list`, async ({ page }) => {
      await page.route('**' + LIST_PATH, fulfil)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))

      await page.goto('/read')
      await expect(page.getByRole('alert')).toContainText('The poems could not be loaded')
      await expect(page.locator('a.poem-line'), 'no poem is listed in place of the missing list').toHaveCount(0)

      // A poem page says the same, and does not crash.
      const entry = published()[0]
      await page.goto(routeOf(entry))
      await expect(page.getByRole('alert')).toContainText('The poems could not be loaded')
      await expect(page.locator('.editor')).toHaveCount(0)

      // Nothing was fetched from the archive but the list: no fallback to the bundled list's names.
      expect(requested.get(page)!.filter(path => path.startsWith('/archive/') && path !== LIST_PATH && !path.startsWith('/archive/fonts/'))).toEqual([])
      expect(errors).toEqual([])
    })
  }
})
