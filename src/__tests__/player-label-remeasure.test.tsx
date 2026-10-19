/** @jest-environment jsdom */
// The timestamp label is re-measured when its own width changes, not only when its text or the timeline does.
// A web font served from FONTS_URL can finish loading after the label is first measured; the text is the same
// and the timeline the same width, but the label is wider, and a width measured in the fallback font clamps the
// label past the timeline's ends (seen in e2e/timestamp-bounds.spec.ts once the harness loaded the fonts).
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { IMidstFile } from '../store/types'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'

jest.mock('../components/MidstPlayer/player.css', () => ({}), { virtual: true })
jest.mock('../fonts', () => ({ installFonts: jest.fn() }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Records what each observer watches, so the test can fire the observer of one element as a layout change would.
const observed: Array<{ target: Element, callback: () => void }> = []
class RecordingResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe(target: Element) { observed.push({ target, callback: this.callback }) }
  unobserve() { /* not used by the player */ }
  disconnect() {
    for (let i = observed.length - 1; i >= 0; i--) if (observed[i].callback === this.callback) observed.splice(i, 1)
  }
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = RecordingResizeObserver

const FIVE: IMidstFile = {
  editorTimelineFrames: [0, 1, 2, 3, 4].map(i => ({ content: `<p>zq${i}</p>`, lineNumber: 1, timestamp: 1000000 + i * 1000 })),
  meta: { editorFontFamily: 'Helvetica', editorFontSize: 14, editorHighestEverDraftNumber: 0, editorTitle: 'zq', editorDraftMarkers: [] },
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  observed.length = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
})

const width = (el: Element, px: number) => Object.defineProperty(el, 'offsetWidth', { configurable: true, value: px })

test('a label that widens after it was measured is clamped by its new width', () => {
  act(() => { root.render(<MidstPlayer data={FIVE} activePlayer={true} cursorFollowing={false} hasScrollbar={true} />) })
  const skip = container.querySelector<HTMLButtonElement>('[aria-label="Skip to end"]')!
  act(() => { skip.click() })

  const timeline = container.querySelector('.timeline-control')!
  const label = container.querySelector<HTMLElement>('.frame-timestamp')!
  width(timeline, 400)

  // Measured in the fallback font: 40px of 400 is 10%, so the centre is clamped to 95%.
  width(label, 40)
  act(() => { observed.filter(o => o.target === timeline).forEach(o => o.callback()) })
  expect(label.style.left).toBe('95%')

  // The web font arrives: same text, same timeline, the label is now 80px (20%). Only the label's own size changed.
  width(label, 80)
  const onLabel = observed.filter(o => o.target === label)
  expect(onLabel).toHaveLength(1)
  act(() => { onLabel.forEach(o => o.callback()) })
  expect(label.style.left).toBe('90%')
})
