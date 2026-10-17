// A poem's publishDate in the one format the publisher API accepts: YYYY-MM-DD, or null (#158; Stuart, 16 Oct).
// The bundled metadata holds M/D/YYYY (54 of 55 files) and one null. Both seed tools write through this, so a
// re-seed cannot bring M/D/YYYY back. Strict: M/D/YYYY or YYYY-MM-DD with a real month and day, else it throws,
// naming the poem by id only (never its title or author).

const MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

function real(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

export function isoPublishDate(value, poemId) {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  let y, m, d
  const mdy = MDY.exec(s)
  const iso = ISO.exec(s)
  if (mdy) [m, d, y] = mdy.slice(1).map(Number)
  else if (iso) [y, m, d] = iso.slice(1).map(Number)
  else throw new Error(`publishDate of poem ${poemId} is neither M/D/YYYY nor YYYY-MM-DD`)
  if (!real(y, m, d)) throw new Error(`publishDate of poem ${poemId} is not a real date`)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
