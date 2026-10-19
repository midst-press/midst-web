import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import guide from '../guide/readers-guide.json'
import { activateLocale, catalogs, i18n } from '../i18n'
import { guideMarkdown } from '../guide/markdown'

// The reader's guide (issue #92) must not drift from the player it describes, and its two forms,
// the site's page and docs/readers-guide.md, must say the same words.

const root = join(__dirname, '../..')
const player = readFileSync(join(root, 'src/components/MidstPlayer/MidstPlayer.tsx'), 'utf8')

// The code inside an attribute: "X" or 'X', or the expression in {...} or after 'aria-label':, up to its end.
function attributeValues(source: string, names: string[]): string[] {
  const values: string[] = []
  const attribute = new RegExp(`(?:${names.join('|')})(?:'\\s*:\\s*|=)`, 'g')
  for (let match = attribute.exec(source); match; match = attribute.exec(source)) {
    let i = attribute.lastIndex
    const quote = source[i]
    if (quote === '"' || quote === "'") {
      values.push(source.slice(i, source.indexOf(quote, i + 1) + 1))
      continue
    }
    const braced = quote === '{'
    if (braced) i += 1
    let depth = 0
    let j = i
    for (; j < source.length; j += 1) {
      const c = source[j]
      if ('({['.includes(c)) depth += 1
      else if (')}]'.includes(c)) {
        if (depth === 0) break
        depth -= 1
      } else if (c === ',' && depth === 0 && !braced) break
    }
    values.push(source.slice(i, j))
  }
  return values
}

// i18n._('player.key', ...) in the code, and what it says in English, up to the first {value}.
const catalogCall = /\bi18n\._\(\s*'([\w.]+)'[^)]*\)/g
function catalogWords(id: string): string {
  if (!Object.prototype.hasOwnProperty.call(catalogs.en, id)) throw new Error(`no English text for i18n._('${id}')`)
  activateLocale('en')
  return i18n._(id).split('{')[0].trim()
}

// Words written straight into an attribute rather than taken from the catalog.
function literals(expression: string): string[] {
  const found: string[] = []
  const literal = /"([^"]*)"|'([^']*)'|`([^`]*)`/g
  const rest = expression.replace(catalogCall, '')
  for (let part = literal.exec(rest); part; part = literal.exec(rest)) {
    const words = (part[1] ?? part[2] ?? part[3].replace(/\$\{[^}]*\}/g, '')).trim()
    if (words) found.push(words)
  }
  return found
}

// Every accessible name the player gives a control, in the catalog's English: aria-label={i18n._('player.x')},
// either side of a ?:, and the words before a {value}. Also data-guide="X", which marks something a reader sees
// that has no accessible name of its own (the date under the timeline is hidden from screen readers, which hear
// it from the timeline instead).
function controlLabels(source: string): string[] {
  const labels = new Set<string>()
  for (const expression of attributeValues(source, ['aria-label'])) {
    for (const call of Array.from(expression.matchAll(catalogCall))) labels.add(catalogWords(call[1]))
  }
  for (const expression of attributeValues(source, ['data-guide'])) literals(expression).forEach(label => labels.add(label))
  return Array.from(labels)
}

describe('the control-label reader', () => {
  it('finds each form the player writes a label in', () => {
    const sample = `<input aria-label={i18n._('player.timeline')} /> { 'aria-label': i18n._('player.poemReplay') }
      <button aria-label={on ? i18n._('player.pause') : i18n._('player.play')} />
      <button aria-label={i18n._('player.jumpTo', { draft: name })} disabled /> <div data-guide="zq-six" />`
    expect(controlLabels(sample).sort()).toEqual(['Jump to', 'Pause', 'Play', 'Poem replay', 'Timeline', 'zq-six'])
  })

  it('finds the labels the player has today', () => {
    expect(controlLabels(player)).toEqual(expect.arrayContaining(['Play', 'Pause', 'Timeline', 'Jump to', 'Poem replay']))
  })

  it('finds words written into the player instead of its catalog', () => {
    const sample = `<b aria-label="Zq one" /> { 'aria-label': 'Zq two' } <b aria-label={on ? i18n._('player.play') : 'Zq three'} />
      <b aria-valuetext={\`\${n} zq four\`} /> <b title="Zq five" />`
    const found = attributeValues(sample, ['aria-label', 'aria-valuetext', 'title']).flatMap(literals)
    expect(found.sort()).toEqual(['Zq five', 'Zq one', 'Zq three', 'Zq two', 'zq four'])
  })

  it('finds none: every word the player says comes from its catalog', () => {
    expect(attributeValues(player, ['aria-label', 'aria-valuetext', 'title']).flatMap(literals)).toEqual([])
  })
})

describe("the reader's guide", () => {
  const documented = new Set(guide.sections.flatMap(section => section.labels))

  it('has a section for every control in the player', () => {
    const missing = controlLabels(player).filter(label => !documented.has(label))
    expect(missing).toEqual([])
  })

  it('has no section for a control the player does not have', () => {
    // The other direction: a control that is removed or renamed must take its words with it.
    const inPlayer = new Set(controlLabels(player))
    const gone = Array.from(documented).filter(label => !inPlayer.has(label))
    expect(gone).toEqual([])
  })

  it('names a control in bold exactly as the player labels it', () => {
    // Labels a sighted reader never sees (the poem area, the date under the timeline, the parts of the
    // speed slider) are tied to their section without being printed.
    const unprinted = new Set(['Poem replay', 'Jump to', 'frame-edit-time', 'Playback frame rate', 'Playback speed controls'])
    for (const section of guide.sections) {
      const text = section.paragraphs.join(' ').toLowerCase()
      for (const label of section.labels.filter(name => !unprinted.has(name))) {
        expect(text).toContain(`**${label.toLowerCase()}**`)
      }
    }
  })

  it('uses bold in pairs, so the page never shows a stray marker', () => {
    for (const text of [...guide.intro, ...guide.sections.flatMap(section => section.paragraphs)]) {
      expect(text.split('**').length % 2).toBe(1)
    }
  })

  it('is the same words in docs/readers-guide.md', () => {
    const path = join(root, 'docs/readers-guide.md')
    const expected = guideMarkdown(guide)
    if (process.env.UPDATE_GUIDE) writeFileSync(path, expected)
    expect(readFileSync(path, 'utf8')).toBe(expected)
  })
})
