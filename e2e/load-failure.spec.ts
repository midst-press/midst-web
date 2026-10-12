import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import names from '../src/poems/poem-names.js'

// A poem that cannot be loaded must say so on the page (#34 item 6, #22). Before this, every failure
// ended in a console message at most, and the reader saw the loading mark turn for ever.

const meta = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'poems', 'Margaret_Yapp.json'), 'utf8'))
const route = `/poem/${names.poemUrl(meta.title)}/`
const scope = `.sliding-poems__poem--${names.poemId(meta.author, meta.title)}`
const ZIP_JS = '/midst-press/site/scripts/zip.js'

// Same-origin requests reach the local fixture server unless `broken` answers them first. The only
// external request served is the vendored zip reader; the rest are aborted, as in poem-plays.
async function serve(page: Page, baseURL: string, broken: (path: string) => { status: number, body: string } | 'abort' | null, zipJs = true) {
  await page.route('**/*', (request) => {
    const url = new URL(request.request().url())
    const answer = broken(decodeURIComponent(url.pathname))
    if (answer === 'abort') return request.abort()
    if (answer) return request.fulfill(answer)
    if (url.origin === new URL(baseURL).origin) return request.continue()
    if (zipJs && url.pathname === ZIP_JS) {
      return request.fulfill({ path: join(__dirname, '..', 'static/static/scripts/zip.js'), contentType: 'application/javascript' })
    }
    return request.abort()
  })
}

async function expectFailureShown(page: Page) {
  const slot = page.locator(scope)
  await expect(slot.getByRole('alert'), 'the page must say the poem did not load').toHaveText(/could not be loaded/)
  await expect(slot.locator('.editor')).toHaveCount(0)
  await expect(slot, 'the loading mark must stop').toHaveClass(/sliding-poems__poem--failed/)
}

const cases: Array<[string, (path: string) => { status: number, body: string } | 'abort' | null]> = [
  ['the timelapse is refused (403)', path => path.endsWith('.midst.zip') ? { status: 403, body: '' } : null],
  ['the process note is refused (403)', path => path.startsWith('/archive/') && path.endsWith('.md') ? { status: 403, body: '' } : null],
  ['the timelapse request fails in transport', path => path.endsWith('.midst.zip') ? 'abort' : null],
  ['the timelapse is not a zip archive', path => path.endsWith('.midst.zip') ? { status: 200, body: 'not an archive' } : null],
]

for (const [name, broken] of cases) {
  test(`a load failure is shown: ${name}`, async ({ page, baseURL }) => {
    await serve(page, baseURL!, broken)
    await page.goto(route)
    await expectFailureShown(page)
  })
}

test('a load failure is shown: the zip reader script did not load', async ({ page, baseURL }) => {
  await serve(page, baseURL!, () => null, false)
  await page.goto(route)
  await expectFailureShown(page)
})

test('control: with nothing broken the same page shows the player and no failure', async ({ page, baseURL }) => {
  await serve(page, baseURL!, () => null)
  await page.goto(route)
  await expect(page.locator(`${scope} .editor`)).toBeVisible()
  await expect(page.locator(scope).getByRole('alert')).toHaveCount(0)
  await expect(page.locator(scope)).not.toHaveClass(/sliding-poems__poem--failed/)
})
