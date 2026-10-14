import { draftMarkers, playerFont, DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from '../components/MidstPlayer/timeline'
import { IMidstFile } from '../store/types'

// Synthetic data only. Built loosely (via unknown) so tests can feed malformed shapes.
interface Opts {
  metaMarkers?: unknown
  presentation?: unknown
  sourceHistoryLength?: number
  fontFamily?: unknown
  fontSize?: unknown
}

function makeFile(opts: Opts = {}): IMidstFile {
  const file: Record<string, unknown> = {
    editorTimelineFrames: [],
    meta: {
      editorDraftMarkers: opts.metaMarkers,
      editorFontFamily: opts.fontFamily,
      editorFontSize: opts.fontSize,
    },
  }
  if (opts.presentation !== undefined) file.presentation = opts.presentation
  if (opts.sourceHistoryLength !== undefined) file.sourceHistoryLength = opts.sourceHistoryLength
  return file as unknown as IMidstFile
}

const metaFile = (markers: unknown, extra: Opts = {}) => makeFile({ ...extra, metaMarkers: markers })
const presFile = (markers: unknown, extra: Opts = {}) =>
  makeFile({ ...extra, presentation: { draftMarkers: markers } })
const mm = (timelineIndex: unknown, name?: unknown, defaultName?: unknown) => ({ timelineIndex, name, defaultName })
const pm = (index: unknown, name?: unknown, defaultName?: unknown) => ({ index, name, defaultName })
const indexes = (data: IMidstFile, count: number) => draftMarkers(data, count).map((m) => m.index)

describe('draftMarkers partitions', () => {
  it('TL-EP-1: null data gives no markers', () => {
    expect(draftMarkers(null, 5)).toEqual([])
  })

  it('TL-EP-2: meta shape reads meta.editorDraftMarkers by timelineIndex', () => {
    expect(draftMarkers(metaFile([mm(1, 'zq'), mm(3, 'qv')]), 5)).toEqual([
      { index: 1, label: 'zq' },
      { index: 3, label: 'qv' },
    ])
  })

  it('TL-EP-3: presentation shape reads presentation.draftMarkers by index', () => {
    expect(draftMarkers(presFile([pm(2, 'zq'), pm(4, 'qv')]), 5)).toEqual([
      { index: 2, label: 'zq' },
      { index: 4, label: 'qv' },
    ])
  })

  it('TL-EP-4: with presentation present, meta.editorDraftMarkers is ignored', () => {
    const data = makeFile({ metaMarkers: [mm(1, 'zq')], presentation: { draftMarkers: [pm(2, 'qv')] } })
    expect(draftMarkers(data, 5)).toEqual([{ index: 2, label: 'qv' }])
    const noPresMarkers = makeFile({ metaMarkers: [mm(1, 'zq')], presentation: {} })
    expect(draftMarkers(noPresMarkers, 5)).toEqual([])
  })

  it.each([['undefined', undefined], ['object', {}], ['string', 'x']])(
    'TL-EP-5: presentation.draftMarkers as %s gives no markers',
    (_name, value) => {
      expect(draftMarkers(makeFile({ presentation: { draftMarkers: value }, metaMarkers: [mm(1)] }), 5)).toEqual([])
    },
  )

  it.each([['undefined', undefined], ['object', {}], ['string', 'x'], ['null', null]])(
    'TL-EP-6: meta editorDraftMarkers as %s gives no markers',
    (_name, value) => {
      expect(draftMarkers(metaFile(value), 5)).toEqual([])
    },
  )

  it('TL-EP-7: field selection follows the shape', () => {
    expect(draftMarkers(presFile([{ timelineIndex: 1, name: 'zq' }]), 5)).toEqual([])
    expect(draftMarkers(metaFile([{ index: 1, name: 'zq' }]), 5)).toEqual([])
  })
})

describe('draftMarkers index boundaries (count 5)', () => {
  it('TL-BVA-1: -1 dropped; 0,1,3,4 kept; 5,6 dropped (both shapes)', () => {
    const all = [-1, 0, 1, 3, 4, 5, 6]
    expect(indexes(metaFile(all.map((i) => mm(i))), 5)).toEqual([0, 1, 3, 4])
    expect(indexes(presFile(all.map((i) => pm(i))), 5)).toEqual([0, 1, 3, 4])
  })

  it('TL-BVA-2: non-integer and non-number indexes are dropped', () => {
    const bad = [1.5, NaN, Infinity, -0.5, '2', null, 2 ** 53]
    expect(draftMarkers(metaFile(bad.map((i) => mm(i))), 5)).toEqual([])
    expect(draftMarkers(presFile(bad.map((i) => pm(i))), 5)).toEqual([])
  })

  it('TL-BVA-2: 2**53 is dropped even when the bound would admit it', () => {
    expect(draftMarkers(presFile([pm(2 ** 53)]), 2 ** 54)).toEqual([])
  })

  it('TL-BVA-3: characterisation: index -0 is KEPT, with index -0', () => {
    const out = draftMarkers(presFile([pm(-0, 'zq')]), 5)
    expect(out).toHaveLength(1)
    expect(Object.is(out[0].index, -0)).toBe(true)
    expect(out[0].label).toBe('zq')
  })
})

describe('draftMarkers count source', () => {
  it('TL-CNT-1: sourceHistoryLength wins over frameCount', () => {
    expect(indexes(presFile([pm(2), pm(3)], { sourceHistoryLength: 3 }), 10)).toEqual([2])
    expect(indexes(metaFile([mm(2), mm(3)], { sourceHistoryLength: 3 }), 10)).toEqual([2])
  })

  it('TL-CNT-2: sourceHistoryLength 0 drops every marker', () => {
    expect(draftMarkers(presFile([pm(0), pm(1)], { sourceHistoryLength: 0 }), 10)).toEqual([])
    expect(draftMarkers(metaFile([mm(0), mm(1)], { sourceHistoryLength: 0 }), 10)).toEqual([])
  })

  it('TL-CNT-3: sourceHistoryLength undefined uses frameCount (frameCount 2)', () => {
    expect(indexes(presFile([pm(0), pm(1), pm(2)]), 2)).toEqual([0, 1])
  })

  it('TL-CNT-4: frameCount 0 with no sourceHistoryLength drops every marker', () => {
    expect(draftMarkers(presFile([pm(0), pm(1)]), 0)).toEqual([])
    expect(draftMarkers(metaFile([mm(0), mm(1)]), 0)).toEqual([])
  })
})

describe('draftMarkers entries and labels', () => {
  it('TL-ENT-1: non-object entries are skipped, valid ones kept in order', () => {
    const raw = [pm(3, 'a'), null, undefined, 3, 'zq', true, pm(1, 'b'), pm(2, 'c')]
    expect(draftMarkers(presFile(raw), 5)).toEqual([
      { index: 3, label: 'a' },
      { index: 1, label: 'b' },
      { index: 2, label: 'c' },
    ])
  })

  it('TL-ENT-2: characterisation: duplicate indexes are both kept, in order', () => {
    expect(draftMarkers(presFile([pm(1, 'zq'), pm(1, 'qv')]), 5)).toEqual([
      { index: 1, label: 'zq' },
      { index: 1, label: 'qv' },
    ])
  })

  it('TL-LBL-1: a non-empty string name is the label', () => {
    expect(draftMarkers(presFile([pm(1, 'zq', 'qv')]), 5)[0].label).toBe('zq')
  })

  it("TL-LBL-2: name '' falls to defaultName", () => {
    expect(draftMarkers(presFile([pm(1, '', 'qv')]), 5)[0].label).toBe('qv')
  })

  it.each([[5], [{}], [null]])('TL-LBL-3: non-string name %p falls to defaultName', (name) => {
    expect(draftMarkers(presFile([pm(1, name, 'qv')]), 5)[0].label).toBe('qv')
  })

  it.each([[''], [undefined], [7], [null]])('TL-LBL-4: no usable name, defaultName %p gives Draft', (dn) => {
    expect(draftMarkers(presFile([pm(1, undefined, dn)]), 5)[0].label).toBe('Draft')
    expect(draftMarkers(presFile([pm(1, '', dn)]), 5)[0].label).toBe('Draft')
  })

  it('TL-LBL-5: output objects have exactly the keys index and label', () => {
    const extra = { index: 1, name: 'zq', defaultName: 'qv', colour: 'zq', id: 9 }
    const out = draftMarkers(presFile([extra]), 5)
    expect(Object.keys(out[0]).sort()).toEqual(['index', 'label'])
    const metaOut = draftMarkers(metaFile([{ timelineIndex: 1, name: 'zq', colour: 'qv' }]), 5)
    expect(Object.keys(metaOut[0]).sort()).toEqual(['index', 'label'])
  })
})

describe('playerFont', () => {
  const defaults = { family: DEFAULT_FONT_FAMILY, size: DEFAULT_FONT_SIZE }

  it('TL-FONT-1: null data gives the defaults (Helvetica, 14)', () => {
    expect(DEFAULT_FONT_FAMILY).toBe('Helvetica')
    expect(DEFAULT_FONT_SIZE).toBe(14)
    expect(playerFont(null)).toEqual({ family: 'Helvetica', size: 14 })
  })

  it.each([[5], [null], [undefined], [''], ['   ']])('TL-FONT-2: family %p gives the default', (family) => {
    expect(playerFont(makeFile({ fontFamily: family, fontSize: 16 })).family).toBe(DEFAULT_FONT_FAMILY)
  })

  it('TL-FONT-2: characterisation: " Lato " is returned untrimmed; Lato is returned as is', () => {
    expect(playerFont(makeFile({ fontFamily: ' Lato ', fontSize: 16 })).family).toBe(' Lato ')
    expect(playerFont(makeFile({ fontFamily: 'Lato', fontSize: 16 })).family).toBe('Lato')
  })

  it.each([
    [0, 14],
    [-1, 14],
    [Number.MIN_VALUE, Number.MIN_VALUE],
    [0.5, 0.5],
    [16, 16],
    [NaN, 14],
    [Infinity, 14],
    ['16', 14],
  ])('TL-FONT-3: size %p gives %p', (size, expected) => {
    expect(playerFont(makeFile({ fontFamily: 'Lato', fontSize: size })).size).toBe(expected)
  })

  it('TL-FONT-4: family and size are independent', () => {
    expect(playerFont(makeFile({ fontFamily: '', fontSize: 16 }))).toEqual({ family: defaults.family, size: 16 })
    expect(playerFont(makeFile({ fontFamily: 'Lato', fontSize: 0 }))).toEqual({ family: 'Lato', size: 14 })
  })
})
