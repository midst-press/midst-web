import { renderProcessNote } from '../processNote'
import { renderContent } from '../content'

// marked ends a block with a newline; what is kept is the question here.
const note = (md: string) => renderProcessNote(md).trim()
const content = (md: string) => renderContent(md).trim()

// What marked 18 and DOMPurify keep, as insane kept it (#340).
const LINK = '<a href="https://zq.example.invalid/" target="_blank" title="t" name="n" aria-label="l" rel="r" onclick="x()">zq</a>'

describe('attributes, per tag', () => {
  it('a published note keeps a link its address, target, title, name and label, and nothing else', () => {
    expect(note(LINK)).toBe('<p><a href="https://zq.example.invalid/" target="_blank" title="t" name="n" aria-label="l">zq</a></p>')
  })

  it("Annelyse's text keeps only a link's address", () => {
    expect(content(LINK)).toBe('<p><a href="https://zq.example.invalid/">zq</a></p>')
  })

  it('an attribute allowed on one tag is not allowed on another', () => {
    expect(note('<p title="t" class="c" id="i" style="s" data-x="1" aria-label="l">zq</p>')).toBe('<p>zq</p>')
  })

  it("an image keeps its source, alt and title; an iframe its source, allowfullscreen and frameborder", () => {
    expect(note('<img src="https://zq.example.invalid/t.png" alt="a" title="t" onerror="x()" width="1">'))
      .toBe('<img src="https://zq.example.invalid/t.png" alt="a" title="t">')
    expect(note('<iframe src="https://player.vimeo.com/video/1" allowfullscreen frameborder="0" srcdoc="x"></iframe>'))
      .toBe('<iframe src="https://player.vimeo.com/video/1" allowfullscreen="" frameborder="0"></iframe>')
  })

  it("rendering one list first does not change what another keeps (insane's defaults were shared, and changed)", () => {
    content(LINK)
    expect(note(LINK)).toContain('target="_blank" title="t"')
  })
})

describe('addresses', () => {
  it.each(['/zq', '#zq', '?zq', 'mailto:zq@example.invalid', 'http://zq.example.invalid/', 'https://zq.example.invalid/'])(
    'keeps %s', href => {
      expect(content(`[zq](${href})`)).toBe(`<p><a href="${href}">zq</a></p>`)
    })

  it.each(['javascript:x()', 'data:text/html,x', 'vbscript:x', 'ftp://zq.example.invalid/'])('refuses %s', href => {
    expect(content(`[zq](${href})`)).toBe('<p><a>zq</a></p>')
  })

  it('refuses javascript: however it is spelled', () => {
    expect(note('<a href="JaVaScRiPt:x()">zq</a>')).toBe('<p><a>zq</a></p>')
    expect(note('<a href=" javascript:x()">zq</a>')).toBe('<p><a>zq</a></p>')
  })

  it('refuses a data: or javascript: source on an image or iframe', () => {
    expect(note('<img src="data:image/png;base64,AA">')).toBe('<img>')
    // An iframe with no web address is dropped, not kept empty (#292).
    expect(note('<iframe src="javascript:x()"></iframe>')).toBe('')
  })
})

describe('tags that are not allowed', () => {
  it.each([
    ['<span>zq</span> xv', '<p> xv</p>'],
    ['<div>zq</div>', ''],
    ['<form><p>zq</p></form>', ''],
    ['<style>p{}</style>zq', 'zq'],
    ['<script>x()</script>zq', 'zq'],
    ['<svg><a href="https://zq.example.invalid/">zq</a></svg>', '<p></p>'],
    ['<math>zq</math>', '<p></p>'],
    ['<!-- zq -->xv', 'xv'],
  ])('%j goes, with what is inside it', (markdown, html) => {
    expect(note(markdown)).toBe(html)
  })
})
