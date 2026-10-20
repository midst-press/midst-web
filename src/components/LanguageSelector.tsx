import React, { ReactElement, useContext } from 'react'
import { i18n, languageName, languageOrder, readerLanguages, SOURCE_LOCALE } from '../i18n'
import { LocaleContext } from '../locale'
import UsFlag from './UsFlag'

// The languages, at the top of every page with nothing to open first (Stuart, 20 Oct, midst-web #234): English first,
// then the reader's own browser language when the site has it, then the rest, each by its own name, and the one in
// use pressed. The choice stays in this browser (src/i18n.ts, storeLanguage).
export default function LanguageSelector(): ReactElement {
  const { locale, choose } = useContext(LocaleContext)
  return (
    <div className="language-selector" role="group" aria-label={i18n._('site.language')}>
      {languageOrder(readerLanguages()).map(tag => (
        <button key={tag} type="button" lang={tag} aria-pressed={tag === locale} onClick={() => choose(tag)}>
          {tag === SOURCE_LOCALE ? <UsFlag /> : null}
          {languageName(tag)}
        </button>
      ))}
    </div>
  )
}
