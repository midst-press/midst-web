import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import names from '../src/poems/poem-names.js'

// Website adaptation of midst-editor #21's recorder and verdict. Quiet ticks retain the last target;
// only a shrink that forces the old scroll position out of range is exempted as a browser clamp.
type Sample = [number, number, boolean, number, number, boolean, boolean]
type Rec = { samples: Sample[], viewport: number, rafIntervals?: number[], framePositions?: Array<[number, number, boolean]>, layout?: { paragraphFloat: string, documentHeight: number, scrollHeight: number, overflowAnchor: string }, longTasks?: { count: number, top5: Array<{ duration: number, startTime: number }> }, cacheValid?: { cachedSH: number, cachedCH: number, directSH: number, directCH: number, match: boolean } | null }
const meta = JSON.parse(readFileSync(join(__dirname, '../src/poems/Madeleine_Mori.json'), 'utf8'))
const scope = `.sliding-poems__poem--${names.poemId(meta.author, meta.title)}`
// Motion measurement must not include continuous screenshot/DOM trace capture overhead.
// Numeric recordings below are retained as attachments; failure screenshots still run afterward.
test.use({ trace: 'off' })

async function record(page: Page, done: () => Promise<void>, selector = scope): Promise<Rec> {
  await page.evaluate(selector => {
    const g = window as any
    g.followSamples = []
    g.followRafIntervals = []
    g.followFramePositions = []
    g.followScroller = null
    let frameHeight = 0, frameTop = 0
    // DIAGNOSTIC: log long tasks
    g.followLongTasks = []
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          g.followLongTasks.push({ duration: entry.duration, startTime: entry.startTime })
        }
      }).observe({ type: 'longtask', buffered: true })
    } catch {}
    let previousFrame: number | undefined
    // ResizeObserver caches layout sizes; per-frame reads only scrollTop (no forced reflow).
    g.cachedScrollHeight = 0; g.cachedClientHeight = 0
    let roScroll: ResizeObserver | null = null, roContent: ResizeObserver | null = null
    const setupRO = (scroller: HTMLElement) => {
      if (roScroll) return
      g.cachedClientHeight = scroller.clientHeight
      const content = scroller.firstElementChild as HTMLElement | null
      if (content) g.cachedScrollHeight = content.scrollHeight
      roScroll = new ResizeObserver(() => { g.cachedClientHeight = scroller.clientHeight })
      roScroll.observe(scroller)
      if (content) { roContent = new ResizeObserver(() => { g.cachedScrollHeight = content.scrollHeight }); roContent.observe(content) }
      g.roScroll = roScroll; g.roContent = roContent
    }
    const frame = (now: number) => {
      if (previousFrame !== undefined) g.followRafIntervals.push(now - previousFrame)
      previousFrame = now
      const scroller = g.followScroller as HTMLElement | null
      if (scroller) {
        if (!roScroll) setupRO(scroller)
        const maximum = g.cachedScrollHeight - g.cachedClientHeight
        const clamped = g.cachedScrollHeight < frameHeight && frameTop > maximum + 0.5 && Math.abs(scroller.scrollTop - maximum) < 1
        g.followFramePositions.push([scroller.scrollTop, now, clamped])
        frameHeight = g.cachedScrollHeight; frameTop = scroller.scrollTop
      }
      g.followRaf = requestAnimationFrame(frame)
    }
    g.followRaf = requestAnimationFrame(frame)
    let last: string[] = [], target: [number, number] | null = null
    let lastHeight = 0, lastTop = 0
    const start = performance.now()
    g.followTimer = setInterval(() => {
      const pm = document.querySelector(`${selector} .editable`) as HTMLElement | null
      let s = pm
      while (s && !(s.scrollHeight > s.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement
      if (!pm || !s) return
      g.followScroller = s
      g.followViewport = s.clientHeight
      g.followLayout = { paragraphFloat: pm.firstElementChild ? getComputedStyle(pm.firstElementChild).cssFloat : '', documentHeight: pm.getBoundingClientRect().height, scrollHeight: s.scrollHeight, overflowAnchor: getComputedStyle(s).getPropertyValue('overflow-anchor') }
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
  }, selector)
  await done()
  return page.evaluate(() => {
    const g = window as any
    clearInterval(g.followTimer)
    cancelAnimationFrame(g.followRaf)
    if (g.roScroll) g.roScroll.disconnect()
    if (g.roContent) g.roContent.disconnect()
    const scroller = g.followScroller as HTMLElement | null
    let cacheValid = null
    if (scroller) {
      const content = scroller.firstElementChild as HTMLElement | null
      const directSH = content ? content.scrollHeight : scroller.scrollHeight
      const directCH = scroller.clientHeight
      cacheValid = { cachedSH: g.cachedScrollHeight, cachedCH: g.cachedClientHeight, directSH, directCH, match: g.cachedScrollHeight === directSH && g.cachedClientHeight === directCH }
    }
    const lt = (g.followLongTasks || []).sort((a: any, b: any) => b.duration - a.duration)
    return { samples: g.followSamples, viewport: g.followViewport || 0, rafIntervals: g.followRafIntervals, framePositions: g.followFramePositions, layout: g.followLayout, longTasks: { count: lt.length, top5: lt.slice(0, 5) }, cacheValid }
  })
}

function verdict({ samples, viewport, framePositions = [] }: Rec) {
  const stretches: Sample[][] = []
  for (const sample of samples) {
    const current = stretches[stretches.length - 1], previous = current && current[current.length - 1]
    if (previous && previous[0] === sample[0] && Math.abs(previous[1] - sample[1]) < 40) current.push(sample)
    else stretches.push([sample])
  }
  const settled = stretches.filter(s => s[s.length - 1][4] - s[0][4] > 500)
  const moving = samples.map((s, i) => i > 0 && !s[6] && Math.abs(s[3] - samples[i - 1][3]) > 0.5)
  let abrupt = 0, instant = 0, wroteWhileGliding = 0
  // The original limit is a third of the view per 20ms, not per arbitrarily delayed sample.
  for (let i = 1; i < samples.length; i++) {
    const elapsed = samples[i][4] - samples[i - 1][4]
    if (moving[i] && (elapsed <= 0 || Math.abs(samples[i][3] - samples[i - 1][3]) * 20 / elapsed > viewport / 3)) abrupt++
  }
  // Separately catch real display steps: a slow renderer must not be cleared by time averaging.
  const frameAbrupt = framePositions.filter((f, i) => i > 0 && !f[2] && Math.abs(f[0] - framePositions[i - 1][0]) > viewport / 3).length
  let i = 1
  while (i < samples.length) {
    if (!moving[i]) { i++; continue }
    let j = i
    while (j + 1 < samples.length && moving[j + 1]) j++
    if (Math.abs(samples[j][3] - samples[i - 1][3]) > 50 && samples[j][4] - samples[i - 1][4] < 60) instant++
    for (let m = i + 1; m < j; m++) if (samples[m][5]) wroteWhileGliding++
    i = j + 1
  }
  const offscreenEdits = stretches.reduce((total, stretch) => {
    let first = true
    for (const sample of stretch) if (sample[5]) { if (!first && !sample[2]) total++; first = false }
    return total
  }, 0)
  return { settled: settled.length, settledTargets: Array.from(new Set(settled.map(s => s[0][0]))), viewport, unfollowed: settled.filter(s => !s[s.length - 1][2]).length, offscreenEdits, abrupt, frameAbrupt, instant, wroteWhileGliding }
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

async function serveArchive(page: Page, baseURL: string, archive: Buffer) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL).origin) {
      if (url.pathname.endsWith('.midst.zip')) return route.fulfill({ body: archive, contentType: 'application/zip' })
      return route.continue()
    }
    if (url.pathname.endsWith('/zip.js')) return route.fulfill({ path: join(__dirname, '../static/static/scripts/zip.js'), contentType: 'application/javascript' })
    if (url.pathname.includes('/shapes/')) return route.fulfill({ body: '<svg xmlns="http://www.w3.org/2000/svg"/>', contentType: 'image/svg+xml' })
    return route.fulfill({ body: '', contentType: 'application/javascript' })
  })
}

test('presentation reaches rendered paragraphs and draft buttons seek exact unchanged-history indices', async ({ page, baseURL }) => {
  const contents = ['<p>synthetic first</p>', '<p>synthetic first</p>', '<p>synthetic final</p>']
  const file = { text: contents[2], history: contents.map((inserted, i) => ({ front: 0, end: 0, inserted, t: i * 1000 })),
    meta: { fontFamily: 'Courier', fontSize: 24, futureField: 7, draftMarkers: [
      { index: 0, name: 'synthetic first draft', defaultName: 'Draft 1' },
      { index: 1, name: 'synthetic unchanged draft', defaultName: 'Draft 2' },
      { index: 2, name: 'synthetic final draft', defaultName: 'Draft 3' },
      { index: 3, name: 'synthetic outside draft', defaultName: 'Draft 4' },
    ] } }
  await serveArchive(page, baseURL!, zip(JSON.stringify(file)))
  await page.goto(`/poem/${names.poemUrl(meta.title)}/`)
  const player = page.locator(scope)
  await expect(player.locator('.editable')).toContainText('synthetic final')
  const computed = await player.locator('.editable p').evaluate(p => ({ size: getComputedStyle(p).fontSize, family: getComputedStyle(p).fontFamily }))
  expect(computed.size).toBe('24px')
  expect(computed.family).toContain('Courier')
  await expect(player.locator('.draft-marker')).toHaveCount(3)
  await expect(player.getByRole('button', { name: 'Jump to synthetic outside draft' })).toHaveCount(0)
  await player.getByRole('button', { name: 'Jump to synthetic unchanged draft', exact: true }).click()
  await expect(player.getByRole('slider', { name: 'Timeline' })).toHaveValue('1')
  await expect(player.locator('.editable')).toContainText('synthetic first')
  await player.getByRole('button', { name: 'Jump to synthetic final draft', exact: true }).click()
  await expect(player.getByRole('slider', { name: 'Timeline' })).toHaveValue('2')
  await expect(player.locator('.editable')).toContainText('synthetic final')
})

test('B font and legacy-index draft markers remain supported', async ({ page, baseURL }) => {
  const content = '<p>synthetic legacy</p>'
  const file = { editorTimelineFrames: [0, 1].map(i => ({ content, timestamp: i * 1000, lineNumber: 0 })),
    meta: { editorFontFamily: 'Times New Roman', editorFontSize: 36, editorHighestEverDraftNumber: 4, editorTitle: 'synthetic title',
      editorDraftMarkers: [-1, 0, 1, 2].map(timelineIndex => ({ timelineIndex, name: `synthetic ${timelineIndex}`, defaultName: 'Draft' })) } }
  await serveArchive(page, baseURL!, zip(JSON.stringify(file)))
  await page.goto(`/poem/${names.poemUrl(meta.title)}/`)
  const player = page.locator(scope)
  await expect(player.locator('.editable')).toContainText('synthetic legacy')
  expect(await player.locator('.editable p').evaluate(p => getComputedStyle(p).fontSize)).toBe('36px')
  await expect(player.locator('.draft-marker')).toHaveCount(2)
  await player.getByRole('button', { name: 'Jump to synthetic 0', exact: true }).click()
  await expect(player.getByRole('slider', { name: 'Timeline' })).toHaveValue('0')
})

test('static C history has no valid draft index and rendering defaults handle unusable presentation values', async ({ page, baseURL }) => {
  for (const presentation of [undefined, { fontSize: 0, fontFamily: '' }, { fontSize: -1, fontFamily: ' ' }, { fontSize: 17.5, fontFamily: 'SYNTHETIC_UNKNOWN_FONT' }]) {
    const file = { text: '<p>synthetic static</p>', history: [], meta: { ...presentation, draftMarkers: [{ index: 0, name: 'synthetic invalid index', defaultName: 'Draft' }] } }
    await serveArchive(page, baseURL!, zip(JSON.stringify(file)))
    await page.goto(`/poem/${names.poemUrl(meta.title)}/`)
    const player = page.locator(scope)
    await expect(player.locator('.editable')).toContainText('synthetic static')
    await expect(player.locator('.draft-marker')).toHaveCount(0)
    await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeDisabled()
    const expected = presentation && presentation.fontSize > 0 ? presentation.fontSize : 14
    expect(await player.locator('.editable p').evaluate(p => getComputedStyle(p).fontSize)).toBe(`${expected}px`)
  }
})

test('follow verdict rejects quiet offscreen writing, instant jumps and writing during a glide', () => {
  const run = (visible: boolean, tops: number[], edits: number[] = [0]): Rec => ({ viewport: 600, samples: tops.map((top, i) => [1, 0, visible, top, i * 20, edits.includes(i), false]) })
  expect(verdict(run(true, Array(60).fill(0)))).toMatchObject({ unfollowed: 0, instant: 0, abrupt: 0, wroteWhileGliding: 0 })
  expect(verdict(run(false, Array(125).fill(0))).unfollowed).toBe(1)
  expect(verdict(run(true, [...Array(30).fill(0), ...Array(30).fill(200)])).instant).toBe(1)
  const glide = Array.from({ length: 60 }, (_, i) => Math.min(300, i * 30))
  expect(verdict(run(true, glide)).wroteWhileGliding).toBe(0)
  expect(verdict(run(true, glide, [0, 5])).wroteWhileGliding).toBe(1)
  expect(verdict(run(true, [...Array(30).fill(0), ...Array(30).fill(400)])).abrupt).toBe(1)
  // Late sampling of a genuinely smooth glide is not an instant move. Independent rendered-frame
  // data still rejects a real 400px display step, even though its average sampled speed is small.
  const late = run(true, Array.from({ length: 30 }, (_, i) => Math.min(400, i * 100)))
  late.samples.forEach((sample, i) => { sample[4] = i * 100 })
  expect(verdict(late)).toMatchObject({ abrupt: 0, instant: 0 })
  expect(verdict({ ...late, framePositions: [[0, 0, false], [400, 100, false]] }).frameAbrupt).toBe(1)
  const arrivedLate = run(false, Array(60).fill(0), [0, 5, 10])
  arrivedLate.samples[arrivedLate.samples.length - 1][2] = true
  expect(verdict(arrivedLate)).toMatchObject({ unfollowed: 0, offscreenEdits: 2 })
})

test('@frame-budget recorder observes quiet offscreen writing and distinguishes forced clamps from voluntary jumps', async ({ page }) => {
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
  const voluntary = await scenario(0, 300)
  const sampler = voluntary.samples.slice(1).map((s, i) => s[4] - voluntary.samples[i][4]).sort((a, b) => a - b)
  expect(sampler.length, 'invalid measurement: sampler must have run').toBeGreaterThan(0)
  expect(sampler[sampler.length - 1], 'invalid measurement: sampler interval must stay below 50ms to detect instant moves').toBeLessThan(50)
  const voluntaryResult = verdict(voluntary)
  expect(voluntaryResult.instant + voluntaryResult.abrupt).toBeGreaterThan(0)
  const forced = await scenario(1200, null)
  const forcedSampler = forced.samples.slice(1).map((s, i) => s[4] - forced.samples[i][4]).sort((a, b) => a - b)
  expect(forcedSampler.length, 'invalid measurement: sampler must have run').toBeGreaterThan(0)
  expect(forcedSampler[forcedSampler.length - 1], 'invalid measurement: sampler interval must stay below 50ms to detect instant moves').toBeLessThan(50)
  expect(verdict(forced)).toMatchObject({ instant: 0, abrupt: 0 })
})

function jumpingFile(position: string) {
  const lines = Array.from({ length: 150 }, (_, i) => `synthetic line ${i}`)
  const html = () => lines.map(line => `<p>${line}</p>`).join('')
  const snapshots = [html()]
  for (const target of [140, 4, 110, 20]) for (let n = 0; n < 12; n++) {
    const line = lines[target]
    const at = position === 'end' ? line.length : 5
    lines[target] = line.slice(0, at) + 'z' + line.slice(at)
    snapshots.push(html())
  }
  return 'midstVersion: 1\n' + JSON.stringify({ text: snapshots[snapshots.length - 1], history: snapshots.map((inserted, i) => ({ front: 0, end: 0, inserted, t: i * 1000, pos: 0 })) })
}

for (const position of ['end', 'middle']) test(`actual legacy runtime rejects the same follow scenario: ${position}`, async ({ page, baseURL }) => {
  const raw = jumpingFile(position)
  await serveArchive(page, baseURL!, zip(raw))
  await page.goto('/legacy-harness.html')
  await page.waitForFunction(() => typeof (window as any).mountLegacyReplay === 'function')
  await page.evaluate(file => (window as any).mountLegacyReplay(file), raw)
  const control = page.locator('#legacy-control')
  await expect(control.locator('.editable p')).toHaveCount(150)
  const rec = await record(page, async () => {
    await control.locator('.play-pause-button').click()
    await expect(control.locator('.play-pause-button')).toHaveClass(/playing/)
    await expect(control.locator('.play-pause-button')).not.toHaveClass(/playing/, { timeout: 60000 })
    await page.waitForTimeout(1700)
  }, '#legacy-control')
  const result = verdict(rec)
  expect(result.settledTargets).toEqual(expect.arrayContaining([140, 4, 110, 20]))
  expect(result.unfollowed, 'the actual legacy player must discriminate the follow guard').toBeGreaterThan(0)
})

for (const height of [600, 720]) for (const position of ['end', 'middle']) test(`@frame-budget writing jumps are followed gently and playback waits: ${position}, height ${height}`, async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 1280, height })
  const archive = zip(jumpingFile(position))
  await serveArchive(page, baseURL!, archive)
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
  const intervals = (rec.rafIntervals || []).slice().sort((a, b) => a - b)
  const sampler = rec.samples.slice(1).map((sample, i) => sample[4] - rec.samples[i][4]).sort((a, b) => a - b)
  await testInfo.attach('follow-motion', { body: Buffer.from(JSON.stringify(rec)), contentType: 'application/json' })
  console.log(JSON.stringify({ follow: { height, position, result }, raf: { count: intervals.length, medianMs: intervals.length ? intervals[Math.floor(intervals.length / 2)] : null, maxMs: intervals.length ? intervals[intervals.length - 1] : null }, sampler: { medianMs: sampler.length ? sampler[Math.floor(sampler.length / 2)] : null, maxMs: sampler.length ? sampler[sampler.length - 1] : null }, layout: rec.layout, longTasks: rec.longTasks, cacheValid: rec.cacheValid }))
  if (process.env.FOLLOW_DEBUG) console.log(JSON.stringify({ result, jumps: rec.samples.map((s, i) => ({ s, previous: rec.samples[i - 1] })).filter(({ s, previous }) => previous && Math.abs(s[3] - previous[3]) > rec.viewport / 3) }))
  expect(sampler.length, 'invalid measurement: sampler must have run').toBeGreaterThan(0)
  expect(sampler[sampler.length - 1], 'invalid measurement: sampler interval must stay below 50ms to detect instant moves').toBeLessThan(50)
  expect(result.settledTargets, 'every writing target must have been judged').toEqual(expect.arrayContaining([140, 4, 110, 20]))
  expect(result.viewport, 'no scroll container measured').toBeGreaterThan(0)
  expect(rec.framePositions!.length, 'rendered-frame measurement must run').toBeGreaterThan(0)
  expect(rec.cacheValid, 'positive control: ResizeObserver cache must be verified').not.toBeNull()
  expect(rec.cacheValid!.match, `positive control: cached sizes must match direct reads (cached SH=${rec.cacheValid!.cachedSH} CH=${rec.cacheValid!.cachedCH}, direct SH=${rec.cacheValid!.directSH} CH=${rec.cacheValid!.directCH})`).toBe(true)
  expect(result).toMatchObject({ unfollowed: 0, offscreenEdits: 0, abrupt: 0, frameAbrupt: 0, instant: 0, wroteWhileGliding: 0 })
})
