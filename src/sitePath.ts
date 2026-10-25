/**
 * Whether `path` names a page on this site, and so is safe to hand to the router or a redirect (#340).
 *
 * A browser reads `//host` and `/\host` as another origin: the backslash is the bypass in GHSA-wrjc-x8rr-h8h6,
 * fixed in react-router only from 7.18. The URL parser also drops every tab, LF and CR, so `/\t/host` is `//host`.
 * So a site path starts with one `/`, and has no backslash, tab, LF or CR anywhere.
 */
export const isSitePath = (path: string): boolean =>
  path.startsWith('/') && !path.startsWith('//') && !/[\\\t\n\r]/.test(path)
