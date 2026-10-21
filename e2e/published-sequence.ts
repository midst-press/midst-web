// The published poems in the order the site shows them, derived as src/poems/index.ts is generated:
// order.json's "order", keeping those whose own metadata says "published": true. Routes come from
// poem-names.js, the module the application uses, so none is typed here. Midst-web #100.
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import moment from 'moment'
import names from '../src/poems/poem-names.js'

const POEMS = join(__dirname, '..', 'src', 'poems')
const meta = (file: string) => JSON.parse(readFileSync(join(POEMS, `${file}.json`), 'utf8'))

const order: string[] = JSON.parse(readFileSync(join(POEMS, 'order.json'), 'utf8')).order

export const route = (file: string): string => `/poem/${names.poemUrl(meta(file).title)}/`

/** Published poems, in display order: their metadata file names (without .json). */
export const published: string[] = order.filter(file => meta(file).published === true)

/**
 * Published poems in the order the Table of Contents opens, which the next and previous arrows follow: newest
 * first by publish date (YYYY-MM-DD, strictly), ties and undated poems in display order, undated last
 * (src/store/reducer.ts sortPoems; midst-web #309).
 */
const dateOf = (file: string): string | null => {
  const value = meta(file).publishDate
  return moment(typeof value === 'string' ? value : null, 'YYYY-MM-DD', true).isValid() ? value : null
}
export const opening: string[] = [
  ...published.filter(file => dateOf(file) !== null)
    .map((file, position) => ({ file, position, date: dateOf(file)! }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.position - b.position))
    .map(poem => poem.file),
  ...published.filter(file => dateOf(file) === null),
]

/** Poems whose metadata says "published": false. */
export const unpublished: string[] = readdirSync(POEMS)
  .filter(file => file.endsWith('.json') && file !== 'order.json')
  .map(file => file.slice(0, -'.json'.length))
  .filter(file => meta(file).published === false)

/** The carousel class that scopes one poem's player, as poem-plays.spec.ts derives it. */
// An attribute selector, not `.class`: some poem ids contain characters a class selector cannot (a colon).
export const scope = (file: string): string => `[class~="sliding-poems__poem--${names.poemId(meta(file).author, meta(file).title)}"]`

/** The poems tools/make-e2e-fixtures.mjs builds a timelapse and a process note for. */
export const WITH_FIXTURE = ['Margaret_Yapp', 'Madeleine_Mori', 'Jared_Harél', 'Mónica_de_la_Torre']

/** The path of the current page, decoded, for comparing with route(). */
export const pathOf = (url: string): string => decodeURIComponent(new URL(url).pathname)


/**
 * Keep the page off the network, as poem-plays and load-failure do: same-origin requests reach the local
 * fixture server, the vendored zip reader is served from the tree, and anything else is aborted and
 * recorded. A site built against the production poems host would otherwise fetch real poems here; with
 * this it fails instead. `note`, when given, answers same-origin process-note requests that the fixture
 * server answers 200.
 */
export async function hermetic(
  page: import('@playwright/test').Page,
  baseURL: string,
  note?: (url: string) => string,
): Promise<{ external: string[], archive: string[], externalPoemFiles: () => string[] }> {
  const seen = {
    external: [] as string[],
    archive: [] as string[],
    // A poem's own files asked of another host: what this guard exists to stop. Counted, never printed.
    externalPoemFiles(): string[] { return this.external.filter(path => /\.(md|midst\.zip)$/.test(path)) },
  }
  const base = new URL(baseURL).origin
  await page.route('**/*', async (request) => {
    const url = new URL(request.request().url())
    if (url.origin !== base) {
      seen.external.push(url.pathname)
      return request.abort()
    }
    if (url.pathname.startsWith('/archive/')) seen.archive.push(url.pathname)
    if (note && /\.md$/.test(url.pathname)) {
      const response = await request.fetch()
      if (!response.ok()) return request.fulfill({ response })
      return request.fulfill({ response, body: note(url.href) })
    }
    return request.continue()
  })
  return seen
}
