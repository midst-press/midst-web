import {
  i18n,
  activateLocale,
  catalogs,
  chosenLocale,
  ensureLocale,
  languageName,
  languageOrder,
  readerLanguages,
  readerLocale,
  SOURCE_LOCALE,
} from '../i18n'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const linguiConfig = require('../../lingui.config')

// src/i18n.ts, the site's catalog loader (midst-infra docs/design/message-catalog.md). The same cases as
// midst-editor's src/__tests__/i18n.test.ts, which tests the same functions there.

describe('chosenLocale', () => {
  const available = ['en', 'fr', 'pt-BR']

  it('is English until the reader chooses, whatever the browser language', () => {
    expect(chosenLocale(undefined, available)).toBe('en')
  })

  it('is the stored choice while it has a catalog', () => {
    expect(chosenLocale('fr', available)).toBe('fr')
    expect(chosenLocale('pt-BR', available)).toBe('pt-BR')
  })

  it('is English for a stored choice with no catalog, or not a tag at all', () => {
    for (const stored of ['de', 'FR', 'toString', '', 3, null]) expect(chosenLocale(stored, available)).toBe('en')
  })

  it('reads the compiled catalogs by default', () => {
    expect(chosenLocale('en')).toBe('en')
    expect(chosenLocale('xx')).toBe('en')
  })
})

describe('readerLocale', () => {
  const available = ['en', 'fr', 'pt-BR']

  it('takes the first preference the catalog has', () => {
    expect(readerLocale(['de', 'fr', 'en'], available)).toBe('fr')
  })

  it('matches a regional tag by its language', () => {
    expect(readerLocale(['fr-CA'], available)).toBe('fr')
  })

  it('prefers an exact regional match, ignoring case', () => {
    expect(readerLocale(['PT-br'], available)).toBe('pt-BR')
  })

  it('is undefined when nothing matches, or there are no preferences', () => {
    expect(readerLocale(['de', 'ja'], available)).toBeUndefined()
    expect(readerLocale([], available)).toBeUndefined()
  })
})

describe('languageOrder', () => {
  const available = ['pt-BR', 'en', 'fr', 'de']

  it("puts English first, then the reader's own language, then the rest by tag", () => {
    expect(languageOrder(['fr-CA', 'en'], available)).toEqual(['en', 'fr', 'de', 'pt-BR'])
  })

  it("puts English first once when English is the reader's own language", () => {
    expect(languageOrder(['en-NZ', 'fr'], available)).toEqual(['en', 'de', 'fr', 'pt-BR'])
  })

  it('is English then the rest when no preference has a catalog', () => {
    expect(languageOrder(['ja'], available)).toEqual(['en', 'de', 'fr', 'pt-BR'])
  })

  it('is only English with only the English catalog', () => {
    expect(languageOrder(['fr', 'en'])).toEqual(['en'])
  })
})

describe('languageName', () => {
  it('names a language in that language', () => {
    expect(languageName('en')).toBe('English')
    expect(languageName('de')).toBe('Deutsch')
  })

  it('is the tag when it cannot name it', () => {
    expect(languageName('not a tag')).toBe('not a tag')
  })
})

describe('activateLocale', () => {
  it('activates a catalog the site has', () => {
    expect(activateLocale('en')).toBe('en')
    expect(i18n.locale).toBe('en')
  })

  it('uses English for a locale with no catalog, including an Object.prototype name', () => {
    expect(activateLocale('xx')).toBe('en')
    expect(activateLocale('toString')).toBe('en')
    expect(i18n.locale).toBe('en')
  })
})

describe('catalogs', () => {
  it('has exactly the locales lingui.config.js lists, with English as the source', () => {
    expect(Object.keys(catalogs).sort()).toEqual([...linguiConfig.locales].sort())
    expect(linguiConfig.sourceLocale).toBe(SOURCE_LOCALE)
  })
})

describe('readerLanguages', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else delete (globalThis as { navigator?: unknown }).navigator
  })
  const browser = (value: unknown) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true })

  it("is the browser's languages, in its order", () => {
    browser({ languages: ['fr-CA', 'en'] })
    expect(readerLanguages()).toEqual(['fr-CA', 'en'])
  })

  it('is none where there is no browser, or it lists no languages', () => {
    browser(undefined)
    expect(readerLanguages()).toEqual([])
    browser({})
    expect(readerLanguages()).toEqual([])
  })
})

describe('ensureLocale', () => {
  it('activates English when none is active and nothing is stored', () => {
    jest.isolateModules(() => {
      // A fresh @lingui/core, so no language is active yet.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fresh = require('../i18n') as typeof import('../i18n')
      expect(fresh.i18n.locale).toBeFalsy()
      expect(fresh.ensureLocale()).toBe('en')
      expect(fresh.i18n.locale).toBe('en')
      expect(fresh.i18n._('player.timeline')).toBe('Timeline')
    })
  })

  it('leaves a language that is already active', () => {
    i18n.loadAndActivate({ locale: 'zq', messages: {} })
    expect(ensureLocale()).toBe('zq')
    expect(i18n.locale).toBe('zq')
    activateLocale('en')
  })
})
