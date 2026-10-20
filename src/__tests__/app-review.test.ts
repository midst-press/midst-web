import { Call } from '../app/publisher'
import { Submission, canPlay, reviewByline } from '../app/submit'
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { POEM_LIST_UNKNOWN, PlayDeps, PlayError, decide, fetchTimelapse, needsFinishing, poemIdsOf, reviewSubmissions, timelapseTicket, waitingCount } from '../app/review'

// The review calls (docs/app-api.md, "Review") and the fetch, unzip and parse step behind Play.

const call = (answer: unknown = {}) => jest.fn(async () => answer) as unknown as Call & jest.Mock

describe('review calls', () => {
  it('lists the submissions', async () => {
    const c = call({ submissions: [] })
    await reviewSubmissions(c)
    expect(c.mock.calls).toEqual([['/review/submissions']])
  })

  it('asks for a timelapse by id, encoded', async () => {
    const c = call({ url: 'https://files.example.invalid/zq', expiresAt: 'x' })
    await timelapseTicket(c, 's/1 ?')
    expect(c.mock.calls).toEqual([['/review/submissions/s%2F1%20%3F/timelapse']])
  })

  it('posts a decision with its note, by id, encoded', async () => {
    const c = call()
    await decide(c, 's/1', 'accept', 'Zq note')
    await decide(c, 's/1', 'decline', '')
    expect(c.mock.calls).toEqual([
      ['/review/submissions/s%2F1/decision', { method: 'POST', body: { decision: 'accept', note: 'Zq note' } }],
      ['/review/submissions/s%2F1/decision', { method: 'POST', body: { decision: 'decline', note: '' } }],
    ])
  })
})

describe('waitingCount (#289)', () => {
  it('counts only the submissions waiting to be read', () => {
    const of = (...statuses: Submission['status'][]) => statuses.map(status => ({ status }))
    expect(waitingCount(of())).toBe(0)
    expect(waitingCount(of('received', 'received'))).toBe(2)
    expect(waitingCount(of('uploading', 'received', 'accepted', 'declined', 'published'))).toBe(1)
  })
})

describe('needsFinishing', () => {
  const sub = (status: string, origin: 'upload' | 'archive' = 'upload') => ({ submissionId: 'sub-1', origin, status }) as Parameters<typeof needsFinishing>[0]
  const poem = (poemId: string) => ({ poemId, title: 'Zq', author: 'Qz', timelapseKey: 'k', processNoteKey: null, publishDate: null, highlighted: false })
  const ids = poemIdsOf({ published: [poem('sub-9')], unpublished: [poem('sub-8')] })

  it('collects the ids of published and unpublished poems', () => {
    expect([...ids].sort()).toEqual(['sub-8', 'sub-9'])
  })

  it('offers it for an accepted upload with no poem', () => {
    expect(needsFinishing(sub('accepted'), ids)).toEqual({ offer: true, enabled: true })
  })

  it('does not offer it when the poem is unpublished or published', () => {
    expect(needsFinishing(sub('accepted'), new Set(['sub-1']))).toEqual({ offer: false })
    expect(needsFinishing(sub('accepted'), poemIdsOf({ published: [poem('sub-1')], unpublished: [] }))).toEqual({ offer: false })
  })

  it.each(['published', 'received', 'declined', 'uploading'])('does not offer it for status %s', status => {
    expect(needsFinishing(sub(status), ids)).toEqual({ offer: false })
    expect(needsFinishing(sub(status), null)).toEqual({ offer: false })
  })

  it('does not offer it for an archive record', () => {
    expect(needsFinishing(sub('accepted', 'archive'), ids)).toEqual({ offer: false })
    expect(needsFinishing(sub('accepted', 'archive'), null)).toEqual({ offer: false })
  })

  it('offers it disabled, with the reason, when the poem list is unknown', () => {
    const result = needsFinishing(sub('accepted'), null)
    expect(result).toEqual({ offer: true, enabled: false, reason: POEM_LIST_UNKNOWN })
    expect(POEM_LIST_UNKNOWN).toContain('could not be loaded')
  })

  it('offers nothing while the poem list is still being read, so it never says the list failed when it has not', () => {
    expect(needsFinishing(sub('accepted'), 'loading')).toEqual({ offer: false })
  })
})

const midst = JSON.stringify({
  editorTimelineFrames: [{ content: '<p data-line-number="0">zq</p>', lineNumber: '0', timestamp: 1600000000000 }],
  meta: { editorDraftMarkers: [], editorFontFamily: 'Helvetica', editorFontSize: 14, editorHighestEverDraftNumber: 0, editorTitle: 'Untitled' },
})

// Real archives (#270): what Play fetches is a .midst.zip, made here with the zip library from synthetic contents.
async function midstZip(files: [string, string][] = [['zq.midst', midst]], level?: number): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'), level === undefined ? {} : { level })
  for (const [name, text] of files) await writer.add(name, new TextReader(text))
  return writer.close()
}

const serving = (archive: Blob): PlayDeps => ({
  fetch: jest.fn(async () => ({ ok: true, blob: async () => archive })),
})

describe('fetchTimelapse', () => {
  it('fetches the URL, reads the first file of a real .midst.zip and parses it', async () => {
    const d = serving(await midstZip([['zq.midst', midst], ['xv.midst', 'zq not this one']]))
    const data = await fetchTimelapse('https://files.example.invalid/zq', d)
    expect(d.fetch).toHaveBeenCalledWith('https://files.example.invalid/zq')
    expect(data.editorTimelineFrames).toHaveLength(1)
    expect(data.editorTimelineFrames[0].content).toContain('zq')
  })

  it('says the link may have expired when the fetch is refused or cannot be made', async () => {
    const refused: PlayDeps = { fetch: async () => ({ ok: false, blob: async () => new Blob() }) }
    const down: PlayDeps = { fetch: async () => { throw new TypeError('network') } }
    for (const d of [refused, down]) {
      await expect(fetchTimelapse('https://files.example.invalid/zq', d)).rejects.toThrow(PlayError)
      await expect(fetchTimelapse('https://files.example.invalid/zq', d)).rejects.toThrow('may have expired')
    }
  })

  it('says the copy is damaged when the archive is empty, not an archive, fails its CRC, or holds no Midst file', async () => {
    const stored = new Uint8Array(await (await midstZip([['zq.midst', midst]], 0)).arrayBuffer())
    // A byte of the stored contents, not of the file name in the headers.
    const at = Buffer.from(stored).indexOf('Helvetica')
    expect(at).toBeGreaterThan(0)
    stored[at + 1] ^= 1
    const copies = [
      await midstZip([]),
      new Blob(['zq not a zip']),
      new Blob([stored]),
      await midstZip([['zq.midst', 'not json']]),
    ]
    for (const archive of copies) {
      await expect(fetchTimelapse('https://files.example.invalid/zq', serving(archive))).rejects.toThrow(PlayError)
      await expect(fetchTimelapse('https://files.example.invalid/zq', serving(archive))).rejects.toThrow('damaged')
    }
  })
})

describe('the review list for an archive record', () => {
  const upload: Submission = { submissionId: 's-1', title: 'Zq xv', author: 'Qz Vb', poet: 'qz@example.invalid', origin: 'upload', submittedAt: '2026-10-15T09:30:00Z', status: 'received', note: null }
  const archive: Submission = { submissionId: 's-2', title: 'Zq xv', author: 'Qz Vb', poet: null, origin: 'archive', submittedAt: null, status: 'accepted', note: null, recordedBy: 'zq-migration' }

  it('says "from the archive" with no poet, no 1970 and no stray comma', () => {
    const line = reviewByline(archive)
    expect(line).toBe('by Qz Vb, from the archive')
    expect(line).not.toContain('1970')
    expect(line).not.toMatch(/,\s*,/)
  })

  it('keeps the poet of an archive record that has one', () => {
    expect(reviewByline({ ...archive, poet: 'qz@example.invalid' })).toBe('by Qz Vb, qz@example.invalid, from the archive')
  })

  it('shows the date of an archive record whose file gave one, and still offers nothing to play', () => {
    const dated = { ...archive, poet: 'qz@example.invalid', submittedAt: '2021-01-06T21:14:03.512Z' }
    expect(reviewByline(dated)).toBe(`by Qz Vb, qz@example.invalid, from the archive, last edited ${new Date('2021-01-06T21:14:03.512Z').toLocaleDateString()}`)
    expect(canPlay(dated)).toBe(false)
  })

  it('shows author, poet and date for an upload, as before', () => {
    expect(reviewByline(upload)).toBe(`by Qz Vb, qz@example.invalid, ${new Date('2026-10-15T09:30:00Z').toLocaleDateString()}`)
  })

  it('offers Play for an upload that has a review copy, and not for an archive record or an unfinished upload', () => {
    expect(canPlay(upload)).toBe(true)
    expect(canPlay({ ...upload, status: 'accepted' })).toBe(true)
    expect(canPlay(archive)).toBe(false)
    expect(canPlay({ ...archive, status: 'published' })).toBe(false)
    expect(canPlay({ ...upload, status: 'uploading' })).toBe(false)
  })
})
