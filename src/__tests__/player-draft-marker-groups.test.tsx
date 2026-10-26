/** @jest-environment jsdom */
// #256 (b) (Annelyse, "One tick"): on a phone, draft marker ticks nearer than 24px apart merge into one tap
// target that lists their drafts. e2e/draft-markers.spec.ts covers the real layout end to end; this covers the
// group button, its popover, and the ways it closes, with jsdom's layout faked (no real CSS box model here).
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { IMidstFile } from '../store/types'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'

jest.mock('../components/MidstPlayer/player.css', () => ({}), { virtual: true })
jest.mock('../fonts', () => ({ installFonts: jest.fn() }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom never lays anything out, so every element reports the same width: enough that the player's own
// layout effect (useLayoutEffect in MidstPlayer.tsx) has a real number to compute centres from.
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 200 })

// The player reads window.matchMedia(PHONE_QUERY).matches once, synchronously, in the same effect. Every query
// matches here: this file is only about the phone layout, never the desktop one (e2e already covers desktop).
;(globalThis as { matchMedia?: unknown }).matchMedia = (media: string) => ({
  matches: true,
  media,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
})

// jsdom has no ResizeObserver; the component constructs one unconditionally for the marker row and the label.
class FakeResizeObserver {
  observe() { /* no layout in jsdom */ }
  unobserve() { /* no layout in jsdom */ }
  disconnect() { /* no layout in jsdom */ }
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver

type Marker = { timelineIndex: number, name: string, defaultName: string }

function makeFile(frameCount: number, markers: Marker[]): IMidstFile {
  return {
    editorTimelineFrames: Array.from({ length: frameCount }, (_, i) => ({
      content: `<p>zq${i}</p>`, lineNumber: 1, timestamp: 1000000 + i * 1000,
    })),
    meta: {
      editorFontFamily: 'Helvetica', editorFontSize: 14, editorHighestEverDraftNumber: markers.length,
      editorTitle: 'zq', editorDraftMarkers: markers,
    },
  }
}

// 11 frames (maxStep 10) at the 200px clientWidth stubbed above: 20px per step. Markers 5 and 6 are 20px apart
// (under the 24px merge threshold, #256 (b)) and merge; marker 0 is 100px from the merged group's leader and
// stays its own tick.
const CLOSE_PAIR: Marker[] = [
  { timelineIndex: 5, name: 'zq near one', defaultName: 'Draft 1' },
  { timelineIndex: 6, name: 'zq near two', defaultName: 'Draft 2' },
]
const WITH_FAR_MARKER = makeFile(11, [
  { timelineIndex: 0, name: 'zq far', defaultName: 'Draft 0' },
  ...CLOSE_PAIR,
])

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
})

function render(data: IMidstFile) {
  act(() => {
    root.render(<MidstPlayer data={data} activePlayer={true} cursorFollowing={false} hasScrollbar={true} />)
  })
}

const byLabel = (label: string) => container.querySelector(`[aria-label="${label}"]`)
const shown = () => container.querySelector('[aria-label="Poem replay"]')!.textContent

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
}

function keyDown(target: Element, key: string) {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
}

function pointerDownOutside() {
  act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
}

describe('a single marker far from the merged pair', () => {
  it('GRP-1 renders as its own plain tick, not a group button', () => {
    render(WITH_FAR_MARKER)
    const ticks = container.querySelectorAll('.draft-marker')
    expect(ticks).toHaveLength(2) // the far marker, plus one merged tick for the close pair
    expect(container.querySelectorAll('.draft-marker-group-button')).toHaveLength(1)
    const far = byLabel('Jump to zq far')!
    expect(far.className).toBe('draft-marker')
    expect(far.getAttribute('aria-haspopup')).toBeNull()
  })
})

describe('a group button for ticks nearer than 24px apart', () => {
  it('GRP-2 has the accessible name: how many drafts it holds', () => {
    render(WITH_FAR_MARKER)
    const group = container.querySelector('.draft-marker-group-button')!
    expect(group.getAttribute('aria-haspopup')).toBe('true')
    expect(group.getAttribute('aria-expanded')).toBe('false')
    expect(group.getAttribute('aria-label')).toBe('2 drafts here')
  })

  it('GRP-3 opens its list on click, and the list closes on a second click', () => {
    render(WITH_FAR_MARKER)
    const group = container.querySelector('.draft-marker-group-button')!
    expect(container.querySelectorAll('.draft-marker-group-item')).toHaveLength(0)

    click(group)
    expect(group.getAttribute('aria-expanded')).toBe('true')
    const items = container.querySelectorAll<HTMLButtonElement>('.draft-marker-group-item')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('zq near one')
    expect(items[1].textContent).toBe('zq near two')

    click(group)
    expect(group.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelectorAll('.draft-marker-group-item')).toHaveLength(0)
  })

  it('GRP-4 picking a listed draft jumps to it, exactly as a single marker does, and closes the list', () => {
    render(WITH_FAR_MARKER)
    const group = container.querySelector('.draft-marker-group-button')!
    click(group)
    const items = container.querySelectorAll<HTMLButtonElement>('.draft-marker-group-item')
    click(items[1]) // 'zq near two', timelineIndex 6
    expect(shown()).toBe('zq6')
    expect(group.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelectorAll('.draft-marker-group-item')).toHaveLength(0)
  })

  it('GRP-5 Escape closes the list, without jumping anywhere', () => {
    render(WITH_FAR_MARKER)
    const group = container.querySelector('.draft-marker-group-button')!
    click(group)
    expect(group.getAttribute('aria-expanded')).toBe('true')
    keyDown(group, 'Escape')
    expect(group.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelectorAll('.draft-marker-group-item')).toHaveLength(0)
    // The last frame, where every poem opens (#256 is silent on the playhead; only the list closed).
    expect(shown()).toBe('zq10')
  })

  it('GRP-6 a pointerdown outside the group closes the list', () => {
    render(WITH_FAR_MARKER)
    const group = container.querySelector('.draft-marker-group-button')!
    click(group)
    expect(group.getAttribute('aria-expanded')).toBe('true')
    pointerDownOutside()
    expect(group.getAttribute('aria-expanded')).toBe('false')
  })

  it('GRP-7 a pointerdown inside the open list does not close it', () => {
    render(WITH_FAR_MARKER)
    const group = container.querySelector('.draft-marker-group-button')!
    click(group)
    const items = container.querySelectorAll<HTMLButtonElement>('.draft-marker-group-item')
    act(() => { items[0].dispatchEvent(new Event('pointerdown', { bubbles: true })) })
    expect(group.getAttribute('aria-expanded')).toBe('true')
  })

  it('GRP-8 hiding the markers closes an open list', () => {
    render(WITH_FAR_MARKER)
    const toggle = byLabel('Show draft markers')!
    click(toggle) // off by default (#324): show them first, as a reader would before ever opening a list
    const group = container.querySelector('.draft-marker-group-button')!
    click(group)
    expect(group.getAttribute('aria-expanded')).toBe('true')
    click(toggle) // and hide them again
    expect(container.querySelector('.draft-marker-group-button')!.getAttribute('aria-expanded')).toBe('false')
  })
})
