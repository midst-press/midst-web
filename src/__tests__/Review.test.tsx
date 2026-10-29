/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { MemoryRouter } from 'react-router'
import { ApiError } from '../app/api'
import { loadList } from '../app/publisher'
import { decide, reviewSubmissions } from '../app/review'
import Review from '../routes/Review'

// A decision is saved before the lists are read again: whatever those reads do, the page never says otherwise, or the
// decision may be made twice (#127). Found in review of #402 (vivian-1a61bc9a). Names are invented.

jest.mock('../app/config', () => ({ APP_API_URL: 'https://app.invalid', APP_AVAILABLE: true }))
jest.mock('../app/auth', () => ({
  ...jest.requireActual('../app/auth'),
  currentSession: () => ({ idToken: 't', groups: ['publisher'], email: 'zq@example.invalid', expiresAt: Infinity }),
  forgetSession: jest.fn(),
}))
jest.mock('../app/browser', () => ({ browserDeps: () => ({ storage: window.sessionStorage }), authSettings: () => ({}) }))
jest.mock('../app/publisher', () => ({ ...jest.requireActual('../app/publisher'), callerFor: () => jest.fn(), loadList: jest.fn() }))
jest.mock('../app/review', () => ({ ...jest.requireActual('../app/review'), reviewSubmissions: jest.fn(), decide: jest.fn() }))
jest.mock('../components/MidstPlayer/MidstPlayer', () => () => null)

const S = { submissionId: 's1', title: 'Zq xv', author: 'Qz Vb', origin: 'upload', submittedAt: null, status: 'received', note: null }
const unauthorised = () => new ApiError(401, 'unauthorised', 'Please sign in again.')

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

it('a decision saved, then both lists refused with a 401: the page still says the decision was saved', async () => {
  const lists = loadList as jest.Mock
  const submissions = reviewSubmissions as jest.Mock
  // On opening: the poem list cannot be read (quietly), the submissions can.
  lists.mockRejectedValueOnce(new ApiError(500, 'server', 'x'))
  submissions.mockResolvedValueOnce({ submissions: [S] })
  await act(async () => {
    root.render(<MemoryRouter><Review /></MemoryRouter>)
  })

  // After the decision: the submissions refuse at once, the poem list a moment later, so it settles last.
  ;(decide as jest.Mock).mockResolvedValueOnce({ ...S, status: 'accepted' })
  submissions.mockRejectedValueOnce(unauthorised())
  let refusePoems = () => undefined as void
  lists.mockReturnValueOnce(new Promise((_, reject) => { refusePoems = () => reject(unauthorised()) }))
  const accept = container.querySelector('button[aria-label="Accept Zq xv"]') as HTMLButtonElement
  await act(async () => { accept.click() })
  await act(async () => { refusePoems() })

  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'The decision was saved, but the list could not be refreshed. Reload the page to see it.',
  )
})
