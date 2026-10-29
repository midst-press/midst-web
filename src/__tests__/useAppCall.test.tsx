/** @jest-environment jsdom */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { ApiError } from '../app/api'
import { forgetSession } from '../app/auth'
import { problemText, sessionExpired, useAppCall, AppCallOptions } from '../app/useAppCall'

// The one scaffold round the app pages' API calls (#387): busy, notice and problem, the 401 path, and the guard.

jest.mock('../app/auth', () => ({ ...jest.requireActual('../app/auth'), forgetSession: jest.fn() }))
// jsdom has no fetch for browserDeps to bind; the 401 path needs only the storage.
jest.mock('../app/browser', () => ({ browserDeps: () => ({ storage: window.sessionStorage }) }))
const forgot = forgetSession as jest.Mock

let container: HTMLDivElement
let root: Root
let hook: ReturnType<typeof useAppCall>

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  forgot.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function Probe(props: AppCallOptions) {
  hook = useAppCall(props)
  return null
}
const mount = async (props: AppCallOptions = {}) => {
  await act(async () => { root.render(<Probe {...props} />) })
}
const unauthorised = new ApiError(401, 'unauthorised', 'Please sign in again.')

describe('sessionExpired and problemText', () => {
  it('forgets the session on a 401 only, and says whether it did', () => {
    expect(sessionExpired(unauthorised)).toBe(true)
    expect(forgot).toHaveBeenCalledTimes(1)
    expect(sessionExpired(new ApiError(403, 'forbidden', 'Your account cannot do that.'))).toBe(false)
    expect(sessionExpired(new Error('x'))).toBe(false)
    expect(forgot).toHaveBeenCalledTimes(1)
  })

  it("says the API's message, or the page's fallback for anything else", () => {
    expect(problemText(new ApiError(500, 'server', 'Zq on our side.'), 'Fallback.')).toBe('Zq on our side.')
    expect(problemText(new TypeError('x'), 'Fallback.')).toBe('Fallback.')
  })
})

describe('useAppCall: run', () => {
  it('is busy while the work runs, clears the last notice and problem first, and keeps what the work says', async () => {
    await mount()
    act(() => { hook.setNotice('Old notice.'); hook.setProblem('Old problem.') })
    let finish = () => undefined as void
    let done: Promise<boolean> = Promise.resolve(false)
    act(() => {
      done = hook.run(() => new Promise<void>(resolve => { finish = resolve }).then(() => hook.setNotice('Saved.')), 'Fallback.')
    })
    expect([hook.busy, hook.notice, hook.problem]).toEqual([true, null, null])
    await act(async () => { finish(); await done })
    expect(await done).toBe(true)
    expect([hook.busy, hook.notice, hook.problem]).toEqual([false, 'Saved.', null])
  })

  it("says the API's message, or the fallback, and is not busy after a failure", async () => {
    await mount()
    let ok = true
    await act(async () => { ok = await hook.run(async () => { throw new ApiError(500, 'server', 'Zq on our side.') }, 'Fallback.') })
    expect(ok).toBe(false)
    expect([hook.busy, hook.problem]).toEqual([false, 'Zq on our side.'])
    await act(async () => { await hook.run(async () => { throw new TypeError('x') }, 'Fallback.') })
    expect(hook.problem).toBe('Fallback.')
  })

  it("lets the page say its own words for an error, and keeps the usual ones when it does not", async () => {
    await mount()
    const onError = jest.fn((error: unknown) => (error instanceof ApiError && error.code === 'conflict' ? 'Zq conflict.' : undefined))
    await act(async () => { await hook.run(async () => { throw new ApiError(409, 'conflict', 'x') }, 'Fallback.', onError) })
    expect(hook.problem).toBe('Zq conflict.')
    await act(async () => { await hook.run(async () => { throw new ApiError(400, 'bad', 'Zq bad.') }, 'Fallback.', onError) })
    expect(hook.problem).toBe('Zq bad.')
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('waits for a page that reloads before it speaks, and stays busy until then', async () => {
    await mount()
    let reloaded = () => undefined as void
    let done: Promise<boolean> = Promise.resolve(true)
    await act(async () => {
      done = hook.run(async () => { throw new TypeError('x') }, 'Fallback.', () =>
        new Promise<string>(resolve => { reloaded = () => resolve('Zq after reload.') }))
    })
    expect([hook.busy, hook.problem]).toEqual([true, null])
    await act(async () => { reloaded(); await done })
    expect([hook.busy, hook.problem]).toEqual([false, 'Zq after reload.'])
  })

  it("says the usual message when the page's own handling itself fails, and does not reject", async () => {
    await mount()
    let ok = true
    await act(async () => {
      ok = await hook.run(async () => { throw new ApiError(500, 'server', 'Zq on our side.') }, 'Fallback.', async () => {
        throw new Error('the reload failed too')
      })
    })
    expect(ok).toBe(false)
    expect([hook.busy, hook.problem]).toEqual([false, 'Zq on our side.'])
  })

  it('forgets the session on a 401, then says the message', async () => {
    await mount()
    await act(async () => { await hook.run(async () => { throw unauthorised }, 'Fallback.') })
    expect(forgot).toHaveBeenCalledTimes(1)
    expect(hook.problem).toBe('Please sign in again.')
  })

  it("in a section, a failure goes to the page's handler instead of forgetting here", async () => {
    const onExpired = jest.fn()
    await mount({ onExpired })
    await act(async () => { await hook.run(async () => { throw unauthorised }, 'Fallback.') })
    expect(onExpired).toHaveBeenCalledWith(unauthorised)
    expect(forgot).not.toHaveBeenCalled()
  })

  it('ignores a second action while one is running, even in the same render', async () => {
    await mount()
    let finish = () => undefined as void
    const first = jest.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const second = jest.fn(async () => undefined)
    let again: Promise<boolean> = Promise.resolve(true)
    let one: Promise<boolean> = Promise.resolve(false)
    act(() => {
      one = hook.run(first, 'Fallback.')
      again = hook.run(second, 'Fallback.')
    })
    expect(await again).toBe(false)
    expect(second).not.toHaveBeenCalled()
    await act(async () => { finish(); await one })
    await act(async () => { await hook.run(second, 'Fallback.') })
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('useAppCall: load', () => {
  it('is not busy and clears nothing; a failure is said, and a 401 forgets the session', async () => {
    await mount()
    act(() => hook.setNotice('Kept.'))
    let finish = () => undefined as void
    let done: Promise<boolean> = Promise.resolve(false)
    act(() => { done = hook.load(() => new Promise<void>(resolve => { finish = resolve }), 'Could not load.') })
    expect([hook.busy, hook.notice]).toEqual([false, 'Kept.'])
    await act(async () => { finish(); await done })
    await act(async () => { await hook.load(async () => { throw unauthorised }, 'Could not load.') })
    expect(forgot).toHaveBeenCalledTimes(1)
    expect([hook.notice, hook.problem]).toEqual(['Kept.', 'Please sign in again.'])
    await act(async () => { await hook.load(async () => { throw new TypeError('x') }, 'Could not load.') })
    expect(hook.problem).toBe('Could not load.')
  })
})
