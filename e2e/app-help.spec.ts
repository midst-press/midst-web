import { test, expect } from './coverage'

// Beta builds of the editor open /app#help for "Need help?" (midst-editor #105). Until Annelyse writes the help, the
// section is two dropdowns with stand-in text (GitHub midst-press/midst-editor#63; midst-web #278).

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    return route.abort()
  })
})

const DROPDOWNS = [
  ['Installation', '[Installation instructions go here]'],
  ['Using Midst', '[Instructions for using Midst go here]'],
] as const

test('/app#help lands on two dropdowns, Installation and Using Midst, closed until opened', async ({ page }) => {
  await page.goto('/app#help')
  const help = page.locator('#help')
  await expect(help).toBeInViewport()
  await expect(help.locator('summary')).toHaveText(DROPDOWNS.map(([label]) => label))
  for (const [label, standIn] of DROPDOWNS) {
    const dropdown = help.locator('details', { has: page.locator('summary', { hasText: label }) })
    await expect(dropdown.getByText(standIn)).toBeHidden()
    await dropdown.locator('summary').click()
    await expect(dropdown.getByText(standIn)).toBeVisible()
  }
  // No guide content: the section is the two dropdowns and their stand-ins only.
  await expect(help.getByRole('heading')).toHaveCount(0)
  await expect(help).not.toContainText('Under Construction')
})

test('/app without the anchor starts at the top', async ({ page }) => {
  await page.goto('/app')
  await expect(page.locator('#help')).toBeAttached()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
