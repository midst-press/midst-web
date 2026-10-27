import { IMidstFile } from '../../store/types'

export interface DraftMarker {
  index: number
  label: string
}

// The draft markers to show on the timeline. A file in the presentation shape (Format C) keeps them in
// presentation.draftMarkers with `index`; an older file keeps them in meta.editorDraftMarkers with
// `timelineIndex`. A marker that is not an object, or points at no frame of the poem's history, is left out:
// a marker the player cannot place is not drawn somewhere wrong. The label is the poet's name for the draft,
// else its default name, else "Draft".
export function draftMarkers(data: IMidstFile | null, frameCount: number): DraftMarker[] {
  if (!data) return []
  const raw: unknown = data.presentation ? data.presentation.draftMarkers : data.meta.editorDraftMarkers
  if (!Array.isArray(raw)) return []
  // Markers count frames of the poem's own history; a synthetic timeline (sourceHistoryLength 0) has none.
  const count = data.sourceHistoryLength === undefined ? frameCount : data.sourceHistoryLength
  return raw.reduce<DraftMarker[]>((out, marker) => {
    if (!marker || typeof marker !== 'object') return out
    const index = data.presentation ? marker.index : marker.timelineIndex
    if (!Number.isSafeInteger(index) || index < 0 || index >= count) return out
    const label = typeof marker.name === 'string' && marker.name ? marker.name
      : typeof marker.defaultName === 'string' && marker.defaultName ? marker.defaultName : 'Draft'
    out.push({ index, label })
    return out
  }, [])
}

// On a phone, draft marker ticks nearer than `threshold` px apart are one tap target instead of fighting for
// the same space (#256 (b), Annelyse's "One tick"). `centres` are pixel positions index-aligned with the
// draft markers array (as MidstPlayer.tsx computes them from the row's measured width). A marker joins the
// previous marker's group when it is nearer than `threshold` to it IN SORTED ORDER, so a run of close markers
// chains into one group; a marker threshold px or further from its neighbour starts a new group. Each
// returned group lists the markers' array indices, left to right, so group[0] is always its leftmost member -
// the position the merged tick renders at.
export function groupDraftMarkers(centres: readonly number[], threshold: number): number[][] {
  const order = centres.map((_, i) => i).sort((a, b) => centres[a] - centres[b])
  const groups: number[][] = []
  order.forEach((i, k) => {
    if (k > 0 && centres[i] - centres[order[k - 1]] < threshold) groups[groups.length - 1].push(i)
    else groups.push([i])
  })
  return groups
}

export const DEFAULT_FONT_FAMILY = 'Helvetica'
export const DEFAULT_FONT_SIZE = 14

// The font the poem was written in, or the defaults when the file names none that can be used.
export function playerFont(data: IMidstFile | null): { family: string, size: number } {
  const family = data && typeof data.meta.editorFontFamily === 'string' && data.meta.editorFontFamily.trim()
    ? data.meta.editorFontFamily : DEFAULT_FONT_FAMILY
  const size = data && Number.isFinite(data.meta.editorFontSize) && data.meta.editorFontSize > 0
    ? data.meta.editorFontSize : DEFAULT_FONT_SIZE
  return { family, size }
}
