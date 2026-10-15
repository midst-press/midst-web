/*
 * The patrons the site thanks (#58). They are data, not code: /site/patrons.json, public site data served by the
 * same distribution as the site (site/ in the publishing bucket). It holds only the patrons who agreed to be named;
 * the back end writes it whenever the publisher saves the full list on their page (docs/app-api.md, "Patrons").
 * The site reads it when a page that shows them is opened.
 *
 *   { "version": 1, "updated": "<ISO time>", "patrons": ["<name>", ...], "closing": "Anonymous donors" | null }
 *
 * The names are shown in the order given, then the closing line.
 */
export interface Patrons {
  patrons: string[]
  closing: string | null
}

export const PATRONS_URL = '/site/patrons.json'

const isLine = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

/** The list from the file's JSON. Throws when it is not the shape above, so nothing half-read is shown. */
export function parsePatrons(json: unknown): Patrons {
  const file = json as { version?: unknown, patrons?: unknown, closing?: unknown } | null
  if (!file || typeof file !== 'object' || file.version !== 1 || !Array.isArray(file.patrons) || !file.patrons.every(isLine)) {
    throw new Error('patrons.json is not a list of patrons')
  }
  if (!(file.closing === null || file.closing === undefined || isLine(file.closing))) {
    throw new Error('patrons.json has a closing line that is not text')
  }
  return { patrons: file.patrons, closing: isLine(file.closing) ? file.closing : null }
}

/** The list, fetched now. Rejects on any failure: no answer, an error status, or a file that is not the list. */
export async function loadPatrons(request: typeof fetch = fetch): Promise<Patrons> {
  const response = await request(PATRONS_URL, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`patrons.json answered ${response.status}`)
  return parsePatrons(await response.json())
}
