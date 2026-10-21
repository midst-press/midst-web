/** @jest-environment jsdom */
// #296: a switch in the player shows or hides the draft markers, on by default, kept in this browser like the
// language choice, and shared by every player on the page.
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { IMidstFile } from '../store/types'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'
import { DRAFT_MARKERS_KEY, resetDraftMarkersPreference, setShowDraftMarkers, storedShowDraftMarkers } from '../draft-markers-preference'

jest.mock('../components/MidstPlayer/player.css', () => ({}), { virtual: true })
jest.mock('../fonts', () => ({ installFonts: jest.fn() }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const file = (markers: IMidstFile['meta']['editorDraftMarkers']): IMidstFile => ({
  editorTimelineFrames: [0, 1, 2].map(i => ({ content: `<p>zq${i}</p>`, lineNumber: 1, timestamp: 1000000 + i * 1000 })),
  meta: {
    editorFontFamily: 'Helvetica',
    editorFontSize: 14,
    editorHighestEverDraftNumber: 1,
    editorTitle: 'zq',
    editorDraftMarkers: markers,
  },
})
const WITH_MARKERS = file([{ timelineIndex: 1, name: 'zq-draft', defaultName: 'Draft 1' }])

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  resetDraftMarkersPreference()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (players: IMidstFile[]) =>
  act(() => {
    root.render(<>{players.map((data, i) => <MidstPlayer key={i} data={data} activePlayer={true} cursorFollowing={false} hasScrollbar={true} />)}</>)
  })
const switches = () => [...container.querySelectorAll<HTMLButtonElement>('[role="switch"]')]
const rows = () => [...container.querySelectorAll<HTMLElement>('.draft-markers')]

test('the markers are shown by default, and the switch says so', () => {
  render([WITH_MARKERS])
  expect(switches()).toHaveLength(1)
  expect(switches()[0].getAttribute('aria-checked')).toBe('true')
  expect(switches()[0].getAttribute('aria-label')).toBe('Show draft markers')
  expect(rows()[0].hidden).toBe(false)
  expect(container.querySelectorAll('.draft-marker')).toHaveLength(1)
})

test('the switch hides the row and its ticks, keeps the choice, and shows them again', () => {
  render([WITH_MARKERS])
  act(() => switches()[0].click())
  expect(switches()[0].getAttribute('aria-checked')).toBe('false')
  expect(rows()[0].hidden).toBe(true)
  expect(localStorage.getItem(DRAFT_MARKERS_KEY)).toBe('false')
  act(() => switches()[0].click())
  expect(rows()[0].hidden).toBe(false)
  expect(localStorage.getItem(DRAFT_MARKERS_KEY)).toBe('true')
})

test('a choice kept in this browser is what the next visit starts with', () => {
  localStorage.setItem(DRAFT_MARKERS_KEY, 'false')
  render([WITH_MARKERS])
  expect(switches()[0].getAttribute('aria-checked')).toBe('false')
  expect(rows()[0].hidden).toBe(true)
})

test('one switch holds for every player on the page', () => {
  render([WITH_MARKERS, WITH_MARKERS])
  act(() => switches()[0].click())
  expect(rows().map(row => row.hidden)).toEqual([true, true])
  expect(switches().map(s => s.getAttribute('aria-checked'))).toEqual(['false', 'false'])
})

test('a poem with no draft markers has no switch', () => {
  render([file([])])
  expect(switches()).toHaveLength(0)
})

test('storage that refuses leaves the markers shown, and a change still holds on this page', () => {
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
  try {
    expect(storedShowDraftMarkers()).toBe(true)
    render([WITH_MARKERS])
    expect(rows()[0].hidden).toBe(false)
    let kept = true
    act(() => { kept = setShowDraftMarkers(false) })
    expect(kept).toBe(false)
    expect(rows()[0].hidden).toBe(true)
  } finally {
    get.mockRestore()
    set.mockRestore()
  }
})
