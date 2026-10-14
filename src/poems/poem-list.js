// Where the site's list of poems comes from. Issue #110.
//
//   bundled    the list built into the site (src/poems/index.ts), asked for under MIDST_KEY_SCHEME. Today's
//              behaviour.
//   published  poems/published.json, fetched once when the site starts. Its order is the reading order, and
//              each entry RECORDS the two object keys the poem is fetched under; the site derives no name.
//
// Like the key scheme, the choice has no default: a site that guessed would show a list its bucket may not
// hold, or hide the poems that are there. And there is no fallback from one to the other. A published list
// that cannot be fetched, or is not well formed, is an error the reader is told about.
//
// A message here can end up in a public log, so none of them says which poem or quotes the list.

const LISTS = ['bundled', 'published']

// Keys in the list are written from the bucket root; the site's POEMS_URL already ends in /poems/.
const KEY_ROOT = 'poems/'

/**
 * @param {unknown} value what MIDST_POEM_LIST held
 * @returns {'bundled' | 'published'}
 */
function parsePoemList(value) {
  if (LISTS.includes(value)) return value
  const got = value === undefined || value === '' ? 'it is not set' : `it is ${JSON.stringify(value)}`
  throw new Error(`MIDST_POEM_LIST must be "bundled" or "published"; ${got}. There is no default.`)
}

const isText = value => typeof value === 'string' && value.length > 0

// "poems/<something>", with nothing that climbs out of it.
function isKey(value) {
  return isText(value)
    && value.startsWith(KEY_ROOT)
    && value.length > KEY_ROOT.length
    && !value.split('/').some(part => part === '..' || part === '.')
}

const malformed = () => new Error('The published poem list is not well formed.')

/**
 * Check a parsed published.json as a whole: one bad entry refuses the list, because a list with a hole in it
 * is not the list the publisher meant.
 * @param {unknown} json
 * @returns {Array<{poemId: string, title: string, author: string, keys: {timelapse: string, processNote: string | null},
 *   publishDate: string | null, highlighted: boolean, date: string | null}>}
 */
function parsePublishedList(json) {
  if (!json || typeof json !== 'object' || json.version !== 1 || !Array.isArray(json.poems)) throw malformed()
  const seen = new Set()
  return json.poems.map(entry => {
    if (!entry || typeof entry !== 'object') throw malformed()
    const { poemId, title, author, timelapse, processNote, publishDate, highlighted, date } = entry
    if (!isText(poemId) || !isText(title) || !isText(author) || !isKey(timelapse) || seen.has(poemId)) throw malformed()
    if (processNote !== null && processNote !== undefined && !isKey(processNote)) throw malformed()
    seen.add(poemId)
    return {
      poemId,
      title,
      author,
      keys: {
        timelapse: timelapse.slice(KEY_ROOT.length),
        processNote: isKey(processNote) ? processNote.slice(KEY_ROOT.length) : null,
      },
      publishDate: isText(publishDate) ? publishDate : null,
      highlighted: highlighted === true,
      date: isText(date) ? date : null,
    }
  })
}

/**
 * A recorded key is fetched as it is written: one request, no alternative spellings.
 * @param {string} base POEMS_URL
 * @param {string} key a keys value from parsePublishedList
 * @param {RequestInit} options
 * @param {typeof fetch} request
 * @returns {Promise<Response>}
 */
function fetchRecordedKey(base, key, options = {}, request = fetch) {
  return request(base + key, options)
}

module.exports = { LISTS, KEY_ROOT, parsePoemList, parsePublishedList, fetchRecordedKey }
