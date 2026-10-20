/*
 * Google Analytics 4 (midst-web #270), replacing the Universal Analytics tag that Google stopped processing on
 * 1 July 2023.
 *
 *   MIDST_GA_MEASUREMENT_ID  the GA4 measurement id, G-..., from whoever holds the Analytics account
 *
 * Parcel inlines process.env.* at build time, so the id is chosen when the bundle is built. Empty or unset means no
 * tag: nothing is loaded from Google and nothing is sent. An id that is not a measurement id is refused the same way,
 * and logged, so a mistyped variable cannot load something else.
 *
 * Website visitors are logged as little as possible (midst-infra #132): Google signals and ad personalisation are
 * off, and no user id is set. GA4 does not log or store IP addresses.
 */

const ID = /^G-[A-Z0-9]+$/

export const GA_MEASUREMENT_ID: string = (process.env.MIDST_GA_MEASUREMENT_ID ?? '').trim()

type Gtag = (...args: unknown[]) => void
type AnalyticsWindow = Window & { dataLayer?: unknown[], gtag?: Gtag }

/**
 * Loads the GA4 tag for `id`, as Google's gtag.js snippet does, with Google signals and ad personalisation off.
 * Returns whether a tag was loaded.
 */
export function startAnalytics(id: string = GA_MEASUREMENT_ID, win: AnalyticsWindow = window): boolean {
  if (id === '') return false
  if (!ID.test(id)) {
    console.error('analytics: MIDST_GA_MEASUREMENT_ID is not a GA4 measurement id (G-...), so no tag is loaded')
    return false
  }
  const doc = win.document
  const script = doc.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  doc.head.appendChild(script)

  const dataLayer = (win.dataLayer = win.dataLayer ?? [])
  // gtag.js reads each entry as an Arguments object, as in Google's snippet; an array is not read the same way.
  win.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments)
  }
  win.gtag('js', new Date())
  win.gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false })
  return true
}
