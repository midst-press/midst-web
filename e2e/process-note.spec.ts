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
  await page.locator('#poem-nav a:has(.arrow-forward)').click()
  await page.waitForURL(url => decodeURIComponent(url.pathname) === route(failing))
  await expect(page.locator(`${scope(failing)}.sliding-poems__poem--failed`)).toBeVisible()
  await openNote(page)
  await expect(note(page)).toHaveText('')
  expect(sentinels.size, 'a note was served for the poem whose note should have failed').toBe(1)
  expect(seen.externalPoemFiles().length, 'a poem file was asked of another host').toBe(0)
  expect(seen.archive.length, 'no poem file came from the local fixture server').toBeGreaterThan(0)

  await page.locator('#poem-nav a:has(.arrow-back)').click()
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

test('Escape and a click outside close the note', async ({ page, baseURL }) => {
  const file = published[withNote]
  await serveSentinelNotes(page, baseURL!)
  await page.goto(route(file))
  await expect(page.locator(`${scope(file)} .editor`)).toBeVisible()
  await openNote(page)
  await page.keyboard.press('Escape')
  await expect(page.locator('.process-note')).not.toHaveClass(/open/)
  await openNote(page)
  // A point outside the note's box, on whichever side of it the window has room.
  const box = (await page.locator('.process-note').boundingBox())!
  const viewport = page.viewportSize()!
  const x = box.x + box.width + 20 < viewport.width ? box.x + box.width + 20 : box.x - 20
  expect(x, 'the note fills the window: there is nowhere outside it to click').toBeGreaterThan(0)
  await page.mouse.click(x, box.y + box.height / 2)
  await expect(page.locator('.process-note')).not.toHaveClass(/open/)
  await openNote(page)
  await note(page).click()
  await expect(page.locator('.process-note'), 'a click inside the note closed it').toHaveClass(/open/)
})
