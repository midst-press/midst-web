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
import { ID_SHAPE, baseIds, baseRetired, currentIds, idChanges, mergeBase, mint, problems, readRetired } from './poem-ids.mjs'

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

// ---- an id never changes meaning (#65) -----------------------------------------------------------------------

const C = '33333333-3333-4333-a333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'
const gone = (id, name) =>
  `id ${id} (on ${name} at the base) is on no poem file now; an id never changes, and a withdrawn poem's id goes on tools/retired-poem-ids.json`

test('idChanges: the same ids pass, a new poem passes, and a renamed file keeps its id', () => {
  const before = new Map([[A, 'Zq.json'], [B, 'Xv.json']])
  assert.deepEqual(idChanges(before, new Map([[A, 'Zq.json'], [B, 'Xv.json'], [C, 'Kj.json']])), [])
  assert.deepEqual(idChanges(before, new Map([[A, 'Zq_renamed.json'], [B, 'Xv.json']])), [])
})

test('idChanges: an id changed in place, or a poem removed without retiring its id, is refused by id', () => {
  const before = new Map([[A, 'Zq.json'], [B, 'Xv.json']])
  assert.deepEqual(idChanges(before, new Map([[C, 'Zq.json'], [B, 'Xv.json']])), [gone(A, 'Zq.json')])
  assert.deepEqual(idChanges(before, new Map([[A, 'Zq.json']])), [gone(B, 'Xv.json')])
})

test('idChanges: a withdrawn poem whose id is retired passes', () => {
  const before = new Map([[A, 'Zq.json'], [B, 'Xv.json']])
  assert.deepEqual(idChanges(before, new Map([[A, 'Zq.json']]), { [B]: 'withdrawn by the poet' }), [])
})

test('idChanges: a retired id stays reserved: not on a live file, and never off the list', () => {
  const now = new Map([[A, 'Zq.json']])
  assert.deepEqual(idChanges(new Map(), now, { [A]: 'withdrawn' }),
    [`id ${A} is retired but is on Zq.json; a retired id is never used again`])
  assert.deepEqual(idChanges(new Map(), now, {}, { [B]: 'withdrawn' }),
    [`id ${B} was retired at the base and is not now; a retired id stays on tools/retired-poem-ids.json`])
})

test('idChanges: a retired entry is a well-formed id with a reason', () => {
  assert.deepEqual(idChanges(new Map(), new Map(), { 'zq-xv': 'withdrawn', [B]: ' ' }), [
    'tools/retired-poem-ids.json: "zq-xv" is not a lower-case version-4 UUID',
    `tools/retired-poem-ids.json: id ${B} needs a reason`,
  ])
})

// A real repository: main holds two poems; a branch off it changes, renames or adds files. It must not see the
// repository this test runs in: a commit hook exports GIT_INDEX_FILE and the like, and a hooks path would run
// this repo's pre-commit inside the fixture.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key]
function repo(t, retired) {
  const root = mkdtempSync(join(tmpdir(), 'poem-ids-git-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const run = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=zq', '-c', 'user.email=zq@example.invalid', '-c', 'core.hooksPath=/dev/null', ...args], { stdio: 'pipe' })
  run('init', '-q', '-b', 'main')
  mkdirSync(join(root, 'src/poems'), { recursive: true })
  mkdirSync(join(root, 'tools'))
  writeFileSync(join(root, 'src/poems/Zq.json'), poem({ id: A }))
  writeFileSync(join(root, 'src/poems/Xv.json'), poem({ id: B }))
  writeFileSync(join(root, 'src/poems/order.json'), '{"order": []}\n')
  if (retired) writeFileSync(join(root, 'tools/retired-poem-ids.json'), JSON.stringify(retired) + '\n')
  run('add', '-A'); run('commit', '-q', '--no-verify', '-m', 'base')
  run('switch', '-q', '-c', 'work')
  return { root, dir: join(root, 'src/poems'), run }
}

const changesAt = (root, dir, base = 'main') => {
  const commit = mergeBase(root, base)
  return idChanges(baseIds(root, commit), currentIds(dir), readRetired(root), baseRetired(root, commit))
}

test('against a real merge base: an edited id is refused, a rename and a new poem pass', t => {
  const { root, dir, run } = repo(t, {})
  assert.deepEqual([...baseIds(root, mergeBase(root, 'main'))].sort(), [[A, 'Zq.json'], [B, 'Xv.json']].sort())
  renameSync(join(dir, 'Xv.json'), join(dir, 'Xv2.json'))
  writeFileSync(join(dir, 'Kj.json'), poem({ id: C }))
  run('add', '-A'); run('commit', '-q', '--no-verify', '-m', 'rename and add')
  assert.deepEqual(changesAt(root, dir), [])
  writeFileSync(join(dir, 'Zq.json'), poem({ id: D }))
  assert.deepEqual(changesAt(root, dir), [gone(A, 'Zq.json')], 'uncommitted edits are checked too')
})

test('against a real merge base: withdrawing a poem passes once its id is retired, and not before', t => {
  const { root, dir } = repo(t, {})
  rmSync(join(dir, 'Xv.json'))
  assert.deepEqual(changesAt(root, dir), [gone(B, 'Xv.json')])
  writeFileSync(join(root, 'tools/retired-poem-ids.json'), JSON.stringify({ [B]: 'withdrawn by the poet' }))
  assert.deepEqual(changesAt(root, dir), [])
})

test('against a real merge base: a retired id taken off the list is refused', t => {
  const { root, dir } = repo(t, { [C]: 'withdrawn by the poet' })
  writeFileSync(join(root, 'tools/retired-poem-ids.json'), '{}')
  assert.deepEqual(changesAt(root, dir),
    [`id ${C} was retired at the base and is not now; a retired id stays on tools/retired-poem-ids.json`])
})

test('a base from before the retired list counts as an empty list', t => {
  const { root } = repo(t)
  assert.deepEqual(baseRetired(root, mergeBase(root, 'main')), {})
})

test('the base is the merge base, so a poem added to main after the branch is not required on it', t => {
  const { root, dir, run } = repo(t, {})
  run('switch', '-q', 'main')
  writeFileSync(join(dir, 'Kj.json'), poem({ id: C }))
  run('add', '-A'); run('commit', '-q', '--no-verify', '-m', 'main moves on')
  run('switch', '-q', 'work')
  assert.deepEqual(changesAt(root, dir), [])
})

test('no base to compare with is an error, never an empty base that passes everything', t => {
  const { root } = repo(t, {})
  assert.throws(() => mergeBase(root, 'origin/main'), /no merge base with origin\/main/)
})
