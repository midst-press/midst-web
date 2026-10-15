// Run: node --test tools/test-seed-published.mjs   (synthetic metadata in temporary directories; no poem content)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TOOL = join(dirname(fileURLToPath(import.meta.url)), 'seed-published.mjs')
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

const meta = (id, extra = {}) => ({
  id, author: `Au ${id[0]}`, title: `Zq ${id[0]}`, date: 'Spring', tags: ['x'], publishDate: '2026-10-01',
  highlighted: false, published: true, ...extra,
})

/** A poems directory, a staged directory and an out path, all under a fresh temporary directory. */
function setup({ metas, order, staged }) {
  const root = mkdtempSync(join(tmpdir(), 'seed-published-'))
  const poems = join(root, 'poems-meta')
  mkdirSync(poems)
  for (const [name, m] of Object.entries(metas)) writeFileSync(join(poems, `${name}.json`), JSON.stringify(m))
  writeFileSync(join(poems, 'order.json'), JSON.stringify({ order }))
  const stage = join(root, 'staged')
  for (const key of staged) {
    mkdirSync(dirname(join(stage, key)), { recursive: true })
    writeFileSync(join(stage, key), 'zq')
  }
  mkdirSync(stage, { recursive: true })
  return { root, poems, stage, out: join(root, 'published.json') }
}

const run = (s, extra = []) => spawnSync(process.execPath, [TOOL, '--staged', s.stage, '--out', s.out, '--poems', s.poems, ...extra], { encoding: 'utf8' })
const tl = id => `poems/${id}/timelapse.midst.zip`
const note = id => `poems/${id}/process-note.md`

test('the list follows order.json, with canonical keys, a note only where one was staged, and the legacy fields', () => {
  const s = setup({ metas: { Bb: meta(B, { highlighted: true }), Aa: meta(A) }, order: ['Bb', 'Aa'], staged: [tl(A), tl(B), note(B)] })
  const r = run(s)
  assert.equal(r.status, 0, r.stderr)
  const list = JSON.parse(readFileSync(s.out, 'utf8'))
  assert.equal(list.version, 1)
  assert.ok(!Number.isNaN(Date.parse(list.updated)))
  assert.deepEqual(list.poems.map(p => p.poemId), [B, A])
  assert.deepEqual(list.poems[0], {
    poemId: B, title: 'Zq 2', author: 'Au 2', timelapse: tl(B), processNote: note(B),
    publishDate: '2026-10-01', highlighted: true, date: 'Spring', tags: ['x'],
  })
  assert.equal(list.poems[1].processNote, null)
  assert.equal(statSync(s.out).mode & 0o777, 0o600)
  assert.equal(r.stdout.trim(), 'seed-published: 2 poems in reading order, 1 with a process note.')
})

test('what it prints names no poem: no title or author, on success or refusal', () => {
  const ok = setup({ metas: { Aa: meta(A) }, order: ['Aa'], staged: [tl(A)] })
  const bad = setup({ metas: { Aa: meta(A) }, order: ['Aa'], staged: [] })
  for (const r of [run(ok), run(bad)]) {
    assert.doesNotMatch(r.stdout + r.stderr, /Zq|Au |Aa/)
  }
})

test('a timelapse that was not staged refuses the whole list, naming only its id', () => {
  const s = setup({ metas: { Aa: meta(A), Bb: meta(B) }, order: ['Aa', 'Bb'], staged: [tl(A), note(B)] })
  const r = run(s)
  assert.equal(r.status, 1)
  assert.match(r.stderr, new RegExp(`1 timelapse\\(s\\) are not in --staged: ${B}`))
  assert.equal(existsSync(s.out), false)
})

test('an inconsistent order or metadata refuses, and nothing is written', () => {
  const cases = [
    [{ Aa: meta(A) }, ['Aa', 'Zz'], 'no metadata file'],
    [{ Aa: meta(A), Bb: meta(B, { published: false }) }, ['Aa', 'Bb'], 'not published:true'],
    [{ Aa: meta(A), Bb: meta('not-an-id') }, ['Aa', 'Bb'], 'no well-formed id'],
    [{ Aa: meta(A), Bb: meta(A) }, ['Aa', 'Bb'], 'share an id'],
    [{ Aa: meta(A) }, ['Aa', 'Aa'], 'more than once'],
  ]
  for (const [metas, order, expected] of cases) {
    const s = setup({ metas, order, staged: [tl(A), tl(B), tl(C)] })
    const r = run(s)
    assert.equal(r.status, 1, expected)
    assert.match(r.stderr, new RegExp(expected.replace(/[()]/g, '\\$&')), expected)
    assert.equal(existsSync(s.out), false, expected)
  }
})

test('an existing --out is never replaced', () => {
  const s = setup({ metas: { Aa: meta(A) }, order: ['Aa'], staged: [tl(A)] })
  writeFileSync(s.out, 'the publisher\'s list')
  const r = run(s)
  assert.equal(r.status, 1)
  assert.equal(readFileSync(s.out, 'utf8'), 'the publisher\'s list')
})

test('--out inside a git work tree is refused', () => {
  const s = setup({ metas: { Aa: meta(A) }, order: ['Aa'], staged: [tl(A)] })
  mkdirSync(join(s.root, 'repo', '.git'), { recursive: true })
  const inside = join(s.root, 'repo', 'deep', 'published.json')
  const r = spawnSync(process.execPath, [TOOL, '--staged', s.stage, '--out', inside, '--poems', s.poems], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /git work tree/)
  assert.equal(existsSync(inside), false)
})

test('missing --staged or --out is a usage error', () => {
  for (const args of [['--out', '/nonexistent/x.json'], ['--staged', '/nonexistent']]) {
    const r = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /usage|needs a value/)
  }
})
