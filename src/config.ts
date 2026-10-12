export const BASE_SITE_TITLE = 'Midst'
export const BASE_SITE_PAGE_TITLE = BASE_SITE_TITLE + ':'
export const POEM_ARROW_KEY: 'timeline' | 'slide' = 'timeline'

/*
 * Where runtime assets come from.
 *
 * These used to be three hardcoded CloudFront literals in store/actions.ts, components/ProcessNote.tsx
 * and components/Shapes.tsx. Having them in one place, overridable at build time, buys three things:
 * a beta deployment that can read test data without touching production objects, a local demo that
 * works against the archive, and one place to change if the bucket ever moves.
 *
 * Parcel inlines process.env.* at BUILD time, so these are chosen when the bundle is built, not in
 * the browser. Each defaults to production, so a build with no environment set behaves exactly as
 * before.
 *
 *   MIDST_POEMS_URL   the timelapses and process notes -- the irreplaceable data
 *   MIDST_MEDIA_URL   author photographs
 *   MIDST_SHAPES_URL  decorative shapes
 *   MIDST_FONTS_URL   the font files named in font-faces.json (see fonts.ts)
 *
 * POEMS is separate from MEDIA on purpose: pointing poems at a local archive while photographs still
 * come from production is the common case for a demo, and conflating them would force an all-or-
 * nothing switch.
 */
const PROD_AUTHORS = 'https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/'
const PROD_SHAPES = 'https://d3nlqr52a31o6y.cloudfront.net/midst-press/site/shapes/'

export const POEMS_URL: string = process.env.MIDST_POEMS_URL || PROD_AUTHORS
export const MEDIA_URL: string = process.env.MIDST_MEDIA_URL || PROD_AUTHORS
export const SHAPES_URL: string = process.env.MIDST_SHAPES_URL || PROD_SHAPES

/* Fonts are served by the site itself, from fonts/ at its own origin, so the default is a path and
 * not a CloudFront literal: whoever deploys the site uploads the fonts beside it (#55). It is not
 * part of USING_NON_PRODUCTION_ASSETS, which is about whose DATA a build shows. */
export const FONTS_URL: string = process.env.MIDST_FONTS_URL || '/fonts/'

/* True when any asset origin has been redirected away from production. Shown in the UI so nobody
 * mistakes a demo build for the live site -- the failure this prevents is someone reporting a bug
 * against data that is not what production holds. */
export const USING_NON_PRODUCTION_ASSETS: boolean =
  POEMS_URL !== PROD_AUTHORS || MEDIA_URL !== PROD_AUTHORS || SHAPES_URL !== PROD_SHAPES
