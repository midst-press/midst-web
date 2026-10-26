import { Page } from '@playwright/test'
import { test, expect } from './coverage'
import { showDraftMarkers } from './draft-markers-on'
import { readFileSync } from 'fs'
import { join } from 'path'
import names from '../src/poems/poem-names.js'

// A poem and the newsletter bar on a phone, and the same pages on a desktop left as they were (#254).
// Geometry, not screenshots. Synthetic content only: invented words, never a poem or a poet's marker name.
// The poem is played on its own page, not in e2e/legacy-harness.html: that harness also loads the retired player's
// stylesheet (e2e/legacy-player/style.css), which the site does not, so its layout is not the site's.

const meta = JSON.parse(readFileSync(join(__dirname, '../src/poems/Madeleine_Mori.json'), 'utf8'))
const scope = `.sliding-poems__poem--${names.poemId(meta.author, meta.title)}`
const route = `/poem/${names.poemUrl(meta.title)}/`
const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 720 } // Desktop Chrome, as playwright.config.ts runs every spec

// Lines long enough to wrap on a phone, and one short one.
const TEXT = '<p>zq xv wb zq xv wb zq xv wb zq xv wb zq xv</p><p>zq</p><p>zq xv wb zq xv wb zq xv wb zq xv wb zq xv wb zq xv wb zq xv</p>'
// 41 frames. Markers 10 steps apart: far enough on a phone that their ticks stay separate rather than merging
// into one (#256 (b)); e2e/draft-markers.spec.ts covers markers close enough to merge.
const MARKERS = [0, 10, 20, 30]

// A one-entry zip, as in replay-follow.spec.ts.
function zip(body: string) {
  const filename = Buffer.from('synthetic.midst'), bytes = Buffer.from(body)
  const crc = require('zlib').crc32(bytes)
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4)
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26)
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6)
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(local.length + filename.length + bytes.length, 16)
  return Buffer.concat([local, filename, bytes, central, filename, end])
}

test.beforeEach(async ({ page, baseURL }) => {
  const file = {
    editorTimelineFrames: Array.from({ length: 41 }, (_, i) => ({ content: TEXT, timestamp: i * 1000, lineNumber: 0 })),
    meta: {
      editorFontFamily: 'Courier', editorFontSize: 18, editorHighestEverDraftNumber: MARKERS.length, editorTitle: 'synthetic',
      editorDraftMarkers: MARKERS.map((timelineIndex, i) => ({ timelineIndex, name: `zq marker ${i}`, defaultName: `Draft ${i}` })),
    },
  }
  const archive = zip(JSON.stringify(file))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) {
      if (url.pathname.endsWith('.midst.zip')) return route.fulfill({ body: archive, contentType: 'application/zip' })
      return route.continue()
    }
    if (url.pathname.includes('/shapes/')) return route.fulfill({ body: '<svg xmlns="http://www.w3.org/2000/svg"/>', contentType: 'image/svg+xml' })
    return route.fulfill({ body: '', contentType: 'application/javascript' })
  })
})

async function openPoem(page: Page, viewport: { width: number, height: number }) {
  await page.setViewportSize(viewport)
  await page.goto(route)
  // The small-screen notice stays (App.tsx); a reader dismisses it with a click, and so does this test.
  if (viewport.width < 600) await page.locator('.window-size-popup').click()
  const player = page.locator(scope)
  await expect(player.locator('.editable p')).toHaveCount(3)
  // The poems slide into place (.sliding-poems__frame, a 250ms transition); measure once this one has arrived.
  await expect.poll(() => player.evaluate(el => el.getBoundingClientRect().left)).toBe(0)
  // Only then turn its markers on (#324): a click while the poems are still sliding can land on the wrong one.
  await showDraftMarkers(player)
  await page.waitForTimeout(300)
  return player
}

type Box = { left: number, right: number, top: number, bottom: number }
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

test.describe('on a phone, 390 by 844', () => {
  test('every line of the poem is inside the screen, in a column most of its width', async ({ page }) => {
    const player = await openPoem(page, PHONE)
    // Each rendered line box of each paragraph, not the paragraph's box: a line can run past its paragraph.
    const lines = await player.locator('.editable p').evaluateAll(ps => ps.flatMap(p => {
      const range = document.createRange()
      range.selectNodeContents(p)
      return Array.from(range.getClientRects()).map(r => ({ left: r.left, right: r.right }))
    }))
    expect(lines.length).toBeGreaterThan(3) // the long lines wrapped
    for (const line of lines) {
      expect(line.left).toBeGreaterThanOrEqual(0)
      expect(line.right).toBeLessThanOrEqual(PHONE.width)
    }
    // And the column the lines are set in is most of the screen, not a sliver at its right edge.
    for (const p of await player.locator('.editable p').evaluateAll(ps => ps.map(p => p.getBoundingClientRect().width))) {
      expect(p).toBeGreaterThanOrEqual(PHONE.width * 0.6)
    }
    const editor = await player.locator('.editor').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(editor.scroll, 'nothing in the poem runs off sideways').toBeLessThanOrEqual(editor.client)
  })

  test('draft markers are ticks, without labels, and do not overlap', async ({ page }) => {
    const player = await openPoem(page, PHONE)
    const markers = player.locator('.draft-marker')
    await expect(markers).toHaveCount(MARKERS.length)
    const boxes: Box[] = await markers.evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `markers ${i} and ${j} overlap`).toBe(false)
    }
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(PHONE.width)
    }
    for (const name of await player.locator('.draft-marker-name').all()) await expect(name).toBeHidden()
    // Still named for screen readers and on hover, and still a way to jump.
    await expect(markers.first()).toHaveAttribute('aria-label', 'Jump to zq marker 0')
    await markers.nth(1).click()
    await expect(player.getByRole('slider', { name: 'Timeline' })).toHaveValue(String(MARKERS[1]))
  })

  // #256: each tick is tapped through a box around it, 24 by 24 unless a neighbouring tick is nearer than 24px -
  // which, at this spacing, none of these are (#256 (b): any that were would merge into one tick instead; see
  // e2e/draft-markers.spec.ts for that case).
  test('a tick is the size it was, on its marker, inside a 24px box a tap can reach', async ({ page }) => {
    const player = await openPoem(page, PHONE)
    const slider = player.getByRole('slider', { name: 'Timeline' })
    const ticks = await player.locator('.draft-marker').evaluateAll((els, steps) => {
      const row = els[0].parentElement!.getBoundingClientRect()
      return els.map((el, i) => {
        const r = el.getBoundingClientRect(), after = getComputedStyle(el, '::after')
        return {
          left: r.left, right: r.right, top: r.top, bottom: r.bottom,
          tick: r.left + parseFloat(after.left), place: row.left + steps[i] / 40 * row.width,
          size: [after.borderLeftWidth, after.borderRightWidth, after.borderTopWidth, after.height].join(' '),
        }
      })
    }, MARKERS)
    for (const t of ticks) {
      expect(t.size, 'the tick is drawn as before').toBe('5px 5px 5px 0px')
      expect(Math.abs(t.tick - t.place), 'the tick is on its marker').toBeLessThan(0.5)
      expect(t.bottom - t.top).toBeCloseTo(24, 0)
      // Each marker here has room for a whole box: none is nearer than 24px to its neighbour.
      expect(t.right - t.left).toBeCloseTo(24, 0)
    }
    // A tap off the tick reaches it: 11px left of the last marker and near the box's top edge.
    const last = ticks[ticks.length - 1]
    await page.mouse.click(last.tick - 11, last.top + 2)
    await expect(slider).toHaveValue(String(MARKERS[MARKERS.length - 1]))
  })

  test('the newsletter bar is a footer at the end of the page, its fields stacked inside the screen', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto('/about')
    await page.locator('.window-size-popup').click()
    const form = page.locator('.site-footer .campaign-monitor-form')
    await expect(form.locator('button[type=submit]')).toBeVisible()
    const parts = await page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY }
      }
      const footer = document.querySelector('.site-footer')!
      // Every line of text in the page's main content.
      const text: Array<ReturnType<typeof box>> = []
      const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent!.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const r of Array.from(range.getClientRects())) {
          if (r.width && r.height) text.push({ left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY })
        }
      }
      return {
        controls: Array.from(footer.querySelectorAll('.campaign-monitor-form label, .campaign-monitor-form input, .campaign-monitor-form button, .patreon-logo')).map(box),
        footer: [footer.querySelector('.campaign-monitor-form')!, footer.querySelector('.patreon-logo')!].map(box),
        text,
        pageWidth: document.documentElement.scrollWidth,
      }
    })
    expect(parts.controls).toHaveLength(5) // label, name, email, submit, Patreon
    expect(parts.text.length).toBeGreaterThan(10)
    expect(parts.pageWidth, 'nothing makes the page wider than the phone').toBeLessThanOrEqual(PHONE.width)
    for (const control of parts.controls) {
      expect(control.left).toBeGreaterThanOrEqual(0)
      expect(control.right).toBeLessThanOrEqual(PHONE.width)
    }
    for (let i = 0; i < parts.controls.length; i++) {
      for (let j = i + 1; j < parts.controls.length; j++) {
        expect(overlaps(parts.controls[i], parts.controls[j]), `footer controls ${i} and ${j} overlap`).toBe(false)
      }
    }
    const [bar] = parts.footer
    for (const control of parts.controls.slice(0, 4)) {
      expect(control.top >= bar.top && control.bottom <= bar.bottom, 'every field and the Submit button inside the bar').toBe(true)
    }
    for (const line of parts.text) {
      for (const part of parts.footer) expect(overlaps(line, part), 'the footer covers no text').toBe(false)
    }
    // In the page, not over it: it scrolls away with the text instead of following the reader down the screen.
    for (const selector of ['.site-footer', '.site-footer .campaign-monitor-form', '.site-footer .patreon-logo']) {
      expect(await page.locator(selector).evaluate(el => getComputedStyle(el).position), selector).not.toBe('fixed')
    }
  })
})

// The labels come back at 600px, where the small-screen notice stops: the boundary of the tick-only rule.
test('at 600px wide the draft markers keep their labels', async ({ page }) => {
  const player = await openPoem(page, { width: 600, height: 844 })
  for (const name of await player.locator('.draft-marker-name').all()) await expect(name).toBeVisible()
})

// The desktop as it was before #254, pinned: a change to the player's or the footer's desktop layout fails here. Only what
// does not depend on a font's measurements is pinned, so the test holds wherever Courier, Arial or Futura render
// differently.
test('on a desktop, the poem, its markers and the newsletter bar are where they were', async ({ page }) => {
  const player = await openPoem(page, DESKTOP)
  const poem = await player.evaluate(root => {
    const css = (el: Element, keys: string[]) => Object.fromEntries(keys.map(k => [k, getComputedStyle(el).getPropertyValue(k)]))
    const editable = root.querySelector('.editable')!
    const box = editable.getBoundingClientRect(), around = editable.parentElement!.getBoundingClientRect()
    const row = root.querySelector('.draft-markers')!.getBoundingClientRect()
    return {
      editor: css(root.querySelector('.editor')!, ['text-align', 'padding-left', 'padding-right']),
      editable: css(editable, ['display', 'text-align', 'transform', 'padding-left', 'padding-right']),
      // Centred before its 20px shift to the right, and every line starting at its left edge.
      centreOffset: Math.round((box.left - 20 + box.right - 20) / 2 - (around.left + around.right) / 2),
      paragraphs: Array.from(root.querySelectorAll('.editable p')).map(p => ({
        ...css(p, ['float', 'clear']), offset: Math.round(p.getBoundingClientRect().left - box.left),
      })),
      // Each marker's pointer at its place along the row; the label above it, the same height as before.
      markers: Array.from(root.querySelectorAll('.draft-marker')).map(el => {
        const r = el.getBoundingClientRect(), name = el.querySelector('.draft-marker-name')!
        return { at: Math.round(((r.left + r.right) / 2 - row.left) / row.width * 400) / 10, top: Math.round(r.top), height: Math.round(r.height),
          name: { display: getComputedStyle(name).display, height: Math.round(name.getBoundingClientRect().height) } }
      }),
    }
  })
  expect(poem).toEqual({
    editor: { 'text-align': 'center', 'padding-left': '224px', 'padding-right': '224px' },
    editable: { display: 'inline-block', 'text-align': 'left', transform: 'matrix(1, 0, 0, 1, 20, 0)', 'padding-left': '0px', 'padding-right': '20px' },
    centreOffset: 0,
    paragraphs: Array(3).fill({ float: 'none', clear: 'both', offset: 0 }),
    markers: MARKERS.map(at => ({ at, top: 606, height: 33, name: { display: 'block', height: 28 } })),
  })

  await page.goto('/about')
  const footer = await page.evaluate(() => {
    const at = (selector: string) => {
      const el = document.querySelector(selector)!, r = el.getBoundingClientRect(), style = getComputedStyle(el)
      return { position: style.position, float: style.float, top: Math.round(r.top), height: Math.round(r.height), left: Math.round(r.left), width: Math.round(r.width) }
    }
    const form = '.site-footer .campaign-monitor-form'
    const name = at(`${form} input[name="cm-name"]`), email = at(`${form} input[type="email"]`)
    const label = at(`${form} label`), button = at(`${form} button`)
    return {
      footer: at('.site-footer'), form: at(form), logo: at('.site-footer .patreon-logo'),
      name: { ...name, left: undefined }, email: { ...email, left: email.left - (name.left + name.width) },
      label: { ...label, left: label.left, width: undefined }, button: { ...button, left: undefined, width: undefined },
    }
  })
  expect(footer).toEqual({
    footer: { position: 'fixed', float: 'none', top: 720, height: 0, left: 30, width: 0 },
    form: { position: 'fixed', float: 'none', top: 683, height: 37, left: 0, width: 1280 },
    logo: { position: 'fixed', float: 'none', top: 689, height: 28, left: 1247, width: 28 },
    label: { position: 'static', float: 'left', top: 689, height: 26, left: 20, width: undefined },
    // 20vw wide, with 5px of padding and the border; the email field 10px to the right of the name field.
    name: { position: 'static', float: 'left', top: 689, height: 28, left: undefined, width: 263 },
    email: { position: 'static', float: 'left', top: 689, height: 28, left: 10, width: 263 },
    button: { position: 'static', float: 'none', top: 689, height: 28, left: undefined, width: undefined },
  })
})
