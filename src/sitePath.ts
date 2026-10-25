/**
 * Whether `path` names a page on this site, and so is safe to hand to the router or a redirect (#340).
 *
 * A browser reads `//host` and `/\host` as another origin: the backslash is the bypass in GHSA-wrjc-x8rr-h8h6,
 * fixed in react-router only from 7.18. So a site path starts with one `/`, and has no backslash anywhere.
 */
export const isSitePath = (path: string): boolean =>
  path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
