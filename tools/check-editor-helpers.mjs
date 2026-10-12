import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'

// Files copied from midst-editor and held byte-identical to editor main.
const HELPERS = [
  ['src/components/MidstPlayer/follow.ts', 'src/renderer/components/Replay/follow.ts'],
  ['src/components/MidstPlayer/helpers.ts', 'src/renderer/tracking/utils.ts'],
]
// The editor's tests for those files, copied too. A copy may differ from its original in exactly two
// ways: the header note below, and the path it imports from. [copy, original, original's import, copy's import]
const TESTS = [
  ['src/__tests__/editor-follow.test.ts', 'src/__tests__/follow.test.ts', '../renderer/components/Replay/follow', '../components/MidstPlayer/follow'],
  ['src/__tests__/editor-followMore.test.ts', 'src/__tests__/followMore.test.ts', '../renderer/components/Replay/follow', '../components/MidstPlayer/follow'],
  ['src/__tests__/editor-trackingUtils.test.ts', 'src/__tests__/trackingUtils.test.ts', '../renderer/tracking/utils', '../components/MidstPlayer/helpers'],
]

export const headerNote = upstream =>
  `// Copied from midst-editor ${upstream}, with only the import path changed.\n` +
  '// MidstPlayer/follow.ts and helpers.ts are byte-identical copies of the editor\'s files, so the editor\'s\n' +
  '// tests are the tests for them. The editor-helpers-identical hook holds this copy to its original.\n'

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

export function check(editorRoot, webRoot) {
  // Git hooks export repository-local variables; -C alone does not escape the website's GIT_DIR.
  const env = { ...process.env }
  const localVariables = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split('\n')
  for (const name of localVariables) delete env[name]
  const git = args => execFileSync('git', ['-C', editorRoot, ...args], { env })
  const origin = git(['remote', 'get-url', 'origin']).toString().trim()
  if (!/[/:](The_Kindled|midst-press)\/midst-editor(\.git)?$/.test(origin)) throw new Error('Provenance checkout must be midst-editor')
  const head = git(['rev-parse', 'refs/remotes/origin/main']).toString().trim()
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Invalid editor main SHA')
  const upstreamBytes = upstream => {
    const bytes = git(['show', `${head}:${upstream}`])
    if (!bytes.length) throw new Error('Missing upstream source')
    return bytes
  }
  for (const [local, upstream] of HELPERS) {
    if (!upstreamBytes(upstream).equals(readFileSync(join(webRoot, local)))) throw new Error(`Copied editor helper differs: ${local} at ${head}`)
  }
  for (const [local, upstream, originalImport, copyImport] of TESTS) {
    const expected = expectedTestCopy(upstreamBytes(upstream).toString('utf8'), upstream, originalImport, copyImport)
    if (!Buffer.from(expected, 'utf8').equals(readFileSync(join(webRoot, local)))) {
      throw new Error(`Copied editor test differs from ${upstream} beyond its header note and import path: ${local} at ${head}`)
    }
  }
  if (git(['rev-parse', 'refs/remotes/origin/main']).toString().trim() !== head) throw new Error('Editor main moved during comparison')
  return head
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.env.MIDST_EDITOR_ROOT
  if (!root) throw new Error('Set MIDST_EDITOR_ROOT to a freshly fetched midst-editor checkout')
  const head = check(root, fileURLToPath(new URL('..', import.meta.url)))
  console.log(`Editor helpers and their copied tests match editor main at ${head}`)
}
