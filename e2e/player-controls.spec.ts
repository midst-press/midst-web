import { Page } from '@playwright/test'
import { test, expect } from './coverage'

const player = '#player-options-control'
const options = { activePlayer: true, cursorFollowing: false, hasScrollbar: true }

function syntheticData(frames = 80) {
  return {
    editorTimelineFrames: Array.from({ length: frames }, (_, i) => ({
      content: `<p>synthetic frame ${i}</p>`, timestamp: i * 1000, lineNumber: 0,
    })),
    meta: {
      editorFontFamily: 'Courier', editorFontSize: 18, editorHighestEverDraftNumber: 2,
      editorTitle: 'synthetic controls', editorDraftMarkers: [
        { timelineIndex: 0, name: 'synthetic beginning', defaultName: 'Draft 1' },
        { timelineIndex: frames - 1, name: 'synthetic ending', defaultName: 'Draft 2' },
      ],
    },
  }
}

async function mount(page: Page, data = syntheticData(), flags = options) {
  await page.evaluate(({ data, flags }) => (window as any).mountPlayerOptions(data, flags), { data, flags })
}

// Install after the harness loads, before the player mounts. Retain cleared callbacks so a test can
// deliver a queued old tick; no wall-clock intervals run in these tests. Each test gets a fresh page.
async function recordIntervals(page: Page) {
  await page.evaluate(() => {
    const nativeSet = window.setInterval
    const nativeClear = window.clearInterval
    const entries = new Map<number, { delay: number, cleared: boolean, fire: () => void }>()
    let next = 1000000
    ;(window as any).setInterval = (callback: TimerHandler, delay: number, ...args: any[]) => {
      if (typeof callback !== 'function') throw new Error('Unexpected string interval in player test')
      const id = next++
      entries.set(id, { delay, cleared: false, fire: () => callback(...args) })
      return id
    }
    ;(window as any).clearInterval = (id: number) => {
      const entry = entries.get(id)
      if (entry) entry.cleared = true
      else nativeClear(id)
    }
    ;(window as any).playerTestTimers = {
      snapshot: () => Array.from(entries, ([id, entry]) => ({ id, delay: entry.delay, cleared: entry.cleared })),
      fire: (id: number) => {
        const entry = entries.get(id)
        if (!entry) throw new Error(`Unknown player interval ${id}`)
        entry.fire()
      },
      restore: () => { window.setInterval = nativeSet; window.clearInterval = nativeClear },
    }
  })
}

type Interval = { id: number, delay: number, cleared: boolean }
async function intervals(page: Page): Promise<Interval[]> {
  return page.evaluate(() => (window as any).playerTestTimers.snapshot())
}
async function liveInterval(page: Page): Promise<Interval> {
  await expect.poll(async () => (await intervals(page)).filter(entry => !entry.cleared).length).toBe(1)
  const live = (await intervals(page)).filter(entry => !entry.cleared)
  expect(live, 'exactly one playback interval should be active').toHaveLength(1)
  return live[0]
}
async function fire(page: Page, id: number) {
  await page.evaluate(id => (window as any).playerTestTimers.fire(id), id)
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    return route.abort()
  })
  await page.goto('/legacy-harness.html')
  await page.waitForFunction(() => typeof (window as any).mountPlayerOptions === 'function')
  await recordIntervals(page)
})

test('default, minimum, intermediate and maximum FPS select the intended cadence', async ({ page }) => {
  await mount(page)
  const root = page.locator(player)
  await root.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(root.getByRole('button', { name: 'Pause' })).toBeVisible()
  await root.getByRole('button', { name: 'Playback speed' }).click()
  const rate = root.getByRole('slider', { name: 'Playback frame rate' })
  await expect(rate).toHaveAttribute('min', '1')
  await expect(rate).toHaveAttribute('max', '60')
  await expect(rate).toHaveAttribute('step', 'any')
  expect(Number(await rate.inputValue())).toBeCloseTo(1000 / 60)
  await expect(root.locator('.playback-speed-value')).toHaveText('16.7 fps')
  expect((await liveInterval(page)).delay).toBe(60)
  for (const [fps, delay] of [[1, 1000], [24.5, 41], [60, 17]]) {
    await rate.fill(String(fps))
    await expect(rate).toHaveValue(String(fps))
    await expect(root.locator('.playback-speed-value')).toHaveText(`${fps} fps`)
    await expect.poll(async () => (await liveInterval(page)).delay).toBe(delay)
    await expect(root.getByRole('button', { name: 'Pause' })).toBeVisible()
  }
  await expect(root.getByRole('slider', { name: 'Timeline' })).toHaveValue('0')
})

test('speed popup interactions preserve a paused frame and do not start a timer', async ({ page }) => {
  await mount(page)
  const root = page.locator(player)
  await root.getByRole('slider', { name: 'Timeline' }).fill('23')
  const speed = root.getByRole('button', { name: 'Playback speed' })
  await speed.click()
  await root.getByRole('slider', { name: 'Playback frame rate' }).fill('12')
  await expect(root.locator('.playback-speed-value')).toHaveText('12 fps')
  await speed.click()
  await expect(root.getByRole('group', { name: 'Playback speed controls' })).toHaveCount(0)
  await expect(root.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await expect(root.getByRole('slider', { name: 'Timeline' })).toHaveValue('23')
  await expect(root.locator('.editable')).toContainText('synthetic frame 23')
  expect((await intervals(page)).filter(entry => !entry.cleared)).toHaveLength(0)
})

test('changing FPS invalidates retained old ticks; choosing the same FPS keeps the live timer', async ({ page }) => {
  await mount(page)
  const root = page.locator(player)
  const timeline = root.getByRole('slider', { name: 'Timeline' })
  await root.getByRole('button', { name: 'Play', exact: true }).click()
  const old = await liveInterval(page)
  await root.getByRole('button', { name: 'Playback speed' }).click()
  const rate = root.getByRole('slider', { name: 'Playback frame rate' })
  await rate.fill('25')
  await expect.poll(async () => (await liveInterval(page)).delay).toBe(40)
  const current = await liveInterval(page)
  expect(current.id).not.toBe(old.id)
  expect((await intervals(page)).find(entry => entry.id === old.id)?.cleared).toBe(true)
  await fire(page, old.id)
  await expect(timeline).toHaveValue('0')
  await fire(page, current.id)
  await expect(timeline).toHaveValue('1')
  await expect(root.getByRole('button', { name: 'Pause' })).toBeVisible()

  // A user re-selecting the existing value must not renew (or silently stop) this interval.
  await rate.fill('25')
  expect((await liveInterval(page)).id).toBe(current.id)
  await fire(page, current.id)
  await expect(timeline).toHaveValue('2')
  await expect(root.locator('.editable')).toContainText('synthetic frame 2')
})

test('skip endpoints pause, render their frames and reject a queued playback tick', async ({ page }) => {
  await mount(page)
  const root = page.locator(player)
  const timeline = root.getByRole('slider', { name: 'Timeline' })
  await root.getByRole('button', { name: 'Play', exact: true }).click()
  const first = await liveInterval(page)
  await fire(page, first.id)
  await expect(timeline).toHaveValue('1')
  await root.getByRole('button', { name: 'Skip to end' }).click()
  await expect(timeline).toHaveValue('79')
  await expect(root.locator('.editable')).toContainText('synthetic frame 79')
  await expect(root.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await fire(page, first.id)
  await expect(timeline).toHaveValue('79')

  await root.getByRole('button', { name: 'Play', exact: true }).click()
  const second = await liveInterval(page)
  await root.getByRole('button', { name: 'Skip to start' }).click()
  await expect(timeline).toHaveValue('0')
  await expect(root.locator('.editable')).toContainText('synthetic frame 0')
  await expect(root.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await fire(page, second.id)
  await expect(timeline).toHaveValue('0')
  expect((await intervals(page)).filter(entry => !entry.cleared)).toHaveLength(0)
})

test('changing FPS during a real glide holds the frame until scrolling finishes', async ({ page }) => {
  const data = syntheticData(3)
  const body = '<p>synthetic scrolling row</p>'.repeat(200)
  data.editorTimelineFrames.forEach((frame, index) => { frame.content = body + `<p>synthetic tail ${index}</p>` })
  await mount(page, data, { ...options, cursorFollowing: true })
  const root = page.locator(player)
  const editor = root.locator('.editor')
  const timeline = root.getByRole('slider', { name: 'Timeline' })
  await expect(root.locator('.editable')).toContainText('synthetic tail 2')
  await editor.evaluate(el => { el.scrollTop = 0 })
  await root.getByRole('button', { name: 'Play', exact: true }).click()
  const old = await liveInterval(page)
  await expect(timeline).toHaveValue('0')
  await expect.poll(() => editor.evaluate(el => el.scrollTop)).toBeGreaterThan(2)
  await root.getByRole('button', { name: 'Playback speed' }).click()
  await root.getByRole('slider', { name: 'Playback frame rate' }).fill('60')
  const current = await liveInterval(page)
  expect(current.delay).toBe(17)
  const movingTop = await editor.evaluate(el => el.scrollTop)
  await fire(page, old.id)
  await fire(page, current.id)
  await expect(timeline).toHaveValue('0')
  // Continuing motion after the attempted tick proves that this was a real, unfinished glide.
  await expect.poll(() => editor.evaluate(el => el.scrollTop)).toBeGreaterThan(movingTop + 1)
  await expect(timeline).toHaveValue('0')
  await expect(root.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect.poll(async () => {
    await fire(page, current.id)
    return Number(await timeline.inputValue())
  }, { timeout: 20_000, intervals: [100] }).toBe(1)
  await expect(root.locator('.editable')).toContainText('synthetic tail 1')
})

test('becoming inactive closes the popup, disables controls and stops playback; static history is guarded', async ({ page }) => {
  const data = syntheticData()
  await page.evaluate(({ data, flags }) => {
    ;(window as any).playerControlsData = data
    ;(window as any).mountPlayerOptions(data, flags)
  }, { data, flags: options })
  const root = page.locator(player)
  await root.getByRole('button', { name: 'Play', exact: true }).click()
  const tick = await liveInterval(page)
  await fire(page, tick.id)
  await expect(root.getByRole('slider', { name: 'Timeline' })).toHaveValue('1')
  await root.getByRole('button', { name: 'Playback speed' }).click()
  await page.evaluate(flags => (window as any).mountPlayerOptions((window as any).playerControlsData, flags),
    { ...options, activePlayer: false })
  await expect(root.getByRole('group', { name: 'Playback speed controls' })).toHaveCount(0)
  for (const name of ['Skip to start', 'Skip to end', 'Playback speed', 'Play']) {
    await expect(root.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  await fire(page, tick.id)
  await expect(root.getByRole('slider', { name: 'Timeline' })).toHaveValue('1')
  expect((await intervals(page)).filter(entry => !entry.cleared)).toHaveLength(0)

  for (const count of [0, 1]) {
    await mount(page, syntheticData(count))
    for (const name of ['Skip to start', 'Skip to end', 'Playback speed', 'Play']) {
      await expect(root.getByRole('button', { name, exact: true })).toBeDisabled()
    }
    await expect(root.getByRole('group', { name: 'Playback speed controls' })).toHaveCount(0)
    expect((await intervals(page)).filter(entry => !entry.cleared)).toHaveLength(0)
  }
})

test('Escape and outside pointer close the popup without changing playback or position', async ({ page }) => {
  await mount(page)
  const root = page.locator(player)
  const speed = root.getByRole('button', { name: 'Playback speed' })
  await root.getByRole('button', { name: 'Play', exact: true }).click()
  const timer = await liveInterval(page)
  await fire(page, timer.id)
  await expect(root.getByRole('slider', { name: 'Timeline' })).toHaveValue('1')
  await speed.click()
  await expect(root.getByRole('slider', { name: 'Playback frame rate' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(speed).toBeFocused()
  await expect(speed).toHaveAttribute('aria-expanded', 'false')
  await speed.click()
  await expect(speed).toHaveAttribute('aria-expanded', 'true')
  await root.locator('.editor').click({ position: { x: 10, y: 10 } })
  await expect(speed).toHaveAttribute('aria-expanded', 'false')
  await expect(root.getByRole('slider', { name: 'Timeline' })).toHaveValue('1')
  await expect(root.getByRole('button', { name: 'Pause' })).toBeVisible()
  expect((await liveInterval(page)).id).toBe(timer.id)
})

test('vertical range keyboard changes FPS without seeking; body Space remains play/pause', async ({ page }) => {
  await mount(page)
  const root = page.locator(player)
  await root.getByRole('slider', { name: 'Timeline' }).fill('20')
  await root.getByRole('button', { name: 'Playback speed' }).click()
  const rate = root.getByRole('slider', { name: 'Playback frame rate' })
  await expect(rate).toHaveAttribute('aria-orientation', 'vertical')
  await rate.fill('20')
  await rate.press('ArrowUp')
  await expect.poll(async () => Number(await rate.inputValue())).toBeGreaterThan(20)
  await expect.poll(async () => Number.parseFloat(await root.locator('.playback-speed-value').innerText())).toBeGreaterThan(20)
  await expect(root.getByRole('slider', { name: 'Timeline' })).toHaveValue('20')
  await expect(root.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await rate.press('Space')
  await expect(root.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await root.locator('.editor').click({ position: { x: 10, y: 10 } })
  await page.keyboard.press('Space')
  await expect(root.getByRole('button', { name: 'Pause' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(root.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})

test('two mounted players retain independent FPS, popup and playback state', async ({ page }) => {
  await page.evaluate(data => (window as any).mountTwoPlayerOptions(data), syntheticData())
  const first = page.locator('#player-options-first')
  const second = page.locator('#player-options-second')
  await first.getByRole('button', { name: 'Playback speed' }).click()
  await first.getByRole('slider', { name: 'Playback frame rate' }).fill('12')
  await expect(first.locator('.playback-speed-value')).toHaveText('12 fps')
  await expect(second.getByRole('group', { name: 'Playback speed controls' })).toHaveCount(0)
  await second.getByRole('button', { name: 'Playback speed' }).click()
  await expect(second.locator('.playback-speed-value')).toHaveText('16.7 fps')
  await expect(first.getByRole('group', { name: 'Playback speed controls' })).toHaveCount(0)
  await first.getByRole('button', { name: 'Playback speed' }).click()
  await expect(first.locator('.playback-speed-value')).toHaveText('12 fps')
  await expect(second.getByRole('group', { name: 'Playback speed controls' })).toHaveCount(0)
  await first.getByRole('button', { name: 'Play', exact: true }).click()
  const timer = await liveInterval(page)
  expect(timer.delay).toBe(84)
  await fire(page, timer.id)
  await expect(first.getByRole('slider', { name: 'Timeline' })).toHaveValue('1')
  await expect(second.getByRole('slider', { name: 'Timeline' })).toHaveValue('79')
  await expect(second.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})

for (const width of [320, 1024]) {
  test(`right-hand controls and upward popup fit alongside endpoint marker pills at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 720 })
    await mount(page)
    const root = page.locator(player)
    await root.getByRole('button', { name: 'Playback speed' }).click()
    const bounds = await root.locator('.controls').boundingBox()
    const cluster = await root.locator('.playback-controls').boundingBox()
    const popup = await root.locator('.playback-speed-popup').boundingBox()
    const speed = await root.getByRole('button', { name: 'Playback speed' }).boundingBox()
    const markerBoxes = await root.locator('.draft-marker-name').evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }))
    expect(bounds && cluster && popup && speed).toBeTruthy()
    expect(markerBoxes).toHaveLength(2)
    expect(cluster!.x).toBeGreaterThanOrEqual(bounds!.x - 0.5)
    expect(cluster!.x + cluster!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 0.5)
    expect(popup!.y + popup!.height).toBeLessThan(speed!.y)
    expect(popup!.x).toBeGreaterThanOrEqual(bounds!.x - 0.5)
    expect(popup!.x + popup!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 0.5)
    for (const marker of markerBoxes) {
      expect(marker.left).toBeGreaterThanOrEqual(bounds!.x - 0.5)
      expect(marker.right).toBeLessThanOrEqual(bounds!.x + bounds!.width + 0.5)
      expect(marker.right <= popup!.x || marker.left >= popup!.x + popup!.width ||
        marker.bottom <= popup!.y || marker.top >= popup!.y + popup!.height).toBe(true)
    }
    await root.screenshot({ path: testInfo.outputPath('controls-popup.png') })
  })
}
