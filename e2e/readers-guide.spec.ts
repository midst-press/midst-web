import { test, expect } from './coverage'

// The reader's guide is a page of the site (issue #92), reached from About.

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    return route.abort()
  })
})

test('the guide page shows its title and the Under Construction placeholder', async ({ page }) => {
  await page.goto('/guide')
  const guide = page.locator('.guide-page')
  await expect(guide.getByRole('heading', { name: 'How to watch a poem' })).toBeVisible()
  // A placeholder until Annelyse writes the guide (#99, Stuart, 21 Oct).
  await expect(guide.getByRole('heading', { name: 'Under Construction' })).toBeVisible()
  await expect(guide).not.toContainText('**')
})

test('About links to the guide', async ({ page }) => {
  await page.goto('/about')
  await page.locator('.about-page').getByRole('link', { name: 'How to watch a poem' }).click()
  await expect(page.locator('.guide-page')).toBeVisible()
})
