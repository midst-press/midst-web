import { test, expect } from '@playwright/test'
// Bare specifiers, not `node:fs`/`node:path`: this repository pins @types/node 12.12.42, which
// predates the `node:` prefix, so the prefixed form fails `tsc --noEmit`. See #11.
import { readFileSync } from 'fs'
import { join } from 'path'
// The same module the application uses to build object names, so the routes under test are derived
// rather than typed. A human typing one of these is how four poems became unreachable.
import names from '../src/poems/poem-names.js'

const SUBJECTS = ['Margaret_Yapp', 'Madeleine_Mori']

const poems = SUBJECTS.map((file) => {
  const meta = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'poems', `${file}.json`), 'utf8'))
  // The route matches `poem.url` -- the TITLE slug alone, not `author--title`. That is why the live
  // URL is /poem/december. The OBJECT name uses author--title; the ROUTE does not. Two different
  // derivations from the same metadata, and conflating them was my first mistake here.
  return {
    file,
    meta,
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

test.describe('a published poem plays', () => {
  for (const { file, route, scope } of poems) {
    test(`${file}: the player mounts and replays to the end`, async ({ page }) => {
      const failures: string[] = []
      page.on('response', (r) => {
        if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`)
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
      expect(
        await page.locator(`${scope} .editable p[data-line-number]`).count(),
        'both paragraphs should render',
      ).toBeGreaterThanOrEqual(2)

      // 4. Nothing 404ed or 403ed on the way. The production failures this suite exists to prevent
      //    were all 403s on an object whose name did not match what was uploaded.
      expect(failures, `requests failed:\n${failures.join('\n')}`).toEqual([])
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
