// A comment-only file has no code; anything else does (midst-web #24). Run with `npm run test:coverage-control`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasCode } from './coverage-has-code.mjs'

for (const [label, text] of [['empty', ''], ['whitespace', ' \n\t\n'], ['line comment', '// TODO: zq\n'],
  ['block comment', '/* zq\n * xv */\n'], ['both', '// zq\n/* xv */\n\n// kj\n']]) {
  test(`no code: ${label}`, () => assert.equal(hasCode(text), false))
}

for (const [label, text] of [['a statement', 'export const zq = 1\n'], ['after a comment', '// zq\nexport {}\n'],
  ['a directive', "'use strict'\n"], ['JSX', '// zq\n<div />\n'], ['a type only', 'export type Zq = string\n']]) {
  test(`code: ${label}`, () => assert.equal(hasCode(text), true))
}
