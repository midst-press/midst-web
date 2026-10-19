// The site's words, kept out of the code so they can be edited without touching it, one folder per language:
// src/i18n/<language>/. English is the default, and a language without a file falls back to it.
import { Guide } from '../guide/markdown'
import enReadersGuide from './en/readers-guide.json'

export const DEFAULT_LANGUAGE = 'en'

// Every language that has a reader's guide. Add a language by adding its folder and a line here.
export const READERS_GUIDES: Record<string, Guide> = {
  en: enReadersGuide,
}

export function readersGuide(language: string = DEFAULT_LANGUAGE): Guide {
  return READERS_GUIDES[language] ?? READERS_GUIDES[DEFAULT_LANGUAGE]
}
