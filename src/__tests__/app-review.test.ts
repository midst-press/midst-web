import { Call } from '../app/publisher'
import { PlayDeps, PlayError, ZipLib, decide, fetchTimelapse, reviewSubmissions, timelapseTicket } from '../app/review'

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

const midst = JSON.stringify({
  editorTimelineFrames: [{ content: '<p data-line-number="0">zq</p>', lineNumber: '0', timestamp: 1600000000000 }],
  meta: { editorDraftMarkers: [], editorFontFamily: 'Helvetica', editorFontSize: 14, editorHighestEverDraftNumber: 0, editorTitle: 'Untitled' },
})

// A stand-in for zip.js: one entry, or none, or a reader that fails.
function zipLib(mode: 'ok' | 'empty' | 'unreadable' = 'ok'): ZipLib & { read: jest.Mock } {
  const read = jest.fn()
  return {
    read,
    BlobReader: class { constructor(blob: Blob) { read(blob) } },
    BlobWriter: class {},
    createReader: (_reader, onReader, onError) => {
      if (mode === 'unreadable') return onError()
      onReader({ getEntries: done => done(mode === 'empty' ? [] : [{ getData: (_w, got) => got(new Blob([midst])) }]) })
    },
  }
}

const deps = (over: Partial<PlayDeps> = {}): PlayDeps => ({
  fetch: jest.fn(async () => ({ ok: true, blob: async () => new Blob(['zip']) })),
  zip: zipLib(),
  readText: async () => midst,
  ...over,
})

describe('fetchTimelapse', () => {
  it('fetches the URL, unzips the first entry and parses it', async () => {
    const d = deps()
    const data = await fetchTimelapse('https://files.example.invalid/zq', d)
    expect(d.fetch).toHaveBeenCalledWith('https://files.example.invalid/zq')
    expect((d.zip as ReturnType<typeof zipLib>).read).toHaveBeenCalledTimes(1)
    expect(d.zip.workerScriptsPath).toBe('/static/workers/')
    expect(data.editorTimelineFrames).toHaveLength(1)
    expect(data.editorTimelineFrames[0].content).toContain('zq')
  })

  it('says the link may have expired when the fetch is refused or cannot be made', async () => {
    const refused = deps({ fetch: async () => ({ ok: false, blob: async () => new Blob() }) })
    const down = deps({ fetch: async () => { throw new TypeError('network') } })
    for (const d of [refused, down]) {
      await expect(fetchTimelapse('https://files.example.invalid/zq', d)).rejects.toThrow(PlayError)
      await expect(fetchTimelapse('https://files.example.invalid/zq', d)).rejects.toThrow('may have expired')
    }
  })

  it('says the copy is damaged when the archive is empty, unreadable, or not a Midst file', async () => {
    for (const d of [deps({ zip: zipLib('empty') }), deps({ zip: zipLib('unreadable') }), deps({ readText: async () => 'not json' })]) {
      await expect(fetchTimelapse('https://files.example.invalid/zq', d)).rejects.toThrow('damaged')
    }
  })
})
