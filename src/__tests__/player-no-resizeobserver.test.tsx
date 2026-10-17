/** @jest-environment jsdom */
// #146: where ResizeObserver does not exist, the player still renders. Neither the draft-marker row's effect nor the
// edit-time label's may construct one; a throw during commit would unmount the tree and the poem would not show.
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { IMidstFile } from '../store/types'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'

jest.mock('../components/MidstPlayer/player.css', () => ({}), { virtual: true })
jest.mock('../fonts', () => ({ installFonts: jest.fn() }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const FILE: IMidstFile = {
  editorTimelineFrames: [0, 1, 2].map(i => ({ content: `<p>zq${i}</p>`, lineNumber: 1, timestamp: 1000000 + i * 1000 })),
  meta: {
    editorFontFamily: 'Helvetica',
    editorFontSize: 14,
    editorHighestEverDraftNumber: 1,
    editorTitle: 'zq',
    editorDraftMarkers: [{ timelineIndex: 1, name: 'zq-draft', defaultName: 'Draft 1' }],
  },
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

test('the player renders with no ResizeObserver', () => {
  expect(typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver).toBe('undefined')
  act(() => {
    root.render(<MidstPlayer data={FILE} activePlayer={true} cursorFollowing={false} hasScrollbar={true} />)
  })
  expect(container.querySelector('[aria-label="Poem replay"]')).not.toBeNull()
  expect(container.querySelector('[aria-label="Timeline"]')).not.toBeNull()
})
