/** @jest-environment jsdom */
// #324: the draft markers are off by default; the switch shows them for that poem only, and nothing is remembered.
// #325: Space on the switch plays and pauses, as everywhere else in the player; only a click or Enter switches it.
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { IMidstFile } from '../store/types'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'

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
const playButtons = () => [...container.querySelectorAll<HTMLButtonElement>('.play-pause-button')]
const keyDown = (target: Element, key: string) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => { target.dispatchEvent(event) })
  return event
}

test('the markers are off by default, and the switch says so', () => {
  render([WITH_MARKERS])
  expect(switches()).toHaveLength(1)
  expect(switches()[0].getAttribute('aria-checked')).toBe('false')
  expect(switches()[0].getAttribute('aria-label')).toBe('Show draft markers')
  expect(rows()[0].hidden).toBe(true)
})

test('the switch shows the row and hides it again, and nothing is kept in the browser', () => {
  render([WITH_MARKERS])
  act(() => switches()[0].click())
  expect(switches()[0].getAttribute('aria-checked')).toBe('true')
  expect(rows()[0].hidden).toBe(false)
  expect(container.querySelectorAll('.draft-marker')).toHaveLength(1)
  act(() => switches()[0].click())
  expect(rows()[0].hidden).toBe(true)
  expect(localStorage.length).toBe(0)
})

test('each poem has its own: turning one on leaves the other off', () => {
  render([WITH_MARKERS, WITH_MARKERS])
  act(() => switches()[0].click())
  expect(rows().map(row => row.hidden)).toEqual([false, true])
  expect(switches().map(s => s.getAttribute('aria-checked'))).toEqual(['true', 'false'])
})

test('a reload, or another poem in the same player, starts with them off again', () => {
  render([WITH_MARKERS])
  act(() => switches()[0].click())
  act(() => root.unmount())
  root = createRoot(container)
  render([WITH_MARKERS])
  expect(rows()[0].hidden).toBe(true)
  act(() => switches()[0].click())
  render([file([{ timelineIndex: 2, name: 'vb-draft', defaultName: 'Draft 1' }])])
  expect(switches()[0].getAttribute('aria-checked')).toBe('false')
  expect(rows()[0].hidden).toBe(true)
})

test('a poem with no draft markers has no switch', () => {
  render([file([])])
  expect(switches()).toHaveLength(0)
})

test('Space on the switch plays and pauses and never switches it; Enter is left to the button', () => {
  render([WITH_MARKERS])
  const play = () => playButtons()[0].getAttribute('aria-label')
  expect(play()).toBe('Play')
  const space = keyDown(switches()[0], ' ')
  expect(space.defaultPrevented).toBe(true) // so the button does not click itself on keyup
  expect(play()).toBe('Pause')
  expect(switches()[0].getAttribute('aria-checked')).toBe('false')
  keyDown(switches()[0], ' ')
  expect(play()).toBe('Play')
  expect(rows()[0].hidden).toBe(true)
  // Enter is left to the button itself, which clicks it.
  expect(keyDown(switches()[0], 'Enter').defaultPrevented).toBe(false)
})
