import { i18n, Messages } from '@lingui/core'
import { messages as en } from '../locales/en/messages'

// The site's message catalog (midst-infra docs/design/message-catalog.md). The site reads its words from here,
// by id. Nothing calls this until the words move into the catalog (design section 9, PR 5).
//
// The catalogs are compiled from locales/<lang>/messages.po by `npm run catalog:compile`. A language added to
// lingui.config.js is added here too; the catalog check fails until it is.

export const SOURCE_LOCALE = 'en'

/** Every compiled catalog, by BCP 47 tag. English is complete; another language may be partial, and a key it
 *  lacks was compiled to the English. */
export const catalogs: Readonly<Record<string, Messages>> = { en }

/** True when `tag` is one of `available`, exactly. A list of tags, so 'toString' and the like are never taken for a
 *  catalog. */
const hasCatalog = (tag: string, available: readonly string[]): boolean => available.includes(tag)

/**
 * The language the site shows: the one the reader chose from the language selector, kept in this browser, while it
 * still has a catalog. Otherwise English, whatever the browser's language (Stuart, 20 Oct, midst-web #234: the site
 * starts in English until the reader chooses).
 */
export function chosenLocale(stored: unknown, available: readonly string[] = Object.keys(catalogs)): string {
  return typeof stored === 'string' && hasCatalog(stored, available) ? stored : SOURCE_LOCALE
}

/**
 * The reader's own language among the catalogs: the first of `preferred`, the browser's languages in order of
 * preference (`navigator.languages`, never a guess from location or IP), that has one. A tag matches exactly, ignoring
 * case, or by its language alone (`fr-CA` matches `fr`). None matching gives undefined.
 */
export function readerLocale(preferred: readonly string[], available: readonly string[] = Object.keys(catalogs)): string | undefined {
  const byLower = new Map(available.map(tag => [tag.toLowerCase(), tag]))
  const match = (tag: string) => {
    const lower = tag.toLowerCase()
    return byLower.get(lower) ?? byLower.get(lower.split('-')[0])
  }
  const found = preferred.find(tag => match(tag) !== undefined)
  return found === undefined ? undefined : match(found)
}

/** The selector's order: English first, then the reader's own language when it is another catalog, then the rest by
 *  tag. */
export function languageOrder(preferred: readonly string[], available: readonly string[] = Object.keys(catalogs)): string[] {
  const own = readerLocale(preferred, available)
  const first = own === undefined || own === SOURCE_LOCALE ? [SOURCE_LOCALE] : [SOURCE_LOCALE, own]
  return [...first, ...available.filter(tag => !first.includes(tag)).sort()]
}

/** A language's name in that language ("Deutsch" for de), or the tag when the browser has no name for it. */
export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

// The reader's choice is kept in this browser only: never in the URL, a cookie or anything the server sees, so it
// appears in no log and no shared link (Stuart, 20 Oct, midst-web #234). Storage can be refused (a private window,
// blocked site data); then nothing is kept and the site is in English on the next visit.
export const LANGUAGE_KEY = 'midst.language'

/** The language the reader chose here, or undefined when none was, or storage cannot be read. */
export function storedLanguage(): string | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage.getItem(LANGUAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/** Keep the reader's choice in this browser. False when storage refused it. */
export function storeLanguage(tag: string): boolean {
  try {
    localStorage.setItem(LANGUAGE_KEY, tag)
    return true
  } catch {
    return false
  }
}

/** Load and activate `locale`'s catalog, English for a locale with none. Returns the locale used. */
export function activateLocale(locale: string): string {
  const used = hasCatalog(locale, Object.keys(catalogs)) ? locale : SOURCE_LOCALE
  i18n.loadAndActivate({ locale: used, messages: catalogs[used] })
  return used
}

/** The reader's languages, in order of preference: the browser's, or none where there is no browser. */
export function readerLanguages(): readonly string[] {
  return typeof navigator === 'undefined' ? [] : navigator.languages ?? []
}

/** Activate the language the reader chose here (else English) unless a language is already active, and return the
 *  active one. Lingui throws on a lookup with no language active, so whatever reads the catalog calls this first,
 *  wherever it is mounted. */
export function ensureLocale(): string {
  return i18n.locale || activateLocale(chosenLocale(storedLanguage()))
}

export { i18n }
