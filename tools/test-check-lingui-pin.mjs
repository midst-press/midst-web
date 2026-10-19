// tools/check-lingui-pin.mjs: the pin holds on this repository, and each way it can be broken is caught.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { RANGE, pinProblems } from './check-lingui-pin.mjs'

const pkg = (ranges = { '@lingui/core': RANGE }, dev = { '@lingui/cli': RANGE }) => ({ dependencies: ranges, devDependencies: dev })
const lock = (versions = { 'node_modules/@lingui/core': '5.9.5', 'node_modules/@lingui/cli': '5.9.5' }) =>
  ({ packages: Object.fromEntries(Object.entries(versions).map(([path, version]) => [path, { version }])) })

test('this repository holds Lingui below 6, and the CLI says so', () => {
  const real = pinProblems(JSON.parse(readFileSync('package.json', 'utf8')), JSON.parse(readFileSync('package-lock.json', 'utf8')))
  assert.deepEqual(real, [])
  const run = spawnSync(process.execPath, ['tools/check-lingui-pin.mjs'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
})

test('a range other than the written-out one is refused, a caret most of all', () => {
  for (const range of ['^5.9.5', '5.9.5', '>=5.9.5', '>=5.9.5 <7', '*']) {
    assert.deepEqual(pinProblems(pkg({ '@lingui/core': range }), lock()),
      [`package.json has @lingui/core at "${range}"; it must be "${RANGE}".`], range)
  }
  assert.equal(pinProblems(pkg({}, { '@lingui/cli': '^6.0.0' }), lock()).length, 1, 'a dev dependency counts too')
})

test('a locked 6, direct or nested, is refused', () => {
  assert.deepEqual(pinProblems(pkg(), lock({ 'node_modules/@lingui/core': '6.0.0', 'node_modules/@lingui/cli': '5.9.5' })),
    ['package-lock.json locks @lingui/core at 6.0.0; it must stay below 6.'])
  assert.deepEqual(pinProblems(pkg(), lock({
    'node_modules/@lingui/core': '5.9.5', 'node_modules/zq/node_modules/@lingui/message-utils': '6.10.0',
  })), ['package-lock.json locks @lingui/message-utils at 6.10.0; it must stay below 6.'])
})

test('no @lingui package declared, or none locked, is a problem, not a pass', () => {
  assert.deepEqual(pinProblems({ dependencies: {}, devDependencies: {} }, lock()), ['package.json declares no @lingui package.'])
  assert.deepEqual(pinProblems(pkg(), { packages: {} }), ['package-lock.json locks no @lingui package.'])
})

test('a broken package.json is exit 2, named', () => {
  const run = spawnSync(process.execPath, ['tools/check-lingui-pin.mjs', '--root', 'tools/no-such-dir'], { encoding: 'utf8' })
  assert.equal(run.status, 2)
  assert.match(run.stderr, /cannot read .*package\.json/)
})
