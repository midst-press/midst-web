// How a poem's S3 object names are derived from its metadata. THE ONE DEFINITION.
//
// This logic used to live inline in src/store/reducer.ts, and was transcribed a second time into
// tools/poem-canary.mjs so the canary could build the URLs the site builds. Two copies of a
// derivation that decides whether a poem can be fetched is one copy too many: if they drift, the
// canary reports every poem healthy while the site asks for names that do not exist.
//
// Plain CommonJS on purpose, so both consumers can use it without a build step:
//   - the bundled app imports it (tsconfig has allowJs, so types come from the JSDoc below)
//   - tools/*.mjs import it directly under Node, with no install and no credentials
//
// ---------------------------------------------------------------------------------------------
// WARNING. THE OBJECTS IN THE BUCKET ARE THE FIXED POINT, NOT THIS CODE.
//
// Every name here was used to upload a real object. Changing a rule changes the URL the site asks
// for, and the poem goes 403 the moment it is deployed. Two consequences:
//
//   1. The behaviour below is preserved EXACTLY as it shipped, including a defect (see poemUrl).
//      It is characterised by tools/test-poem-names.mjs, which pins the output for every title in
//      the archive that contains a character these rules touch. Change a rule and that test tells
//      you precisely which URLs move.
//   2. Fixing a rule is a DATA migration, not a code change: the objects have to be renamed, or
//      the client has to fall back to the old name. See the unreachable-poems issue.
// ---------------------------------------------------------------------------------------------

/**
 * The author's folder-and-URL identifier.
 * @param {string} author
 * @returns {string}
 */
function authorId(author) {
  return author.toLowerCase().replace(/ /g, '-')
}

/**
 * The title's URL segment.
 *
 * ⚠️ CARRIES A LIVE DEFECT, DELIBERATELY. `/` is stripped GLOBALLY on the fourth line, before
 * `</i>` is removed on the sixth. So a closing italic tag has already become `<i>` by then, and
 * the `<i>` replace above it is first-occurrence-only and has already been spent on the opening
 * tag. A stray `<i>` survives into the URL.
 *
 * Madeleine Mori's poem is the one title in the archive with italics, and it is unreachable in
 * production for exactly this reason — the site asks for `...westworld%3Ci%3E...`. Reproduced
 * rather than corrected, because correcting it here silently changes the URL without renaming the
 * object, which turns one broken poem into a broken poem that is harder to explain.
 *
 * @param {string} title
 * @returns {string}
 */
function poemUrl(title) {
  return title
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/,/g, '')
    .replace(/\//g, '')
    .replace('<i>', '')
    .replace('</i>', '')
    .replace('-:)', '')
    .replace('{::', '')
    .replace('::}', '')
    .replace('{', '')
    .replace('}', '')
    .replace('(', '')
    .replace(')', '')
    .replace('#', '')
    .replace(/-$/, '')
    .replace(/--/g, '-')
    .replace(/"/g, '')
}

/**
 * The poem's identifier, as used in the object name and in client-side routes.
 * @param {string} author
 * @param {string} title
 * @returns {string}
 */
function poemId(author, title) {
  return authorId(author) + '--' + poemUrl(title)
}

/**
 * The bucket folder. Some poets have an explicit override in their metadata; the rest derive it.
 * @param {{author: string, authorSecondaryFolder?: string}} meta
 * @returns {string}
 */
function poemFolder(meta) {
  return meta.authorSecondaryFolder || authorId(meta.author)
}

/**
 * Object name of the timelapse, relative to the assets base URL. Not URL-encoded: encode at the
 * point of use, so callers that need the raw key (an S3 listing, a rename) get the raw key.
 * @param {{author: string, title: string, authorSecondaryFolder?: string}} meta
 * @returns {string}
 */
function timelapseObjectName(meta) {
  return poemFolder(meta) + '/' + poemId(meta.author, meta.title) + '.midst.zip'
}

/**
 * Object name of the process note. Keyed on the AUTHOR, not the poem, so a poet with two poems has
 * one note. (Whether that is intended is a question for the editor, not an assumption to encode
 * further — it is simply what is deployed.)
 * @param {{author: string, authorSecondaryFolder?: string}} meta
 * @returns {string}
 */
function processNoteObjectName(meta) {
  return poemFolder(meta) + '/' + authorId(meta.author) + '.md'
}

module.exports = {
  authorId,
  poemUrl,
  poemId,
  poemFolder,
  timelapseObjectName,
  processNoteObjectName,
}
