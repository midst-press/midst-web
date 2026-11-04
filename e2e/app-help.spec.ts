import { test, expect } from './coverage'

// Beta builds of the editor open /app#help for "Need help?" (midst-editor #105), which lands on Using Midst, open
// (midst-web #413). Until Annelyse writes the help, the section is two dropdowns whose bodies say "Under construction"
// and nothing more (GitHub midst-press/midst-editor#63; midst-web #278; Stuart, 21 Oct).

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    return route.abort()
  })
})

const LABELS = ['Installation', 'Using Midst']

test('/app#help lands on Using Midst, open; Installation stays closed until opened', async ({ page }) => {
  await page.goto('/app#help')
  // "Need help?" lands on Using Midst, open (GitHub midst-press/midst-editor#63; midst-web #413).
  const help = page.locator('#help')
  await expect(help).toBeInViewport()
  await expect(help.locator('summary')).toHaveText('Using Midst')
  await expect(help).toHaveJSProperty('open', true)
  await expect(help.locator('p')).toHaveText('Under construction')
  await expect(help.locator('p')).toBeVisible()

  const section = page.locator('.app-help')
  await expect(section.locator('summary')).toHaveText(LABELS)
  const installation = section.locator('details', { has: page.locator('summary', { hasText: 'Installation' }) })
  await expect(installation).toHaveJSProperty('open', false)
  await installation.locator('summary').click()
  await expect(installation.locator('p')).toHaveText('Under construction')
  await expect(installation.locator('p')).toBeVisible()

  // The poet can still close it.
  await help.locator('summary').click()
  await expect(help).toHaveJSProperty('open', false)
  // Each dropdown is its label and that one line: no headings, no other text.
  await expect(section.getByRole('heading')).toHaveCount(0)
  await expect(section).toHaveText(LABELS.map(label => `${label}Under construction`).join(''))
})

test('/app without the anchor leaves both dropdowns closed', async ({ page }) => {
  await page.goto('/app')
  await expect(page.locator('#help')).toHaveJSProperty('open', false)
  await expect(page.locator('.app-help details').first()).toHaveJSProperty('open', false)
})

test('/app without the anchor starts at the top', async ({ page }) => {
  await page.goto('/app')
  await expect(page.locator('#help')).toBeAttached()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
