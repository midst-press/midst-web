#!/usr/bin/env node
// Lingui stays on 5 until both apps move to 6 together (midst-infra #110: 6 is ESM-only). Stuart, 19 Oct: every
// @lingui package is written ">=5.9.5 <6" in package.json, explicitly, and nothing may bump it to 6 until the
// move-to-6 issue is done. This fails when either a range or a locked version would let 6 in.
//
//   node tools/check-lingui-pin.mjs [--root <dir>]
//
// Exit: 0 held; 1 a range or a locked version is not held below 6; 2 an unreadable package.json or lockfile.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './is-main.mjs'

export const RANGE = '>=5.9.5 <6'

/** What is wrong with the Lingui pin, as sentences; empty when it holds. */
export function pinProblems(pkg, lock) {
  const problems = []
  const declared = { ...pkg.dependencies, ...pkg.devDependencies }
  const names = Object.keys(declared).filter(name => name.startsWith('@lingui/')).sort()
  if (names.length === 0) problems.push('package.json declares no @lingui package.')
  for (const name of names) {
    if (declared[name] !== RANGE) problems.push(`package.json has ${name} at "${declared[name]}"; it must be "${RANGE}".`)
  }
  const locked = Object.entries(lock.packages ?? {}).filter(([path]) => /(^|\/)node_modules\/@lingui\/[^/]+$/.test(path))
  if (names.length > 0 && locked.length === 0) problems.push('package-lock.json locks no @lingui package.')
  for (const [path, entry] of locked.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const major = Number(String(entry.version).split('.')[0])
    if (!(major < 6)) problems.push(`package-lock.json locks ${path.replace(/^.*node_modules\//, '')} at ${entry.version}; it must stay below 6.`)
  }
  return problems
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.error(`check-lingui-pin: cannot read ${path}: ${error.message}`)
    process.exit(2)
  }
  return undefined
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2)
  let root = join(dirname(fileURLToPath(import.meta.url)), '..')
  if (args.length > 0) {
    if (args[0] !== '--root' || args.length !== 2 || !args[1]) {
      console.error('usage: node tools/check-lingui-pin.mjs [--root <dir>]')
      process.exit(2)
    }
    root = args[1]
  }
  const problems = pinProblems(readJson(join(root, 'package.json')), readJson(join(root, 'package-lock.json')))
  for (const problem of problems) console.log(`check-lingui-pin: ${problem}`)
  if (problems.length > 0) process.exit(1)
  console.log(`Lingui is held below 6 (${RANGE}).`)
}
