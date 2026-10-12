import { test, expect, Page } from '@playwright/test'

const player = '#player-options-control'
const options = { activePlayer: true, cursorFollowing: true, hasScrollbar: true }

function syntheticData(frames = 40) {
  const lines = Array.from({ length: 100 }, (_, i) => `<p>synthetic line ${i}</p>`)
  return {
    editorTimelineFrames: Array.from({ length: frames }, (_, i) => ({
      content: [...lines.slice(0, 90), `<p>synthetic frame ${i}</p>`, ...lines.slice(91)].join(''),
      timestamp: i * 1000, lineNumber: 90,
    })),
    meta: {
      editorFontFamily: 'Courier', editorFontSize: 18, editorHighestEverDraftNumber: 1,
      editorTitle: 'synthetic options', editorDraftMarkers: [{ timelineIndex: 1, name: 'synthetic draft', defaultName: 'Draft 1' }],
    },
  }
}

async function mount(page: Page, data: ReturnType<typeof syntheticData>, flags: typeof options) {
  await page.evaluate(({ data, flags }) => (window as any).mountPlayerOptions(data, flags), { data, flags })
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

test('cursorFollowing=false leaves a scrollable editor at its chosen position on seek', async ({ page }) => {
  const data = syntheticData()
  await mount(page, data, { ...options, cursorFollowing: false })
  const editor = page.locator(`${player} .editor`)
  await expect(editor.locator('.editable')).toContainText('synthetic frame 39')
  const before = await editor.evaluate(el => {
    el.scrollTop = 100
    return { top: el.scrollTop, range: el.scrollHeight - el.clientHeight }
  })
  expect(before.range).toBeGreaterThan(100)
  expect(before.top).toBe(100)
  await page.locator(`${player} input[aria-label="Timeline"]`).fill('0')
  await expect(editor.locator('.editable')).toContainText('synthetic frame 0')
  await page.locator(`${player} input[aria-label="Timeline"]`).fill('39')
  await expect(editor.locator('.editable')).toContainText('synthetic frame 39')
  expect(await editor.evaluate(el => el.scrollTop)).toBe(100)
})

test('hasScrollbar=false hides the scrollbar without disabling scrolling', async ({ page }) => {
  await mount(page, syntheticData(), { ...options, hasScrollbar: false })
  const editor = page.locator(`${player} .editor`)
  await expect(editor).toHaveClass(/editor--hide-scrollbar/)
  await expect(editor.locator('.editable')).toContainText('synthetic frame 39')
  const scroll = await editor.evaluate(el => {
    el.scrollTop = 120
    return { top: el.scrollTop, overflow: getComputedStyle(el).overflowY, scrollbar: getComputedStyle(el).getPropertyValue('scrollbar-width') }
  })
  expect(scroll.top).toBe(120)
  expect(scroll.overflow).toBe('auto')
  expect(scroll.scrollbar).toBe('none')
})

test('activePlayer=false renders content but disables playback, seeking and draft navigation', async ({ page }) => {
  await mount(page, syntheticData(), { ...options, activePlayer: false })
  await expect(page.locator(`${player} .editable`)).toContainText('synthetic frame 39')
  await expect(page.locator(`${player} .play-pause-button`)).toBeDisabled()
  await expect(page.locator(`${player} input[aria-label="Timeline"]`)).toBeDisabled()
  await expect(page.locator(`${player} .draft-marker`)).toHaveCount(1)
  await expect(page.locator(`${player} .draft-marker`)).toBeDisabled()
})

test('becoming inactive during playback stops the timer and freezes the displayed frame', async ({ page }) => {
  const data = syntheticData(100)
  await mount(page, data, options)
  const play = page.locator(`${player} .play-pause-button`)
  const timeline = page.locator(`${player} input[aria-label="Timeline"]`)
  await play.click()
  await expect(play).toHaveClass(/playing/)
  await expect.poll(async () => Number(await timeline.inputValue())).toBeGreaterThan(1)
  await mount(page, data, { ...options, activePlayer: false })
  await expect(play).not.toHaveClass(/playing/)
  await expect(play).toBeDisabled()
  const stopped = await timeline.inputValue()
  const content = await page.locator(`${player} .editable`).textContent()
  await page.waitForTimeout(400)
  expect(await timeline.inputValue()).toBe(stopped)
  expect(await page.locator(`${player} .editable`).textContent()).toBe(content)
})
