import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { activateLocale, ensureLocale, storeLanguage } from './i18n'

// The language the site's words are in (midst-web #234). App holds it as state, so choosing a language re-renders
// the page in place; the selector chooses through `choose`, which also keeps the choice in this browser. Anything
// that sets a word outside React's render (the player's editor attributes) follows `locale` in an effect.
export interface SiteLocale {
  locale: string
  choose: (tag: string) => void
}

export const LocaleContext = createContext<SiteLocale>({ locale: 'en', choose: () => undefined })

export function useSiteLocale(): SiteLocale {
  const [locale, setLocale] = useState(() => ensureLocale())

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const choose = useCallback((tag: string) => {
    storeLanguage(tag)
    setLocale(activateLocale(tag))
  }, [])

  return useMemo(() => ({ locale, choose }), [locale, choose])
}
