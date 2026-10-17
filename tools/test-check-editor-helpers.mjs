#!/usr/bin/env node
// Does tools/check-editor-helpers.mjs pass on faithful copies and fail on anything else?
// Two throwaway directories stand in for the editor checkout and this repository. Synthetic text only.
//
// Run: node --test tools/test-check-editor-helpers.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check, expectedTestCopy, headerNote, PIN_FILE } from './check-editor-helpers.mjs'

const EDITOR_FILES = {
  'src/renderer/components/Replay/follow.ts': 'export const ease = (zq: number) => zq\n',
  'src/renderer/tracking/utils.ts': 'export const step = (xv: string) => xv\n',
  'src/__tests__/follow.test.ts': "import { ease } from '../renderer/components/Replay/follow';\n\nit('zq', () => expect(ease(1)).toBe(1));\n",
  'src/__tests__/followMore.test.ts': "/** @jest-environment jsdom */\nimport { ease } from '../renderer/components/Replay/follow';\n\nit('xv', () => expect(ease(2)).toBe(2));\n",
  'src/__tests__/trackingUtils.test.ts': "/** @jest-environment node */\nimport { step } from '../renderer/tracking/utils';\n\nit('qz', () => expect(step('qz')).toBe('qz'));\n",
  'src/shared/buildLabel.ts': "export const label = (vq: string) => vq\n",
  'src/__tests__/buildLabel.test.ts': "import { label } from '../shared/buildLabel';\n\nit('vq', () => expect(label('vq')).toBe('vq'));\n",
  'docs/user-guide.md': '# Zq\n\nPress **Xv**.\n',
}
const WEB_COPIES = [
  ['src/components/MidstPlayer/follow.ts', 'src/renderer/components/Replay/follow.ts'],
  ['src/components/MidstPlayer/helpers.ts', 'src/renderer/tracking/utils.ts'],
  ['src/buildLabel.ts', 'src/shared/buildLabel.ts'],
  ['src/guide/editor-user-guide.md', 'docs/user-guide.md'],
  ['src/__tests__/editor-follow.test.ts', 'src/__tests__/follow.test.ts', '../renderer/components/Replay/follow', '../components/MidstPlayer/follow'],
  ['src/__tests__/editor-followMore.test.ts', 'src/__tests__/followMore.test.ts', '../renderer/components/Replay/follow', '../components/MidstPlayer/follow'],
  ['src/__tests__/editor-trackingUtils.test.ts', 'src/__tests__/trackingUtils.test.ts', '../renderer/tracking/utils', '../components/MidstPlayer/helpers'],
  ['src/__tests__/editor-buildLabel.test.ts', 'src/__tests__/buildLabel.test.ts', '../shared/buildLabel', '../buildLabel'],
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
  const pinTo = commit => write(web, PIN_FILE, `${commit}\n`)
  pinTo(git('rev-parse', 'HEAD').toString().trim())
  return { editor, web, git, pinTo }
}
const commitAll = (git, message) =>
  git('-c', 'user.name=zq', '-c', 'user.email=zq@example.invalid', 'commit', '--quiet', '--no-verify', '-am', message)
const edit = (root, path, change) => writeFileSync(join(root, path), change(readFileSync(join(root, path), 'utf8')))

test('faithful copies pass, and the pin, editor main and nothing behind are reported', t => {
  const { editor, web, git } = fixture(t)
  const head = git('rev-parse', 'HEAD').toString().trim()
  assert.deepEqual(check(editor, web), { pin: head, main: head, behind: [] })
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

for (const [local] of WEB_COPIES.slice(0, 4)) {
  test(`a changed helper fails: ${local}`, t => {
    const { editor, web } = fixture(t)
    // A one-character change at the start: it changes a helper and the guide alike.
    edit(web, local, text => `x${text}`)
    assert.throws(() => check(editor, web), new RegExp(`Copied editor helper differs: ${local}`))
  })
}

for (const [local] of WEB_COPIES.slice(4)) {
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

// midst-web #152: an editor merge must not turn the website red; it is reported until a copy PR lands.
test('a change on editor main is reported as behind, and fails nothing, until the copy PR moves the pin', t => {
  const { editor, web, git, pinTo } = fixture(t)
  const pinned = git('rev-parse', 'HEAD').toString().trim()
  edit(editor, 'src/__tests__/trackingUtils.test.ts', text => text + "it('later', () => {});\n")
  commitAll(git, 'xv')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  const main = git('rev-parse', 'HEAD').toString().trim()
  assert.deepEqual(check(editor, web), { pin: pinned, main, behind: ['src/__tests__/trackingUtils.test.ts'] })
  // Moving the pin without copying is caught: the copy no longer matches the pinned commit.
  pinTo(main)
  assert.throws(() => check(editor, web), /Copied editor test differs.*editor-trackingUtils/)
  // Copying as well clears it.
  const [local, upstream, originalImport, copyImport] = WEB_COPIES.find(([l]) => l.endsWith('editor-trackingUtils.test.ts'))
  write(web, local, expectedTestCopy(readFileSync(join(editor, upstream), 'utf8'), upstream, originalImport, copyImport))
  assert.deepEqual(check(editor, web), { pin: main, main, behind: [] })
})

test('a copied file that editor main deletes or moves is reported as behind, and fails nothing', t => {
  const { editor, web, git } = fixture(t)
  const pinned = git('rev-parse', 'HEAD').toString().trim()
  git('rm', '--quiet', 'src/renderer/components/Replay/follow.ts')
  git('mv', 'docs/user-guide.md', 'docs/guide.md')
  git('-c', 'user.name=zq', '-c', 'user.email=zq@example.invalid', 'commit', '--quiet', '--no-verify', '-m', 'xv')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  const main = git('rev-parse', 'HEAD').toString().trim()
  assert.deepEqual(check(editor, web), {
    pin: pinned,
    main,
    behind: ['src/renderer/components/Replay/follow.ts (gone from editor main)', 'docs/user-guide.md (gone from editor main)'],
  })
})

test('a pin that is not on editor main is refused, even when the copies match it', t => {
  const { editor, web, git, pinTo } = fixture(t)
  git('checkout', '--quiet', '-b', 'side')
  edit(editor, 'src/shared/buildLabel.ts', text => text + '// side\n')
  commitAll(git, 'side')
  pinTo(git('rev-parse', 'HEAD').toString().trim())
  write(web, 'src/buildLabel.ts', readFileSync(join(editor, 'src/shared/buildLabel.ts'), 'utf8'))
  assert.throws(() => check(editor, web), /is not on editor main/)
})

test('a pin the checkout does not have is refused, and says to fetch', t => {
  const { editor, web, pinTo } = fixture(t)
  pinTo('0123456789abcdef0123456789abcdef01234567')
  assert.throws(() => check(editor, web), /is not in .*: fetch midst-editor/)
})

test('a pin that is not one full SHA is refused', t => {
  const { editor, web, git, pinTo } = fixture(t)
  for (const bad of ['', 'main', git('rev-parse', '--short', 'HEAD').toString().trim(), 'zq\nxv']) {
    pinTo(bad)
    assert.throws(() => check(editor, web), /must hold one full editor commit SHA/)
  }
})

test('a checkout that is not midst-editor is refused', t => {
  const { editor, web } = fixture(t, 'stuartswerdloff@gitea-server:The_Kindled/midst-web.git')
  assert.throws(() => check(editor, web), /must be midst-editor/)
})

test('running through a symlink does not skip the check', t => {
  const tmp = mkdtempSync(join(tmpdir(), 'symlink-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const link = join(tmp, 'check-editor-helpers.mjs')
  const target = join(process.cwd(), 'tools', 'check-editor-helpers.mjs')
  symlinkSync(target, link)
  try {
    execFileSync(process.execPath, [link], { env: { ...process.env, MIDST_EDITOR_ROOT: '' }, stdio: 'pipe' })
    assert.fail('expected non-zero exit')
  } catch (e) {
    assert.notEqual(e.status, 0, 'the check must run (and fail without MIDST_EDITOR_ROOT), not skip')
    assert.match(String(e.stderr || e.message), /Set MIDST_EDITOR_ROOT/)
  }
})
