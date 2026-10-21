import { SUBMIT_TEXT, renderContent } from '../content'

// Annelyse's texts from content/ (#281). Her words are hers to change, so these tests ask what her Markdown
// becomes, and only that her Submit text is there at all.

describe('content', () => {
  it('reads her Submit text from content/submit.md', () => {
    expect(SUBMIT_TEXT.trim().length).toBeGreaterThan(0)
    expect(renderContent(SUBMIT_TEXT)).toContain('<p>')
  })

  it('renders her Markdown: emphasis, links and paragraphs', () => {
    const html = renderContent('Midst is **closed**, *only* [the app](/app).\n\n[Sign up](#newsletter) or [mail](mailto:zq@example.invalid).')
    expect(html).toBe(
      '<p>Midst is <strong>closed</strong>, <em>only</em> <a href="/app">the app</a>.</p>\n' +
        '<p><a href="#newsletter">Sign up</a> or <a href="mailto:zq@example.invalid">mail</a>.</p>\n'
    )
  })

  it('keeps nothing that could load or run something from elsewhere', () => {
    const html = renderContent(
      '![x](https://zq.example.invalid/x.png)\n\n<iframe src="https://zq.example.invalid"></iframe>\n\n<script>zq()</script>\n\n' +
        '[x](javascript:zq()) <a href="/app" onclick="zq()" style="color:red">y</a>'
    )
    expect(html).not.toMatch(/<img|<iframe|<script|javascript:|onclick|style=/)
    expect(html).toContain('<a href="/app">y</a>')
  })
})
