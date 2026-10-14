// Tests of tools/check-key-scheme.mjs (key scheme and poem list), on invented poem files.  node --test tools/test-check-key-scheme.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { problems } from './check-key-scheme.mjs'

const ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TOOL = fileURLToPath(new URL('./check-key-scheme.mjs', import.meta.url))

function poems(files) {
  const dir = mkdtempSync(join(tmpdir(), 'key-scheme-'))
  for (const [name, meta] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(meta))
  return dir
}

const complete = () => poems({
  'a.json': { id: ID, author: 'Zq', title: 'x', published: true },
  'b.json': { author: 'Kj', title: 'y', published: false },
  'order.json': ['a'],
})

test('legacy needs nothing of the poem files', () => {
  assert.deepEqual(problems('legacy', poems({ 'a.json': { author: 'Zq', title: 'x', published: true } }), 'bundled'), [])
})

test('canonical passes when every published poem has an id; unpublished ones and order.json are not asked', () => {
  assert.deepEqual(problems('canonical', complete(), 'bundled'), [])
})

test('canonical names each published file with no id or a malformed one, by file name only', () => {
  const dir = poems({
    'a.json': { id: ID, author: 'Zq', title: 'x', published: true },
    'c.json': { author: 'Secret Author', title: 'Secret Title', published: true },
    'd.json': { id: ID.toUpperCase(), author: 'Wm', title: 'z', published: true },
  })
  const found = problems('canonical', dir, 'bundled')
  assert.equal(found.length, 1)
  assert.match(found[0], /^2 published poem file\(s\) have no well-formed id/)
  assert.match(found[0], /: c\.json, d\.json$/)
  assert.doesNotMatch(found[0], /Secret/)
})

for (const value of [undefined, '', 'Legacy', 'canonical ', 'both']) {
  test(`refuses ${JSON.stringify(value)} and says there is no default`, () => {
    const found = problems(value, complete(), 'bundled')
    assert.equal(found.length, 1)
    assert.match(found[0], /MIDST_KEY_SCHEME must be "legacy" or "canonical"/)
    assert.match(found[0], /There is no default\.$/)
  })
}

// The command itself, against this repository's poem files: what `npm run build` runs first.
const run = (scheme, list = 'bundled') => {
  const env = { ...process.env }
  delete env.MIDST_KEY_SCHEME
  delete env.MIDST_POEM_LIST
  if (scheme !== undefined) env.MIDST_KEY_SCHEME = scheme
  if (list !== null) env.MIDST_POEM_LIST = list
  return spawnSync(process.execPath, [TOOL], { env, encoding: 'utf8' })
}

test('the command exits 1 with no scheme set', () => {
  const result = run(undefined)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /it is not set/)
})

test('the command exits 1 for an unknown scheme', () => {
  assert.equal(run('s3').status, 1)
})

for (const scheme of ['legacy', 'canonical']) {
  test(`the command passes for ${scheme} on this repository's poems`, () => {
    const result = run(scheme)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), `key scheme: ${scheme}; poem list: bundled`)
  })
}

// The poem list (#110): required like the scheme, and "published" does not ask the bundled files for ids.
for (const value of [undefined, '', 'Bundled', 'published ', 'both']) {
  test(`refuses the poem list ${JSON.stringify(value)} and says there is no default`, () => {
    const found = problems('legacy', complete(), value)
    assert.equal(found.length, 1)
    assert.match(found[0], /MIDST_POEM_LIST must be "bundled" or "published"/)
    assert.match(found[0], /There is no default\.$/)
  })
}

test('names both when neither is set', () => {
  assert.equal(problems(undefined, complete(), undefined).length, 2)
})

test('canonical under published does not ask the bundled poem files for ids', () => {
  const dir = poems({ 'c.json': { author: 'Secret Author', title: 'Secret Title', published: true } })
  assert.equal(problems('canonical', dir, 'bundled').length, 1)
  assert.deepEqual(problems('canonical', dir, 'published'), [])
})

test('published still refuses a missing or unknown key scheme', () => {
  assert.equal(problems(undefined, complete(), 'published').length, 1)
  assert.equal(problems('s3', complete(), 'published').length, 1)
})

test('the command exits 1 with no poem list set, and passes for each list', () => {
  const missing = run('legacy', null)
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /MIDST_POEM_LIST must be/)
  assert.equal(run('legacy', 'both').status, 1)
  for (const list of ['bundled', 'published']) {
    const result = run('canonical', list)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), `key scheme: canonical; poem list: ${list}`)
  }
})
