#!/usr/bin/env node
// Run @frame-budget tests and print a markdown attestation block for a PR comment.
// Numbers only — never poem names. Refuses on a dirty tree.

import { execSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { hostname } from 'node:os'

// Refuse on dirty tree
const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
if (status) {
  console.error('REFUSED: working tree is dirty. Commit or stash before attesting.')
  process.exit(1)
}

const headSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()

// GUI session check
let gui = 'no'
try { execSync('launchctl print gui/' + process.getuid(), { stdio: 'pipe' }); gui = 'yes' } catch {}

// Versions
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
let playwrightVersion = 'unknown'
try { playwrightVersion = execSync('npx playwright --version', { encoding: 'utf8' }).trim() } catch {}
let chromiumVersion = 'unknown'
try {
  const out = execSync('npx playwright install --dry-run chromium 2>&1 || true', { encoding: 'utf8' })
  const m = out.match(/chromium[_\s]*(\d+)/i) || out.match(/(\d{3,})/)?.[0]
  chromiumVersion = typeof m === 'string' ? m : (m?.[1] ?? 'unknown')
} catch {}

// Run the frame-budget tests with list reporter, capturing stdout for timing data
const result = spawnSync('npx', ['playwright', 'test', '--grep', '@frame-budget', '--reporter=list'], {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
  stdio: ['pipe', 'pipe', 'pipe'],
})

// Parse the JSON lines the tests print to stdout
const jsonLines = result.stdout.split('\n').filter(l => l.trim().startsWith('{')).map(l => {
  try { return JSON.parse(l) } catch { return null }
}).filter(Boolean)

// Parse pass/fail from the summary
const summaryMatch = result.stdout.match(/(\d+) passed/)
const failedMatch = result.stdout.match(/(\d+) failed/)
const passedCount = summaryMatch ? parseInt(summaryMatch[1]) : 0
const failedCount = failedMatch ? parseInt(failedMatch[1]) : 0

// Build rows from the JSON data (which contains height/position in the follow field)
const rows = jsonLines.map(j => {
  const f = j.follow ?? {}
  const s = j.sampler ?? {}
  const r = j.raf ?? {}
  return {
    height: f.height ?? '?',
    position: f.position ?? '?',
    status: (j.cacheValid?.match && s.maxMs < 50 && f.result?.unfollowed === 0) ? 'PASS' : 'FAIL',
    samplerMedian: s.medianMs != null ? s.medianMs.toFixed(1) : '?',
    samplerMax: s.maxMs != null ? s.maxMs.toFixed(1) : '?',
    rafMax: r.maxMs != null ? r.maxMs.toFixed(1) : '?',
    abrupt: f.result?.abrupt ?? '?',
    cacheMatch: j.cacheValid?.match ? 'yes' : 'no',
  }
})

const passed = passedCount
const failed = failedCount

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
| Chromium | ${chromiumVersion} |

| Height | Position | Result | Sampler median | Sampler max | rAF max | Abrupt | Cache match |
|--------|----------|--------|----------------|-------------|---------|--------|-------------|
${rows.map(r => `| ${r.height} | ${r.position} | ${r.status} | ${r.samplerMedian} | ${r.samplerMax} | ${r.rafMax} | ${r.abrupt} | ${r.cacheMatch} |`).join('\n')}

**Totals:** ${passed} passed, ${failed} failed out of ${rows.length}
`)
