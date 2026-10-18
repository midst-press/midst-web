import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EXPECTED, measurements, summarize } from './frame-budget-host-summary.mjs'

const line = (height, position, result) =>
  JSON.stringify({ follow: { height, position, result }, raf: { count: 9, medianMs: 1, maxMs: 151.4 }, sampler: { medianMs: 30, maxMs: 150.5 } })
const clean = { unfollowed: 1, offscreenEdits: 0, abrupt: 5, frameAbrupt: 0, instant: 13, wroteWhileGliding: 0 }
const four = [line(600, 'end', clean), line(600, 'middle', clean), line(720, 'end', clean), line(720, 'middle', clean)]

test('reads a measurement wherever the reporter puts it on the line', () => {
  assert.equal(measurements(['noise', `  ${four[0]}`, '[chromium] x'].join('\n')).length, 1)
})

test('a passing run with all four measurements is a pass, and its row shows gated then reported counters', () => {
  const { markdown, ok } = summarize(four.join('\n'), 0)
  assert.equal(ok, true)
  assert.match(markdown, /4 of 4 follow measurements/)
  assert.match(markdown, /\| 600 \| end \| 0 \| 0 \| 0 \| 5 \| 13 \| 1 \| 151 \| 151 \|/)
})

test('a passing run that measured fewer than four is refused', () => {
  for (const rows of [[], four.slice(0, 3)]) {
    const { markdown, ok } = summarize(rows.join('\n'), 0)
    assert.equal(ok, false)
    assert.match(markdown, new RegExp(`Refused: Playwright passed but ${rows.length} measurements were found, not ${EXPECTED}`))
  }
})

test('a failing run is reported, not refused: the failure is the verdict', () => {
  const { markdown, ok } = summarize(four.slice(0, 2).join('\n'), 1)
  assert.equal(ok, true)
  assert.match(markdown, /Playwright exit 1; 2 of 4/)
  assert.doesNotMatch(markdown, /Refused/)
})
