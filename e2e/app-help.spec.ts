import { test, expect } from './coverage'

// Beta builds of the editor open /app#help for "Need help?" (midst-editor #105). Until Annelyse writes the help, the
// section is two dropdowns whose bodies say "Under construction" and nothing more (GitHub midst-press/midst-editor#63;
// midst-web #278; Stuart, 21 Oct).

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    return route.abort()
  })
})

const LABELS = ['Installation', 'Using Midst']

test('/app#help lands on two dropdowns, Installation and Using Midst, closed until opened', async ({ page }) => {
  await page.goto('/app#help')
  const help = page.locator('#help')
  await expect(help).toBeInViewport()
  await expect(help.locator('summary')).toHaveText(LABELS)
  for (const label of LABELS) {
    const dropdown = help.locator('details', { has: page.locator('summary', { hasText: label }) })
    const body = dropdown.locator('p')
    await expect(body).toBeHidden()
    await dropdown.locator('summary').click()
    await expect(body).toBeVisible()
    // The body is the placeholder and nothing more.
    await expect(body).toHaveText('Under construction')
  }
  // Each dropdown is its label and that one line: no headings, no other text.
  await expect(help.getByRole('heading')).toHaveCount(0)
  await expect(help).toHaveText(LABELS.map(label => `${label}Under construction`).join(''))
})

test('/app without the anchor starts at the top', async ({ page }) => {
  await page.goto('/app')
  await expect(page.locator('#help')).toBeAttached()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
