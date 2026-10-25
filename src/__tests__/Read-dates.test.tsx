/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { combineReducers, createStore } from 'redux'
import Read from '../routes/Read'
import { reducer } from '../store/reducer'
import { LOAD_POEM_LIST } from '../store/types'

// The Table of Contents shows each poem's publish date: the date it is sorted by, and the one the publisher edits
// (midst-web #305). It used to show the archive's legacy `date`, so a poem published through the portal showed none.

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const entry = (poemId: string, url: string, fields: object) => ({
  poemId, title: `Zq ${url}`, url, author: 'Qz Vb', highlighted: false, keys: { timelapse: `${poemId}/t.zip`, processNote: null }, ...fields,
})

let container: HTMLDivElement
let root: Root

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

it('shows each poem\'s publish date, never the legacy date, and nothing for a poem without one', () => {
  const store = createStore(combineReducers({ app: reducer }))
  store.dispatch({ type: LOAD_POEM_LIST, payload: { entries: [
    // An archive poem whose two dates differ, a poem published through the portal (no legacy date), and an undated one.
    entry(A, 'zq-a', { publishDate: '2019-03-05', date: '2019-03-04' }),
    entry(B, 'zq-b', { publishDate: '2026-10-20' }),
    entry(C, 'zq-c', { publishDate: null, date: '2018-01-01' }),
  ] } })
  act(() => root.render(<Provider store={store}><MemoryRouter><Read /></MemoryRouter></Provider>))
  const shown = Object.fromEntries([...container.querySelectorAll('a.poem-line')].map(line =>
    [line.getAttribute('href'), line.querySelector('.poem-date')!.textContent!.trim()]))
  expect(shown).toEqual({ '/poem/zq-a/': '03/05/2019', '/poem/zq-b/': '10/20/2026', '/poem/zq-c/': '' })
})
