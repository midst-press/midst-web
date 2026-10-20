/** @jest-environment jsdom */
import React, { useContext } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import LanguageSelector from '../components/LanguageSelector'
import { i18n, LANGUAGE_KEY } from '../i18n'
import { LocaleContext, useSiteLocale } from '../locale'

// The language selector and the in-place change it makes (midst-web #234). Only English is compiled, so a second
// catalog is stood in for here: 'zq', with the two words these tests read.
jest.mock('../i18n', () => {
  const actual = jest.requireActual('../i18n')
  const zq = { 'site.language': 'ZQ-LANGUAGE', 'player.timeline': 'ZQ-TIMELINE' }
  const catalogs = { ...actual.catalogs, zq }
  const activateLocale = (locale: string) => {
    const used = Object.keys(catalogs).includes(locale) ? locale : 'en'
    actual.i18n.loadAndActivate({ locale: used, messages: catalogs[used as keyof typeof catalogs] })
    return used
  }
  return {
    ...actual,
    catalogs,
    activateLocale,
    ensureLocale: () => actual.i18n.locale || activateLocale(actual.chosenLocale(actual.storedLanguage(), Object.keys(catalogs))),
    languageOrder: (preferred: readonly string[]) => actual.languageOrder(preferred, Object.keys(catalogs)),
  }
})

let container: HTMLDivElement
let root: Root

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  localStorage.clear()
  jest.requireMock('../i18n').activateLocale('en')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.requireMock('../i18n').activateLocale('en')
})

// A word read in render, as the player reads its words, in a sibling of the selector.
function Word() {
  useContext(LocaleContext)
  return <p className="word">{i18n._('player.timeline')}</p>
}

function Site() {
  const locale = useSiteLocale()
  return (
    <LocaleContext.Provider value={locale}>
      <Word />
      <LanguageSelector />
    </LocaleContext.Provider>
  )
}

const select = () => container.querySelector('select') as HTMLSelectElement
const word = () => container.querySelector('.word')?.textContent

const choose = (tag: string) =>
  act(() => {
    select().value = tag
    select().dispatchEvent(new Event('change', { bubbles: true }))
  })

it('lists English first, each language by its own name, with English chosen until the reader chooses', () => {
  act(() => root.render(<Site />))
  expect([...select().options].map(o => [o.value, o.lang])).toEqual([
    ['en', 'en'],
    ['zq', 'zq'],
  ])
  expect(select().options[0].textContent).toBe('English')
  expect(select().value).toBe('en')
  expect(container.querySelector('.language-selector-label')?.textContent).toBe('Language')
  expect(document.documentElement.lang).toBe('en')
})

it('choosing a language re-renders the words in place, keeps it in this browser, and sets the page language', () => {
  act(() => root.render(<Site />))
  choose('zq')
  expect(word()).toBe('ZQ-TIMELINE')
  expect(container.querySelector('.language-selector-label')?.textContent).toBe('ZQ-LANGUAGE')
  expect(select().value).toBe('zq')
  expect(localStorage.getItem(LANGUAGE_KEY)).toBe('zq')
  expect(document.documentElement.lang).toBe('zq')
  choose('en')
  expect(word()).toBe('Timeline')
  expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en')
})

it('starts in the language kept in this browser', () => {
  localStorage.setItem(LANGUAGE_KEY, 'zq')
  i18n.loadAndActivate({ locale: '', messages: {} })
  act(() => root.render(<Site />))
  expect(select().value).toBe('zq')
  expect(word()).toBe('ZQ-TIMELINE')
})

it('still changes the language when this browser refuses to keep it', () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError')
  })
  act(() => root.render(<Site />))
  choose('zq')
  expect(word()).toBe('ZQ-TIMELINE')
  jest.restoreAllMocks()
})
