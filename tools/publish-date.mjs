// A poem's stored date in the one canonical form, YYYY-MM-DD, or null (midst-infra #81, midst-web #158; Stuart,
// 16 Oct). It applies to both date fields the list carries, publishDate and date. The bundled metadata held
// M/D/YYYY until #81 converted it. Both seed tools still write through this, so a re-seed can't bring M/D/YYYY
// back. Strict: M/D/YYYY or YYYY-MM-DD with a real month and day, else it throws, naming the field and the poem
// by id only (never its title or author). The calendar lives in src/poems/canonical-date.js, shared with the site.

import canonical from '../src/poems/canonical-date.js'

const { isRealDate, formatDate } = canonical

const MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export function canonicalDate(value, field, poemId) {
  if (value === null || value === undefined) return null
  // Only a string, matched as it is: no coercion and no trimming, so a wrong JSON type or stray whitespace is
  // refused rather than read into a known format (Alden, review of #169).
  if (typeof value !== 'string') throw new Error(`${field} of poem ${poemId} is not a string`)
  let y, m, d
  const mdy = MDY.exec(value)
  const iso = ISO.exec(value)
  if (mdy) [m, d, y] = mdy.slice(1).map(Number)
  else if (iso) [y, m, d] = iso.slice(1).map(Number)
  else throw new Error(`${field} of poem ${poemId} is neither M/D/YYYY nor YYYY-MM-DD`)
  if (!isRealDate(y, m, d)) throw new Error(`${field} of poem ${poemId} is not a real date`)
  return formatDate(y, m, d)
}

export function isoPublishDate(value, poemId) {
  return canonicalDate(value, 'publishDate', poemId)
}
