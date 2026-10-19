import { readFileSync } from 'fs'
import { join } from 'path'

import { parsePublishedList } from '../poems/poem-list'

// midst-infra #65: deploy/beta/published_list_cases.json is midst-infra's corpus, copied here under
// tools/midst-infra-copies.sha256. The deploy check (deploy/beta/check_published_list.py) runs the same cases in
// midst-infra, so the two parsers cannot drift. A case's text is the exact content of a published.json; the site
// reads it with response.json(), which is JSON.parse.
type Case = { name: string; accepted: boolean; text: string }

const cases: Case[] = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'deploy', 'beta', 'published_list_cases.json'), 'utf8'),
).cases

const accepts = (text: string) => {
  try {
    parsePublishedList(JSON.parse(text))
    return true
  } catch {
    return false
  }
}

describe('the shared published-list corpus', () => {
  it('has unique case names and both verdicts', () => {
    expect(new Set(cases.map(c => c.name)).size).toBe(cases.length)
    expect(cases.some(c => c.accepted)).toBe(true)
    expect(cases.some(c => !c.accepted)).toBe(true)
  })

  it.each(cases.map(c => [c.name, c] as const))('%s', (_name, c) => {
    expect(accepts(c.text)).toBe(c.accepted)
  })
})
