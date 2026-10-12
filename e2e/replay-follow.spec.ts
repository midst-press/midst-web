import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import names from '../src/poems/poem-names.js'

// Website adaptation of midst-editor #21's recorder and verdict. Quiet ticks retain the last target;
// only a shrink that forces the old scroll position out of range is exempted as a browser clamp.
type Sample = [number, number, boolean, number, number, boolean, boolean]
type Rec = { samples: Sample[], viewport: number }
const meta = JSON.parse(readFileSync(join(__dirname, '../src/poems/Madeleine_Mori.json'), 'utf8'))
const scope = `.sliding-poems__poem--${names.poemId(meta.author, meta.title)}`

async function record(page: Page, done: () => Promise<void>): Promise<Rec> {
  await page.evaluate(selector => {
    const g = window as any
    g.followSamples = []
    let last: string[] = [], target: [number, number] | null = null
    let lastHeight = 0, lastTop = 0
    const start = performance.now()
    g.followTimer = setInterval(() => {
      const pm = document.querySelector(`${selector} .editable`) as HTMLElement | null
      let s = pm
      while (s && !(s.scrollHeight > s.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement
      if (!pm || !s) return
      g.followViewport = s.clientHeight
      const maximum = s.scrollHeight - s.clientHeight
      const clamped = s.scrollHeight < lastHeight && lastTop > maximum + 0.5 && Math.abs(s.scrollTop - maximum) < 1
      lastHeight = s.scrollHeight; lastTop = s.scrollTop
      const ps = Array.from(pm.children) as HTMLElement[]
      const now = ps.map(p => p.textContent || '')
      let k = -1
      if (last.length) for (let i = 0; i < Math.max(now.length, last.length); i++) {
        if (now[i] !== last[i]) { k = Math.min(i, now.length - 1); break }
      }
      const changed = k >= 0
      if (changed) {
        let c = 0
        const previous = last[k] || ''
        while (c < now[k].length && now[k][c] === previous[c]) c++
        target = [k, c]
      }
      last = now
      if (!target || !ps[target[0]]) return
      const walk = document.createTreeWalker(ps[target[0]], NodeFilter.SHOW_TEXT)
      let n = walk.nextNode() as Text | null, left = target[1]
      while (n && left > n.length) { left -= n.length; n = walk.nextNode() as Text | null }
      const box = s.getBoundingClientRect()
      let rect = ps[target[0]].getBoundingClientRect()
      if (n) {
        const range = document.createRange()
        range.setStart(n, Math.min(left, n.length)); range.setEnd(n, Math.min(left, n.length))
        const rr = range.getBoundingClientRect()
        if (rr.height) rect = rr
      }
      g.followSamples.push([target[0], target[1], rect.top >= box.top && rect.bottom <= box.bottom, s.scrollTop, performance.now() - start, changed, clamped])
    }, 20)
  }, scope)
  await done()
  return page.evaluate(() => {
    const g = window as any
    clearInterval(g.followTimer)
    return { samples: g.followSamples, viewport: g.followViewport || 0 }
  })
}

function verdict({ samples, viewport }: Rec) {
  const stretches: Sample[][] = []
  for (const sample of samples) {
    const current = stretches[stretches.length - 1], previous = current && current[current.length - 1]
    if (previous && previous[0] === sample[0] && Math.abs(previous[1] - sample[1]) < 40) current.push(sample)
    else stretches.push([sample])
  }
  const settled = stretches.filter(s => s[s.length - 1][4] - s[0][4] > 500)
  const moving = samples.map((s, i) => i > 0 && !s[6] && Math.abs(s[3] - samples[i - 1][3]) > 0.5)
  let abrupt = 0, instant = 0, wroteWhileGliding = 0
  for (let i = 1; i < samples.length; i++) if (moving[i] && Math.abs(samples[i][3] - samples[i - 1][3]) > viewport / 3) abrupt++
  let i = 1
  while (i < samples.length) {
    if (!moving[i]) { i++; continue }
    let j = i
    while (j + 1 < samples.length && moving[j + 1]) j++
    if (Math.abs(samples[j][3] - samples[i - 1][3]) > 50 && j - i + 1 < 3) instant++
    for (let m = i + 1; m < j; m++) if (samples[m][5]) wroteWhileGliding++
    i = j + 1
  }
  return { settled: settled.length, viewport, unfollowed: settled.filter(s => !s[s.length - 1][2]).length, abrupt, instant, wroteWhileGliding }
}

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

test('follow verdict rejects quiet offscreen writing, instant jumps and writing during a glide', () => {
  const run = (visible: boolean, tops: number[], edits: number[] = [0]): Rec => ({ viewport: 600, samples: tops.map((top, i) => [1, 0, visible, top, i * 20, edits.includes(i), false]) })
  expect(verdict(run(true, Array(60).fill(0)))).toMatchObject({ unfollowed: 0, instant: 0, abrupt: 0, wroteWhileGliding: 0 })
  expect(verdict(run(false, Array(125).fill(0))).unfollowed).toBe(1)
  expect(verdict(run(true, [...Array(30).fill(0), ...Array(30).fill(200)])).instant).toBe(1)
  const glide = Array.from({ length: 60 }, (_, i) => Math.min(300, i * 30))
  expect(verdict(run(true, glide)).wroteWhileGliding).toBe(0)
  expect(verdict(run(true, glide, [0, 5])).wroteWhileGliding).toBe(1)
  expect(verdict(run(true, [...Array(30).fill(0), ...Array(30).fill(400)])).abrupt).toBe(1)
})

test('recorder observes quiet offscreen writing and distinguishes forced clamps from voluntary jumps', async ({ page }) => {
  const controlled = async (count: number) => page.setContent(`<div class="${scope.slice(1)}"><div style="height:600px;overflow-y:auto"><div class="editable">${Array.from({ length: count }, (_, i) => `<p style="height:20px;margin:0">line ${i}</p>`).join('')}</div></div></div>`)
  await controlled(150)
  const quiet = await record(page, async () => {
    await page.waitForTimeout(100)
    await page.locator('.editable p').nth(140).evaluate(p => { p.textContent += 'x' })
    await page.waitForTimeout(700)
  })
  expect(verdict(quiet).unfollowed).toBe(1)
  const scenario = async (top: number, to: number | null) => {
    await controlled(90)
    await page.locator('.editable').evaluate((p, position) => { p.parentElement!.scrollTop = position }, top)
    return record(page, async () => {
      await page.waitForTimeout(100)
      await page.locator('.editable p').nth(Math.floor(top / 20) + 2).evaluate(p => { p.textContent += 'x' })
      await page.waitForTimeout(200)
      await page.locator('.editable').evaluate((p, position) => {
        Array.from(p.children).slice(45).forEach(child => child.remove())
        if (position !== null) p.parentElement!.scrollTop = position
      }, to)
      await page.waitForTimeout(200)
    })
  }
  const voluntary = verdict(await scenario(0, 300))
  expect(voluntary.instant + voluntary.abrupt).toBeGreaterThan(0)
  expect(verdict(await scenario(1200, null))).toMatchObject({ instant: 0, abrupt: 0 })
})

for (const height of [600, 720]) for (const position of ['end', 'middle']) test(`writing jumps are followed gently and playback waits: ${position}, height ${height}`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height })
  const lines = Array.from({ length: 150 }, (_, i) => `synthetic line ${i}`)
  const html = () => lines.map(line => `<p>${line}</p>`).join('')
  const snapshots = [html()]
  for (const target of [140, 4, 110, 20]) for (let n = 0; n < 12; n++) {
    const line = lines[target]
    const at = position === 'end' ? line.length : 5
    lines[target] = line.slice(0, at) + 'z' + line.slice(at)
    snapshots.push(html())
  }
  const archive = zip('midstVersion: 1\n' + JSON.stringify({ text: snapshots[snapshots.length - 1], history: snapshots.map((inserted, i) => ({ front: 0, end: 0, inserted, t: i * 1000, pos: 0 })) }))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) {
      if (url.pathname.endsWith('.midst.zip')) return route.fulfill({ body: archive, contentType: 'application/zip' })
      return route.continue()
    }
    if (url.pathname.endsWith('/zip.js')) return route.fulfill({ path: join(__dirname, '../static/static/scripts/zip.js'), contentType: 'application/javascript' })
    if (url.pathname.includes('/shapes/')) return route.fulfill({ body: '<svg xmlns="http://www.w3.org/2000/svg"/>', contentType: 'image/svg+xml' })
    return route.fulfill({ body: '', contentType: 'application/javascript' })
  })
  await page.goto(`/poem/${names.poemUrl(meta.title)}/`)
  const player = page.locator(scope)
  await expect(player.locator('.editable p')).toHaveCount(150)
  const rec = await record(page, async () => {
    await player.locator('.play-pause-button').click()
    await expect(player.locator('.play-pause-button')).toHaveClass(/playing/)
    await expect(player.locator('.play-pause-button')).not.toHaveClass(/playing/, { timeout: 60000 })
    await page.waitForTimeout(1700)
  })
  const result = verdict(rec)
  if (process.env.FOLLOW_DEBUG) console.log(JSON.stringify({ result, jumps: rec.samples.map((s, i) => ({ s, previous: rec.samples[i - 1] })).filter(({ s, previous }) => previous && Math.abs(s[3] - previous[3]) > rec.viewport / 3) }))
  expect(result.settled, 'no settled writing measured').toBeGreaterThan(0)
  expect(result.viewport, 'no scroll container measured').toBeGreaterThan(0)
  expect(result).toMatchObject({ unfollowed: 0, abrupt: 0, instant: 0, wroteWhileGliding: 0 })
})
