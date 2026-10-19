/** @jest-environment jsdom */
// The edit time under the timeline (#225): the time over the date, and the same two read to a screen reader as one
// value. editTime's own cases are in edit-time.test.ts; this is how the player shows what it returns.
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { IMidstFile } from '../store/types'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'
import { editTime } from '../components/MidstPlayer/edit-time'

jest.mock('../components/MidstPlayer/player.css', () => ({}), { virtual: true })
jest.mock('../fonts', () => ({ installFonts: jest.fn() }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const AT = Date.UTC(2019, 10, 6, 1, 19)
const poem = (timestamps: Array<number | undefined>, sourceHistoryLength?: number): IMidstFile => ({
  editorTimelineFrames: timestamps.map((timestamp, i) => ({ content: `<p>zq${i}</p>`, lineNumber: 1, timestamp })) as IMidstFile['editorTimelineFrames'],
  meta: { editorFontFamily: 'Helvetica', editorFontSize: 14, editorHighestEverDraftNumber: 0, editorTitle: 'zq', editorDraftMarkers: [] },
  ...(sourceHistoryLength === undefined ? {} : { sourceHistoryLength }),
})

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

const show = (data: IMidstFile) => {
  act(() => { root.render(<MidstPlayer data={data} activePlayer={true} cursorFollowing={false} hasScrollbar={true} />) })
  return {
    label: container.querySelector<HTMLElement>('.frame-timestamp')!,
    valuetext: container.querySelector('.progress-bar')!.getAttribute('aria-valuetext'),
  }
}

test('shows the time over the date, and reads them as one value', () => {
  const { time, date } = editTime(AT, 'en')
  const { label, valuetext } = show(poem([AT, AT + 1000]))
  expect(Array.from(label.children, child => [child.className, child.textContent])).toEqual([
    ['frame-timestamp-time', time],
    ['frame-timestamp-date', date],
  ])
  expect(valuetext).toBe(`${time}, ${date}`)
  expect(label.classList.contains('frame-timestamp--unavailable')).toBe(false)
})

test('a frame with no edit time says so, on one line', () => {
  const { label, valuetext } = show(poem([undefined, undefined]))
  expect(label.children).toHaveLength(0)
  expect(label.textContent).toBe('edit time unavailable')
  expect(valuetext).toBe('edit time unavailable')
  expect(label.classList.contains('frame-timestamp--unavailable')).toBe(true)
})
