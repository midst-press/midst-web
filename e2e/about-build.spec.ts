import { test, expect } from './coverage'

// The About page says which build is in front of the reader (issue #77). The end-to-end build is
// given made-up values (package.json, e2e:build); this reads them back from the page.

test('About shows the tag, the commit and the commit date the build was given', async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL!).origin) return route.continue()
    return route.abort()
  })
  await page.goto('/about')
  const build = page.locator('.about-page .build-info')
  await expect(build).toBeVisible()
  await expect(build).toHaveText('Version v9.9.9-zq, commit zq12345, committed 2001-02-03 04:05 UTC')
})
