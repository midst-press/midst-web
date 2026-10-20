/** @jest-environment jsdom */
import { LANGUAGE_KEY, storedLanguage, storeLanguage } from '../i18n'

// The reader's language choice is kept in this browser only (midst-web #234).
describe('the stored choice', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    localStorage.clear()
  })

  it('is kept in this browser under its key, and read back', () => {
    expect(storedLanguage()).toBeUndefined()
    expect(storeLanguage('fr')).toBe(true)
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('fr')
    expect(storedLanguage()).toBe('fr')
  })

  it('is never in the URL or a cookie', () => {
    const before = window.location.href
    storeLanguage('fr')
    expect(window.location.href).toBe(before)
    expect(document.cookie).toBe('')
  })

  it('is none, not an error, when storage refuses to be read or written', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(storedLanguage()).toBeUndefined()
    expect(storeLanguage('fr')).toBe(false)
  })
})
