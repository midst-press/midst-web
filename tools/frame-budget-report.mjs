// The frame-budget attestation's reading of a Playwright JSON report, and its markdown block. No side effects:
// tools/frame-budget-attest.mjs runs git and Playwright, and tools/test-frame-budget-report.mjs tests this.
// Numbers and spec titles only, never poem names.
import { Buffer } from 'node:buffer'

// The verdict's counters, as e2e/replay-follow.spec.ts computes and asserts them. Printed from the spec's own
// 'follow-verdict' attachment, never recomputed here, so the block cannot disagree with the test (#20).
export const COUNTERS = ['unfollowed', 'offscreenEdits', 'abrupt', 'frameAbrupt', 'instant', 'wroteWhileGliding']
export const WRITING_JUMPS = [['600', 'end'], ['600', 'middle'], ['720', 'end'], ['720', 'middle']]
// The fifth test, named exactly, so another @frame-budget test without a height cannot pass as it (#173).
export const RECORDER_TITLE =
  '@frame-budget recorder observes quiet offscreen writing and distinguishes forced clamps from voluntary jumps'
const UNREADABLE = Symbol('unreadable')

const plain = text => String(text ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').map(line => line.trim()).filter(Boolean)

// An attachment's JSON; null when the test attached none, UNREADABLE when it attached one that does not parse,
// so a corrupt attachment is refused as unreadable and not as missing (#173).
function attachment(res, name) {
  const att = (res.attachments ?? []).find(a => a.name === name)
  if (!att?.body) return null
  try { return JSON.parse(Buffer.from(att.body, 'base64').toString('utf-8')) } catch { return UNREADABLE }
}

function* tests(report) {
  const walk = function* (suite) {
    for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) yield { spec, res: t.results?.[t.results.length - 1] }
    for (const child of suite.suites ?? []) yield* walk(child)
  }
  for (const suite of report.suites ?? []) yield* walk(suite)
}

const median = xs => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null)

// Sampler intervals from the recording's timestamps (sample[4] is elapsed ms).
export function sampler(rec) {
  const samples = rec?.samples ?? []
  if (samples.length < 2) return { median: null, max: null }
  const intervals = samples.slice(1).map((s, i) => s[4] - samples[i][4])
  return { median: median(intervals), max: Math.max(...intervals) }
}

// Why a run did not pass, one line each: the report's top-level errors (Playwright failing before any test
// started, #68), then every test that neither passed nor was skipped, with its first lines of error.
export function failureLines(report) {
  const lines = (report.errors ?? []).map(e => `- error: ${plain(e.message ?? e.value).slice(0, 16).join(' | ').slice(0, 1200)}`)
  for (const { spec, res } of tests(report)) {
    if (!res || res.status === 'passed' || res.status === 'skipped') continue
    const message = plain(res.error?.message ?? res.errors?.[0]?.message ?? 'no error message').slice(0, 16).join(' | ')
    lines.push(`- ${res.status}: ${spec.title}: ${message.slice(0, 1200)}`)
  }
  return lines
}

const fixed = x => (x == null ? 'n/a' : x.toFixed(1))

// One row per test, from the spec's 'follow-motion' (the recording) and 'follow-verdict' (the verdict and the
// browser version) attachments.
export function rows(report) {
  const out = []
  for (const { spec, res } of tests(report)) {
    if (!res) continue
    const motion = attachment(res, 'follow-motion')
    const verdict = attachment(res, 'follow-verdict')
    const unreadable = [['follow-motion', motion], ['follow-verdict', verdict]].filter(([, v]) => v === UNREADABLE).map(([n]) => n)
    const rec = motion === UNREADABLE ? null : motion
    const judged = verdict === UNREADABLE ? null : verdict
    const s = rec ? sampler(rec) : { median: null, max: null }
    const raf = rec?.rafIntervals ?? []
    out.push({
      title: spec.title,
      unreadable,
      height: spec.title.match(/height (\d+)/)?.[1] ?? 'recorder',
      position: spec.title.match(/:\s*(end|middle)/)?.[1] ?? 'n/a',
      status: res.status === 'passed' ? 'PASS' : 'FAIL',
      samplerMedian: fixed(s.median),
      samplerMax: fixed(s.max),
      rafMedian: fixed(median(raf)),
      rafMax: fixed(raf.length ? Math.max(...raf) : null),
      counters: judged?.result ? COUNTERS.map(k => judged.result[k] ?? 'n/a') : COUNTERS.map(() => 'n/a'),
      browser: judged?.browser ?? null,
      // 'n/a' when the test recorded no cache check at all, so the no-timing-data refusal can fire for it (#30).
      cacheMatch: rec?.cacheValid ? (rec.cacheValid.match ? 'yes' : 'no') : 'n/a',
    })
  }
  return out
}

// Why these rows are not an attestation, or null: five tests (four writing jumps and the recorder), each writing
// jump present once, with its recording, its cache check and its verdict.
export function refusal(rs) {
  if (rs.length !== 5) return `expected 5 tests, got ${rs.length}.`
  const others = rs.filter(r => r.height === 'recorder')
  if (others.length !== 1 || others[0].title !== RECORDER_TITLE) {
    return `expected the recorder test and four writing jumps; also found: ${others.filter(r => r.title !== RECORDER_TITLE).map(r => r.title).join('; ') || 'no recorder test'}.`
  }
  for (const [h, p] of WRITING_JUMPS) {
    const found = rs.filter(r => r.height === h && r.position === p)
    if (found.length !== 1) return `expected one test for height ${h}, position ${p}, got ${found.length}.`
    const [r] = found
    if (r.unreadable.length) return `test ${h}/${p}: attachment ${r.unreadable.join(' and ')} is unreadable.`
    if (r.samplerMax === 'n/a' || r.cacheMatch === 'n/a') return `test ${h}/${p} has no timing data.`
    if (r.counters.includes('n/a')) return `test ${h}/${p} attached no verdict.`
    const bad = COUNTERS.filter((k, i) => !Number.isInteger(r.counters[i]))
    if (bad.length) return `test ${h}/${p}: verdict counter ${bad.join(', ')} is not an integer.`
  }
  return null
}

// The browser the run reported, from the writing jumps' verdicts: one version, or every version seen.
export function browserVersion(rs) {
  const seen = [...new Set(rs.map(r => r.browser).filter(Boolean))]
  return seen.length ? seen.join(', ') : 'not reported by the run'
}

export function render({ headSha, host, displayCheck, playwrightVersion, platform, extraArgs, rs }) {
  const passed = rs.filter(r => r.status === 'PASS').length
  return `
## Frame-Budget Attestation

| Field | Value |
|-------|-------|
| Head | \`${headSha}\` |
| Dirty tree | refused if dirty (clean) |
| Hostname | ${host} |
| Display check (not a frame rate; the rAF columns are) | ${displayCheck} |
| Playwright | ${playwrightVersion} |
| Chromium | ${browserVersion(rs)} |
| Platform | ${platform} |
| Playwright arguments | ${extraArgs.length ? extraArgs.join(' ') : '(none)'} |

| Height | Position | Result | Sampler median | Sampler max | rAF median | rAF max | ${COUNTERS.join(' | ')} | Cache match |
|--------|----------|--------|----------------|-------------|------------|---------|${COUNTERS.map(() => '---').join('|')}|-------------|
${rs.map(r => `| ${r.height} | ${r.position} | ${r.status} | ${r.samplerMedian} | ${r.samplerMax} | ${r.rafMedian} | ${r.rafMax} | ${r.counters.join(' | ')} | ${r.cacheMatch} |`).join('\n')}

**Totals:** ${passed} passed, ${rs.length - passed} failed out of ${rs.length}
`
}
