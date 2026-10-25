/** @jest-environment jsdom */
// midst-web #303: a poem's address under /read goes to its page under /poem, by a real request, so the edge can follow
// old links for /poem/* (cora-2f1e43dc, review of #317).
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { MemoryRouter, Routes, Route } from 'react-router'
import ReadRedirect from '../components/ReadRedirect'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

// Where the page asked the browser to go, and what the router showed meanwhile.
const at = (path: string) => {
  const went: string[] = []
  act(() => root.render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/read/:poemUrl" element={<ReadRedirect go={url => went.push(url)} />} />
        <Route path="/poem/:poemUrl" element={<p id="routed">routed</p>} />
        <Route path="/read" element={<p id="toc">table of contents</p>} />
      </Routes>
    </MemoryRouter>,
  ))
  return { went, routed: host.querySelector('#routed') !== null, toc: host.querySelector('#toc') !== null }
}

describe('ReadRedirect', () => {
  it('asks the browser for /poem/<poem>/, once, and never routes there inside the page', () => {
    expect(at('/read/zq-rain--zq-au')).toEqual({ went: ['/poem/zq-rain--zq-au/'], routed: false, toc: false })
  })

  it('takes a trailing slash, and keeps the query and fragment', () => {
    expect(at('/read/zq-rain--zq-au/?t=3#note').went).toEqual(['/poem/zq-rain--zq-au/?t=3#note'])
  })

  it('leaves /read itself as the Table of Contents', () => {
    expect(at('/read')).toEqual({ went: [], routed: false, toc: true })
  })
})
