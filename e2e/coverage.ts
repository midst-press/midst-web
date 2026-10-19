import { test as base, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

// Per-test collector for what the browser executed. Issue #13.
//
// Opt-in: with MIDST_COVERAGE unset this is the ordinary Playwright `test`, so a normal run pays
// nothing. With it set, Chromium's own V8 coverage is recorded for each test's page and written,
// unprocessed, to coverage/raw/. scripts/coverage-merge.mjs maps it back to src/ and reports.
//
// The raw files hold the built JavaScript the page loaded. They are git-ignored and never printed.
// Poems are fetched as data, not loaded as scripts, so no archive content is in them.
const enabled = !!process.env.MIDST_COVERAGE
const RAW = join(__dirname, '..', 'coverage', 'raw')
let written = 0

export const test = base.extend<{ v8Coverage: void }>({
  v8Coverage: [async ({ page }, use, testInfo) => {
    if (!enabled) {
      await use()
      return
    }
    // resetOnNavigation: false, or a test that navigates keeps only its last page's counts.
    await page.coverage.startJSCoverage({ resetOnNavigation: false })
    await use()
    const entries = await page.coverage.stopJSCoverage()
    mkdirSync(RAW, { recursive: true })
    // The project name too: tools/e2e-split.sh runs each project separately, and a worker pid can recur between runs.
    const name = `${testInfo.project.name}-w${testInfo.workerIndex}-r${testInfo.retry}-${process.pid}-${written++}.json`
    writeFileSync(join(RAW, name), JSON.stringify(entries))
  }, { auto: true }],
})

export { expect }
