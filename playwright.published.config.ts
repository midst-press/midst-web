import { defineConfig, devices } from '@playwright/test'
import poemList from './src/poems/poem-list.js'

// End-to-end tests of the site built with MIDST_POEM_LIST=published (#110). A parallel to playwright.config.ts,
// which stays the bundled site: this one builds its own bundle (dist-published) against its own synthetic
// fixtures (e2e/fixtures/published, with a published.json in the list's shape) and serves them on their own
// port, so neither suite can overwrite the other's build or fixtures.
//
//   npm run test:e2e:published
if (poemList.parsePoemList(process.env.MIDST_POEM_LIST) !== 'published') {
  throw new Error('This suite tests the published poem list: run it with MIDST_POEM_LIST=published (npm run test:e2e:published).')
}

const PORT = Number(process.env.MIDST_E2E_PUBLISHED_PORT ?? 8098)
const BASE = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: 'published-list.spec.ts',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run e2e:serve:published',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
