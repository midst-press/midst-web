import { PATRONS_URL, loadPatrons, parsePatrons } from '../patrons'

// The site's read of patrons.json (#58). Names are invented.

const FILE = { version: 1, updated: '2026-10-16T08:00:00.000Z', patrons: ['Zq Vel', 'Orrin Taf'], closing: 'Anonymous donors' }

describe('parsePatrons', () => {
  it('gives the names in the order given, and the closing line', () => {
    expect(parsePatrons(FILE)).toEqual({ patrons: ['Zq Vel', 'Orrin Taf'], closing: 'Anonymous donors' })
  })

  it('gives null for a closing line that is null or absent, and accepts an empty list', () => {
    expect(parsePatrons({ ...FILE, closing: null }).closing).toBeNull()
    expect(parsePatrons({ version: 1, patrons: [] })).toEqual({ patrons: [], closing: null })
  })

  it.each([
    ['nothing', null],
    ['an array', []],
    ['another version', { ...FILE, version: 2 }],
    ['no patrons', { version: 1, closing: null }],
    ['patrons not a list', { ...FILE, patrons: 'Zq Vel' }],
    ['a name that is not text', { ...FILE, patrons: ['Zq Vel', 3] }],
    ['a blank name', { ...FILE, patrons: ['Zq Vel', ' '] }],
    ['a closing line that is not text', { ...FILE, closing: 4 }],
    ['a blank closing line', { ...FILE, closing: '' }],
  ])('refuses %s', (_why, json) => {
    expect(() => parsePatrons(json)).toThrow()
  })
})

describe('loadPatrons', () => {
  const answer = (status: number, body: unknown) =>
    jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response)

  it('reads /site/patrons.json from the site’s own origin, revalidating, and parses it', async () => {
    const request = answer(200, FILE)
    expect(await loadPatrons(request)).toEqual({ patrons: ['Zq Vel', 'Orrin Taf'], closing: 'Anonymous donors' })
    expect(PATRONS_URL).toBe('/site/patrons.json')
    expect(request).toHaveBeenCalledWith(PATRONS_URL, { cache: 'no-cache' })
  })

  it('rejects on an error status, a file that is not the list, and no answer', async () => {
    await expect(loadPatrons(answer(404, {}))).rejects.toThrow()
    await expect(loadPatrons(answer(200, { version: 1 }))).rejects.toThrow()
    await expect(loadPatrons(jest.fn(async () => { throw new TypeError('offline') }))).rejects.toThrow()
  })
})
