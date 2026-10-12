// Checks the generated bundle (src/poems/index.ts) against the metadata files it is derived from,
// as tools/generate-poem-index.mjs derives it: every src/poems/*.json except order.json is a record,
// "published": true selects it, and order.json's "order" array gives the sequence. Records are
// identified in failure messages by JSON file name or index only.
import * as fs from 'fs'
import * as path from 'path'
import poems from '../poems'
import * as names from '../poems/poem-names'

const POEMS_DIR = path.join(__dirname, '..', 'poems')

const metaFiles = fs
  .readdirSync(POEMS_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'order.json')
  .sort()

const load = (stem: string) => JSON.parse(fs.readFileSync(path.join(POEMS_DIR, `${stem}.json`), 'utf8'))

const stems = metaFiles.map((f) => f.replace(/\.json$/, ''))
const publishedStems = stems.filter((s) => load(s).published === true)
const unpublishedStems = stems.filter((s) => load(s).published !== true)
const order: string[] = JSON.parse(fs.readFileSync(path.join(POEMS_DIR, 'order.json'), 'utf8')).order
const expectedStems = order.filter((s) => publishedStems.includes(s))

const records = poems as any[]

describe('poems index', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(poems)).toBe(true)
    expect(records.length).toBeGreaterThan(0)
  })

  it('has one entry per published metadata file', () => {
    expect(records).toHaveLength(publishedStems.length)
  })

  it('exercises the filter: at least one metadata file is unpublished', () => {
    expect(metaFiles.length).toBeGreaterThan(publishedStems.length)
    expect(unpublishedStems.length).toBeGreaterThan(0)
  })

  it('every published file has a place in order.json', () => {
    expect(expectedStems).toHaveLength(publishedStems.length)
  })

  it('lists exactly the published files in order.json order', () => {
    expect(records).toHaveLength(expectedStems.length)
    for (let i = 0; i < expectedStems.length; i += 1) {
      // Message names the index and file only, never a value.
      expect({ index: i, file: expectedStems[i], record: records[i] }).toEqual({
        index: i,
        file: expectedStems[i],
        record: load(expectedStems[i]),
      })
    }
  })

  it('contains no unpublished record', () => {
    for (const stem of unpublishedStems) {
      const content = load(stem)
      const hits = records.filter((r) => JSON.stringify(r) === JSON.stringify(content)).length
      expect({ file: `${stem}.json`, hits }).toEqual({ file: `${stem}.json`, hits: 0 })
    }
  })

  it('every record has published true, and non-empty string author and title', () => {
    records.forEach((r, i) => {
      expect({ index: i, published: r.published }).toEqual({ index: i, published: true })
      expect({ index: i, authorOk: typeof r.author === 'string' && r.author.trim().length > 0 }).toEqual({
        index: i,
        authorOk: true,
      })
      expect({ index: i, titleOk: typeof r.title === 'string' && r.title.trim().length > 0 }).toEqual({
        index: i,
        titleOk: true,
      })
    })
  })

  it('every record has a date and publishDate that parse to a finite time', () => {
    records.forEach((r, i) => {
      for (const field of ['date', 'publishDate']) {
        const ok = typeof r[field] === 'string' && Number.isFinite(new Date(r[field]).getTime())
        expect({ index: i, field, ok }).toEqual({ index: i, field, ok: true })
      }
    })
  })

  it('poemId is distinct for every record', () => {
    const ids = records.map((r) => names.poemId(r.author, r.title))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('timelapseObjectName is distinct for every record', () => {
    const objectNames = records.map((r) => names.timelapseObjectName(r))
    expect(new Set(objectNames).size).toBe(objectNames.length)
  })
})
