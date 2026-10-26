import { MAX_NOTE_CHARACTERS, applyMarkup, renderProcessNote } from '../processNote'

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

describe('embedded video (#292; Annelyse, 26 Oct, GitHub #81)', () => {
  it.each([
    'https://www.youtube.com/embed/zq',
    'https://youtube.com/embed/zq',
    'https://www.youtube-nocookie.com/embed/zq',
    'https://player.vimeo.com/video/1',
  ])('keeps an embedded player from %s', src => {
    expect(renderProcessNote(`<iframe src="${src}" allowfullscreen></iframe>`)).toContain(`<iframe src="${src}"`)
  })

  it.each([
    ['https://zq.example.invalid/sign-in', 'another host'],
    ['http://www.youtube.com/embed/zq', 'YouTube over plain http'],
    ['https://www.youtube.com.zq.example.invalid/embed', 'a host that only starts like YouTube'],
    ['https://vimeo.com/1', "Vimeo's page, not its player"],
  ])('shows any other iframe as a link to its address: %s (%s)', src => {
    const html = renderProcessNote(`<iframe src="${src}"></iframe>`)
    expect(html).not.toContain('<iframe')
    expect(html).toContain(`<a href="${src}">${src}</a>`)
  })

  it('drops an iframe with no web address, and never links a script', () => {
    for (const src of ['javascript:x()', 'data:text/html,x', '']) {
      const html = renderProcessNote(`<iframe src="${src}"></iframe>`)
      expect(html).not.toContain('<iframe')
      expect(html).not.toContain('<a')
    }
  })

  it("keeps a poet's line breaks and images now that every note is rendered the same way", () => {
    expect(renderProcessNote('zq<br>xv')).toContain('<br>')
    expect(renderProcessNote('![zq](https://example.invalid/t.png)')).toContain('<img')
  })
})
