import { Page } from '@playwright/test'
import { test, expect } from './coverage'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import names from '../src/poems/poem-names.js'

// The poem's title and author at the top of its page, on every width from a wide window down to a phone (#416;
// Annelyse, GitHub midst-web #118): never over the poem, the logo, the arrows or the languages, and never off the
// screen. Geometry, not screenshots. The poem's text is invented. The title is the published poem whose title and
// author are longest together, chosen here by length; a failure names widths and what was touched, never the title.

const dir = join(__dirname, '../src/poems')
const meta = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .filter((m) => m.title && m.author)
  .sort((a, b) => b.title.length + b.author.length - (a.title.length + a.author.length))[0]
const scope = `.sliding-poems__poem--${names.poemId(meta.author, meta.title)}`
const route = `/poem/${names.poemUrl(meta.title)}/`
// Every 10px from 1440 down to 320, and both sides of each of the header's breakpoints.
const WIDTHS = [
  ...new Set([
    ...Array.from({ length: 113 }, (_, i) => 1440 - i * 10),
    1025, 1024, 961, 960, 651, 650, 601, 600, 599, 451, 450,
  ]),
].sort((a, b) => b - a)

const TEXT = '<p>zq xv wb zq xv wb zq xv wb zq xv wb zq xv</p><p>zq</p><p>zq xv wb zq xv</p>'

// A one-entry zip, as in phone-layout.spec.ts.
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
    editorTimelineFrames: Array.from({ length: 5 }, (_, i) => ({ content: TEXT, timestamp: i * 1000, lineNumber: 0 })),
    meta: { editorFontFamily: 'Courier', editorFontSize: 18, editorTitle: 'synthetic' },
  }
  const archive = zip(JSON.stringify(file))
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) {
      if (url.pathname.endsWith('.midst.zip')) return route.fulfill({ body: archive, contentType: 'application/zip' })
      return route.continue()
    }
    if (url.pathname.includes('/shapes/')) return route.fulfill({ body: '<svg xmlns="http://www.w3.org/2000/svg"/>', contentType: 'image/svg+xml' })
    return route.fulfill({ body: '', contentType: 'application/javascript' })
  })
})

// What the title and author touch at the window's current size, in words; empty when nothing.
function problems(page: Page): Promise<string[]> {
  return page.evaluate((sc) => {
    type Box = { left: number, right: number, top: number, bottom: number }
    const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    // The boxes of the text itself, line by line: a range over the element would also give its inline elements' boxes,
    // which reach past the words.
    const textLines = (el: Element) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const lines: DOMRect[] = []
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        lines.push(...[...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0))
      }
      return lines
    }
    const credit = textLines(document.querySelector('.site-header .poem-credit')!)
    const found: string[] = []
    if (!credit.length) found.push('the title is not drawn')
    const against: [string, DOMRect[]][] = [
      ['the poem', [...document.querySelectorAll(`${sc} .editable p`)].flatMap(textLines)],
      // The shapes drawn, not the svg's box, which is wider than its letters. On a poem's page the rest of the wordmark
      // is hidden (logo-idst--hidden, fading out) and only the M is drawn.
      ['the logo', [...document.querySelectorAll('.site-header h1 svg:not(.logo-idst--hidden)')]
        .flatMap((svg) => [...svg.querySelectorAll('path, polygon, rect, circle')].map((e) => e.getBoundingClientRect()))],
      ['the arrows', [...document.querySelectorAll('#poem-nav .arrow')].map((e) => e.getBoundingClientRect())],
      ['the languages', [...document.querySelectorAll('.language-selector')].map((e) => e.getBoundingClientRect())],
    ]
    for (const [what, boxes] of against) {
      const shown = boxes.filter((b) => b.width > 0 && b.height > 0)
      if (credit.some((l) => shown.some((b) => overlaps(l, b)))) found.push(`over ${what}`)
    }
    if (credit.some((l) => l.left < 0 || l.right > innerWidth)) found.push('off the screen')
    return found
  }, scope)
}

test('the title never covers the poem, the logo, the arrows or the languages, at any width', async ({ page }) => {
  await page.setViewportSize({ width: WIDTHS[0], height: 800 })
  await page.goto(route)
  await expect(page.locator(`${scope} .editable p`)).toHaveCount(3)
  // CONTROLS: everything the title is checked against is on the page, so an empty list is a finding.
  await expect(page.locator('.site-header h1 svg:not(.logo-idst--hidden) path').first()).toBeVisible()
  await expect(page.locator('#poem-nav .arrow').first()).toBeVisible()
  await expect(page.locator('.language-selector')).toBeVisible()
  const found: string[] = []
  for (const width of WIDTHS) {
    // eslint-disable-next-line no-await-in-loop -- one width at a time
    await page.setViewportSize({ width, height: 800 })
    // eslint-disable-next-line no-await-in-loop -- the layout settles before it is measured
    await page.waitForTimeout(100)
    // eslint-disable-next-line no-await-in-loop
    const here = await problems(page)
    if (here.length) found.push(`${width}px: ${here.join(', ')}`)
  }
  expect(found).toEqual([])
})

test('the small-screen notice still shows below 600px', async ({ page }) => {
  await page.setViewportSize({ width: 599, height: 800 })
  await page.goto(route)
  await expect(page.locator('.window-size-popup')).toBeVisible()
})
