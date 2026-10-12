#!/usr/bin/env node
// Does tools/check-editor-helpers.mjs pass on faithful copies and fail on anything else?
// Two throwaway directories stand in for the editor checkout and this repository. Synthetic text only.
//
// Run: node --test tools/test-check-editor-helpers.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check, expectedTestCopy, headerNote } from './check-editor-helpers.mjs'

const EDITOR_FILES = {
  'src/renderer/components/Replay/follow.ts': 'export const ease = (zq: number) => zq\n',
  'src/renderer/tracking/utils.ts': 'export const step = (xv: string) => xv\n',
  'src/__tests__/follow.test.ts': "import { ease } from '../renderer/components/Replay/follow';\n\nit('zq', () => expect(ease(1)).toBe(1));\n",
  'src/__tests__/followMore.test.ts': "/** @jest-environment jsdom */\nimport { ease } from '../renderer/components/Replay/follow';\n\nit('xv', () => expect(ease(2)).toBe(2));\n",
  'src/__tests__/trackingUtils.test.ts': "/** @jest-environment node */\nimport { step } from '../renderer/tracking/utils';\n\nit('qz', () => expect(step('qz')).toBe('qz'));\n",
}
const WEB_COPIES = [
  ['src/components/MidstPlayer/follow.ts', 'src/renderer/components/Replay/follow.ts'],
  ['src/components/MidstPlayer/helpers.ts', 'src/renderer/tracking/utils.ts'],
  ['src/__tests__/editor-follow.test.ts', 'src/__tests__/follow.test.ts', '../renderer/components/Replay/follow', '../components/MidstPlayer/follow'],
  ['src/__tests__/editor-followMore.test.ts', 'src/__tests__/followMore.test.ts', '../renderer/components/Replay/follow', '../components/MidstPlayer/follow'],
  ['src/__tests__/editor-trackingUtils.test.ts', 'src/__tests__/trackingUtils.test.ts', '../renderer/tracking/utils', '../components/MidstPlayer/helpers'],
]

// A git hook exports GIT_DIR and friends; without this the fixture's commits would land in this repository.
const env = { ...process.env }
for (const name of execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split('\n')) delete env[name]
const gitIn = root => (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe', env })

const write = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

// An editor checkout whose origin/main holds EDITOR_FILES, and a website tree of faithful copies.
function fixture(t, origin = 'stuartswerdloff@gitea-server:The_Kindled/midst-editor.git') {
  const base = mkdtempSync(join(tmpdir(), 'editor-provenance-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const editor = join(base, 'editor')
  const web = join(base, 'web')
  for (const [path, text] of Object.entries(EDITOR_FILES)) write(editor, path, text)
  const git = gitIn(editor)
  git('init', '--quiet')
  git('add', '.')
  git('-c', 'user.name=zq', '-c', 'user.email=zq@example.invalid', 'commit', '--quiet', '--no-verify', '-m', 'zq')
  git('remote', 'add', 'origin', origin)
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  for (const [local, upstream, originalImport, copyImport] of WEB_COPIES) {
    const original = EDITOR_FILES[upstream]
    write(web, local, originalImport ? expectedTestCopy(original, upstream, originalImport, copyImport) : original)
  }
  return { editor, web }
}
const edit = (root, path, change) => writeFileSync(join(root, path), change(readFileSync(join(root, path), 'utf8')))

test('faithful copies pass and the editor main SHA is reported', t => {
  const { editor, web } = fixture(t)
  assert.match(check(editor, web), /^[a-f0-9]{40}$/)
})

test('the note goes first, or directly after a jest-environment docblock', () => {
  const plain = expectedTestCopy("import { a } from '../x';\n", 'src/__tests__/p.test.ts', '../x', '../y')
  assert.equal(plain, headerNote('src/__tests__/p.test.ts') + "import { a } from '../y';\n")
  const docblock = expectedTestCopy("/** @jest-environment jsdom */\nimport { a } from '../x';\n", 'src/__tests__/p.test.ts', '../x', '../y')
  assert.equal(docblock, '/** @jest-environment jsdom */\n' + headerNote('src/__tests__/p.test.ts') + "import { a } from '../y';\n")
})

test('an original that does not import from the expected path exactly once is refused', () => {
  assert.throws(() => expectedTestCopy("import { a } from '../other';\n", 'p', '../x', '../y'), /exactly one/)
  assert.throws(() => expectedTestCopy("import { a } from '../x';\nimport { b } from '../x';\n", 'p', '../x', '../y'), /exactly one/)
})

for (const [local] of WEB_COPIES.slice(0, 2)) {
  test(`a changed helper fails: ${local}`, t => {
    const { editor, web } = fixture(t)
    edit(web, local, text => text.replace('=>', '=> 0 +'))
    assert.throws(() => check(editor, web), new RegExp(`Copied editor helper differs: ${local}`))
  })
}

for (const [local] of WEB_COPIES.slice(2)) {
  test(`one changed line in a copied test fails: ${local}`, t => {
    const { editor, web } = fixture(t)
    edit(web, local, text => text.replace('toBe(', 'not.toBe('))
    assert.throws(() => check(editor, web), new RegExp(`Copied editor test differs.*${local}`))
  })
}

test('a copied test fails without its note, with an altered note, with an added line, or importing from elsewhere', t => {
  const local = 'src/__tests__/editor-followMore.test.ts'
  const changes = [
    text => text.replace(headerNote('src/__tests__/followMore.test.ts'), ''),
    text => text.replace('with only the import path changed', 'with small changes'),
    text => text + "it('extra', () => {});\n",
    text => text.replace('../components/MidstPlayer/follow', '../components/MidstPlayer/helpers'),
    text => text.replace('/** @jest-environment jsdom */\n', ''),
  ]
  for (const change of changes) {
    const { editor, web } = fixture(t)
    const before = readFileSync(join(web, local), 'utf8')
    edit(web, local, change)
    assert.notEqual(readFileSync(join(web, local), 'utf8'), before)
    assert.throws(() => check(editor, web), /Copied editor test differs/)
  }
})

test('a change on editor main fails the copy until it is copied again', t => {
  const { editor, web } = fixture(t)
  edit(editor, 'src/__tests__/trackingUtils.test.ts', text => text + "it('later', () => {});\n")
  const git = gitIn(editor)
  git('-c', 'user.name=zq', '-c', 'user.email=zq@example.invalid', 'commit', '--quiet', '--no-verify', '-am', 'xv')
  assert.match(check(editor, web), /^[a-f0-9]{40}$/, 'origin/main has not moved yet')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  assert.throws(() => check(editor, web), /Copied editor test differs.*editor-trackingUtils/)
})

test('a checkout that is not midst-editor is refused', t => {
  const { editor, web } = fixture(t, 'stuartswerdloff@gitea-server:The_Kindled/midst-web.git')
  assert.throws(() => check(editor, web), /must be midst-editor/)
})
