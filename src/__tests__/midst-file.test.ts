import { cursorParagraphIndex, parseMidstFile, playbackFile } from '../components/midst-player-hack/midst-file'

const INVALID = 'Invalid or unsupported Midst file'

const change = (inserted: any, front: any, end: any, extra: Record<string, any> = {}) => (
  { inserted, front, end, t: 1000, ...extra }
)
const fileC = (history: any, text: any, extra: Record<string, any> = {}) => ({ text, history, ...extra })
const play = (data: any) => playbackFile(data)
const expectInvalid = (fn: () => unknown) => expect(fn).toThrow(new Error(INVALID))

describe('cursorParagraphIndex', () => {
  it('returns 0 for empty sizes', () => {
    expect(cursorParagraphIndex([], 0)).toBe(0)
    expect(cursorParagraphIndex([], 5)).toBe(0)
  })

  it('finds a position inside the first paragraph', () => {
    expect(cursorParagraphIndex([3, 4, 2], 0)).toBe(0)
    expect(cursorParagraphIndex([3, 4, 2], 2)).toBe(0)
  })

  it('assigns the exact end of a paragraph to that paragraph', () => {
    expect(cursorParagraphIndex([3, 4, 2], 3)).toBe(0)
    expect(cursorParagraphIndex([3, 4, 2], 7)).toBe(1)
  })

  it('moves to the next paragraph one past the end', () => {
    expect(cursorParagraphIndex([3, 4, 2], 4)).toBe(1)
    expect(cursorParagraphIndex([3, 4, 2], 8)).toBe(2)
  })

  it('returns the last index beyond the total', () => {
    expect(cursorParagraphIndex([3, 4, 2], 9)).toBe(2)
    expect(cursorParagraphIndex([3, 4, 2], 1000)).toBe(2)
  })

  it('handles zero-length paragraphs', () => {
    expect(cursorParagraphIndex([0, 3], 0)).toBe(0)
    expect(cursorParagraphIndex([0, 3], 1)).toBe(1)
    expect(cursorParagraphIndex([3, 0, 2], 3)).toBe(0)
    expect(cursorParagraphIndex([3, 0, 2], 4)).toBe(2)
    expect(cursorParagraphIndex([0, 0], 5)).toBe(1)
  })
})

describe('playbackFile format C, valid', () => {
  it('yields one exact frame per change', () => {
    const history = [
      change('kj', 0, 0, { t: '2020-01-01T00:00:00.000Z', pos: 2 }),
      change('xv', 0, 2, { t: 5, pos: 2 }),
      change('zq', 4, 0, { t: 6, pos: 6 }),
      change('ww', 3, 3, { t: 7, pos: 5 }),
      change('', 3, 3, { t: 8 }),
      change('ab', 1, 1, { t: 9, pos: 3 }),
    ]
    const result = play(fileC(history, 'xabq'))
    expect(result.editorTimelineFrames).toEqual([
      { content: 'kj', timestamp: Date.parse('2020-01-01T00:00:00.000Z'), lineNumber: 0, cursorPosition: 2 },
      { content: 'xvkj', timestamp: 5, lineNumber: 0, cursorPosition: 2 },
      { content: 'xvkjzq', timestamp: 6, lineNumber: 0, cursorPosition: 6 },
      { content: 'xvkwwjzq', timestamp: 7, lineNumber: 0, cursorPosition: 5 },
      { content: 'xvkjzq', timestamp: 8, lineNumber: 0, cursorPosition: 0 },
      { content: 'xabq', timestamp: 9, lineNumber: 0, cursorPosition: 3 },
    ])
    expect(result.sourceHistoryLength).toBe(6)
  })

  it('accepts front + end exactly equal to the content length', () => {
    const result = play(fileC([change('abc', 0, 0), change('Q', 2, 1)], 'abQc'))
    expect(result.editorTimelineFrames.map(f => f.content)).toEqual(['abc', 'abQc'])
  })

  it('accepts pos undefined and t of 0', () => {
    const result = play(fileC([change('zq', 0, 0, { pos: undefined, t: 0 })], 'zq'))
    expect(result.editorTimelineFrames).toEqual([{ content: 'zq', timestamp: 0, lineNumber: 0, cursorPosition: 0 }])
  })
})

describe('playbackFile empty history', () => {
  it('turns a static document into one synthetic frame', () => {
    const result = play(fileC([], 'zq xv'))
    expect(result.editorTimelineFrames).toEqual([{ content: 'zq xv', timestamp: 0, lineNumber: 0, cursorPosition: 0 }])
    expect(result.sourceHistoryLength).toBe(0)
  })

  it('handles empty history with empty text', () => {
    const result = play(fileC([], ''))
    expect(result.editorTimelineFrames).toEqual([{ content: '', timestamp: 0, lineNumber: 0, cursorPosition: 0 }])
    expect(result.sourceHistoryLength).toBe(0)
  })
})

describe('playbackFile meta handling', () => {
  const defaults = {
    editorDraftMarkers: [],
    editorFontFamily: 'Helvetica',
    editorFontSize: 14,
    editorHighestEverDraftNumber: 0,
    editorTitle: 'Untitled',
  }

  it('uses fontFamily string and fontSize number', () => {
    const result = play(fileC([], 'zq', { meta: { fontFamily: 'Zq Mono', fontSize: 21 } }))
    expect(result.meta).toEqual({ ...defaults, editorFontFamily: 'Zq Mono', editorFontSize: 21 })
  })

  it('falls back when types are wrong', () => {
    const result = play(fileC([], 'zq', { meta: { fontFamily: 5, fontSize: '21' } }))
    expect(result.meta).toEqual(defaults)
    expect(result.presentation).toEqual({ fontFamily: 5, fontSize: '21' })
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['an array', ['zq']],
    ['a string', 'zq'],
  ])('gives empty presentation and defaults when meta is %s', (_name, meta) => {
    const data: Record<string, any> = fileC([], 'zq')
    if (meta !== undefined) data.meta = meta
    const result = play(data)
    expect(result.presentation).toEqual({})
    expect(result.meta).toEqual(defaults)
  })

  it('keeps raw meta unchanged, including unknown keys and out-of-range markers', () => {
    const meta = { fontSize: 20, unknownKey: { nested: 'qv' }, draftMarkers: [{ index: 99 }], editorTitle: 'Zq' }
    const result = play(fileC([change('zq', 0, 0)], 'zq', { meta }))
    expect(result.presentation).toEqual(meta)
    expect(result.meta).toEqual({ ...defaults, editorFontSize: 20 })
    expect(result.meta.editorDraftMarkers).toEqual([])
  })
})

describe('playbackFile invalid format C', () => {
  it.each([
    ['text not a string', fileC([], 5)],
    ['text missing', { history: [] }],
    ['history not an array', fileC('zq', 'zq')],
    ['history missing', { text: 'zq' }],
    ['a null change', fileC([null], 'zq')],
    ['inserted not a string', fileC([change(5, 0, 0)], '')],
    ['inserted missing', fileC([{ front: 0, end: 0, t: 1 }], '')],
    ['final content differs from text', fileC([change('zq', 0, 0)], 'xv')],
    ['final content differs from empty text', fileC([change('zq', 0, 0)], '')],
  ])('rejects %s', (_name, data) => {
    expectInvalid(() => play(data))
  })

  describe.each(['front', 'end'])('%s offset', field => {
    const make = (value: any) => fileC([change('zq', field === 'front' ? value : 0, field === 'end' ? value : 0)], 'zq')

    it.each([
      ['negative', -1],
      ['fractional', 1.5],
      ['NaN', NaN],
      ['a numeric string', '1'],
      ['beyond MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER + 1],
      ['undefined', undefined],
      ['null', null],
    ])('rejects %s', (_name, value) => {
      expectInvalid(() => play(make(value)))
    })
  })

  it('rejects offsets beyond the content length', () => {
    expectInvalid(() => play(fileC([change('abc', 0, 0), change('Q', 2, 2)], 'abQc')))
    expectInvalid(() => play(fileC([change('abc', 0, 0), change('Q', 4, 0)], 'abcQ')))
    expectInvalid(() => play(fileC([change('abc', 0, 0), change('Q', 0, 4)], 'Qabc')))
  })

  it('rejects offsets on the very first change, where content is empty', () => {
    expectInvalid(() => play(fileC([change('a', 1, 0)], 'a')))
    expectInvalid(() => play(fileC([change('a', 0, 1)], 'a')))
  })

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['a string', '1'],
    ['NaN', NaN],
    ['null', null],
  ])('rejects pos that is %s', (_name, pos) => {
    expectInvalid(() => play(fileC([change('zq', 0, 0, { pos })], 'zq')))
  })

  it.each([
    ['missing', undefined],
    ['null', null],
    ['an object', {}],
    ['an unparseable date string', 'not a date'],
    ['NaN', NaN],
  ])('rejects t that is %s', (_name, t) => {
    expectInvalid(() => play(fileC([change('zq', 0, 0, { t })], 'zq')))
  })
})

describe('playbackFile format B', () => {
  it('returns the same object', () => {
    const data = { editorTimelineFrames: [{ content: 'zq', timestamp: 1, lineNumber: 0, cursorPosition: 0 }], meta: { editorTitle: 'xv' } }
    expect(play(data)).toBe(data)
  })

  it('rejects non-array frames', () => {
    expectInvalid(() => play({ editorTimelineFrames: 'zq', meta: {} }))
  })

  it('rejects a missing meta', () => {
    expectInvalid(() => play({ editorTimelineFrames: [] }))
  })
})

describe('playbackFile non-object input', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'zq'],
    ['a number', 5],
  ])('rejects %s', (_name, value) => {
    expectInvalid(() => play(value))
  })
})

describe('parseMidstFile', () => {
  const body = JSON.stringify(fileC([change('zq', 0, 0, { pos: 2 })], 'zq'))
  const expected = [{ content: 'zq', timestamp: 1000, lineNumber: 0, cursorPosition: 2 }]

  it.each([
    ['bare JSON', body],
    ['header midstVersion: 1', `midstVersion: 1\n${body}`],
    ['header midstVersion: v0.0.1', `midstVersion: v0.0.1\n${body}`],
    ['a CRLF header', `midstVersion: 1\r\n${body}`],
    ['a BOM before the header', `﻿midstVersion: 1\n${body}`],
    ['a BOM before bare JSON', `﻿${body}`],
    ['surrounding whitespace', `\n\n  ${body}  \n\n`],
    ['whitespace around a header file', `\n midstVersion: 1\n${body}\n\n`],
  ])('parses %s', (_name, raw) => {
    const result = parseMidstFile(raw)
    expect(result.editorTimelineFrames).toEqual(expected)
    expect(result.sourceHistoryLength).toBe(1)
  })

  it('parses a format B file', () => {
    const result = parseMidstFile('{"editorTimelineFrames":[],"meta":{}}')
    expect(result).toEqual({ editorTimelineFrames: [], meta: {} })
  })

  it.each([
    ['version 2', `midstVersion: 2\n${body}`],
    ['no space after the colon', `midstVersion:1\n${body}`],
    ['no newline and no body', 'midstVersion: 1'],
    ['a trailing space', `midstVersion: 1 \n${body}`],
    ['version v0.0.2', `midstVersion: v0.0.2\n${body}`],
    ['a header with a body on the same line', `midstVersion: 1 ${body}`],
  ])('rejects a malformed header: %s', (_name, raw) => {
    expectInvalid(() => parseMidstFile(raw))
  })

  it.each([
    ['a body that is not JSON', 'zq xv'],
    ['an empty string', ''],
    ['whitespace only', ' \n '],
    ['a header with an empty body', 'midstVersion: 1\n'],
    ['JSON that is a number', '5'],
    ['JSON that is null', 'null'],
    ['JSON that is an array', '[]'],
  ])('rejects %s', (_name, raw) => {
    expectInvalid(() => parseMidstFile(raw))
  })
})

describe('parseMidstFile privacy', () => {
  const SENTINEL = 'QZXSENTINEL'

  const caught = (raw: string): Error => {
    try {
      parseMidstFile(raw)
    } catch (error) {
      return error as Error
    }
    throw new Error('expected parseMidstFile to throw')
  }

  it.each([
    ['broken JSON', `{"text": "${SENTINEL} zq", "history": [`],
    ['broken JSON after a header', `midstVersion: 1\n{"text": ${SENTINEL}}`],
    ['valid JSON, invalid file', `{"text":"${SENTINEL}","history":"x"}`],
    ['valid JSON, invalid change', `{"text":"${SENTINEL}","history":[{"inserted":"${SENTINEL}","front":-1,"end":0,"t":1}]}`],
    ['valid JSON, mismatched text', `{"text":"${SENTINEL}","history":[{"inserted":"zq","front":0,"end":0,"t":1}]}`],
  ])('does not leak content for %s', (_name, raw) => {
    const error = caught(raw)
    expect(error.message).toBe(INVALID)
    expect(error.message).not.toContain(SENTINEL)
  })
})


describe('playbackFile, the edges a single changed character would move', () => {
  // The content before the first change is the empty string, so NO offset is in range yet.
  it('rejects a first change that keeps one character from the front or from the end', () => {
    expectInvalid(() => play(fileC([change('zq', 1, 0)], 'zq')))
    expectInvalid(() => play(fileC([change('zq', 0, 1)], 'zq')))
    // Still invalid when `text` is what a phantom first character would have produced: the offsets
    // are checked against the real (empty) content, not rescued by the final comparison with `text`.
    expectInvalid(() => play(fileC([change('zq', 1, 0)], 'xzq')))
    expectInvalid(() => play(fileC([change('zq', 0, 1)], 'zqx')))
  })

  it('accepts a cursor position of exactly 0', () => {
    const out = play(fileC([change('zq', 0, 0, { pos: 0 })], 'zq'))
    expect(out.editorTimelineFrames).toEqual([
      { content: 'zq', timestamp: 1000, lineNumber: 0, cursorPosition: 0 },
    ])
  })
})
