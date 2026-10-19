// The site's words, kept out of the code so they can be edited without touching it, one folder per language:
// src/i18n/<language>/. English is the default, and a language without a file falls back to it.
import { Guide } from '../guide/markdown'
import enReadersGuide from './en/readers-guide.json'
import enPlayer from './en/player.json'

export const DEFAULT_LANGUAGE = 'en'

// Every language that has a reader's guide. Add a language by adding its folder and a line here.
export const READERS_GUIDES: Record<string, Guide> = {
  en: enReadersGuide,
}

export function readersGuide(language: string = DEFAULT_LANGUAGE): Guide {
  return READERS_GUIDES[language] ?? READERS_GUIDES[DEFAULT_LANGUAGE]
}

// One string and a note for whoever edits it: where it shows, what triggers it, any length limit.
export interface Entry {
  text: string
  note: string
}

const ENGLISH = {
  player: enPlayer,
}

export type Surface = keyof typeof ENGLISH
export type Key<S extends Surface> = keyof (typeof ENGLISH)[S] & string
export type Values = Record<string, string | number>
export type Catalog = { [S in Surface]?: { [K in Key<S>]?: Entry } }

// Every language's surfaces. English must have every key; another language may leave one out, and English
// is shown in its place. Add a language by adding its folder and a line here.
export const CATALOGS: Record<string, Catalog> = {
  en: ENGLISH,
}

// {name} in a string is filled from values. One left unfilled stays visible, so it is noticed, never blank.
export function fill(text: string, values: Values = {}): string {
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    if (name in values) return String(values[name])
    console.error(`i18n: no value for ${placeholder} in "${text}"`)
    return placeholder
  })
}

export function translate<S extends Surface>(language: string, surface: S, key: Key<S>, values?: Values): string {
  const entry = (CATALOGS[language]?.[surface] as Record<string, Entry> | undefined)?.[key]
    ?? (ENGLISH[surface] as Record<string, Entry>)[key]
  return fill(entry.text, values)
}

// Until a second language exists there is nothing to choose, so the site's words are English.
export function t<S extends Surface>(surface: S, key: Key<S>, values?: Values): string {
  return translate(DEFAULT_LANGUAGE, surface, key, values)
}
