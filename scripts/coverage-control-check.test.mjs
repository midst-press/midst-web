// Each control message must be seen to fire (midst-web #32). Run with `npm run test:coverage-control`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { controlFailures } from './coverage-control-check.mjs'

const good = { called: 1, never: 0, calledBody: 1, neverBody: 0 }

test('a sound measurement fails nothing', () => {
  assert.deepEqual(controlFailures(good), [])
})

for (const [change, message] of [
  [{ called: 0 }, 'the function the module calls reads as never run'],
  [{ never: 1 }, 'the function nothing calls reads as run'],
  [{ calledBody: 0 }, 'the statement inside the called function reads as never run'],
  [{ neverBody: 1 }, 'the statement inside the uncalled function reads as run'],
]) {
  test(`fires alone: ${message}`, () => {
    assert.deepEqual(controlFailures({ ...good, ...change }), [message])
  })
}

test('names every failed check, not only the first', () => {
  assert.deepEqual(controlFailures({ ...good, never: 3, neverBody: 3 }), [
    'the function nothing calls reads as run',
    'the statement inside the uncalled function reads as run',
  ])
})
