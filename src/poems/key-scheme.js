// Which object names a poem's two files are asked for under. Issue #41.
//
//   legacy     the names the hand uploads produced, built from the author and title by poem-names.js,
//              with the NFC/NFD retry in asset-fetch.js. This is what production holds.
//   canonical  <id>/timelapse.midst.zip and <id>/process-note.md, where <id> is the poem's opaque id
//              (tools/poem-ids.mjs). One request, no alternatives, no folder override.
//
// The scheme is always passed in. Nothing here reads the environment, and nothing falls back from one
// scheme to the other: a site that quietly asked for legacy names would hide exactly the mismatch the
// canonical names exist to end. An unknown or missing scheme is an error.
//
// Routes are not storage. /poem/<...> is built by poemUrl in poem-names.js under both schemes.
//
// Shared by the site, tools/poem-canary.mjs and tools/make-e2e-fixtures.mjs, so the three cannot
// disagree about a name.

const names = require('./poem-names')
const { fetchAsset } = require('./asset-fetch')

const SCHEMES = ['legacy', 'canonical']

// A random version-4 UUID, lower case. The same shape tools/poem-ids.mjs checks.
const ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/**
 * @param {unknown} value what MIDST_KEY_SCHEME held
 * @returns {'legacy' | 'canonical'}
 */
function parseScheme(value) {
  if (SCHEMES.includes(value)) return value
  const got = value === undefined || value === '' ? 'it is not set' : `it is ${JSON.stringify(value)}`
  throw new Error(`MIDST_KEY_SCHEME must be "legacy" or "canonical"; ${got}. There is no default.`)
}

/**
 * The poem's two object names, relative to the poems base URL.
 * @param {{id?: string, author: string, title: string, authorSecondaryFolder?: string}} meta
 * @param {'legacy' | 'canonical'} scheme
 * @returns {{timelapse: string, processNote: string}}
 */
function objectNames(meta, scheme) {
  if (parseScheme(scheme) === 'legacy') {
    return { timelapse: names.timelapseObjectName(meta), processNote: names.processNoteObjectName(meta) }
  }
  // Says nothing about which poem: an error message can end up in a public log.
  if (typeof meta.id !== 'string' || !ID_SHAPE.test(meta.id)) {
    throw new Error('A poem without a well-formed id has no canonical object names.')
  }
  return { timelapse: `${meta.id}/timelapse.midst.zip`, processNote: `${meta.id}/process-note.md` }
}

/**
 * @param {string} base
 * @param {string} key one of objectNames()
 * @param {'legacy' | 'canonical'} scheme
 * @param {RequestInit} options
 * @param {typeof fetch} request
 * @returns {Promise<Response>}
 */
function fetchPoemAsset(base, key, scheme, options = {}, request = fetch) {
  if (parseScheme(scheme) === 'legacy') return fetchAsset(base, key, options, request)
  // A canonical key is ASCII and exists under one spelling, so whatever this answers is the answer.
  return request(base + key, options)
}

module.exports = { SCHEMES, ID_SHAPE, parseScheme, objectNames, fetchPoemAsset }
