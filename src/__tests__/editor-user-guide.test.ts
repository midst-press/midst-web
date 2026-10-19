import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { editorGuideHtml } from '../guide/editorGuideHtml'
import generated from '../guide/editor-user-guide.generated'

// /app#help shows the editor's user guide (midst-editor #105). The HTML it shows must be made from the
// guide in src/guide, the website's own file since midst-web #194.

const guideDir = join(__dirname, '../guide')
const markdown = readFileSync(join(guideDir, 'editor-user-guide.md'), 'utf8')

const moduleFor = (html: string): string =>
  '// Made from src/guide/editor-user-guide.md by src/guide/editorGuideHtml.ts. Do not edit by hand:\n' +
  '// run UPDATE_GUIDE=1 npx jest src/__tests__/editor-user-guide.test.ts\n' +
  `const html = ${JSON.stringify(html)}\n\nexport default html\n`

describe("the editor's user guide on /app", () => {
  it('is the HTML made from the copy of the guide', () => {
    const path = join(guideDir, 'editor-user-guide.generated.ts')
    const expected = moduleFor(editorGuideHtml(markdown))
    if (process.env.UPDATE_GUIDE) writeFileSync(path, expected)
    expect(readFileSync(path, 'utf8')).toBe(expected)
  })

  it('has the guide’s headings, its shortcut table and its bold names', () => {
    expect(generated).toContain('<h1>Writing in Midst</h1>')
    expect(generated).toContain('<h2>Keyboard shortcuts</h2>')
    expect(generated).toContain('<table>')
    expect((generated.match(/<tr>/g) ?? []).length).toBeGreaterThan(15)
    expect(generated).toContain('<strong>Mark this moment as a draft</strong>')
  })

  it('keeps no Markdown, comment or anchor of its own', () => {
    expect(generated).not.toContain('**')
    expect(generated).not.toContain('<!--')
    expect(generated).not.toMatch(/\sid=/)
  })

  it('drops markup the guide has no use for', () => {
    expect(editorGuideHtml('Zq <script>xv()</script> <img src="q.png"> [a](https://example.invalid)')).toBe(
      '<p>Zq   <a href="https://example.invalid">a</a></p>\n'
    )
  })
})
