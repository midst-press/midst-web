import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import guide from '../guide/readers-guide.json'
import { guideMarkdown } from '../guide/markdown'

// The reader's guide (issue #92) must not drift from the player it describes, and its two forms,
// the site's page and docs/readers-guide.md, must say the same words.

const root = join(__dirname, '../..')
const player = readFileSync(join(root, 'src/components/MidstPlayer/MidstPlayer.tsx'), 'utf8')

// Every accessible name the player gives a control: aria-label="X", 'aria-label': 'X',
// aria-label={cond ? 'A' : 'B'} and aria-label={`Jump to ${name}`} (the words before the ${). Also
// data-guide="X", which marks something a reader sees that has no accessible name of its own (the date
// under the timeline is hidden from screen readers, which hear it from the timeline instead).
function controlLabels(source: string): string[] {
  const labels = new Set<string>()
  const attribute = /(?:aria-label|data-guide)(?:'\s*:\s*|=)("[^"]*"|'[^']*'|\{[^}]*)/g
  for (let match = attribute.exec(source); match; match = attribute.exec(source)) {
    const literal = /"([^"]+)"|'([^']+)'|`([^`$]+)/g
    for (let part = literal.exec(match[1]); part; part = literal.exec(match[1])) {
      labels.add((part[1] || part[2] || part[3]).trim())
    }
  }
  return Array.from(labels)
}

describe('the control-label reader', () => {
  it('finds each form the player writes a label in', () => {
    const sample = `<input aria-label="Zq one" /> { 'aria-label': 'Zq two' }
      <button aria-label={on ? 'Zq three' : 'Zq four'} /> <button aria-label={\`Zq five \${name}\`} /> <div data-guide="zq-six" />`
    expect(controlLabels(sample).sort()).toEqual(['Zq five', 'Zq four', 'Zq one', 'Zq three', 'Zq two', 'zq-six'])
  })

  it('finds the labels the player has today', () => {
    expect(controlLabels(player)).toEqual(expect.arrayContaining(['Play', 'Pause', 'Timeline', 'Jump to', 'Poem replay']))
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
