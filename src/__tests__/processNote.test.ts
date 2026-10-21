import { MAX_NOTE_CHARACTERS, applyMarkup, renderPoetNote, renderProcessNote } from '../processNote'

// The process note (#292): the Markdown buttons, and the one rendering the poem page, the review page and the preview share.

describe('applyMarkup', () => {
  it('wraps the selection in bold or italic markers and keeps the same words selected', () => {
    expect(applyMarkup('zq xv vb', 3, 5, 'bold')).toEqual({ text: 'zq **xv** vb', start: 5, end: 7 })
    expect(applyMarkup('zq xv vb', 3, 5, 'italic')).toEqual({ text: 'zq *xv* vb', start: 4, end: 6 })
  })

  it('with nothing selected, puts the markers at the caret with the caret between them', () => {
    expect(applyMarkup('zq', 2, 2, 'bold')).toEqual({ text: 'zq****', start: 4, end: 4 })
    expect(applyMarkup('zq', 0, 0, 'italic')).toEqual({ text: '**zq', start: 1, end: 1 })
  })

  it('makes a link of the selection with its address selected, so typing replaces it', () => {
    const edit = applyMarkup('see xv here', 4, 6, 'link')
    expect(edit.text).toBe('see [xv](https://) here')
    expect(edit.text.slice(edit.start, edit.end)).toBe('https://')
  })

  it('with nothing selected, a link leaves the caret inside the brackets', () => {
    expect(applyMarkup('zq ', 3, 3, 'link')).toEqual({ text: 'zq [](https://)', start: 4, end: 4 })
  })

  it('takes a backwards selection as the same range', () => {
    expect(applyMarkup('zq xv vb', 5, 3, 'bold')).toEqual(applyMarkup('zq xv vb', 3, 5, 'bold'))
  })

  it('matches the API limit', () => {
    expect(MAX_NOTE_CHARACTERS).toBe(20000)
  })
})

describe('renderProcessNote', () => {
  it('renders the buttons\' Markdown as paragraphs, emphasis and links', () => {
    expect(renderProcessNote('Zq **xv**\n\n*vb* [qz](https://example.invalid/)')).toBe(
      '<p>Zq <strong>xv</strong></p>\n<p><em>vb</em> <a href="https://example.invalid/">qz</a></p>\n')
  })

  it('removes script and handlers, and links with a scheme other than http, https or mailto', () => {
    const html = renderProcessNote('<script>x()</script><p onclick="x()">zq</p>\n\n[a](javascript:x())')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
  })
})

describe('renderPoetNote', () => {
  it('keeps what the form\'s buttons make', () => {
    expect(renderPoetNote('Zq **xv**\n\n*vb* [qz](https://example.invalid/)')).toBe(renderProcessNote('Zq **xv**\n\n*vb* [qz](https://example.invalid/)'))
  })

  it('drops img and iframe, which load another server\'s content for whoever reads the note (review of #314)', () => {
    const html = renderPoetNote('<img src="https://example.invalid/t.png"><iframe src="https://example.invalid/"></iframe>\n\n![zq](https://example.invalid/t.png)')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<iframe')
    // The archive's list still has both, for the poem page's existing notes.
    expect(renderProcessNote('<img src="https://example.invalid/t.png">')).toContain('<img')
  })

  it('keeps a link\'s address only, and no other scheme', () => {
    const html = renderPoetNote('<a href="https://example.invalid/" target="_blank" title="zq">xv</a>\n\n[vb](javascript:x())')
    expect(html).toContain('<a href="https://example.invalid/">xv</a>')
    expect(html).not.toContain('target')
    expect(html).not.toContain('javascript:')
  })
})
