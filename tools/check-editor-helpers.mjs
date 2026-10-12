import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const root = process.env.MIDST_EDITOR_ROOT
if (!root) throw new Error('Set MIDST_EDITOR_ROOT to a freshly fetched midst-editor checkout')
// Git hooks export repository-local variables; -C alone does not escape the website's GIT_DIR.
const env = { ...process.env }
const localVariables = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split('\n')
for (const name of localVariables) delete env[name]
const git = args => execFileSync('git', ['-C', root, ...args], { env })
const origin = git(['remote', 'get-url', 'origin']).toString().trim()
if (!/[/:](The_Kindled|midst-press)\/midst-editor(\.git)?$/.test(origin)) throw new Error('Provenance checkout must be midst-editor')
const head = git(['rev-parse', 'refs/remotes/origin/main']).toString().trim()
if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Invalid editor main SHA')
for (const [local, upstream] of [
  ['follow.ts', 'src/renderer/components/Replay/follow.ts'],
  ['helpers.ts', 'src/renderer/tracking/utils.ts'],
]) {
  const expected = git(['show', `${head}:${upstream}`])
  if (!expected.length) throw new Error('Missing upstream source')
  const actual = readFileSync(new URL(`../src/components/MidstPlayer/${local}`, import.meta.url))
  if (!expected.equals(actual)) throw new Error(`Copied editor helper differs: ${local} at ${head}`)
}
if (git(['rev-parse', 'refs/remotes/origin/main']).toString().trim() !== head) throw new Error('Editor main moved during comparison')
console.log(`Editor helpers byte-identical at ${head}`)
