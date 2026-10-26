/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AnyAction, applyMiddleware, combineReducers, createStore, Middleware } from 'redux'
import ProcessNote, { authorPhotoUrl } from '../components/ProcessNote'
import { MEDIA_URL, POEMS_URL } from '../config'
import { reducer } from '../store/reducer'
import { SET_PROCESS_NOTE_OPEN } from '../store/types'

// The note's Escape handler is removed when the note unmounts (#210). It was added to document.body and removed
// from document, so every mount left one behind.

let container: HTMLDivElement
let root: Root
let closes: number

// Counts every dispatch that closes the note, through the app's own reducer.
const counter: Middleware = () => next => (action: AnyAction) => {
  if (action.type === SET_PROCESS_NOTE_OPEN && action.payload === false) closes += 1
  return next(action)
}
const makeStore = () => createStore(combineReducers({ app: reducer }), applyMiddleware(counter))

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  closes = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const store = makeStore()
const note = (
  <Provider store={store}>
    <MemoryRouter initialEntries={['/zq-poem']}>
      <Routes>
        <Route path="/:poemUrl" element={<ProcessNote />} />
      </Routes>
    </MemoryRouter>
  </Provider>
)
const mount = () => act(() => root.render(note))
const unmount = () => act(() => root.render(<></>))
const escape = () => act(() => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, bubbles: true }))
})

it('closes the note on Escape while it is mounted', () => {
  mount()
  escape()
  expect(closes).toBe(1)
})

it('leaves no Escape handler behind when it unmounts', () => {
  mount()
  unmount()
  escape()
  expect(closes).toBe(0)
})

it('has one Escape handler after a remount, not one per mount', () => {
  mount()
  unmount()
  mount()
  escape()
  expect(closes).toBe(1)
})

describe('authorPhotoUrl (#312)', () => {
  it("is the poem's own photo when the list recorded one, and the archive's author photo otherwise", () => {
    expect(authorPhotoUrl({ authorId: 'qz-vb', keys: { timelapse: 't', processNote: null, photo: 'zq/g1/author-photo.png' } }))
      .toBe(`${POEMS_URL}zq/g1/author-photo.png`)
    expect(authorPhotoUrl({ authorId: 'qz-vb', keys: { timelapse: 't', processNote: null, photo: null } })).toBe(`${MEDIA_URL}qz-vb/qz-vb.jpg`)
    expect(authorPhotoUrl({ authorId: 'qz-vb', keys: undefined })).toBe(`${MEDIA_URL}qz-vb/qz-vb.jpg`)
  })
})
