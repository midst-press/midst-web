import { test, expect } from './coverage'
import { Page } from '@playwright/test'
import { published, route, scope, hermetic, WITH_FIXTURE } from './published-sequence'

// The poet's process note beside the poem (ProcessNote.tsx). Midst-web #100, item 2. The risks: a
// note shown for the wrong poem, or not shown. Three poems: one with a note, one without, and one
// whose note fails to load.
//
// Each served note is replaced by a sentinel, one per note address, so a note on screen can be traced
// to the poem whose address it came from without printing anything of the fixture's. A note that is
// not served (a poem with no fixture: the local server answers 404) is passed through as it is. The
// page is kept off the network (hermetic): every poem file must come from the local fixture server.

async function serveSentinelNotes(page: Page, baseURL: string, empty = false) {
  const sentinels = new Map<string, string>()
  const seen = await hermetic(page, baseURL, (url) => {
    if (!sentinels.has(url)) sentinels.set(url, `NOTE-SENTINEL-${sentinels.size + 1}`)
    return empty ? '' : `# Process note\n\n${sentinels.get(url)}\n`
  })
  return { sentinels, seen }
}

const note = (page: Page) => page.locator('.process-note__content')

async function openNote(page: Page) {
  if (!(await page.locator('.process-note').getAttribute('class'))?.includes('open')) {
    await page.locator('.poem-credit > span').click()
  }
  await expect(page.locator('.process-note')).toHaveClass(/open/)
}

// A poem with a note, followed in the sequence by a poem with no fixture, whose note fails to load.
const withNote = published.findIndex((file, i) => WITH_FIXTURE.includes(file) && !WITH_FIXTURE.includes(published[i + 1] ?? ''))

test('a poem\'s note is its own: shown for it, not carried to a poem whose note did not load, and shown again on return', async ({ page, baseURL }) => {
  expect(withNote, 'no fixture poem is followed by a poem without one').toBeGreaterThanOrEqual(0)
  const failing = published[withNote + 1]
  expect(failing, 'the fixture poem is the last one').toBeDefined()
  const { sentinels, seen } = await serveSentinelNotes(page, baseURL!)

  await page.goto(route(published[withNote]))
  await expect(page.locator(`${scope(published[withNote])} .editor`)).toBeVisible()
  expect(sentinels.size, 'exactly one note was served, for this poem').toBe(1)
  const [ownNote] = Array.from(sentinels.values())
  await openNote(page)
  await expect(note(page)).toContainText(ownNote)

  // The next poem has no fixture, so its note answers 404 and the poem shows its load failure.
  await page.locator('#poem-nav .arrow-forward').click()
  await page.waitForURL(url => decodeURIComponent(url.pathname) === route(failing))
  await expect(page.locator(`${scope(failing)}.sliding-poems__poem--failed`)).toBeVisible()
  await openNote(page)
  await expect(note(page)).toHaveText('')
  expect(sentinels.size, 'a note was served for the poem whose note should have failed').toBe(1)
  expect(seen.externalPoemFiles().length, 'a poem file was asked of another host').toBe(0)
  expect(seen.archive.length, 'no poem file came from the local fixture server').toBeGreaterThan(0)

  await page.locator('#poem-nav .arrow-back').click()
  await page.waitForURL(url => decodeURIComponent(url.pathname) === route(published[withNote]))
  await openNote(page)
  await expect(note(page)).toContainText(ownNote)
})

test('a poem with an empty note: the poem plays and the note shows nothing', async ({ page, baseURL }) => {
  const file = published[withNote]
  const { seen } = await serveSentinelNotes(page, baseURL!, true)
  await page.goto(route(file))
  await expect(page.locator(`${scope(file)} .editor`)).toBeVisible()
  await openNote(page)
  await expect(note(page)).toHaveText('')
  expect(seen.externalPoemFiles().length, 'a poem file was asked of another host').toBe(0)
})

test('control: the same poem with its note served shows text, so the empty case above can fail', async ({ page, baseURL }) => {
  const file = published[withNote]
  const { seen } = await serveSentinelNotes(page, baseURL!)
  await page.goto(route(file))
  await expect(page.locator(`${scope(file)} .editor`)).toBeVisible()
  await openNote(page)
  await expect(note(page)).toContainText('NOTE-SENTINEL-1')
  expect(seen.externalPoemFiles().length, 'a poem file was asked of another host').toBe(0)
})

// The author photo at the foot of the note (#359, GitHub #97). The archive's photo is guessed from the author's id; a
// missing one showed the browser's empty broken-image box. A 1x1 PNG stands in for a photo that exists.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const photo = (page: Page) => page.locator('.process-note__content img')

for (const exists of [false, true]) {
  test(exists ? 'control: a photo that exists is shown at the foot of the note (#359)' : 'a poem whose photo is missing shows no box where it would be (#359)', async ({ page, baseURL }) => {
    const file = published[withNote]
    await serveSentinelNotes(page, baseURL!)
    const asked: string[] = []
    await page.route(/\.(jpe?g|png|webp)$/, request => {
      asked.push(new URL(request.request().url()).pathname)
      return exists ? request.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : request.fulfill({ status: 404, body: '' })
    })
    await page.goto(route(file))
    await expect(page.locator(`${scope(file)} .editor`)).toBeVisible()
    await openNote(page)
    await expect(note(page)).toContainText('NOTE-SENTINEL-1')
    await expect.poll(() => asked.length, 'the photo was asked for').toBeGreaterThan(0)
    if (exists) await expect(photo(page)).toBeVisible()
    else await expect(photo(page)).toHaveCount(0)
  })
}

test('Escape and a click outside close the note', async ({ page, baseURL }) => {
  const file = published[withNote]
  await serveSentinelNotes(page, baseURL!)
  await page.goto(route(file))
  await expect(page.locator(`${scope(file)} .editor`)).toBeVisible()
  await openNote(page)
  await page.keyboard.press('Escape')
  await expect(page.locator('.process-note')).not.toHaveClass(/open/)
  await openNote(page)
  // A mousedown on the poem, outside the note. ProcessNote closes on a document mousedown whose target
  // the note does not contain, so this exercises exactly that, without hit-testing a pointer position:
  // the open note covers the centre of the poem, and pointer clicks beside it were unreliable on the CI
  // runner (a coordinate click missed; a locator click was intercepted by the note, then hung).
  await page.locator(`${scope(file)} .editor`).dispatchEvent('mousedown')
  await expect(page.locator('.process-note')).not.toHaveClass(/open/)
  await openNote(page)
  await note(page).click()
  await expect(page.locator('.process-note'), 'a click inside the note closed it').toHaveClass(/open/)
})

test('a mousedown outside, the moment the note opens, closes it', async ({ page, baseURL }) => {
  // The note used to read "is it open?" from a variable set in an effect, which runs after the render
  // that adds `open` to its class. A mousedown in that gap was ignored (connor-227743e6). A
  // MutationObserver callback runs as a microtask right after React writes the class, before its effects,
  // so a mousedown sent from it lands in exactly that gap, every time.
  const file = published[withNote]
  await serveSentinelNotes(page, baseURL!)
  await page.goto(route(file))
  await expect(page.locator(`${scope(file)} .editor`)).toBeVisible()
  await page.evaluate((editorSelector) => {
    const note = document.querySelector('.process-note')!
    const editor = document.querySelector(editorSelector)!
    const observer = new MutationObserver(() => {
      if (!note.classList.contains('open')) return
      observer.disconnect()
      editor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    observer.observe(note, { attributes: true, attributeFilter: ['class'] })
  }, `${scope(file)} .editor`)
  await page.locator('.poem-credit > span').click()
  await expect(page.locator('.process-note')).not.toHaveClass(/open/)
})
