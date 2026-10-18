import { Page } from '@playwright/test'
import { test, expect } from './coverage'

function syntheticData(frames = 80) {
  return {
    editorTimelineFrames: Array.from({ length: frames }, (_, i) => ({
      content: `<p>synthetic frame ${i}</p>`, timestamp: i * 1000, lineNumber: 0,
    })),
    meta: {
      editorFontFamily: 'Courier', editorFontSize: 18, editorHighestEverDraftNumber: 1,
      editorTitle: 'timestamp bounds', editorDraftMarkers: [],
    },
    sourceHistoryLength: frames,
  }
}

async function mount(page: Page, data = syntheticData()) {
  await page.evaluate(data =>
    (window as any).mountPlayerOptions(data, { activePlayer: true, cursorFollowing: false, hasScrollbar: true }),
    data,
  )
}

// The label must be entirely inside the timeline-control box.
async function assertLabelInsideTimeline(page: Page) {
  const label = page.locator('.frame-timestamp')
  await expect(label).toBeVisible()
  const labelBox = await label.boundingBox()
  const timelineBox = await page.locator('.timeline-control').boundingBox()
  expect(labelBox).not.toBeNull()
  expect(timelineBox).not.toBeNull()
  expect(labelBox!.x, 'label left edge outside timeline').toBeGreaterThanOrEqual(timelineBox!.x - 1)
  expect(labelBox!.x + labelBox!.width, 'label right edge outside timeline')
    .toBeLessThanOrEqual(timelineBox!.x + timelineBox!.width + 1)
}

async function labelCentre(page: Page): Promise<number> {
  const box = await page.locator('.frame-timestamp').boundingBox()
  const timeline = await page.locator('.timeline-control').boundingBox()
  expect(box).not.toBeNull()
  expect(timeline).not.toBeNull()
  return (box!.x + box!.width / 2 - timeline!.x) / timeline!.width
}

async function setStep(page: Page, value: number) {
  await page.evaluate(value => {
    const slider = document.querySelector<HTMLInputElement>('.progress-bar')
    if (!slider) throw new Error('no slider')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(slider, String(value))
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    slider.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    return route.abort()
  })
  await page.goto('/legacy-harness.html')
  await page.waitForFunction(() => typeof (window as any).mountPlayerOptions === 'function')
})

test('label stays inside the timeline at the first frame', async ({ page }) => {
  await mount(page)
  await setStep(page, 0)
  await assertLabelInsideTimeline(page)
})

test('label stays inside the timeline at the last frame', async ({ page }) => {
  await mount(page)
  await setStep(page, 79)
  await assertLabelInsideTimeline(page)
})

test('label stays inside the timeline near the end (75/80)', async ({ page }) => {
  await mount(page)
  await setStep(page, 75)
  await assertLabelInsideTimeline(page)
})

test('label follows the playhead', async ({ page }) => {
  await mount(page)
  // At frame 10 the label's centre should be near 10/79 of the timeline.
  await setStep(page, 10)
  const early = await labelCentre(page)
  // At frame 70 it should be near 70/79 — much further right.
  await setStep(page, 70)
  const late = await labelCentre(page)
  expect(late, 'label did not move right with the playhead').toBeGreaterThan(early + 0.3)
})

test('label stays inside after a paused wide-to-narrow resize', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await mount(page)
  await setStep(page, 79)
  await assertLabelInsideTimeline(page)

  await page.setViewportSize({ width: 320, height: 720 })
  await expect(async () => { await assertLabelInsideTimeline(page) })
    .toPass({ timeout: 5000 })
})

test('label stays inside after a paused narrow-to-wide resize', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await mount(page)
  await setStep(page, 79)
  await assertLabelInsideTimeline(page)

  await page.setViewportSize({ width: 1024, height: 720 })
  await expect(async () => { await assertLabelInsideTimeline(page) })
    .toPass({ timeout: 5000 })
})

test('label stays inside after a resize when the player was mounted before its data (#94)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await page.evaluate(() =>
    (window as any).mountPlayerOptions(null, { activePlayer: true, cursorFollowing: false, hasScrollbar: true }))
  await expect(page.locator('.timeline-control')).toBeVisible()
  await expect(page.locator('.frame-timestamp')).toHaveCount(0)
  await mount(page)
  await setStep(page, 79)
  await assertLabelInsideTimeline(page)

  await page.setViewportSize({ width: 320, height: 720 })
  await expect(async () => { await assertLabelInsideTimeline(page) })
    .toPass({ timeout: 5000 })
})

// ---- accessibility (Cyril's review on #107) ------------------------------------------------

test('aria-valuetext on the timeline equals the visible label text', async ({ page }) => {
  await mount(page)
  await setStep(page, 40)
  const label = page.locator('.frame-timestamp')
  const labelText = await label.textContent()
  const valuetext = await page.locator('.progress-bar').getAttribute('aria-valuetext')
  expect(valuetext).toBe(labelText)
})

test('label is aria-hidden and carries data-guide', async ({ page }) => {
  await mount(page)
  await setStep(page, 40)
  const label = page.locator('.frame-timestamp')
  await expect(label).toHaveAttribute('aria-hidden', 'true')
  await expect(label).toHaveAttribute('data-guide', 'frame-edit-time')
})

test('synthetic frame: aria-valuetext is "edit time unavailable"', async ({ page }) => {
  const data = { ...syntheticData(), sourceHistoryLength: 0 }
  await mount(page, data)
  await setStep(page, 40)
  const label = page.locator('.frame-timestamp--unavailable')
  await expect(label).toBeVisible()
  const valuetext = await page.locator('.progress-bar').getAttribute('aria-valuetext')
  expect(valuetext).toBe('edit time unavailable')
})
