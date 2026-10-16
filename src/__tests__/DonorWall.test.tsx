/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import DonorWall, { PATRONS_UNAVAILABLE } from '../components/DonorWall'
import { Patrons } from '../patrons'

// The patrons as the home and Funding pages show them (#58): from patrons.json, never from the code. Names are
// invented.

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
  jest.restoreAllMocks()
})

const render = async (load: () => Promise<Patrons>) => {
  await act(async () => {
    root.render(<DonorWall load={load}><h2>Thanks</h2></DonorWall>)
  })
}

const items = () => [...container.querySelectorAll('.donor-list li')].map(li => li.textContent)

it('shows the heading it is given, then the names in the order given, then the closing line', async () => {
  await render(async () => ({ patrons: ['Zq Vel', 'Orrin Taf', 'Zq Vel'], closing: 'Anonymous donors' }))
  expect(container.querySelector('h2')?.textContent).toBe('Thanks')
  expect(items()).toEqual(['Zq Vel', 'Orrin Taf', 'Zq Vel', 'Anonymous donors'])
  expect(container.textContent).not.toContain(PATRONS_UNAVAILABLE)
})

it('shows no closing line when there is none', async () => {
  await render(async () => ({ patrons: ['Zq Vel'], closing: null }))
  expect(items()).toEqual(['Zq Vel'])
})

it('says plainly that the list could not be loaded, and shows no names, when it fails', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  await render(async () => { throw new Error('offline') })
  expect(container.textContent).toContain(PATRONS_UNAVAILABLE)
  expect(items()).toEqual([])
  expect(error).toHaveBeenCalledWith('Unable to load the patrons')
})

it('shows nothing in place of the list while it loads', async () => {
  await render(() => new Promise<Patrons>(() => undefined))
  expect(items()).toEqual([])
  expect(container.textContent).toBe('Thanks')
})
