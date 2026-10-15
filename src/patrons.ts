/*
 * The patrons the site thanks (#58). They are data, not code: poems/patrons.json in the publishing bucket, beside
 * published.json and served from the same place, which the publisher edits on their page (docs/app-api.md,
 * "Patrons"). The site reads it when a page that shows them is opened.
 *
 *   { "version": 1, "updated": "<ISO time>", "patrons": ["<name>", ...], "closing": "Anonymous donors" | null }
 *
 * The names are shown in the order given, then the closing line.
 */
import { POEMS_URL } from './config'

export interface Patrons {
  patrons: string[]
  closing: string | null
}

export const PATRONS_URL = `${POEMS_URL}patrons.json`

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
