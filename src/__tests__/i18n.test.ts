import { i18n, activateLocale, catalogs, ensureLocale, pickLocale, readerLanguages, SOURCE_LOCALE } from '../i18n'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const linguiConfig = require('../../lingui.config')

// src/i18n.ts, the site's catalog loader (midst-infra docs/design/message-catalog.md). The same cases as
// midst-editor's src/__tests__/i18n.test.ts, which tests the same functions there.

describe('pickLocale', () => {
  const available = ['en', 'fr', 'pt-BR']

  it('takes the first preference the catalog has', () => {
    expect(pickLocale(['de', 'fr', 'en'], available)).toBe('fr')
  })

  it('matches a regional tag by its language', () => {
    expect(pickLocale(['fr-CA'], available)).toBe('fr')
  })

  it('prefers an exact regional match, ignoring case', () => {
    expect(pickLocale(['PT-br'], available)).toBe('pt-BR')
  })

  it('falls back to English when nothing matches, or there are no preferences', () => {
    expect(pickLocale(['de', 'ja'], available)).toBe('en')
    expect(pickLocale([], available)).toBe('en')
  })

  it('reads the compiled catalogs by default', () => {
    expect(pickLocale(['en-NZ'])).toBe('en')
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
  it("activates the reader's language when none is active", () => {
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
