#!/usr/bin/env node
// Finds words written straight into the site's pages and components, which belong in the message catalog
// (midst-infra docs/design/message-catalog.md, section 7). midst-web has no ESLint, so this reads the code with
// the TypeScript compiler, as midst-editor's tools/check-main-strings.mjs does for its main process.
//
//   node tools/check-site-strings.mjs [--root <dir>] [--report-only] [files...]
//
// A finding is words a reader sees or hears, written out:
//   - JSX text (anything between tags but space);
//   - the attributes aria-label, aria-valuetext, aria-description, title, alt and placeholder, as a string, a
//     template, or an array, conditional, concatenation or fallback holding one.
// A catalog call is not a finding, and neither is anything computed elsewhere. Report only for now: each PR that
// moves a surface into the catalog makes it enforcing there (design section 7, the ratchet).
//
// Scans src/**/*.tsx except tests, or the files given. Prints file:line and what kind of words, never the words.
// Exit: 0 none (or --report-only); 1 findings; 2 usage or an unreadable file.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './is-main.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

export const WORD_ATTRIBUTES = new Set(['aria-label', 'aria-valuetext', 'aria-description', 'title', 'alt', 'placeholder'])

function usage(message) {
  console.error(`check-site-strings: ${message}`)
  console.error('usage: node tools/check-site-strings.mjs [--root <dir>] [--report-only] [files...]')
  process.exit(2)
}

function parseArgs(argv) {
  const opts = { root: join(dirname(fileURLToPath(import.meta.url)), '..'), reportOnly: false, files: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--report-only') opts.reportOnly = true
    else if (arg === '--root') {
      if (i + 1 >= argv.length) usage('--root needs a directory')
      i += 1
      opts.root = argv[i]
    } else if (arg.startsWith('--')) usage(`unknown argument ${arg}`)
    else opts.files.push(arg)
  }
  return opts
}

function siteSources(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__') out.push(...siteSources(full))
    } else if (name.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

/** Whether `node` is words written out, rather than a call or a reference. */
export function isWrittenWords(node) {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return isWrittenWords(node.expression)
  // A template made only of substitutions (`${a}`) holds no words of its own.
  if (ts.isTemplateExpression(node)) {
    return [node.head, ...node.templateSpans.map(span => span.literal)].some(part => part.text.trim() !== '')
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text.trim() !== ''
  if (ts.isArrayLiteralExpression(node)) return node.elements.some(isWrittenWords)
  if (ts.isConditionalExpression(node)) return isWrittenWords(node.whenTrue) || isWrittenWords(node.whenFalse)
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind
    if (op === ts.SyntaxKind.PlusToken) return isWrittenWords(node.left) || isWrittenWords(node.right)
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.AmpersandAmpersandToken) {
      return isWrittenWords(node.right)
    }
  }
  return false
}

/** The findings in one file's source, as { line, kind }. */
export function findings(fileName, text) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []
  const at = node => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
  const visit = node => {
    if (ts.isJsxText(node) && node.text.trim() !== '') found.push({ line: at(node), kind: 'text' })
    if (ts.isJsxAttribute(node) && WORD_ATTRIBUTES.has(node.name.getText(source)) && node.initializer) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer
      if (value && isWrittenWords(value)) found.push({ line: at(node), kind: node.name.getText(source) })
    }
    // A JSX expression child, {'words'} or {cond ? 'a' : 'b'}, is text too.
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent) && isWrittenWords(node.expression)) {
      found.push({ line: at(node), kind: 'text' })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const files = opts.files.length ? opts.files.map(f => join(opts.root, f)) : siteSources(join(opts.root, 'src'))
  let total = 0
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      console.error(`check-site-strings: cannot read ${file}: ${error.message}`)
      process.exit(2)
    }
    for (const { line, kind } of findings(file, text)) {
      console.log(`${relative(opts.root, file)}:${line}: ${kind} is written out; it belongs in the catalog.`)
      total += 1
    }
  }
  console.log(`Site words outside the catalog: ${total}${total && opts.reportOnly ? ' (report only, not failing)' : ''}`)
  if (total && !opts.reportOnly) process.exitCode = 1
}

if (isMain(import.meta.url)) main()
