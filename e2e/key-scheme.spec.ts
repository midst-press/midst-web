import { test, expect } from './coverage'
import { readFileSync } from 'fs'
import { join } from 'path'
import names from '../src/poems/poem-names.js'

// Which object names does the BUILT site ask for? Issue #41.
//
// The other specs cannot answer that: the fixtures are written by the same module the site uses, so
// the two agree whatever that module does. Here the expected paths are written out by hand from the
// poem's metadata, for the scheme this run was started with, and compared with what the page requests.
//
// One poem whose author has an accent, because that is where the legacy scheme needs its second
// spelling and the canonical scheme must not.
const SCHEME = process.env.MIDST_KEY_SCHEME
const meta = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'poems', 'Mónica_de_la_Torre.json'), 'utf8'))
const route = `/poem/${names.poemUrl(meta.title)}/`
const scope = `.sliding-poems__poem--${names.poemId(meta.author, meta.title)}`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('the site asks for the poem under the scheme it was built with, and only that one', async ({ page }) => {
  expect(['legacy', 'canonical'], 'run the suite with MIDST_KEY_SCHEME set').toContain(SCHEME)
  expect(meta.id, 'the subject poem needs an id').toMatch(UUID)

  const asked: string[] = []
  page.on('request', request => {
    const path = decodeURIComponent(new URL(request.url()).pathname)
    if (path.startsWith('/archive/') && (path.endsWith('.midst.zip') || path.endsWith('.md'))) asked.push(path.slice('/archive/'.length))
  })
  await page.goto(route)
  await expect(page.locator(`${scope} .editor`)).toContainText('the quick brown fox')

  const canonical = [`${meta.id}/process-note.md`, `${meta.id}/timelapse.midst.zip`]
  const underAnId = asked.filter(key => UUID.test(key.split('/')[0]))
  if (SCHEME === 'canonical') {
    // Exactly the two names, once each: no second spelling, no author folder.
    expect(asked).toEqual(canonical)
  } else {
    expect(underAnId, 'a legacy build must not ask for canonical names').toEqual([])
    // The folder is the author's name in lower case with hyphens; this poem has no folder override.
    expect(meta.authorSecondaryFolder).toBeFalsy()
    const folders = new Set(asked.map(key => key.split('/')[0].normalize('NFC')))
    expect(Array.from(folders)).toEqual([meta.author.toLowerCase().replace(/ /g, '-').normalize('NFC')])
    expect(asked.some(key => key.endsWith('.midst.zip'))).toBe(true)
    expect(asked.some(key => key.endsWith('.md'))).toBe(true)
  }
})
