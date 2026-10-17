// A poem's publishDate in the one format the publisher API accepts: YYYY-MM-DD, or null (#158; Stuart, 16 Oct).
// The bundled metadata holds M/D/YYYY (54 of 55 files) and one null. Both seed tools write through this, so a
// re-seed cannot bring M/D/YYYY back. Strict: M/D/YYYY or YYYY-MM-DD with a real month and day, else it throws,
// naming the poem by id only (never its title or author).

const MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

// The Gregorian calendar by arithmetic, for every four-digit year. Date.UTC is not used: it maps years 0-99 to
// 1900-1999 (Alden, review of #169).
function real(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
  return d <= days
}

export function isoPublishDate(value, poemId) {
  if (value === null || value === undefined) return null
  // Only a string, matched as it is: no coercion and no trimming, so a wrong JSON type or stray whitespace is
  // refused rather than read into a known format (Alden, review of #169).
  if (typeof value !== 'string') throw new Error(`publishDate of poem ${poemId} is not a string`)
  let y, m, d
  const mdy = MDY.exec(value)
  const iso = ISO.exec(value)
  if (mdy) [m, d, y] = mdy.slice(1).map(Number)
  else if (iso) [y, m, d] = iso.slice(1).map(Number)
  else throw new Error(`publishDate of poem ${poemId} is neither M/D/YYYY nor YYYY-MM-DD`)
  if (!real(y, m, d)) throw new Error(`publishDate of poem ${poemId} is not a real date`)
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
