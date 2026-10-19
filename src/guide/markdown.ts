// The reader's guide as Markdown, for docs/readers-guide.md. The guide's words live in one place,
// src/i18n/<language>/readers-guide.json; the site's page and the Markdown file are both made from it.
export interface Guide {
  title: string
  intro: string[]
  sections: Array<{ heading: string, labels: string[], paragraphs: string[] }>
}

export const NOTE = '<!-- Made from src/i18n/en/readers-guide.json. Edit that file, then run: UPDATE_GUIDE=1 npx jest src/__tests__/readers-guide.test.ts -->'

export function guideMarkdown(guide: Guide): string {
  const blocks = [NOTE, `# ${guide.title}`, ...guide.intro]
  for (const section of guide.sections) blocks.push(`## ${section.heading}`, ...section.paragraphs)
  return blocks.join('\n\n') + '\n'
}
