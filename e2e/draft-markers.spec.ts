import { Page } from '@playwright/test'
import { test, expect } from './coverage'

// Draft markers on the timeline show the name the poet gave them (issue #71).
// Synthetic content only: invented words, never a poem or a poet's marker name.

const player = '#player-options-control'
const options = { activePlayer: true, cursorFollowing: true, hasScrollbar: true }

type Marker = { timelineIndex: number, name?: string, defaultName?: string }

function syntheticData(markers: Marker[], frames = 41) {
  return {
    editorTimelineFrames: Array.from({ length: frames }, (_, i) => ({
      content: `<p>synthetic frame ${i}</p>`, timestamp: i * 1000, lineNumber: 0,
    })),
    meta: {
      editorFontFamily: 'Courier', editorFontSize: 18, editorHighestEverDraftNumber: markers.length,
      editorTitle: 'synthetic markers', editorDraftMarkers: markers,
    },
  }
}

async function mount(page: Page, data: ReturnType<typeof syntheticData>) {
  await page.evaluate(({ data, flags }) => (window as any).mountPlayerOptions(data, flags), { data, flags: options })
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

test('a draft marker shows its name on a pale yellow label', async ({ page }) => {
  await mount(page, syntheticData([{ timelineIndex: 10, name: 'zq xv', defaultName: 'Draft 1' }]))
  const label = page.locator(`${player} .draft-marker .draft-marker-name`)
  await expect(label).toHaveCount(1)
  await expect(label).toBeVisible()
  await expect(label).toHaveText('zq xv')
  expect(await label.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 251, 232)')
})

test('a marker with no name of its own shows its default name', async ({ page }) => {
  await mount(page, syntheticData([{ timelineIndex: 10, name: '', defaultName: 'Draft 3' }]))
  await expect(page.locator(`${player} .draft-marker-name`)).toHaveText('Draft 3')
})

test('each marker points at its own place on the timeline', async ({ page }) => {
  // 41 frames: indices 0..40, so index 10 is a quarter of the way along and 30 three quarters.
  await mount(page, syntheticData([
    { timelineIndex: 10, name: 'zq one' }, { timelineIndex: 30, name: 'zq two' },
  ]))
  // The pointer under each label has to line up with where the slider's thumb sits at that index.
  const timeline = page.locator(`${player} input[aria-label="Timeline"]`)
  const thumbCentre = async (index: number) => {
    await timeline.fill(String(index))
    return timeline.evaluate((el: HTMLInputElement) => {
      const r = el.getBoundingClientRect()
      const thumb = 16 // the default thumb width in Chromium, which these tests run in
      return r.left + thumb / 2 + (r.width - thumb) * Number(el.value) / Number(el.max)
    })
  }
  const centres = await page.locator(`${player} .draft-marker`).evaluateAll(els => els.map(el => {
    const r = el.getBoundingClientRect()
    return r.left + r.width / 2
  }))
  expect(centres).toHaveLength(2)
  expect(Math.abs(centres[0] - await thumbCentre(10))).toBeLessThan(1.5)
  expect(Math.abs(centres[1] - await thumbCentre(30))).toBeLessThan(1.5)
  // And the labels sit above the slider, not over it or below it.
  const slider = await timeline.boundingBox()
  for (const box of await page.locator(`${player} .draft-marker`).evaluateAll(els => els.map(el => el.getBoundingClientRect().bottom))) {
    expect(box).toBeLessThanOrEqual(slider!.y + 0.5)
  }
})

test('a poem with no draft markers shows none', async ({ page }) => {
  await mount(page, syntheticData([]))
  await expect(page.locator(`${player} .editable`)).toContainText('synthetic frame 40')
  await expect(page.locator(`${player} .draft-marker`)).toHaveCount(0)
  await expect(page.locator(`${player} .draft-marker-name`)).toHaveCount(0)
})

test('clicking a marker while the poem is playing jumps there and pauses', async ({ page }) => {
  await mount(page, syntheticData([{ timelineIndex: 150, name: 'zq xv' }], 200))
  const play = page.locator(`${player} .play-pause-button`)
  const timeline = page.locator(`${player} input[aria-label="Timeline"]`)
  await play.click()
  await expect(play).toHaveClass(/playing/)
  await expect.poll(async () => Number(await timeline.inputValue())).toBeGreaterThan(1)

  await page.locator(`${player} .draft-marker`).click()
  await expect(play).not.toHaveClass(/playing/)
  await expect(timeline).toHaveValue('150')
  await expect(page.locator(`${player} .editable`)).toContainText('synthetic frame 150')
  await page.waitForTimeout(400)
  await expect(timeline).toHaveValue('150')
})

test('a long name is cut short on the label and kept whole for hover and screen readers', async ({ page }) => {
  const long = 'zq '.repeat(30).trim()
  await mount(page, syntheticData([{ timelineIndex: 20, name: long }]))
  const marker = page.locator(`${player} .draft-marker`)
  const label = marker.locator('.draft-marker-name')
  await expect(marker).toHaveAttribute('title', long)
  await expect(marker).toHaveAttribute('aria-label', `Jump to ${long}`)
  const box = await label.evaluate(el => ({ shown: el.clientWidth, full: el.scrollWidth }))
  expect(box.shown).toBeLessThanOrEqual(120)
  expect(box.full).toBeGreaterThan(box.shown)
})
