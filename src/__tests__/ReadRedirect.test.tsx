/** @jest-environment jsdom */
// midst-web #303: a poem's address under /read goes to its page under /poem.
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import ReadRedirect from '../components/ReadRedirect'

function Where() {
  return <p id="where">{useLocation().pathname}</p>
}

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

const at = (path: string) => {
  act(() => root.render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/read/:poemUrl" element={<ReadRedirect />} />
        <Route path="/poem/:poemUrl" element={<Where />} />
        <Route path="/read" element={<p id="where">table of contents</p>} />
      </Routes>
    </MemoryRouter>,
  ))
  return host.querySelector('#where')?.textContent
}

describe('ReadRedirect', () => {
  it('sends /read/<poem> to /poem/<poem>/', () => {
    expect(at('/read/zq-rain--zq-au')).toBe('/poem/zq-rain--zq-au/')
  })

  it('takes a trailing slash too', () => {
    expect(at('/read/zq-rain--zq-au/')).toBe('/poem/zq-rain--zq-au/')
  })

  it('leaves /read itself as the Table of Contents', () => {
    expect(at('/read')).toBe('table of contents')
  })
})
