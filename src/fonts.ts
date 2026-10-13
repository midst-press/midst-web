import faces from './font-faces.json'
import { FONTS_URL } from './config'

/*
 * The site's @font-face rules, written at runtime.
 *
 * The font files are not in this repository (#55: some are commercial, and a public repository is
 * not a webfont licence). They are served from FONTS_URL. CSS cannot read a build-time variable, so
 * the rules that used to sit in index.css, lato.css and helvetica-neue.css are built here from
 * font-faces.json and put in the document head. installFonts() runs when the bundle is evaluated,
 * before React renders anything, so the rules are in place before the first poem paints.
 *
 * font-faces.json is also read by tools/make-e2e-fixtures.mjs, which writes a synthetic font under
 * every file name listed, so the end-to-end tests load real faces without any real font.
 */
export interface FontFaceSpec {
  family: string
  weight: string
  style: string
  sources: { file: string; format: string }[]
}

export const FONT_FACES: FontFaceSpec[] = faces
export const FONT_STYLE_ID = 'midst-font-faces'

export function fontFaceCss(base: string, specs: FontFaceSpec[] = FONT_FACES): string {
  const root = base.endsWith('/') ? base : base + '/'
  return specs
    .map(spec => {
      const src = spec.sources
        // "?#iefix" is how the embedded-opentype source was always written; kept so the rule is the same.
        .map(s => `url('${root}${encodeURIComponent(s.file)}${s.format === 'embedded-opentype' ? '?#iefix' : ''}') format('${s.format}')`)
        .join(', ')
      return `@font-face { font-family: '${spec.family}'; src: ${src}; font-weight: ${spec.weight}; font-style: ${spec.style}; }`
    })
    .join('\n')
}

/* Idempotent: the site entry and the player both call it, and a second call must not add a second copy. */
export function installFonts(target?: Document, base: string = FONTS_URL): void {
  // Unit tests import the player under Node, where there is no document to write to.
  const doc = target || (typeof document === 'undefined' ? undefined : document)
  if (!doc || doc.getElementById(FONT_STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = FONT_STYLE_ID
  style.textContent = fontFaceCss(base)
  doc.head.appendChild(style)
}
