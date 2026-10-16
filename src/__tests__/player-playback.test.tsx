/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { IMidstFile } from '../store/types'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'

jest.mock('../components/MidstPlayer/player.css', () => ({}), { virtual: true })
jest.mock('../fonts', () => ({ installFonts: jest.fn() }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no ResizeObserver; the component constructs one unconditionally for the timestamp label.
class FakeResizeObserver {
  observe() { /* no layout in jsdom */ }
  unobserve() { /* no layout in jsdom */ }
  disconnect() { /* no layout in jsdom */ }
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver

type Marker = { timelineIndex: number, name: string, defaultName: string }

function makeFile(contents: string[], markers: Marker[] = []): IMidstFile {
  return {
    editorTimelineFrames: contents.map((content, i) => ({ content, lineNumber: 1, timestamp: 1000000 + i * 1000 })),
    meta: {
      editorFontFamily: 'Helvetica',
      editorFontSize: 14,
      editorHighestEverDraftNumber: 0,
      editorTitle: 'zq',
      editorDraftMarkers: markers,
    },
  }
}

const FIVE = makeFile([0, 1, 2, 3, 4].map(i => `<p>zq${i}</p>`))

let container: HTMLDivElement
let root: Root
let errorSpy: jest.SpyInstance
let warnSpy: jest.SpyInstance

interface Opts { data: IMidstFile | null, activePlayer?: boolean }

function ui({ data, activePlayer = true }: Opts) {
  return <MidstPlayer data={data} activePlayer={activePlayer} cursorFollowing={false} hasScrollbar={true} />
}

function render(opts: Opts) {
  act(() => { root.render(ui(opts)) })
}

function byLabel<T extends HTMLElement = HTMLElement>(label: string): T {
  const el = container.querySelector<T>(`[aria-label="${label}"]`)
  if (!el) throw new Error(`no element labelled ${label}`)
  return el
}

const queryLabel = (label: string) => container.querySelector(`[aria-label="${label}"]`)
const shown = () => byLabel('Poem replay').textContent
const playButton = () => (queryLabel('Play') ?? queryLabel('Pause')) as HTMLButtonElement
const timeline = () => byLabel<HTMLInputElement>('Timeline')

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
}

function setRange(el: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, String(value))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function advance(ms: number) {
  act(() => { jest.advanceTimersByTime(ms) })
}

function key(target: Element, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true, ...init })
  act(() => { target.dispatchEvent(event) })
  return event
}

beforeEach(() => {
  jest.useFakeTimers()
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  try {
    // Every test: a React or act() warning is a defect.
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  } finally {
    errorSpy.mockRestore()
    warnSpy.mockRestore()
    act(() => { root.unmount() })
    container.remove()
    document.body.innerHTML = ''
    jest.useRealTimers()
  }
})

describe('harness', () => {
  it('fakes performance.now together with timers (timing is deterministic)', () => {
    const before = performance.now()
    jest.advanceTimersByTime(250)
    expect(performance.now() - before).toBe(250)
  })
})

describe('state transitions', () => {
  it('PB-ST-1 initial render shows the last frame, Play, Timeline at maxStep', () => {
    render({ data: FIVE })
    expect(shown()).toBe('zq4')
    expect(playButton().getAttribute('aria-label')).toBe('Play')
    expect(timeline().value).toBe('4')
  })

  it('PB-ST-2 AT_END + Play shows frame 0 at once and the button becomes Pause', () => {
    render({ data: FIVE })
    click(playButton())
    expect(shown()).toBe('zq0')
    expect(playButton().getAttribute('aria-label')).toBe('Pause')
  })

  it('PB-ST-3 PLAYING advances one frame per 60 ms period, never two', () => {
    render({ data: FIVE })
    click(playButton())
    advance(59)
    expect(shown()).toBe('zq0')
    advance(1)
    expect(shown()).toBe('zq1')
    advance(59)
    expect(shown()).toBe('zq1')
    advance(1)
    expect(shown()).toBe('zq2')
  })

  it('PB-ST-4 reaching the last frame returns to Play and further time changes nothing', () => {
    render({ data: FIVE })
    click(playButton())
    advance(60 * 4)
    expect(shown()).toBe('zq4')
    expect(playButton().getAttribute('aria-label')).toBe('Play')
    advance(1000)
    expect(shown()).toBe('zq4')
    expect(playButton().getAttribute('aria-label')).toBe('Play')
  })

  it('PB-ST-5 Pause keeps the frame shown at the click; further time changes nothing', () => {
    render({ data: FIVE })
    click(playButton())
    advance(120)
    expect(shown()).toBe('zq2')
    click(playButton())
    expect(playButton().getAttribute('aria-label')).toBe('Play')
    expect(shown()).toBe('zq2')
    advance(1000)
    expect(shown()).toBe('zq2')
  })

  it('PB-ST-6 PAUSED mid (seeked to 2) + Play continues from 2, not from 0', () => {
    render({ data: FIVE })
    setRange(timeline(), 2)
    expect(shown()).toBe('zq2')
    click(playButton())
    expect(shown()).toBe('zq2')
    advance(60)
    expect(shown()).toBe('zq3')
  })

  it('PB-ST-7 PLAYING + seek to 1 stops playback, shows frame 1, time changes nothing', () => {
    render({ data: FIVE })
    click(playButton())
    advance(120) // playhead is at 2, so seeking to 1 is a real change (an unchanged value fires no change event)
    setRange(timeline(), 1)
    expect(playButton().getAttribute('aria-label')).toBe('Play')
    expect(shown()).toBe('zq1')
    advance(1000)
    expect(shown()).toBe('zq1')
  })

  it('PB-ST-8 PLAYING + Skip to start -> frame 0 stopped; Skip to end -> frame 4 stopped', () => {
    render({ data: FIVE })
    click(playButton())
    advance(120)
    click(byLabel('Skip to start'))
    expect(shown()).toBe('zq0')
    expect(playButton().getAttribute('aria-label')).toBe('Play')
    advance(1000)
    expect(shown()).toBe('zq0')

    click(playButton())
    advance(60)
    click(byLabel('Skip to end'))
    expect(shown()).toBe('zq4')
    expect(playButton().getAttribute('aria-label')).toBe('Play')
    advance(1000)
    expect(shown()).toBe('zq4')
  })

  it('PB-ST-9 PLAYING + activePlayer false stops advancing and disables the button', () => {
    render({ data: FIVE })
    click(playButton())
    advance(60)
    expect(shown()).toBe('zq1')
    render({ data: FIVE, activePlayer: false })
    const frozen = shown()
    advance(1000)
    expect(shown()).toBe(frozen)
    expect(playButton().disabled).toBe(true)
  })

  // Every poem is mounted in the carousel and only the one on screen is active. Coming back to a poem must not
  // start it playing on its own.
  it('PB-ST-9b PLAYING, made inactive, then active again: stays paused, does not resume by itself', () => {
    render({ data: FIVE })
    click(playButton())
    advance(60)
    render({ data: FIVE, activePlayer: false })
    const frozen = shown()
    render({ data: FIVE, activePlayer: true })
    expect(playButton().getAttribute('aria-label')).toBe('Play')
    advance(1000)
    expect(shown()).toBe(frozen)
  })

  it('PB-ST-10 PLAYING + data replaced by a 3-frame file shows its last frame, Play, stopped', () => {
    render({ data: FIVE })
    click(playButton())
    advance(60)
    const other = makeFile([0, 1, 2].map(i => `<p>qv${i}</p>`))
    render({ data: other })
    expect(shown()).toBe('qv2')
    expect(playButton().getAttribute('aria-label')).toBe('Play')
    advance(1000)
    expect(shown()).toBe('qv2')
  })

  it('PB-ST-11 PLAYING + unmount: later time raises no error and no console output', () => {
    render({ data: FIVE })
    click(playButton())
    advance(60)
    act(() => { root.unmount() })
    expect(() => advance(1000)).not.toThrow()
    // afterEach asserts no console.error / console.warn; re-create root so its unmount has something to do.
    root = createRoot(container)
  })
})

describe('input partitions', () => {
  function allDisabled() {
    for (const label of ['Skip to start', 'Skip to end', 'Playback speed']) {
      expect([label, (byLabel(label) as HTMLButtonElement).disabled]).toEqual([label, true])
    }
    expect(playButton().disabled).toBe(true)
    expect(timeline().disabled).toBe(true)
  }

  it('PB-EP-1 data null: editor empty, every control disabled', () => {
    render({ data: null })
    expect(shown()).toBe('')
    allDisabled()
  })

  it('PB-EP-2 one frame: shows it; Play, Skip and Timeline disabled', () => {
    render({ data: makeFile(['<p>zq0</p>']) })
    expect(shown()).toBe('zq0')
    allDisabled()
  })

  it('PB-EP-3 zero frames: editor empty, controls disabled', () => {
    render({ data: makeFile([]) })
    expect(shown()).toBe('')
    allDisabled()
  })

  it('PB-EP-4 two frames: Play enabled; playing reaches the end after one period', () => {
    render({ data: makeFile(['<p>zq0</p>', '<p>zq1</p>']) })
    expect(playButton().disabled).toBe(false)
    expect(shown()).toBe('zq1')
    click(playButton())
    expect(shown()).toBe('zq0')
    advance(60)
    expect(shown()).toBe('zq1')
    expect(playButton().getAttribute('aria-label')).toBe('Play')
  })

  it('PB-EP-5 activePlayer false with 5 frames: controls disabled, spacebar does nothing', () => {
    render({ data: FIVE, activePlayer: false })
    allDisabled()
    key(document.body)
    expect(playButton().getAttribute('aria-label')).toBe('Play')
    expect(shown()).toBe('zq4')
  })
})

describe('content fidelity', () => {
  it('PB-CF-1 a tab inside a frame is kept (preserveWhitespace)', () => {
    render({ data: makeFile(['<p>zq0</p>', '<p>zq\tqv</p>']) })
    expect(shown()).toBe('zq\tqv')
  })

  it('PB-CF-2 seeking to each index 0..4 shows that frame', () => {
    render({ data: FIVE })
    for (const i of [0, 1, 2, 3, 4]) {
      setRange(timeline(), i)
      expect(shown()).toBe(`zq${i}`)
    }
  })
})

describe('draft markers', () => {
  const markers: Marker[] = [
    { timelineIndex: 1, name: 'zqa', defaultName: 'Draft 1' },
    { timelineIndex: 3, name: 'zqb', defaultName: 'Draft 2' },
  ]
  const withMarkers = makeFile([0, 1, 2, 3, 4].map(i => `<p>zq${i}</p>`), markers)

  it('PB-DM-1 two marker buttons; clicking one shows that frame and stops playback', () => {
    render({ data: withMarkers })
    expect(container.querySelectorAll('.draft-marker').length).toBe(2)
    expect(queryLabel('Jump to zqa')).not.toBeNull()
    click(playButton())
    advance(60)
    click(byLabel('Jump to zqb'))
    expect(shown()).toBe('zq3')
    expect(playButton().getAttribute('aria-label')).toBe('Play')
    advance(1000)
    expect(shown()).toBe('zq3')
    click(byLabel('Jump to zqa'))
    expect(shown()).toBe('zq1')
  })

  it('PB-DM-2 marker buttons are disabled when activePlayer is false', () => {
    render({ data: withMarkers, activePlayer: false })
    const buttons = container.querySelectorAll<HTMLButtonElement>('.draft-marker')
    expect(buttons.length).toBe(2)
    buttons.forEach(b => expect(b.disabled).toBe(true))
  })
})

describe('spacebar', () => {
  it('PB-SP-1 space on document.body toggles Play/Pause', () => {
    render({ data: FIVE })
    key(document.body)
    expect(playButton().getAttribute('aria-label')).toBe('Pause')
    key(document.body)
    expect(playButton().getAttribute('aria-label')).toBe('Play')
  })

  describe('PB-SP-2 ignored when', () => {
    // Targets outside the component: the controls bar stops keydown propagation, so a key pressed on
    // the player's own buttons never reaches the document listener at all.
    const cases: Array<[string, () => Element, KeyboardEventInit]> = [
      ['event.repeat is true', () => document.body, { repeat: true }],
      ['ctrlKey', () => document.body, { ctrlKey: true }],
      ['altKey', () => document.body, { altKey: true }],
      ['metaKey', () => document.body, { metaKey: true }],
      ['target is a button', () => {
        const b = document.createElement('button'); document.body.appendChild(b); return b
      }, {}],
      ['target is an input', () => {
        const i = document.createElement('input'); document.body.appendChild(i); return i
      }, {}],
    ]
    it.each(cases)('PB-SP-2 %s', (_name, target, init) => {
      render({ data: FIVE })
      const event = key(target(), init)
      expect(playButton().getAttribute('aria-label')).toBe('Play')
      expect(event.defaultPrevented).toBe(false)
    })

    it('PB-SP-2 event.defaultPrevented already true', () => {
      render({ data: FIVE })
      const prevent = (e: Event) => e.preventDefault()
      document.body.addEventListener('keydown', prevent)
      try {
        key(document.body)
      } finally {
        document.body.removeEventListener('keydown', prevent)
      }
      expect(playButton().getAttribute('aria-label')).toBe('Play')
    })
  })

  it('PB-SP-3 a handled space calls preventDefault', () => {
    render({ data: FIVE })
    const event = key(document.body)
    expect(playButton().getAttribute('aria-label')).toBe('Pause')
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('speed', () => {
  function openSpeed() {
    click(byLabel('Playback speed'))
  }

  it('PB-SPD-1 Playback speed opens the popup; Escape inside it closes it', () => {
    render({ data: FIVE })
    expect(byLabel('Playback speed').getAttribute('aria-expanded')).toBe('false')
    openSpeed()
    expect(byLabel('Playback speed').getAttribute('aria-expanded')).toBe('true')
    expect(queryLabel('Playback frame rate')).not.toBeNull()
    key(byLabel('Playback frame rate'), { key: 'Escape' })
    expect(byLabel('Playback speed').getAttribute('aria-expanded')).toBe('false')
    expect(queryLabel('Playback frame rate')).toBeNull()
  })

  it('PB-SPD-2 frame rate 1 makes the period 1000 ms (first tick measured from Play)', () => {
    render({ data: FIVE })
    openSpeed()
    setRange(byLabel<HTMLInputElement>('Playback frame rate'), 1)
    click(playButton())
    expect(shown()).toBe('zq0')
    advance(999)
    expect(shown()).toBe('zq0')
    advance(1)
    expect(shown()).toBe('zq1')
    advance(999)
    expect(shown()).toBe('zq1')
    advance(1)
    expect(shown()).toBe('zq2')
  })

  it('PB-SPD-3 frame rate 60 makes the period 17 ms', () => {
    render({ data: FIVE })
    openSpeed()
    setRange(byLabel<HTMLInputElement>('Playback frame rate'), 60)
    click(playButton())
    expect(shown()).toBe('zq0')
    advance(16)
    expect(shown()).toBe('zq0')
    advance(1)
    expect(shown()).toBe('zq1')
    advance(17)
    expect(shown()).toBe('zq2')
  })
})
