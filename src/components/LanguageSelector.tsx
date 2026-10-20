import React, { ReactElement, useContext } from 'react'
import { i18n, languageName, languageOrder, readerLanguages } from '../i18n'
import { LocaleContext } from '../locale'

// The language selector (midst-web #234): English first, then the reader's own browser language when the site has
// it, then the rest, each by its own name. The choice stays in this browser (src/i18n.ts, storeLanguage).
export default function LanguageSelector(): ReactElement {
  const { locale, choose } = useContext(LocaleContext)
  return (
    <label className="language-selector">
      <span className="language-selector-label">{i18n._('site.language')}</span>
      <select value={locale} onChange={event => choose(event.target.value)}>
        {languageOrder(readerLanguages()).map(tag => (
          <option key={tag} value={tag} lang={tag}>
            {languageName(tag)}
          </option>
        ))}
      </select>
    </label>
  )
}
