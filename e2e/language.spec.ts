import { test, expect } from './coverage'

// midst-web #234: the languages are at the top of every page with nothing to open, English with the American flag,
// and the reader's choice stays in the browser: not in the address, not in a cookie. Only English has a catalog, so
// this pins that the control is there, on screen and working, and keeps a screenshot for a person to look at.
for (const path of ['/', '/about']) {
  test(`the languages are at the top of ${path}, English with its flag`, async ({ page }, testInfo) => {
    await page.goto(path)
    const english = page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'English' })
    await expect(english).toBeVisible()
    await expect(english).toBeInViewport()
    await expect(english).toHaveAttribute('aria-pressed', 'true')
    await expect(english.locator('svg.language-flag')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    const box = await english.boundingBox()
    expect(box!.y).toBeLessThan(60)
    await page.screenshot({ path: testInfo.outputPath(`languages${path === '/' ? '-home' : path.replace('/', '-')}.png`) })
  })
}

test('choosing English keeps it in this browser only', async ({ page, context }) => {
  await page.goto('/')
  const before = page.url()
  const cookiesBefore = await context.cookies()
  await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'English' }).click()
  expect(await page.evaluate(() => localStorage.getItem('midst.language'))).toBe('en')
  expect(page.url()).toBe(before)
  // The site's own cookies, whatever they are, are the same after choosing: the choice made none.
  expect(await context.cookies()).toEqual(cookiesBefore)
  await page.reload()
  await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
})
