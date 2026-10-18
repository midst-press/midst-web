#!/usr/bin/env node
// Does tools/poem-ids.mjs pass on sound ids and name each way they can be wrong? Synthetic files only.
//
// Run: node --test tools/test-poem-ids.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ID_SHAPE, mint, problems } from './poem-ids.mjs'

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

test('a file with two id lines is refused, whichever one JSON.parse keeps (#67)', t => {
  const twice = `{\n  "id": "${A}",\n  "id": "${B}",\n  "author": "Zq Xv",\n  "title": "Kj"\n}\n`
  assert.equal(JSON.parse(twice).id, B, 'the fixture is what the issue describes: JSON.parse keeps the last')
  assert.deepEqual(problems(dir(t, { 'Zq.json': twice }), {}), ['Zq.json has 2 id lines; a poem has exactly one'])
  // The same id twice is still two lines, and a pending file is not excused.
  const same = `{\n  "id": "${A}",\n  "id": "${A}",\n  "title": "Kj"\n}\n`
  assert.deepEqual(problems(dir(t, { 'Zq.json': same }), {}), ['Zq.json has 2 id lines; a poem has exactly one'])
  assert.deepEqual(problems(dir(t, { 'Zq.json': same }), { 'Zq.json': 'undecided' }),
    ['Zq.json has 2 id lines; a poem has exactly one'])
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
