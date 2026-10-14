// Tests of tools/check-key-scheme.mjs, on invented poem files.  node --test tools/test-check-key-scheme.mjs
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
  assert.deepEqual(problems('legacy', poems({ 'a.json': { author: 'Zq', title: 'x', published: true } })), [])
})

test('canonical passes when every published poem has an id; unpublished ones and order.json are not asked', () => {
  assert.deepEqual(problems('canonical', complete()), [])
})

test('canonical names each published file with no id or a malformed one, by file name only', () => {
  const dir = poems({
    'a.json': { id: ID, author: 'Zq', title: 'x', published: true },
    'c.json': { author: 'Secret Author', title: 'Secret Title', published: true },
    'd.json': { id: ID.toUpperCase(), author: 'Wm', title: 'z', published: true },
  })
  const found = problems('canonical', dir)
  assert.equal(found.length, 1)
  assert.match(found[0], /^2 published poem file\(s\) have no well-formed id/)
  assert.match(found[0], /: c\.json, d\.json$/)
  assert.doesNotMatch(found[0], /Secret/)
})

for (const value of [undefined, '', 'Legacy', 'canonical ', 'both']) {
  test(`refuses ${JSON.stringify(value)} and says there is no default`, () => {
    const found = problems(value, complete())
    assert.equal(found.length, 1)
    assert.match(found[0], /MIDST_KEY_SCHEME must be "legacy" or "canonical"/)
    assert.match(found[0], /There is no default\.$/)
  })
}

// The command itself, against this repository's poem files: what `npm run build` runs first.
const run = scheme => {
  const env = { ...process.env }
  delete env.MIDST_KEY_SCHEME
  if (scheme !== undefined) env.MIDST_KEY_SCHEME = scheme
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
    assert.equal(result.stdout.trim(), `key scheme: ${scheme}`)
  })
}
