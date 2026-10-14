import { test, expect } from './coverage'
// Bare specifiers, not `node:fs`/`node:path`: this repository pins @types/node 12.12.42, which
// predates the `node:` prefix, so the prefixed form fails `tsc --noEmit`. See #11.
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
// The same module the application uses to build object names, so the routes under test are derived
// rather than typed. A human typing one of these is how four poems became unreachable.
import names from '../src/poems/poem-names.js'

const SUBJECTS = ['Margaret_Yapp', 'Madeleine_Mori', 'Jared_Harél', 'Mónica_de_la_Torre']
const publishedFiles = readdirSync(join(__dirname, '..', 'src', 'poems'))
  .filter(file => file.endsWith('.json') && file !== 'order.json')
  .sort((a, b) => a.normalize('NFC') < b.normalize('NFC') ? -1 : a.normalize('NFC') > b.normalize('NFC') ? 1 : 0)
  .filter(file => JSON.parse(readFileSync(join(__dirname, '..', 'src', 'poems', file), 'utf8')).published === true)

const poems = SUBJECTS.map((file) => {
  const meta = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'poems', `${file}.json`), 'utf8'))
  // The route matches `poem.url` -- the TITLE slug alone, not `author--title`. That is why the live
  // URL is /poem/december. The OBJECT name uses author--title; the ROUTE does not. Two different
  // derivations from the same metadata, and conflating them was my first mistake here.
  return {
    file,
    meta,
    number: publishedFiles.findIndex(name => name.normalize('NFC') === `${file}.json`.normalize('NFC')) + 1,
    // Legacy names only: they can be stored under a second Unicode spelling, which the checks below
    // model. A canonical name is an id and has one spelling, so under that scheme there is nothing to
    // model here; e2e/key-scheme.spec.ts checks what a canonical build asks for.
    keys: process.env.MIDST_KEY_SCHEME === 'legacy' ? [names.processNoteObjectName(meta), names.timelapseObjectName(meta)] : [],
    route: `/poem/${names.poemUrl(meta.title)}/`,
    // The site renders EVERY poem into a sliding carousel, so `.editor` alone matches 50 elements.
    // Scope by the carousel class, which carries the poemId -- so this selector is derived from
    // metadata too, not typed.
    scope: `.sliding-poems__poem--${names.poemId(meta.author, meta.title)}`,
  }
})

// The synthetic fixtures all type this. Asserting on it rather than on a poem's words is deliberate:
// no poem's text belongs in this repository, not even in a test.
const TYPED = 'the quick brown fox'

// No external network: use the vendored ZIP reader and stub ancillary scripts/decorations.
// Refuse poem-data access even if a build accidentally loses its local origins.
const externalRequests = new WeakMap<object, Map<string, number>>()
const alternateRequests = new WeakMap<object, Set<string>>()
function spellingMiss(path: string): boolean {
  return poems.some(poem => poem.keys.some(key => key !== key.normalize('NFD') && path === '/archive/' + key))
}
test.beforeEach(async ({ page, baseURL }) => {
  externalRequests.set(page, new Map())
  alternateRequests.set(page, new Set())
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) {
      const path = decodeURIComponent(url.pathname)
      // The dev server resolves both forms, so intercept NFC first to model S3's strict keys.
      if (spellingMiss(path)) return route.fulfill({ status: 403, body: '' })
      for (const poem of poems) {
        for (const key of poem.keys) {
          if (key !== key.normalize('NFD') && path === '/archive/' + key.normalize('NFD')) alternateRequests.get(page)!.add(key)
        }
      }
      return route.continue()
    }
    if (url.origin === 'https://d3nlqr52a31o6y.cloudfront.net') {
      if (url.pathname === '/midst-press/site/scripts/zip.js') {
        return route.fulfill({ path: join(__dirname, '..', 'static/static/scripts/zip.js'), contentType: 'application/javascript' })
      }
      if (url.pathname.startsWith('/midst-press/site/shapes/')) {
        return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' })
      }
    }
    if ((url.origin === 'https://www.googletagmanager.com' && url.pathname === '/gtag/js')
      || (url.origin === 'https://js.createsend1.com' && url.pathname === '/javascript/copypastesubscribeformlogic.js')) {
      return route.fulfill({ contentType: 'application/javascript', body: '' })
    }
    const origins = externalRequests.get(page)!
    const origin = new URL(route.request().url()).origin
    origins.set(origin, (origins.get(origin) || 0) + 1)
    return route.abort()
  })
})
test.afterEach(async ({ page }) => {
  expect(Array.from(externalRequests.get(page)!.entries()), 'no external poem data or unknown resources may be requested').toEqual([])
})

test.describe('a published poem plays', () => {
  for (const { file, number, route, scope, keys } of poems) {
    test(`poem ${number}: the player mounts and replays to the end`, async ({ page }) => {
      const failures: string[] = []
      page.on('response', (r) => {
        if (r.status() >= 400 && !(r.status() === 403 && spellingMiss(decodeURIComponent(new URL(r.url()).pathname)))) failures.push(`${r.status()} asset request`)
      })

      await page.goto(route)

      // 1. The player mounts at all. This is the check that would have caught the play widget
      //    rendering in one browser and not another.
      const editor = page.locator(`${scope} .editor`)
      await expect(editor, 'the player did not mount').toBeVisible()

      // 2. The timelapse was fetched and decoded. If the slug derivation changes, the app asks for a
      //    name no fixture has, and this is where it fails.
      await expect(editor, 'no replayed content appeared').toContainText(TYPED.slice(0, 3))

      // 3. It reaches the END of the timeline, not just the first frame. The player seeks to the last
      //    frame on load, so the full text and the second paragraph are the evidence that the whole
      //    archive was parsed rather than only its head.
      await expect(editor).toContainText(TYPED)
      await expect(editor).toContainText('and again')

      for (const key of keys.filter(key => key !== key.normalize('NFD'))) {
        expect(alternateRequests.get(page)!.has(key), 'both asset types must traverse the alternate-spelling fetch').toBe(true)
      }
      expect(
        await page.locator(`${scope} .editable p`).count(),
        'both paragraphs should render',
      ).toBeGreaterThanOrEqual(2)

      // Loading at the last frame is not playback. Exercise the timers, reset and stop for B and C.
      const play = page.locator(`${scope} .play-pause-button`)
      await play.click()
      await expect(play).toHaveClass(/playing/)
      await expect(editor).not.toContainText('and again')
      await expect(play).not.toHaveClass(/playing/)
      await expect(editor).toContainText(TYPED)
      await expect(editor).toContainText('and again')

      const timeline = page.locator(`${scope} input[type=range]`)
      await timeline.focus()
      await timeline.press('ArrowLeft')
      await expect(page).toHaveURL(new RegExp(route.replace(/\/$/, '') + '/?$'))
      await expect(editor).not.toContainText('and again')
      await timeline.press('End')
      await expect(editor).toContainText('and again')
      await play.click()
      await expect(play).toHaveClass(/playing/)
      await play.click()
      await expect(play).not.toHaveClass(/playing/)
      const pausedStep = await timeline.inputValue()
      await page.waitForTimeout(300)
      await expect(timeline).toHaveValue(pausedStep)

      // Fonts (#55). The font files are served from MIDST_FONTS_URL, not bundled, so a wrong URL would
      // leave every reader on a system font with all else green. The CSS naming a family proves
      // nothing; the face must have LOADED. The site chrome is set in futuraregular. One fixture poem
      // is set in Lato, which the site serves; the others are in Helvetica, which it does not.
      const fonts = await page.evaluate(async (selector) => {
        const set = (document as any).fonts
        await set.ready
        const bare = (family: string) => family.trim().replace(/^["']|["']$/g, '')
        const first = (element: Element) => bare(getComputedStyle(element).fontFamily.split(',')[0])
        const statuses = (family: string) => Array.from(set as Iterable<any>).filter(face => bare(face.family) === family).map(face => face.status as string)
        const body = first(document.body)
        const poem = first(document.querySelector(selector)!)
        return { body, bodyStatuses: statuses(body), bodyCheck: set.check(`16px "${body}"`) as boolean, poem, poemStatuses: statuses(poem) }
      }, `${scope} .editable p`)
      expect(fonts.body).toBe('futuraregular')
      expect(fonts.bodyStatuses, 'the site font is declared but did not load').toContain('loaded')
      expect(fonts.bodyCheck).toBe(true)
      if (file === 'Margaret_Yapp') {
        expect(fonts.poem).toBe('Lato')
        expect(fonts.poemStatuses, 'the poem is set in Lato and no Lato face loaded').toContain('loaded')
      } else {
        expect(fonts.poemStatuses, 'this fixture poem is set in a system font').toEqual([])
      }

      // 4. Nothing 404ed or 403ed on the way. The production failures this suite exists to prevent
      //    were all 403s on an object whose name did not match what was uploaded.
      expect(failures, `requests failed:\n${failures.join('\n')}`).toEqual([])
    })
  }

  // GitHub midst-web #51: on a freshly loaded poem page, with nothing clicked and so nothing focused,
  // the spacebar must start playback, and pause it again.
  for (const { number, route, scope } of poems) {
    test(`poem ${number}: spacebar plays and pauses on a freshly loaded page`, async ({ page }) => {
      await page.goto(route)
      const editor = page.locator(`${scope} .editor`)
      await expect(editor).toContainText('and again')
      const play = page.locator(`${scope} .play-pause-button`)
      await expect(play).not.toHaveClass(/playing/)
      expect(await page.evaluate(() => document.activeElement === document.body), 'nothing has focus yet').toBe(true)

      await page.keyboard.press('Space')
      await expect(play, 'spacebar did not start playback').toHaveClass(/playing/)
      await expect(editor).not.toContainText('and again')

      await page.keyboard.press('Space')
      await expect(play, 'spacebar did not pause playback').not.toHaveClass(/playing/)
      const timeline = page.locator(`${scope} input[type=range]`)
      const pausedStep = await timeline.inputValue()
      await page.waitForTimeout(300)
      await expect(timeline).toHaveValue(pausedStep)
    })
  }

  test('the route is derived from metadata, not hardcoded', () => {
    // Guards the premise of every test above: if these routes stopped matching the fixture names, the
    // suite would be testing nothing and would still be green, because the app would render its
    // not-found state and `.editor` would simply be absent -- which assertion 1 catches. This makes
    // the dependency explicit instead of implicit.
    for (const { meta, route } of poems) {
      expect(route).toBe(`/poem/${names.poemUrl(meta.title)}/`)
      // And the two derivations are genuinely different, so neither can be silently swapped for the
      // other again: the object name carries the author, the route does not.
      expect(names.poemId(meta.author, meta.title)).not.toBe(names.poemUrl(meta.title))
    }
  })
})

test('an unknown poem route does not render a player', async ({ page }) => {
  // The negative control for assertion 1. Without this, `.editor` being visible proves nothing about
  // whether the app actually found the poem: a suite where every page shows a player would pass
  // identically.
  await page.goto('/poem/a-poem-that-does-not-exist/')
  // Scoped the same way as the positive tests, so this control is discriminating: `.editor` unscoped
  // is present 50 times on every poem page, which would make an unscoped control pass for the wrong
  // reason -- it did, before the selector was fixed.
  await expect(page.locator('.sliding-poems__poem--nobody--a-poem-that-does-not-exist .editor')).toHaveCount(0)
})
