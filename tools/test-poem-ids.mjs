#!/usr/bin/env node
// Does tools/poem-ids.mjs pass on sound ids and name each way they can be wrong? Synthetic files only.
//
// Run: node --test tools/test-poem-ids.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ID_SHAPE, baseIds, currentIds, idChanges, mint, problems } from './poem-ids.mjs'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-9222-222222222222'
const poem = fields => JSON.stringify({ author: 'Zq Xv', title: 'Kj', ...fields }, null, 2) + '\n'

function dir(t, files) {
  const base = mkdtempSync(join(tmpdir(), 'poem-ids-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(base, name), text)
  return base
}

test('sound ids pass, and order.json is not a poem', t => {
  const base = dir(t, { 'Zq.json': poem({ id: A }), 'Xv.json': poem({ id: B }), 'order.json': '{"order": []}\n' })
  assert.deepEqual(problems(base, {}), [])
})

test('a missing id is named', t => {
  const base = dir(t, { 'Zq.json': poem({ id: A }), 'Xv.json': poem({}) })
  assert.deepEqual(problems(base, {}), ['Xv.json has no id; run node tools/poem-ids.mjs --mint'])
})

for (const bad of ['11111111-1111-1111-8111-111111111111', 'ABCDEF12-3456-4ABC-8DEF-ABCDEF123456', 'zq-xv--kj', '', 7, null]) {
  test(`an id that is not a lower-case version-4 UUID is refused: ${JSON.stringify(bad)}`, t => {
    const base = dir(t, { 'Zq.json': poem({ id: bad }) })
    assert.deepEqual(problems(base, {}), ['Zq.json has an id that is not a lower-case version-4 UUID'])
  })
}

test('two poems with one id are refused, naming both', t => {
  const base = dir(t, { 'Xv.json': poem({ id: A }), 'Zq.json': poem({ id: A }) })
  assert.deepEqual(problems(base, {}), ['Zq.json has the same id as Xv.json'])
})

test('a pending file needs no id, must not have one, and must exist', t => {
  const pending = { 'Xv.json': 'undecided' }
  assert.deepEqual(problems(dir(t, { 'Zq.json': poem({ id: A }), 'Xv.json': poem({}) }), pending), [])
  assert.deepEqual(problems(dir(t, { 'Zq.json': poem({ id: A }), 'Xv.json': poem({ id: B }) }), pending),
    ['Xv.json has an id but is on the pending list; decide it and remove it from the list'])
  assert.deepEqual(problems(dir(t, { 'Zq.json': poem({ id: A }) }), pending),
    ['Xv.json is on the pending list but is not a poem file; remove it from the list'])
})

test('mint adds an id first, changes nothing else, skips pending files and files that have one', t => {
  const before = poem({ tags: '' })
  const base = dir(t, { 'Zq.json': before, 'Xv.json': poem({ id: A }), 'Kj.json': poem({}), 'order.json': '{"order": []}\n' })
  const ids = [B]
  assert.deepEqual(mint(base, { 'Kj.json': 'undecided' }, () => ids.shift()), ['Zq.json'])
  assert.equal(readFileSync(join(base, 'Zq.json'), 'utf8'), `{\n  "id": "${B}",\n` + before.slice(2))
  assert.equal(readFileSync(join(base, 'Xv.json'), 'utf8'), poem({ id: A }))
  assert.equal(readFileSync(join(base, 'Kj.json'), 'utf8'), poem({}))
  assert.deepEqual(problems(base, { 'Kj.json': 'undecided' }), [])
  assert.deepEqual(mint(base, { 'Kj.json': 'undecided' }), [], 'a second run mints nothing')
})

test('what the default generator mints has the required shape', t => {
  const base = dir(t, { 'Zq.json': poem({}) })
  mint(base, {})
  assert.match(JSON.parse(readFileSync(join(base, 'Zq.json'), 'utf8')).id, ID_SHAPE)
})

// ---- an id never changes and never goes (#65) ----------------------------------------------------------------

const C = '33333333-3333-4333-a333-333333333333'

test('idChanges: the same ids pass, a new poem passes, and a renamed file keeps its id', () => {
  const before = new Map([[A, 'Zq.json'], [B, 'Xv.json']])
  assert.deepEqual(idChanges(before, new Map([[A, 'Zq.json'], [B, 'Xv.json'], [C, 'Kj.json']])), [])
  assert.deepEqual(idChanges(before, new Map([[A, 'Zq_renamed.json'], [B, 'Xv.json']])), [])
})

test('idChanges: an id changed in place, or a poem removed, is refused by id', () => {
  const before = new Map([[A, 'Zq.json'], [B, 'Xv.json']])
  const gone = id => `id ${id} (on ${before.get(id)} at the base) is on no poem file now; an id never changes and is never removed`
  assert.deepEqual(idChanges(before, new Map([[C, 'Zq.json'], [B, 'Xv.json']])), [gone(A)])
  assert.deepEqual(idChanges(before, new Map([[A, 'Zq.json']])), [gone(B)])
})

// A real repository: main holds two poems; a branch off it changes, renames or adds files. It must not see the
// repository this test runs in: a commit hook exports GIT_INDEX_FILE and the like, and a hooks path would run
// this repo's pre-commit inside the fixture.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key]
function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'poem-ids-git-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const run = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=zq', '-c', 'user.email=zq@example.invalid', '-c', 'core.hooksPath=/dev/null', ...args], { stdio: 'pipe' })
  run('init', '-q', '-b', 'main')
  mkdirSync(join(root, 'src/poems'), { recursive: true })
  writeFileSync(join(root, 'src/poems/Zq.json'), poem({ id: A }))
  writeFileSync(join(root, 'src/poems/Xv.json'), poem({ id: B }))
  writeFileSync(join(root, 'src/poems/order.json'), '{"order": []}\n')
  run('add', '-A'); run('commit', '-q', '--no-verify', '-m', 'base')
  run('switch', '-q', '-c', 'work')
  return { root, dir: join(root, 'src/poems'), run }
}

test('against a real merge base: an edited id is refused, a rename and a new poem pass', t => {
  const { root, dir, run } = repo(t)
  assert.deepEqual([...baseIds(root, 'main')].sort(), [[A, 'Zq.json'], [B, 'Xv.json']].sort())
  renameSync(join(dir, 'Xv.json'), join(dir, 'Xv2.json'))
  writeFileSync(join(dir, 'Kj.json'), poem({ id: C }))
  run('add', '-A'); run('commit', '-q', '--no-verify', '-m', 'rename and add')
  assert.deepEqual(idChanges(baseIds(root, 'main'), currentIds(dir)), [])
  writeFileSync(join(dir, 'Zq.json'), poem({ id: '44444444-4444-4444-8444-444444444444' }))
  assert.equal(idChanges(baseIds(root, 'main'), currentIds(dir)).length, 1, 'uncommitted edits are checked too')
})

test('the base is the merge base, so a poem added to main after the branch is not required on it', t => {
  const { root, dir, run } = repo(t)
  run('switch', '-q', 'main')
  writeFileSync(join(dir, 'Kj.json'), poem({ id: C }))
  run('add', '-A'); run('commit', '-q', '--no-verify', '-m', 'main moves on')
  run('switch', '-q', 'work')
  assert.deepEqual(idChanges(baseIds(root, 'main'), currentIds(dir)), [])
})

test('no base to compare with is an error, never an empty base that passes everything', t => {
  const { root } = repo(t)
  assert.throws(() => baseIds(root, 'origin/main'), /no merge base with origin\/main/)
})
