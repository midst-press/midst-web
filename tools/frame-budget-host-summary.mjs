#!/usr/bin/env node
// The job summary for .gitea/workflows/frame-budget.yml (host profile, midst-infra #102): one row per follow test,
// from the JSON line each test prints. Numbers only, never poem names.
// Usage: frame-budget-host-summary.mjs <playwright log> <playwright exit status>
// Prints markdown. Exits 1 when Playwright passed but the log does not hold exactly the four follow measurements,
// so a run that measured nothing cannot read as a pass.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const EXPECTED = 4
const GATED = ['frameAbrupt', 'offscreenEdits', 'wroteWhileGliding']
const REPORTED = ['abrupt', 'instant', 'unfollowed']

export function measurements(log) {
  const rows = []
  for (const line of log.split('\n')) {
    const at = line.indexOf('{"follow"')
    if (at < 0) continue
    rows.push(JSON.parse(line.slice(at)))
  }
  return rows
}

const ms = v => (typeof v === 'number' ? v.toFixed(0) : '?')

export function summarize(log, rc) {
  const rows = measurements(log)
  const lines = [
    `Playwright exit ${rc}; ${rows.length} of ${EXPECTED} follow measurements.`,
    '',
    `| height | position | ${GATED.join(' | ')} | ${REPORTED.join(' | ')} | rAF max ms | sampler max ms |`,
    `|---|---|${'---|'.repeat(GATED.length + REPORTED.length + 2)}`,
  ]
  for (const d of rows) {
    const r = d.follow.result
    lines.push(`| ${d.follow.height} | ${d.follow.position} | ${GATED.map(k => r[k]).join(' | ')} | ${REPORTED.map(k => r[k]).join(' | ')} | ${ms(d.raf?.maxMs)} | ${ms(d.sampler?.maxMs)} |`)
  }
  lines.push('', `Gated: ${GATED.join(', ')}. Reported only: ${REPORTED.join(', ')} and the intervals.`)
  const vacuous = rc === 0 && rows.length !== EXPECTED
  if (vacuous) lines.push('', `**Refused: Playwright passed but ${rows.length} measurements were found, not ${EXPECTED}.**`)
  return { markdown: lines.join('\n') + '\n', ok: !vacuous }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, status] = process.argv.slice(2)
  const rc = Number(status)
  if (!file || !Number.isInteger(rc)) {
    console.error('usage: frame-budget-host-summary.mjs <playwright log> <exit status>')
    process.exit(2)
  }
  const { markdown, ok } = summarize(readFileSync(file, 'utf8'), rc)
  process.stdout.write(markdown)
  if (!ok) process.exit(1)
}
