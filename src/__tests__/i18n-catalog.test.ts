import { readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import { CATALOGS, DEFAULT_LANGUAGE, fill, translate, t } from '../i18n'

// The site's words live in src/i18n/<language>/<surface>.json (issue #212); i18n-files.test.ts checks the files
// themselves. These check that the code and the catalogs agree, and how t() fills and falls back.

const root = join(__dirname, '../..')
const i18n = join(root, 'src/i18n')
// The reader's guide has its own shape and its own test (readers-guide.test.ts); every other file is a surface.
const NOT_A_SURFACE = new Set(['readers-guide'])

type Entries = Record<string, { text?: unknown, note?: unknown }>

// The {values} and **bold** markers in a string, which a translation must keep.
function markers(text: string): string[] {
  const placeholders = Array.from(text.matchAll(/\{(\w+)\}/g), match => `{${match[1]}}`)
  const bold = Array.from(text.matchAll(/\*\*/g), () => '**')
  return [...placeholders, ...bold].sort()
}

// What is wrong with a translation, set against English: keys English does not have, and values or bold
// dropped or added.
function mismatches(language: string, english: Record<string, Entries>, other: Record<string, Entries>): string[] {
  const problems: string[] = []
  for (const [surface, entries] of Object.entries(other)) {
    for (const [key, entry] of Object.entries(entries)) {
      const original = english[surface]?.[key]
      if (!original) {
        problems.push(`${language}/${surface}.json has "${key}", which English does not have.`)
        continue
      }
      const want = markers(String(original.text))
      const got = markers(String(entry.text))
      if (want.join(' ') !== got.join(' ')) {
        problems.push(`${language}/${surface}.json "${key}" has ${got.join(' ') || 'no markers'}; English has ${want.join(' ') || 'none'}.`)
      }
    }
  }
  return problems
}

// Every t('surface', 'key') in the site's code, and any t( call whose surface or key is not written out.
function catalogCalls(): { used: Set<string>, unreadable: string[] } {
  const used = new Set<string>()
  const unreadable: string[] = []
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(item =>
    item.isDirectory() ? (item.name === '__tests__' ? [] : walk(join(dir, item.name)))
      : /\.tsx?$/.test(item.name) ? [join(dir, item.name)] : [])
  for (const file of walk(join(root, 'src'))) {
    const source = readFileSync(file, 'utf8')
    if (!/import \{[^}]*\bt\b[^}]*\} from '[./]*i18n'/.test(source)) continue
    const calls = Array.from(source.matchAll(/\bt\(\s*'(\w+)'\s*,\s*'(\w+)'/g))
    calls.forEach(call => used.add(`${call[1]}.${call[2]}`))
    const all = source.match(/(?<![.\w])t\(/g)?.length ?? 0
    if (all !== calls.length) unreadable.push(`${relative(root, file)}: ${all - calls.length} t() call(s)`)
  }
  return { used, unreadable }
}

const languages = readdirSync(i18n, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name)
const files = languages.flatMap(language => readdirSync(join(i18n, language))
  .filter(name => name.endsWith('.json'))
  .map(name => ({ language, surface: name.replace(/\.json$/, ''), path: `src/i18n/${language}/${name}` })))

describe.each(files.filter(file => !NOT_A_SURFACE.has(file.surface)))('$path', ({ language, surface, path }) => {
  it('is what the site reads (src/i18n/index.ts lists this file)', () => {
    const entries = JSON.parse(readFileSync(join(root, path), 'utf8'))
    expect((CATALOGS[language] as Record<string, unknown> | undefined)?.[surface]).toEqual(entries)
  })
})

describe('the words the site asks for', () => {
  const { used, unreadable } = catalogCalls()
  const english = CATALOGS[DEFAULT_LANGUAGE] as Record<string, Entries>
  const defined = Object.entries(english).flatMap(([surface, entries]) => Object.keys(entries).map(key => `${surface}.${key}`))

  it('are each asked for by surface and key written out, so this test can see them', () => {
    expect(unreadable).toEqual([])
    expect(used.size).toBeGreaterThan(0)
  })

  it('all have English text', () => {
    expect(Array.from(used).filter(key => !defined.includes(key))).toEqual([])
  })

  it('include every English string, so none is left behind when the code stops using it', () => {
    expect(defined.filter(key => !used.has(key))).toEqual([])
  })
})

describe('a translation', () => {
  const english = { player: { play: { text: 'Play' }, jumpTo: { text: 'Jump to {draft}' }, tip: { text: 'Press **Play**' } } }

  it('may leave strings out, and keep every {value} and **bold** in the ones it has', () => {
    expect(mismatches('zq', english, { player: { jumpTo: { text: 'Zq {draft}' }, tip: { text: 'Zq **zq**' } } })).toEqual([])
  })

  it('is caught dropping a {value}, renaming one, or losing bold', () => {
    expect(mismatches('zq', english, { player: { jumpTo: { text: 'Zq' }, tip: { text: 'Zq zq' } } })).toEqual([
      'zq/player.json "jumpTo" has no markers; English has {draft}.',
      'zq/player.json "tip" has no markers; English has ** **.',
    ])
    expect(mismatches('zq', english, { player: { jumpTo: { text: 'Zq {name}' } } }))
      .toEqual(['zq/player.json "jumpTo" has {name}; English has {draft}.'])
  })

  it('is caught with a string English does not have', () => {
    expect(mismatches('zq', english, { player: { zq: { text: 'Zq' } } })).toEqual(['zq/player.json has "zq", which English does not have.'])
  })

  it('in every language the site has matches English', () => {
    const english = CATALOGS[DEFAULT_LANGUAGE] as Record<string, Entries>
    expect(Object.keys(CATALOGS).filter(language => language !== DEFAULT_LANGUAGE)
      .flatMap(language => mismatches(language, english, CATALOGS[language] as Record<string, Entries>))).toEqual([])
  })

  it('is every language folder, and every one the site lists has a folder', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual(languages.filter(language =>
      files.some(file => file.language === language && !NOT_A_SURFACE.has(file.surface))).sort())
  })
})

describe('t()', () => {
  it('gives the English text, with its {values} filled in', () => {
    expect(t('player', 'play')).toBe('Play')
    expect(t('player', 'jumpTo', { draft: 'Zq' })).toBe('Jump to Zq')
    expect(fill('{fps} fps', { fps: 16.7 })).toBe('16.7 fps')
  })

  it('leaves a {value} it was not given visible, and says so, rather than showing a blank', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(t('player', 'jumpTo')).toBe('Jump to {draft}')
      expect(error).toHaveBeenCalledWith('i18n: no value for {draft} in "Jump to {draft}"')
    } finally {
      error.mockRestore()
    }
  })

  it('falls back to English for a language without a file, or a string a language leaves out', () => {
    expect(translate('zq', 'player', 'play')).toBe('Play')
    CATALOGS.zq = { player: { pause: { text: 'Zq', note: '' } } }
    try {
      expect(translate('zq', 'player', 'pause')).toBe('Zq')
      expect(translate('zq', 'player', 'play')).toBe('Play')
    } finally {
      delete CATALOGS.zq
    }
  })
})
