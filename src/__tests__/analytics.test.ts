/** @jest-environment jsdom */
// midst-web #270: the GA4 tag loads only for a measurement id, and with Google signals and ad personalisation off.
import { startAnalytics } from '../analytics'

type TestWindow = Window & { dataLayer?: unknown[], gtag?: (...args: unknown[]) => void }

const tags = () => [...document.head.querySelectorAll('script')].map(script => script.src)
const entries = (win: TestWindow) => (win.dataLayer ?? []).map(entry => [...(entry as IArguments)])

let error: jest.SpyInstance

beforeEach(() => {
  document.head.innerHTML = ''
  const win = window as TestWindow
  delete win.dataLayer
  delete win.gtag
  error = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => error.mockRestore())

test('a measurement id loads gtag.js for it and configures it with no signals or ad personalisation', () => {
  const win = window as TestWindow
  expect(startAnalytics('G-ZQ12345', win)).toBe(true)
  expect(tags()).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-ZQ12345'])
  expect((document.head.querySelector('script') as HTMLScriptElement).async).toBe(true)
  const pushed = entries(win)
  expect(pushed.map(entry => entry[0])).toEqual(['js', 'config'])
  expect(pushed[0][1]).toBeInstanceOf(Date)
  expect(pushed[1]).toEqual(['config', 'G-ZQ12345', { allow_google_signals: false, allow_ad_personalization_signals: false }])
  // Google's snippet pushes the Arguments object itself, which is what gtag.js reads.
  expect(Object.prototype.toString.call(win.dataLayer![0])).toBe('[object Arguments]')
  expect(error).not.toHaveBeenCalled()
})

test('an empty id loads nothing and sends nothing', () => {
  const win = window as TestWindow
  expect(startAnalytics('', win)).toBe(false)
  expect(tags()).toEqual([])
  expect(win.dataLayer).toBeUndefined()
  expect(win.gtag).toBeUndefined()
  expect(error).not.toHaveBeenCalled()
})

test.each([
  ['a Universal Analytics id', 'UA-121629767-2'],
  ['lower case', 'g-zq12345'],
  ['a URL', 'G-ZQ1"><script src=//zq.invalid>'],
  ['the prefix alone', 'G-'],
])('%s is refused, logged, and loads nothing', (_name, id) => {
  const win = window as TestWindow
  expect(startAnalytics(id, win)).toBe(false)
  expect(tags()).toEqual([])
  expect(win.dataLayer).toBeUndefined()
  expect(error).toHaveBeenCalledWith(expect.stringContaining('is not a GA4 measurement id'))
})

test('an existing dataLayer is kept, not replaced', () => {
  const win = window as TestWindow
  const earlier = { event: 'zq' }
  win.dataLayer = [earlier]
  startAnalytics('G-ZQ12345', win)
  expect(win.dataLayer[0]).toBe(earlier)
  expect(win.dataLayer).toHaveLength(3)
})

describe('the build variable', () => {
  const saved = process.env.MIDST_GA_MEASUREMENT_ID
  afterEach(() => {
    if (saved === undefined) delete process.env.MIDST_GA_MEASUREMENT_ID
    else process.env.MIDST_GA_MEASUREMENT_ID = saved
    jest.resetModules()
  })

  const load = (value: string | undefined) => {
    if (value === undefined) delete process.env.MIDST_GA_MEASUREMENT_ID
    else process.env.MIDST_GA_MEASUREMENT_ID = value
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('../analytics') as typeof import('../analytics')).GA_MEASUREMENT_ID
  }

  test('is the id, trimmed, and empty when unset', () => {
    expect(load(' G-ZQ12345\n')).toBe('G-ZQ12345')
    expect(load(undefined)).toBe('')
    expect(load('')).toBe('')
  })
})
