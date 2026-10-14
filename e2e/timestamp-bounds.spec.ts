import { Page } from '@playwright/test'
import { test, expect } from './coverage'

const player = '#player-options-control'

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
  // The label's left and right edges must be within the timeline's bounds.
  // Allow 1px tolerance for sub-pixel layout.
  expect(labelBox!.x, 'label left edge outside timeline').toBeGreaterThanOrEqual(timelineBox!.x - 1)
  expect(labelBox!.x + labelBox!.width, 'label right edge outside timeline')
    .toBeLessThanOrEqual(timelineBox!.x + timelineBox!.width + 1)
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

test('label stays inside after a paused wide-to-narrow resize', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await mount(page)
  await setStep(page, 79) // pause near the end, where clipping is most likely
  await assertLabelInsideTimeline(page)

  // Narrow the viewport while paused (step unchanged).
  await page.setViewportSize({ width: 320, height: 720 })
  // Give the ResizeObserver a frame to fire and update the label width.
  await page.waitForTimeout(100)
  await assertLabelInsideTimeline(page)
})

test('label stays inside after a paused narrow-to-wide resize', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await mount(page)
  await setStep(page, 79)
  await assertLabelInsideTimeline(page)

  await page.setViewportSize({ width: 1024, height: 720 })
  await page.waitForTimeout(100)
  await assertLabelInsideTimeline(page)
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
