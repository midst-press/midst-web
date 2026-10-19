import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// The site's words live in src/i18n/<language>/<surface>.json (issue #212). These tests are what someone
// editing those files hears from when something is wrong, so their messages are written for that reader. They
// read the files themselves and do not import src/i18n/index.ts: a file that is not valid JSON stops that import,
// and the bundler's message for it is not written for that reader.

const root = join(__dirname, '../..')
const i18n = join(root, 'src/i18n')
// The reader's guide has its own shape and its own test (readers-guide.test.ts); every other file is a surface.
const NOT_A_SURFACE = new Set(['readers-guide'])

type Entries = Record<string, { text?: unknown, note?: unknown }>

// Parse a catalog file, and on a mistake say where it is and what it probably is, in plain words.
function parseCatalog(path: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    const message = (error as Error).message
    const stated = /position (\d+)/.exec(message)?.[1]
    const position = stated != null ? Number(stated) : strayCharacter(text)
    const lineOf = (index: number) => text.slice(0, index).split('\n').length
    let before = position - 1
    while (before >= 0 && /\s/.test(text[before])) before -= 1
    const here = text[position]
    const previous = text[before]
    if (position >= text.trimEnd().length) {
      throw new Error(`${path}: the file ends too soon. A closing } may be missing at the end.`)
    }
    if (/["{[\d]/.test(here) && /["}\]\de]/.test(previous ?? '')) {
      throw new Error(`${path}, line ${lineOf(before)}: a comma is missing at the end of this line.`)
    }
    if (/[}\]]/.test(here) && previous === ',') {
      throw new Error(`${path}, line ${lineOf(before)}: there is a comma after the last item. Take it out.`)
    }
    if (/[A-Za-z']/.test(here ?? '')) {
      throw new Error(`${path}, line ${lineOf(position)}: words must be inside "double quotes".`)
    }
    throw new Error(`${path}, line ${lineOf(position)}: something here is not valid JSON.`)
  }
}

// Where JSON's error gives no position (an unexpected word, such as text without quotes around it): the first
// character outside a string that JSON has no use for.
function strayCharacter(text: string): number {
  let inString = false
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i += 1
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (/^(true|false|null)/.test(text.slice(i))) i += text.slice(i).match(/^\w+/)![0].length - 1
    else if (!/[\s{}[\]:,\d.eE+-]/.test(c)) return i
  }
  return text.length
}

const languages = readdirSync(i18n, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name)
const files = languages.flatMap(language => readdirSync(join(i18n, language))
  .filter(name => name.endsWith('.json'))
  .map(name => ({ language, surface: name.replace(/\.json$/, ''), path: `src/i18n/${language}/${name}` })))

describe('a broken catalog file', () => {
  const path = 'src/i18n/zq/player.json'
  const reason = (text: string) => {
    try {
      parseCatalog(path, text)
    } catch (error) {
      return (error as Error).message
    }
    return 'parsed'
  }

  it('names the line a comma is missing from', () => {
    expect(reason('{\n  "a": { "text": "x" }\n  "b": { "text": "y" }\n}\n'))
      .toBe('src/i18n/zq/player.json, line 2: a comma is missing at the end of this line.')
    expect(reason('{\n  "a": {\n    "text": "x"\n    "note": "y"\n  }\n}\n'))
      .toBe('src/i18n/zq/player.json, line 3: a comma is missing at the end of this line.')
  })

  it('names the line with a comma after the last item', () => {
    expect(reason('{\n  "a": { "text": "x" },\n}\n'))
      .toBe('src/i18n/zq/player.json, line 2: there is a comma after the last item. Take it out.')
  })

  it('says when the file ends too soon', () => {
    expect(reason('{\n  "a": { "text": "x" }\n')).toBe('src/i18n/zq/player.json: the file ends too soon. A closing } may be missing at the end.')
  })

  it('names the line with words outside quotes', () => {
    expect(reason('{\n  "a": { "text": zq }\n}\n')).toBe('src/i18n/zq/player.json, line 2: words must be inside "double quotes".')
    expect(reason("{\n  \"a\": { \"text\": 'zq' }\n}\n")).toBe('src/i18n/zq/player.json, line 2: words must be inside "double quotes".')
  })

  it('names the line of anything else', () => {
    expect(reason('{\n  "a": { "text": "x" }\n}\n}\n')).toBe('src/i18n/zq/player.json, line 4: something here is not valid JSON.')
  })
})

describe.each(files)('$path', ({ path }) => {
  it('is valid JSON holding one object', () => {
    const parsed = parseCatalog(path, readFileSync(join(root, path), 'utf8'))
    expect(typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)).toBe(true)
  })
})

describe.each(files.filter(file => !NOT_A_SURFACE.has(file.surface)))('the strings in $path', ({ path }) => {
  it('each have text and a note for whoever edits it, and nothing else', () => {
    const entries = parseCatalog(path, readFileSync(join(root, path), 'utf8')) as Entries
    const problems = Object.entries(entries).flatMap(([key, entry]) => {
      const keys = Object.keys(entry ?? {}).sort().join(',')
      if (keys !== 'note,text') return [`"${key}" should have exactly "text" and "note", and has: ${keys || 'nothing'}`]
      if (typeof entry.text !== 'string' || entry.text.trim() === '') return [`"${key}" has no text`]
      if (typeof entry.note !== 'string' || entry.note.trim() === '') return [`"${key}" has no note`]
      return []
    })
    expect(problems).toEqual([])
  })
})
