/*
 * Where the beta app's sign-in and back end are (docs/app-api.md, #110). Inlined by Parcel at build
 * time, like the other MIDST_* values in ../config.ts.
 *
 *   MIDST_APP_API_URL      the app's API (an API Gateway HTTP API in front of the Lambda)
 *   MIDST_APP_AUTH_DOMAIN  the Cognito managed login domain, e.g. https://<prefix>.auth.<region>.amazoncognito.com
 *   MIDST_APP_CLIENT_ID    the user pool's app client for this site
 *
 * None has a default: a site built without them (production, today) has no signed-in pages, and they
 * say so instead of sending a reader to a sign-in that does not exist.
 */
const trimmed = (value: string | undefined): string => (value ?? '').replace(/\/+$/, '')

export const APP_API_URL: string = trimmed(process.env.MIDST_APP_API_URL)
// The stack's AuthDomain output has no scheme; a domain without one would be a path on this site.
const withScheme = (value: string): string => (value && !/^https?:\/\//.test(value) ? `https://${value}` : value)
export const APP_AUTH_DOMAIN: string = withScheme(trimmed(process.env.MIDST_APP_AUTH_DOMAIN))
export const APP_CLIENT_ID: string = process.env.MIDST_APP_CLIENT_ID ?? ''

export const APP_AVAILABLE: boolean = Boolean(APP_API_URL && APP_AUTH_DOMAIN && APP_CLIENT_ID)
