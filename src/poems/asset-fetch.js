// Bucket keys are immutable compatibility inputs: try the original spelling before alternatives.
// The site and HEAD-only canary share this policy, rather than changing identifiers or routes.
function assetUrls(base, key) {
  return Array.from(new Set([key, key.normalize('NFC'), key.normalize('NFD')]))
    .map(candidate => base + encodeURI(candidate))
}

/**
 * @param {string} base
 * @param {string} key
 * @param {RequestInit} options
 * @param {typeof fetch} request
 * @returns {Promise<Response>}
 */
async function fetchAsset(base, key, options = {}, request = fetch) {
  const urls = assetUrls(base, key)
  let response = await request(urls[0], options)
  for (const url of urls.slice(1)) {
    // S3 hides missing keys behind 403; local/public servers commonly use 404.
    // Other HTTP failures and network errors are not evidence of a spelling mismatch.
    if (response.ok || (response.status !== 403 && response.status !== 404)) break
    response = await request(url, options)
  }
  return response
}

module.exports = { assetUrls, fetchAsset }
