import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'

// The editor commit the copies are held to. A copy PR copies the files and moves this pin in the same
// commit (--pin-to-main). The gate compares with the pin, not with editor main, so an editor merge cannot
// turn every website branch red (midst-web #152). Copies that have fallen behind editor main are reported
// on every run, without failing it.
export const PIN_FILE = 'tools/editor-copies-pin'

// Files copied from midst-editor and held byte-identical to the pinned editor commit.
const HELPERS = [
  ['src/components/MidstPlayer/follow.ts', 'src/renderer/components/Replay/follow.ts'],
  ['src/components/MidstPlayer/helpers.ts', 'src/renderer/tracking/utils.ts'],
  ['src/buildLabel.ts', 'src/shared/buildLabel.ts'],
  // The editor's user guide, shown on /app#help (midst-editor #105) until Annelyse writes her own help.
  ['src/guide/editor-user-guide.md', 'docs/user-guide.md'],
]
// The editor's tests for those files, copied too. A copy may differ from its original in exactly two
// ways: the header note below, and the path it imports from. [copy, original, original's import, copy's import]
const TESTS = [
  ['src/__tests__/editor-follow.test.ts', 'src/__tests__/follow.test.ts', '../renderer/components/Replay/follow', '../components/MidstPlayer/follow'],
  ['src/__tests__/editor-followMore.test.ts', 'src/__tests__/followMore.test.ts', '../renderer/components/Replay/follow', '../components/MidstPlayer/follow'],
  ['src/__tests__/editor-trackingUtils.test.ts', 'src/__tests__/trackingUtils.test.ts', '../renderer/tracking/utils', '../components/MidstPlayer/helpers'],
  ['src/__tests__/editor-buildLabel.test.ts', 'src/__tests__/buildLabel.test.ts', '../shared/buildLabel', '../buildLabel'],
]

export const headerNote = upstream =>
  `// Copied from midst-editor ${upstream}, with only the import path changed.\n` +
  '// The file it tests is a byte-identical copy of the editor\'s, so the editor\'s test is the test for\n' +
  '// it. The editor-helpers-identical hook holds this copy to its original.\n'

// What the copy of an editor test must be, byte for byte.
export function expectedTestCopy(original, upstream, originalImport, copyImport) {
  const from = `from '${originalImport}'`
  if (original.split(from).length !== 2) throw new Error(`Expected exactly one "${from}" in editor ${upstream}`)
  const text = original.replace(from, `from '${copyImport}'`)
  // A @jest-environment docblock only counts at the top of the file, so the note goes after it.
  const firstLineEnd = text.indexOf('\n') + 1
  const at = text.startsWith('/** @jest-environment') ? firstLineEnd : 0
  return text.slice(0, at) + headerNote(upstream) + text.slice(at)
}

const SHA = /^[a-f0-9]{40}$/

export function readPin(webRoot) {
  const pin = readFileSync(join(webRoot, PIN_FILE), 'utf8').trim()
  if (!SHA.test(pin)) throw new Error(`${PIN_FILE} must hold one full editor commit SHA`)
  return pin
}

// Every editor file the website copies.
const UPSTREAMS = [...HELPERS, ...TESTS].map(([, upstream]) => upstream)

// Throws on a copy that differs from the pinned editor commit, a pin that is not on editor main, or a
// checkout that is not midst-editor. Returns the pin, editor main, and the copied editor files that have
// changed on main since the pin, or that main no longer has (the copies a copy PR is due for).
// git in the editor checkout. Git hooks export repository-local variables; -C alone does not escape the
// website's GIT_DIR, so they are removed.
export function editorGit(editorRoot) {
  const env = { ...process.env }
  const localVariables = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split('\n')
  for (const name of localVariables) delete env[name]
  return args => execFileSync('git', ['-C', editorRoot, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
}

const exists = (git, commit, path) => {
  try {
    git(['cat-file', '-e', `${commit}:${path}`])
    return true
  } catch {
    return false
  }
}

export function check(editorRoot, webRoot) {
  const git = editorGit(editorRoot)
  const origin = git(['remote', 'get-url', 'origin']).toString().trim()
  if (!/[/:](The_Kindled|midst-press)\/midst-editor(\.git)?$/.test(origin)) throw new Error('Provenance checkout must be midst-editor')
  const main = git(['rev-parse', 'refs/remotes/origin/main']).toString().trim()
  if (!SHA.test(main)) throw new Error('Invalid editor main SHA')
  const pin = readPin(webRoot)
  try {
    git(['cat-file', '-e', `${pin}^{commit}`])
  } catch {
    throw new Error(`The pinned editor commit ${pin} is not in ${editorRoot}: fetch midst-editor (with its history, not a shallow clone)`)
  }
  try {
    git(['merge-base', '--is-ancestor', pin, main])
  } catch {
    throw new Error(`The pinned editor commit ${pin} is not on editor main (${main}): pin a merged commit`)
  }
  const upstreamBytes = (commit, upstream) => {
    const bytes = git(['show', `${commit}:${upstream}`])
    if (!bytes.length) throw new Error(`Missing upstream source ${upstream} at ${commit}`)
    return bytes
  }
  for (const [local, upstream] of HELPERS) {
    if (!upstreamBytes(pin, upstream).equals(readFileSync(join(webRoot, local)))) throw new Error(`Copied editor helper differs: ${local} at ${pin}`)
  }
  for (const [local, upstream, originalImport, copyImport] of TESTS) {
    const expected = expectedTestCopy(upstreamBytes(pin, upstream).toString('utf8'), upstream, originalImport, copyImport)
    if (!Buffer.from(expected, 'utf8').equals(readFileSync(join(webRoot, local)))) {
      throw new Error(`Copied editor test differs from ${upstream} beyond its header note and import path: ${local} at ${pin}`)
    }
  }
  // A copied file that editor main has deleted or moved is behind too, never a failure: an editor merge
  // must not turn the website red (#152).
  const behind = UPSTREAMS.flatMap(upstream => {
    if (!exists(git, main, upstream)) return [`${upstream} (gone from editor main)`]
    return upstreamBytes(pin, upstream).equals(upstreamBytes(main, upstream)) ? [] : [upstream]
  })
  if (git(['rev-parse', 'refs/remotes/origin/main']).toString().trim() !== main) throw new Error('Editor main moved during comparison')
  return { pin, main, behind }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.env.MIDST_EDITOR_ROOT
  if (!root) throw new Error('Set MIDST_EDITOR_ROOT to a freshly fetched midst-editor checkout')
  const webRoot = fileURLToPath(new URL('..', import.meta.url))
  if (process.argv[2] === '--pin-to-main') {
    // For a copy PR, after copying the files: pin editor main, then check against it.
    const main = editorGit(root)(['rev-parse', 'refs/remotes/origin/main']).toString().trim()
    writeFileSync(join(webRoot, PIN_FILE), `${main}\n`)
  } else if (process.argv[2]) {
    throw new Error(`Unknown argument ${process.argv[2]}; the only one is --pin-to-main`)
  }
  const { pin, main, behind } = check(root, webRoot)
  console.log(`Editor helpers and their copied tests match the pinned editor commit ${pin}`)
  if (behind.length) {
    console.log(`WARNING: editor main (${main}) has changed ${behind.length} copied file(s) since the pin; a copy PR is due:`)
    for (const upstream of behind) console.log(`  ${upstream}`)
  }
}
