// The one stored form of a date in midst: YYYY-MM-DD (Stuart, 16 Oct; midst-infra #81, "closest to DICOM").
// Input and display can take any form Annelyse chooses. What is stored or sent is this, and nothing else.
//
// Shared by the site (poem-list.js refuses any other form in the published list) and the tools
// (tools/publish-date.mjs converts the bundled metadata's old M/D/YYYY), so there is one calendar, not two.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

// The Gregorian calendar by arithmetic, for every four-digit year. Date.UTC is not used: it maps years 0-99 to
// 1900-1999 (Alden, review of midst-web #169).
function isRealDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
  return d <= days
}

/**
 * @param {unknown} value
 * @returns {boolean} true only for a string that is exactly YYYY-MM-DD and a real date
 */
function isCanonicalDate(value) {
  if (typeof value !== 'string') return false
  const m = ISO.exec(value)
  return m !== null && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

/**
 * @param {number} y
 * @param {number} m
 * @param {number} d
 * @returns {string} YYYY-MM-DD, zero-padded
 */
function formatDate(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

module.exports = { isCanonicalDate, isRealDate, formatDate }
