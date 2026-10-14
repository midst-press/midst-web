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

test('/app#help shows the editor guide and scrolls to it', async ({ page }) => {
  await page.goto('/app#help')
  const help = page.locator('#help')
  await expect(help.getByRole('heading', { name: 'Writing in Midst' })).toBeVisible()
  await expect(help.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeAttached()
  expect(await help.locator('table tr').count()).toBeGreaterThan(15)
  await expect(help).not.toContainText('**')
  await expect(help.getByRole('heading', { name: 'Writing in Midst' })).toBeInViewport()
})

test('/app without the anchor starts at the top', async ({ page }) => {
  await page.goto('/app')
  await expect(page.locator('#help')).toBeAttached()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
