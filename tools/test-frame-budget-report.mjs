// node --test tools/test-frame-budget-report.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COUNTERS, browserVersion, failureLines, refusal, render, rows, sampler } from './frame-budget-report.mjs'

const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64')
const ZERO = Object.fromEntries(COUNTERS.map(k => [k, 0]))
// Samples are [target, ?, followed, scrollTop, elapsedMs, wrote, ...]; only [4] matters to the sampler.
const rec = { samples: [[0, 0, 1, 0, 0], [0, 0, 1, 0, 10], [0, 0, 1, 0, 30], [0, 0, 1, 0, 34]], rafIntervals: [16, 17, 18], cacheValid: { match: true } }

const writingJump = (h, p, { status = 'passed', result = ZERO, attachments } = {}) => ({
  title: `@frame-budget writing jumps are followed gently and playback waits: ${p}, height ${h}`,
  tests: [{ results: [{ status, attachments: attachments ?? [
    { name: 'follow-motion', body: b64(rec) },
    { name: 'follow-verdict', body: b64({ result, browser: '141.0.7390.37' }) },
  ] }] }],
})
const recorder = { title: '@frame-budget the recorder sees a scripted jump', tests: [{ results: [{ status: 'passed', attachments: [] }] }] }
const report = (...specs) => ({ suites: [{ suites: [{ specs }] }] })
const all = (opts = {}) => report(recorder, ...[['600', 'end'], ['600', 'middle'], ['720', 'end'], ['720', 'middle']].map(([h, p]) => writingJump(h, p, opts)))

test('the sampler gives the median and max of the intervals', () => {
  assert.deepEqual(sampler(rec), { median: 10, max: 20 })
  assert.deepEqual(sampler({ samples: [[0, 0, 1, 0, 0]] }), { median: null, max: null })
})

test('a passing run gives five rows and no refusal', () => {
  const rs = rows(all())
  assert.equal(rs.length, 5)
  assert.equal(refusal(rs), null)
  const jump = rs.find(r => r.height === '600' && r.position === 'end')
  assert.deepEqual(jump, {
    height: '600', position: 'end', status: 'PASS', samplerMedian: '10.0', samplerMax: '20.0',
    rafMedian: '17.0', rafMax: '18.0', counters: [0, 0, 0, 0, 0, 0], browser: '141.0.7390.37', cacheMatch: 'yes',
  })
})

test('the counters are the verdict attached by the spec, not recomputed', () => {
  // This recording would give abrupt = 0 by any recomputation; the attached verdict says 3, and 3 is printed.
  const rs = rows(all({ result: { ...ZERO, abrupt: 3, instant: 1 } }))
  const jump = rs.find(r => r.height === '720')
  assert.equal(jump.counters[COUNTERS.indexOf('abrupt')], 3)
  assert.equal(jump.counters[COUNTERS.indexOf('instant')], 1)
  assert.match(render({ headSha: 'a'.repeat(40), host: 'h', displayCheck: 'DISPLAY=:99', playwrightVersion: 'Version 1.56.0', platform: 'linux', extraArgs: [], rs }), /\| 720 \| end \| PASS \|.*\| 0 \| 0 \| 3 \| 0 \| 1 \| 0 \| yes \|/)
})

test('refusals: count, a missing or duplicated writing jump, no timing data, no verdict', () => {
  assert.equal(refusal(rows(report(recorder))), 'expected 5 tests, got 1.')
  const dup = report(recorder, writingJump('600', 'end'), writingJump('600', 'end'), writingJump('720', 'end'), writingJump('720', 'middle'))
  assert.equal(refusal(rows(dup)), 'expected one test for height 600, position end, got 2.')
  assert.equal(refusal(rows(all({ attachments: [{ name: 'follow-verdict', body: b64({ result: ZERO }) }] }))), 'test 600/end has no timing data.')
  assert.equal(refusal(rows(all({ attachments: [{ name: 'follow-motion', body: b64(rec) }] }))), 'test 600/end attached no verdict.')
  assert.equal(refusal(rows(all({ attachments: [{ name: 'follow-motion', body: b64(rec) }, { name: 'follow-verdict', body: 'not json' }] }))), 'test 600/end attached no verdict.')
})

test('failure lines name each failed test, and the top-level errors of a run that never started a test', () => {
  const failed = all()
  failed.suites[0].suites[0].specs[2].tests[0].results[0] = { status: 'failed', error: { message: '\u001b[31mexpect(received)\u001b[39m\n  invalid measurement: sampler interval must stay below 50ms' } }
  assert.deepEqual(failureLines(failed), [
    '- failed: @frame-budget writing jumps are followed gently and playback waits: middle, height 600: expect(received) | invalid measurement: sampler interval must stay below 50ms',
  ])
  assert.deepEqual(failureLines({ suites: [], errors: [{ message: 'Error: webServer exited early\n  code 3' }] }), [
    '- error: Error: webServer exited early | code 3',
  ])
  assert.deepEqual(failureLines(all()), [])
})

test('the block names the browser the run reported, and labels the display check for what it is', () => {
  const block = render({ headSha: 'a'.repeat(40), host: 'h', displayCheck: 'DISPLAY=:99', playwrightVersion: 'Version 1.56.0', platform: 'linux', extraArgs: ['--headed'], rs: rows(all()) })
  assert.match(block, /\| Chromium \| 141\.0\.7390\.37 \|/)
  assert.match(block, /\| Display check \(not a frame rate; the rAF columns are\) \| DISPLAY=:99 \|/)
  assert.match(block, /\*\*Totals:\*\* 5 passed, 0 failed out of 5/)
  assert.equal(browserVersion(rows(report(recorder))), 'not reported by the run')
})
