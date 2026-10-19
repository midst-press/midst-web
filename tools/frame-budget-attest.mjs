#!/usr/bin/env node
// Run @frame-budget tests and print a markdown attestation block for a PR comment.
// Numbers only — never poem names. Refuses on dirty tree, failed runs, or wrong test counts.
// The reading of the report and the block itself are in tools/frame-budget-report.mjs, which is tested.

import { execSync, spawnSync } from 'node:child_process'
import { hostname } from 'node:os'
import { failureLines, refusal, render, rows } from './frame-budget-report.mjs'

// Refuse on FOLLOW_DEBUG: an attestation should be of the run as CI and reviewers run it, and FOLLOW_DEBUG
// adds diagnostic work and output to the follow tests. (Rows come from the JSON reporter and the tests'
// attachments, so the extra output no longer breaks parsing; the refusal is about what is being attested.)
if (process.env.FOLLOW_DEBUG) {
  console.error('REFUSED: FOLLOW_DEBUG is set. Attest the run as CI and reviewers run it: unset FOLLOW_DEBUG.')
  process.exit(1)
}

// Refuse on dirty tree
const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
if (status) {
  console.error('REFUSED: working tree is dirty. Commit or stash before attesting.')
  process.exit(1)
}

const headSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()

// What this checks is whether a display exists, not whether frames arrive at a usable rate (#20): a launchd GUI
// domain for this user succeeds from an ssh shell while someone is at the console. The rAF columns of the
// block are the frame rate actually measured.
let displayCheck = 'none found'
if (process.platform === 'linux') {
  if (process.env.DISPLAY) displayCheck = `DISPLAY=${process.env.DISPLAY}`
} else {
  try {
    execSync('launchctl print gui/' + process.getuid(), { stdio: 'pipe' })
    displayCheck = `launchd gui/${process.getuid()} domain exists`
  } catch {}
}

// Extra arguments go to Playwright unchanged (the GitHub job passes --headed so Chromium draws on Xvfb).
// --retries and --reporter stay ours: they are what make the output an attestation.
const extraArgs = process.argv.slice(2)
if (extraArgs.some(arg => /^--(retries|reporter|grep)\b/.test(arg))) {
  console.error('REFUSED: --retries, --reporter and --grep are fixed by this tool.')
  process.exit(1)
}

// Playwright version
let playwrightVersion = 'unknown'
try { playwrightVersion = execSync('npx playwright --version', { encoding: 'utf8' }).trim() } catch {}

// Run the frame-budget tests with JSON reporter.
// CI=1 disables reuseExistingServer so the build always comes from this tree.
// --retries=0: a retried pass is not the evidence wanted.
const result = spawnSync('node', [
  'node_modules/.bin/playwright', 'test', '--grep', '@frame-budget', '--reporter=json', '--retries=0', ...extraArgs,
], {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, CI: '1' },
})

// Refuse unless Playwright ran and exited 0. A null status is a child killed by a signal or one that never
// started (#20), and is not a pass.
if (result.status !== 0) {
  const how = result.status === null
    ? `did not exit normally (${result.signal ? `signal ${result.signal}` : result.error?.message ?? 'no exit status'})`
    : `exited ${result.status}`
  console.error(`REFUSED: Playwright ${how}.`)
  // Say what failed and with what: a red run that does not name its reason cannot be told from a broken
  // runner. Titles are test names from the spec file, never poem names.
  try {
    const lines = failureLines(JSON.parse(result.stdout))
    console.error(`${lines.length} reason(s) the run did not pass:`)
    for (const line of lines) console.error(line)
  } catch {
    console.error('Playwright printed no JSON report to read the failures from.')
  }
  console.error(result.stderr?.slice(0, 2000) ?? '')
  process.exit(1)
}

// Parse the JSON reporter output
let report
try { report = JSON.parse(result.stdout) } catch {
  console.error('REFUSED: could not parse Playwright JSON output.')
  console.error(result.stderr?.slice(0, 2000) ?? '')
  process.exit(1)
}

const rs = rows(report)
const refused = refusal(rs)
if (refused) {
  console.error(`REFUSED: ${refused}`)
  process.exit(1)
}

// Head/tree re-check after the run
const headAfter = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
if (headAfter !== headSha) {
  console.error('REFUSED: HEAD moved during the run.')
  process.exit(1)
}
const statusAfter = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
if (statusAfter) {
  console.error('REFUSED: working tree became dirty during the run.')
  process.exit(1)
}

console.log(render({ headSha, host: hostname(), displayCheck, playwrightVersion, platform: process.platform, extraArgs, rs }))
