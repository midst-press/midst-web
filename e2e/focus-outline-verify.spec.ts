import { test, expect } from './coverage'

const player = '#player-options-control'

function syntheticData(frames = 80) {
  return {
    editorTimelineFrames: Array.from({ length: frames }, (_, i) => ({
      content: `<p>synthetic frame ${i}</p>`, timestamp: i * 1000, lineNumber: 0,
    })),
    meta: {
      editorFontFamily: 'Courier', editorFontSize: 18, editorHighestEverDraftNumber: 2,
      editorTitle: 'synthetic focus test', editorDraftMarkers: [],
    },
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/legacy-harness.html')
  await page.waitForFunction(() => typeof (window as any).mountPlayerOptions === 'function')
})

test('keyboard focus shows dark-red outline; mouse focus does not', async ({ page }) => {
  await page.evaluate(({ data }) => (window as any).mountPlayerOptions(data, {
    activePlayer: true, cursorFollowing: false, hasScrollbar: true,
  }), { data: syntheticData() })
  await expect(page.locator(player)).toBeVisible()

  // Tab to a button — should get :focus-visible with 2px dark-red outline
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    const fv = await page.evaluate(() => document.activeElement?.matches(':focus-visible') ?? false)
    if (fv) break
  }
  const kb = await page.evaluate(() => {
    const el = document.activeElement!
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName,
      focusVisible: el.matches(':focus-visible'),
      outlineWidth: cs.outlineWidth,
      outlineStyle: cs.outlineStyle,
      outlineColor: cs.outlineColor,
      outlineOffset: cs.outlineOffset,
    }
  })
  console.log('keyboard-focus:', JSON.stringify(kb))
  expect(kb.focusVisible).toBe(true)
  expect(kb.outlineWidth).toBe('2px')
  expect(kb.outlineStyle).toBe('solid')
  expect(kb.outlineColor).toBe('rgb(105, 0, 0)')
  expect(kb.outlineOffset).toBe('2px')

  // Click a button with mouse — should NOT get :focus-visible outline
  const buttons = page.locator('#player-options-control button')
  const count = await buttons.count()
  expect(count).toBeGreaterThan(0)
  await buttons.nth(Math.min(2, count - 1)).click()
  const ms = await page.evaluate(() => {
    const el = document.activeElement!
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName,
      focusVisible: el.matches(':focus-visible'),
      outlineWidth: cs.outlineWidth,
    }
  })
  console.log('mouse-focus:', JSON.stringify(ms))
  expect(ms.focusVisible).toBe(false)
  expect(ms.outlineWidth).toBe('0px')

  // Keyboard pass again — ring returns
  await page.keyboard.press('Tab')
  const kb2 = await page.evaluate(() => {
    const el = document.activeElement!
    return { focusVisible: el.matches(':focus-visible') }
  })
  console.log('keyboard-return:', JSON.stringify(kb2))
  expect(kb2.focusVisible).toBe(true)
})
