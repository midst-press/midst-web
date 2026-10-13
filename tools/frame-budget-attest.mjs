#!/usr/bin/env node
// Run @frame-budget tests and print a markdown attestation block for a PR comment.
// Numbers only — never poem names. Refuses on dirty tree, failed runs, or wrong test counts.

import { execSync, spawnSync } from 'node:child_process'
import { hostname } from 'node:os'
import { Buffer } from 'node:buffer'

// Compute sampler median/max from raw sample timestamps (sample[4] is elapsed ms)
function computeSampler(rec) {
  const samples = rec.samples ?? []
  if (samples.length < 2) return { median: null, max: null }
  const intervals = samples.slice(1).map((s, i) => s[4] - samples[i][4]).sort((a, b) => a - b)
  return {
    median: intervals[Math.floor(intervals.length / 2)],
    max: intervals[intervals.length - 1],
  }
}

// Replicate the verdict's abrupt count: time-normalized speed check
function verdictAbrupt(rec) {
  const samples = rec.samples ?? []
  const viewport = rec.viewport ?? 1
  let abrupt = 0
  for (let i = 1; i < samples.length; i++) {
    const elapsed = samples[i][4] - samples[i - 1][4]
    const moving = samples[i][5]
    if (moving && (elapsed <= 0 || Math.abs(samples[i][3] - samples[i - 1][3]) * 20 / elapsed > viewport / 3)) abrupt++
  }
  return abrupt
}

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

// GUI session check. macOS: a launchd GUI domain for this user. Linux: an X display (Xvfb on a CI runner).
let gui = 'no'
if (process.platform === 'linux') {
  if (process.env.DISPLAY) gui = `X display ${process.env.DISPLAY}`
} else {
  try { execSync('launchctl print gui/' + process.getuid(), { stdio: 'pipe' }); gui = 'yes' } catch {}
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

// Refuse if Playwright failed to run
if (result.status !== 0 && result.status !== null) {
  console.error(`REFUSED: Playwright exited ${result.status}.`)
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

// Extract per-test results from the Playwright report, using the follow-motion attachment
const rows = []
for (const suite of report.suites ?? []) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const res = t.results?.[t.results.length - 1]
      if (!res) continue
      const m = spec.title.match(/height (\d+)/)
      const p = spec.title.match(/:\s*(end|middle)/)
      const height = m?.[1] ?? 'recorder'
      const position = p?.[1] ?? 'n/a'
      // Find the follow-motion attachment
      const att = (res.attachments ?? []).find(a => a.name === 'follow-motion')
      let timing = null
      if (att?.body) {
        try {
          const decoded = Buffer.from(att.body, 'base64').toString('utf-8')
          timing = JSON.parse(decoded)
        } catch {}
      }
      const s = timing ? computeSampler(timing) : null
      const r = timing?.rafIntervals ?? []
      rows.push({
        height,
        position,
        status: res.status === 'passed' ? 'PASS' : 'FAIL',
        samplerMedian: s?.median != null ? s.median.toFixed(1) : 'n/a',
        samplerMax: s?.max != null ? s.max.toFixed(1) : 'n/a',
        rafMedian: r.length ? [...r].sort((a, b) => a - b)[Math.floor(r.length / 2)].toFixed(1) : 'n/a',
        rafMax: r.length ? Math.max(...r).toFixed(1) : 'n/a',
        abrupt: timing ? verdictAbrupt(timing) : 'n/a',
        // 'n/a' when the test recorded no cache check at all (not only when it recorded no timing), so the
        // no-timing-data refusal below can fire for it (#30).
        cacheMatch: timing?.cacheValid ? (timing.cacheValid.match ? 'yes' : 'no') : 'n/a',
      })
    }
  }
}

// Refuse if wrong number of tests (expected 5: 4 writing-jumps + 1 recorder)
if (rows.length !== 5) {
  console.error(`REFUSED: expected 5 tests, got ${rows.length}.`)
  process.exit(1)
}
// The four writing-jump tests must be present
for (const [h, p] of [['600','end'], ['600','middle'], ['720','end'], ['720','middle']]) {
  if (!rows.find(r => r.height === h && r.position === p)) {
    console.error(`REFUSED: missing test for height ${h}, position ${p}.`)
    process.exit(1)
  }
}

// Refuse if any WRITING-JUMP row lacks timing data (recorder test may not have it)
for (const r of rows) {
  if (r.height !== 'recorder' && (r.samplerMax === 'n/a' || r.cacheMatch === 'n/a')) {
    console.error(`REFUSED: test ${r.height}/${r.position} has no timing data.`)
    process.exit(1)
  }
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

const passed = rows.filter(r => r.status === 'PASS').length
const failed = rows.filter(r => r.status === 'FAIL').length

// Print the markdown block
console.log(`
## Frame-Budget Attestation

| Field | Value |
|-------|-------|
| Head | \`${headSha}\` |
| Dirty tree | refused if dirty (clean) |
| Hostname | ${hostname()} |
| GUI session | ${gui} |
| Playwright | ${playwrightVersion} |
| Chromium | (from Playwright) |
| Platform | ${process.platform} |
| Playwright arguments | ${extraArgs.length ? extraArgs.join(' ') : '(none)'} |

| Height | Position | Result | Sampler median | Sampler max | rAF median | rAF max | Abrupt | Cache match |
|--------|----------|--------|----------------|-------------|------------|---------|--------|-------------|
${rows.map(r => `| ${r.height} | ${r.position} | ${r.status} | ${r.samplerMedian} | ${r.samplerMax} | ${r.rafMedian} | ${r.rafMax} | ${r.abrupt} | ${r.cacheMatch} |`).join('\n')}

**Totals:** ${passed} passed, ${failed} failed out of ${rows.length}
`)
