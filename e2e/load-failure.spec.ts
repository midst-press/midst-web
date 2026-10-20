import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import names from '../src/poems/poem-names.js'

// A poem that cannot be loaded must say so on the page (#34 item 6, #22). Before this, every failure
// ended in a console message at most, and the reader saw the loading mark turn for ever.

const meta = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'poems', 'Margaret_Yapp.json'), 'utf8'))
const route = `/poem/${names.poemUrl(meta.title)}/`
const scope = `.sliding-poems__poem--${names.poemId(meta.author, meta.title)}`
// The zip reader is bundled from static/static/scripts/zip.js (#270) as the page's one classic script: the
// built index.html's <script src> without type=module. Found there, not guessed, since its name carries a hash.
function zipScriptPath(): string {
  const html = readFileSync(join(__dirname, '..', 'dist', 'index.html'), 'utf8')
  const classic = Array.from(html.matchAll(/<script\b([^>]*)>/g), m => m[1])
    .filter(attrs => !/type=["']?module/.test(attrs))
    .map(attrs => /src=["']?([^"' >]+)/.exec(attrs)?.[1])
    .filter((src): src is string => src !== undefined && src.startsWith('/'))
  if (classic.length !== 1) throw new Error(`expected one same-origin classic script (the zip reader) in dist/index.html, found ${classic.length}`)
  return classic[0]
}

// Same-origin requests reach the local fixture server unless `broken` answers them first, and with `zipJs` false the
// zip reader's script is refused. Every external request is aborted, as in poem-plays.
async function serve(page: Page, baseURL: string, broken: (path: string) => { status: number, body: string } | 'abort' | null, zipJs = true) {
  const zipScript = zipJs ? null : zipScriptPath()
  await page.route('**/*', (request) => {
    const url = new URL(request.request().url())
    const answer = broken(decodeURIComponent(url.pathname))
    if (answer === 'abort') return request.abort()
    if (answer) return request.fulfill(answer)
    if (url.origin === new URL(baseURL).origin) {
      if (url.pathname === zipScript) return request.abort()
      return request.continue()
    }
    return request.abort()
  })
}

async function expectFailureShown(page: Page, message: string) {
  const slot = page.locator(scope)
  await expect(slot.getByRole('alert'), 'the page must say why the poem did not load').toHaveText(message)
  await expect(slot.locator('.editor')).toHaveCount(0)
  await expect(slot, 'the loading mark must stop').toHaveClass(/sliding-poems__poem--failed/)
}

const archive = (path: string, suffix: string) => path.startsWith('/archive/') && path.endsWith(suffix)
const answer = (suffix: string, status: number, body = '') => (path: string) => archive(path, suffix) ? { status, body } : null

// Each failure and the sentence the reader gets for it (src/routes/Poem.tsx LOAD_FAILURE_MESSAGES).
// 404 and 403 have their own (#47): the poems host answers 404 for a file that is not there.
const NOT_FOUND = 'Unable to find the poem.'
const REFUSED = 'Access to the poem was refused.'
const cases: Array<[string, (path: string) => { status: number, body: string } | 'abort' | null, string]> = [
  ['the timelapse is missing (404)', answer('.midst.zip', 404), NOT_FOUND],
  ['the process note is missing (404)', answer('.md', 404), NOT_FOUND],
  ['the timelapse is refused (403)', answer('.midst.zip', 403), REFUSED],
  ['the process note is refused (403)', answer('.md', 403), REFUSED],
  ['the server fails (500)', answer('.midst.zip', 500), 'The poem could not be fetched. Please try again later.'],
  ['the timelapse request fails in transport', path => archive(path, '.midst.zip') ? 'abort' : null,
    'Unable to reach the poem. Check your connection and try again.'],
  ['the timelapse is not a zip archive', answer('.midst.zip', 200, 'not an archive'), 'The poem\'s file is damaged and cannot be played.'],
]

for (const [name, broken, message] of cases) {
  test(`a load failure is shown: ${name}`, async ({ page, baseURL }) => {
    await serve(page, baseURL!, broken)
    await page.goto(route)
    await expectFailureShown(page, message)
  })
}

test('a load failure is shown: the zip reader script did not load', async ({ page, baseURL }) => {
  await serve(page, baseURL!, () => null, false)
  await page.goto(route)
  await expectFailureShown(page, 'This poem could not be loaded.')
})

test('control: with nothing broken the same page shows the player and no failure', async ({ page, baseURL }) => {
  await serve(page, baseURL!, () => null)
  await page.goto(route)
  await expect(page.locator(`${scope} .editor`)).toBeVisible()
  await expect(page.locator(scope).getByRole('alert')).toHaveCount(0)
  await expect(page.locator(scope)).not.toHaveClass(/sliding-poems__poem--failed/)
})
