import { test, expect } from './coverage'

// Beta builds of the editor open /app#help for "Need help?" (midst-editor #105). The page shows the editor's
// user guide there, and the reader lands on it.

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    return route.abort()
  })
})

test('/app#help shows the guide placeholder on screen', async ({ page }) => {
  await page.goto('/app#help')
  const help = page.locator('#help')
  await expect(help.getByRole('heading', { name: 'Writing in Midst' })).toBeVisible()
  // A placeholder until Annelyse writes the guide (#99, Stuart, 21 Oct).
  await expect(help).toContainText('Under Construction.')
  await expect(help).not.toContainText('**')
  // The placeholder is short enough that the page may not scroll at all, so the check is only that it is on screen.
  // The scroll-to-the-guide check returns with the real guide.
  await expect(help).toBeInViewport()
})

test('/app without the anchor starts at the top', async ({ page }) => {
  await page.goto('/app')
  await expect(page.locator('#help')).toBeAttached()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
