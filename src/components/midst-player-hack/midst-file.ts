import { IMidstCurrentFile, IMidstFile, IMidstTimelineFrame } from '../../store/types'

function invalidFile(): never {
  // JSON parser diagnostics can include excerpts of a poet's work.
  throw new Error('Invalid or unsupported Midst file')
}

export function cursorParagraphIndex(sizes: number[], position: number): number {
  let offset = 0
  for (let index = 0; index < sizes.length; index += 1) {
    if (position <= offset + sizes[index]) return index
    offset += sizes[index]
  }
  return Math.max(0, sizes.length - 1)
}

export function playbackFile(data: IMidstFile | IMidstCurrentFile): IMidstFile {
  if (!data || typeof data !== 'object') return invalidFile()
  if ('editorTimelineFrames' in data) {
    if (!Array.isArray(data.editorTimelineFrames) || !data.meta) return invalidFile()
    return data
  }
  if (typeof data.text !== 'string' || !Array.isArray(data.history)) return invalidFile()

  let content = ''
  const frames: IMidstTimelineFrame[] = data.history.map(change => {
    if (!change || typeof change.inserted !== 'string'
      || !Number.isSafeInteger(change.front) || change.front < 0
      || !Number.isSafeInteger(change.end) || change.end < 0
      || change.front + change.end > content.length
      || (change.pos !== undefined && (!Number.isSafeInteger(change.pos) || change.pos < 0))
      || (typeof change.t !== 'string' && typeof change.t !== 'number')) return invalidFile()
    const timestamp = new Date(change.t).getTime()
    if (!Number.isFinite(timestamp)) return invalidFile()
    // Same step as midst-editor's tracking/utils.ts; offsets count UTF-16 code units.
    content = content.slice(0, change.front) + change.inserted + content.slice(content.length - change.end)
    return { content, timestamp, lineNumber: 0, cursorPosition: change.pos ?? 0 }
  })
  if (frames.length && content !== data.text) return invalidFile()
  // An empty history is a static document, not a zero-length slider timeline.
  if (!frames.length) frames.push({ content: data.text, timestamp: 0, lineNumber: 0, cursorPosition: 0 })
  return {
    editorTimelineFrames: frames,
    meta: {
      editorDraftMarkers: [],
      editorFontFamily: 'Helvetica',
      editorFontSize: 14,
      editorHighestEverDraftNumber: 0,
      editorTitle: 'Untitled',
    },
  }
}

export function parseMidstFile(raw: string): IMidstFile {
  try {
    let json = raw.replace(/^\uFEFF/, '').trim()
    if (json.startsWith('midstVersion:')) {
      const header = /^midstVersion: (1|v0\.0\.1)\r?\n/.exec(json)
      if (!header) return invalidFile()
      json = json.slice(header[0].length)
    }
    return playbackFile(JSON.parse(json))
  } catch {
    return invalidFile()
  }
}
