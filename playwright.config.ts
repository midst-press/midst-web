import { defineConfig, devices } from '@playwright/test'

// End-to-end tests. Issue #13.
//
// These exist because of a specific gap, not for completeness: the gates check that the code
// compiles, and tools/poem-canary.mjs checks that poem files are REACHABLE. Nothing checked that a
// poem still PLAYS. So a dependency bump, or a refactor of the 1,493-line player, could break the one
// thing a reader comes here for and every check would stay green.
//
// HERMETIC BY DESIGN. The site is built with MIDST_POEMS_URL pointed at a local directory of
// SYNTHETIC timelapses (tools/make-e2e-fixtures.mjs), so the suite needs no network, no credentials,
// no CloudFront and no poem data in git. A red test means the code is broken, which is the only thing
// a test should be able to mean.
//
// The origins are inlined by Parcel at BUILD time, not read at runtime, so the server must be built
// with them set — which is why webServer runs the build rather than assuming dist/ is current.

const PORT = Number(process.env.MIDST_E2E_PORT ?? 8099)
const BASE = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // The player is time-based: it replays keystrokes on timers. Generous, because a flaky e2e suite
  // gets switched off and then it protects nothing.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE,
    // A display-less macOS runner delivered RAF at 10–12Hz, turning wall-clock glides into jumps.
    // Remove that headless cap; elapsed-time and rendered-frame checks still enforce gentleness.
    launchOptions: { args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] },
    // Kept on retry only: a trace of a passing run is noise, a trace of a failure is the whole
    // reason you can diagnose CI without a Mac in front of you.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run e2e:serve`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
