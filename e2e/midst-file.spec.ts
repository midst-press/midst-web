import { test, expect } from '@playwright/test'
import { cursorParagraphIndex, parseMidstFile, playbackFile } from '../src/components/midst-player-hack/midst-file'

const epoch = 1600000000000
const t = new Date(epoch).toISOString()
const legacy = {
  editorTimelineFrames: [{ content: '<p>x</p>', lineNumber: 0, timestamp: epoch }],
  meta: { editorDraftMarkers: [] as [], editorFontFamily: 'Helvetica', editorFontSize: 14, editorHighestEverDraftNumber: 0, editorTitle: 'Untitled' },
}

test('cursor following counts paragraph boundaries, UTF-16 and hard breaks', () => {
  // First paragraph: a surrogate pair (2), a hard break (1), and boundaries (2).
  for (const position of [0, 1, 4, 5]) expect(cursorParagraphIndex([5, 3], position)).toBe(0)
  for (const position of [6, 7, 8, 9]) expect(cursorParagraphIndex([5, 3], position)).toBe(1)
  expect(cursorParagraphIndex([], 0)).toBe(0)
})

test('B snapshots and metadata remain unchanged', () => {
  expect(playbackFile(legacy)).toBe(legacy)
  expect(parseMidstFile(JSON.stringify(legacy))).toEqual(legacy)
})

test('C preserves every edit, including Unicode, markup, replacement and deletion', () => {
  const history = [
    { front: 0, end: 0, inserted: '<p>ab😀</p>', t, pos: 5 },
    { front: 4, end: 4, inserted: 'Z', t: epoch + 1, pos: 6 },
    { front: 4, end: 4, inserted: '', t, pos: 2 },
    { front: 0, end: 0, inserted: '<p><strong>界</strong><br>é</p><p>q</p>', t, pos: 7 },
    { front: 37, end: 0, inserted: '', t },
  ]
  // Independent frame oracle, not replay() used to generate its own expected answers.
  const expected = [
    '<p>ab😀</p>', '<p>aZ</p>', '<p>a</p>',
    '<p><strong>界</strong><br>é</p><p>q</p>',
    '<p><strong>界</strong><br>é</p><p>q</p>',
  ]
  history[4].front = expected[3].length
  const data = { text: expected[4], history }
  for (const header of ['midstVersion: 1\n', 'midstVersion: v0.0.1\r\n', '']) {
    const parsed = parseMidstFile(header + JSON.stringify(data, null, 2))
    expect(parsed.editorTimelineFrames.map(frame => frame.content)).toEqual(expected)
    expect(parsed.editorTimelineFrames.map(frame => frame.timestamp)).toEqual([epoch, epoch + 1, epoch, epoch, epoch])
    expect(parsed.editorTimelineFrames.map(frame => frame.cursorPosition)).toEqual([5, 6, 2, 7, 0])
    expect(parsed.meta.editorDraftMarkers).toEqual([])
  }
})

test('C without recorded edits remains a static playable document', () => {
  const file = parseMidstFile('midstVersion: 1\n' + JSON.stringify({ text: '<p></p>', history: [] }))
  expect(file.editorTimelineFrames).toHaveLength(1)
  expect(file.editorTimelineFrames[0].content).toBe('<p></p>')
  expect(file.sourceHistoryLength).toBe(0)
})

test('C presentation preserves unknown values and out-of-range drafts without dropping unchanged frames', () => {
  const meta = { fontFamily: 'Courier', fontSize: 24, highestDraftNumber: 8,
    title: 'synthetic title', author: 'synthetic author', futureField: { x: 1 },
    draftMarkers: [-1, 0, 1, 2].map(index => ({ index, name: 'synthetic draft', defaultName: 'Draft 1' })) }
  const history = [{ front: 0, end: 0, inserted: '<p>x</p>', t }, { front: 8, end: 0, inserted: '', t }]
  const file = parseMidstFile(JSON.stringify({ text: '<p>x</p>', history, meta }))
  expect(file.presentation).toEqual(meta)
  expect(file.sourceHistoryLength).toBe(2)
  expect(file.editorTimelineFrames.map(frame => frame.content)).toEqual(['<p>x</p>', '<p>x</p>'])
  expect(file.meta.editorFontFamily).toBe('Courier')
  expect(file.meta.editorFontSize).toBe(24)
  for (const value of [-1, 0, 17.5, 999]) {
    const loaded = playbackFile({ text: '', history: [], meta: { fontSize: value } })
    expect(loaded.presentation!.fontSize).toBe(value)
  }
  expect(playbackFile({ text: '', history: [] }).meta).toMatchObject({ editorFontFamily: 'Helvetica', editorFontSize: 14 })
})

test('invalid histories and future versions refuse without echoing input', () => {
  const sentinel = 'SYNTHETIC_PRIVATE_SENTINEL'
  const good = { front: 0, end: 0, inserted: sentinel, t }
  const invalid = [
    { ...good, front: -1 }, { ...good, front: 0.5 }, { ...good, end: 1 },
    { ...good, end: -1 }, { ...good, inserted: 7 }, { ...good, t: 'invalid' },
    { ...good, pos: -1 }, { ...good, pos: 0.5 }, null,
  ]
  const sources = invalid.map(change => 'midstVersion: 1\n' + JSON.stringify({ text: sentinel, history: [change] }))
  sources.push(
    `midstVersion: 2\n${sentinel}`, `{"${sentinel}":`,
    JSON.stringify({ text: sentinel, history: [{ ...good, inserted: 'different' }] }),
    JSON.stringify({ text: sentinel, history: {} }), 'null',
  )
  for (const source of sources) {
    let failure: Error | undefined
    try { parseMidstFile(source) } catch (error) { failure = error as Error }
    expect(failure).toBeInstanceOf(Error)
    expect(failure!.message).toBe('Invalid or unsupported Midst file')
    expect(failure!.message).not.toContain(sentinel)
  }
})
