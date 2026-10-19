// The editor's user guide as HTML, for /app#help (midst-editor #105).
//
// src/guide/editor-user-guide.md began as a copy of midst-editor docs/user-guide.md and is now the website's
// own file (midst-web #194). This turns it into the HTML the page shows. The result is checked in as
// editor-user-guide.generated.ts, so the site needs no Markdown at run time, and a test fails when the two
// differ. To regenerate: UPDATE_GUIDE=1 npx jest src/__tests__/editor-user-guide.test.ts
//
// TODO: Type def file
//@ts-ignore
import marked from 'marked'
//@ts-ignore
import insane from 'insane'

// Everything the guide uses, and nothing else. No ids: the page's own id="help" must be the only anchor.
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'br',
]

export function editorGuideHtml(markdown: string): string {
  return insane(marked(markdown, { headerIds: false }), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
  })
}
