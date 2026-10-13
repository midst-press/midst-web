/** @jest-environment jsdom */
import { FONT_FACES, FONT_STYLE_ID, fontFaceCss, installFonts } from '../fonts'

describe('font faces', () => {
  it('writes one rule per face, every source under the base URL', () => {
    const css = fontFaceCss('https://zq.example/fonts/')
    expect(css.match(/@font-face/g)).toHaveLength(FONT_FACES.length)
    const urls = css.match(/url\('[^']*'\)/g) || []
    expect(urls).toHaveLength(FONT_FACES.reduce((n, face) => n + face.sources.length, 0))
    for (const url of urls) {
      expect(url.startsWith("url('https://zq.example/fonts/")).toBe(true)
    }
  })

  it('adds the missing slash to a base without one', () => {
    expect(fontFaceCss('/zq')).toContain("url('/zq/futuraregular.ttf') format('truetype')")
  })

  it('keeps each family, weight and style, and the source order', () => {
    const css = fontFaceCss('/f/', [
      { family: 'Zq', weight: 'bold', style: 'italic', sources: [{ file: 'a b.woff2', format: 'woff2' }, { file: 'a.eot', format: 'embedded-opentype' }] },
    ])
    expect(css).toBe(
      "@font-face { font-family: 'Zq'; src: url('/f/a%20b.woff2') format('woff2'), url('/f/a.eot?#iefix') format('embedded-opentype'); font-weight: bold; font-style: italic; }",
    )
  })

  it('declares the families the stylesheets and the player ask for', () => {
    const families = new Set(FONT_FACES.map(face => face.family))
    for (const family of ['futuraregular', 'futuralight', 'Lato', 'HelveticaNeueLTStd-BdCn']) {
      expect(families.has(family)).toBe(true)
    }
    expect(FONT_FACES.filter(face => face.family === 'Lato').map(face => `${face.weight} ${face.style}`).sort()).toEqual(
      ['bold italic', 'bold normal', 'normal italic', 'normal normal'],
    )
  })

  it('names no file twice with different case, and only font file names', () => {
    const files = FONT_FACES.flatMap(face => face.sources.map(source => source.file))
    expect(new Set(files.map(file => file.toLowerCase())).size).toBe(new Set(files).size)
    for (const file of files) {
      expect(file).toMatch(/^[A-Za-z0-9_-]+\.(ttf|woff2?|eot)$/)
    }
  })
})

describe('installFonts', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('puts the rules in the head once, however often it is called', () => {
    installFonts(document, '/zq/')
    installFonts(document, '/other/')
    const styles = document.head.querySelectorAll(`#${FONT_STYLE_ID}`)
    expect(styles).toHaveLength(1)
    expect(styles[0].textContent).toBe(fontFaceCss('/zq/'))
  })

  it('uses the configured base when none is given', () => {
    installFonts()
    expect(document.getElementById(FONT_STYLE_ID)!.textContent).toBe(fontFaceCss('/fonts/'))
  })
})
