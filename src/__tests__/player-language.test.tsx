/** @jest-environment jsdom */
// The player's words follow a language chosen while it is showing (midst-web #234), including the editor's label,
// which TipTap sets only when the editor is made. Only English is compiled, so 'zq' stands in for a second catalog.
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { IMidstFile } from '../store/types'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'
import { activateLocale, i18n } from '../i18n'
import { LocaleContext } from '../locale'

jest.mock('../components/MidstPlayer/player.css', () => ({}), { virtual: true })
jest.mock('../fonts', () => ({ installFonts: jest.fn() }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const poem: IMidstFile = {
  editorTimelineFrames: [{ content: '<p>zq</p>', lineNumber: 1, timestamp: Date.UTC(2019, 10, 6) }] as IMidstFile['editorTimelineFrames'],
  meta: { editorFontFamily: 'Helvetica', editorFontSize: 14, editorHighestEverDraftNumber: 0, editorTitle: 'zq', editorDraftMarkers: [] },
}

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
  activateLocale('en')
})

const show = (locale: string) =>
  act(() => {
    root.render(
      <LocaleContext.Provider value={{ locale, choose: () => undefined }}>
        <MidstPlayer data={poem} activePlayer={true} cursorFollowing={false} hasScrollbar={true} />
      </LocaleContext.Provider>
    )
  })

const editorLabel = () => container.querySelector('.editable')?.getAttribute('aria-label')
const timelineLabel = () => container.querySelector('.progress-bar')?.getAttribute('aria-label')

test("a language chosen while the player shows reaches the editor's label and the controls", () => {
  show('en')
  expect(editorLabel()).toBe('Poem replay')
  expect(timelineLabel()).toBe('Timeline')
  i18n.loadAndActivate({ locale: 'zq', messages: { 'player.poemReplay': 'ZQ-REPLAY', 'player.timeline': 'ZQ-TIMELINE' } })
  show('zq')
  expect(editorLabel()).toBe('ZQ-REPLAY')
  expect(timelineLabel()).toBe('ZQ-TIMELINE')
  expect(container.querySelector('.editable')?.classList.contains('editable')).toBe(true)
})
