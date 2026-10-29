// The scaffold every app page put round its calls to the app API, in one place (#387): what it is doing (busy), what
// it says (notice, problem), what a 401 does, and a guard so an action does not run twice.
//
// A page keeps its own words: its fallback for an error that is not the API's, and anything it says about a
// particular error (a conflict, a second step that failed). Only the scaffold is shared.
import { useCallback, useRef, useState } from 'react'
import { ApiError } from './api'
import { forgetSession } from './auth'
import { browserDeps } from './browser'

/** On a 401 the token is no longer accepted: forget it, so the page offers sign-in again. Says whether it was one. */
export function sessionExpired(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 401) return false
  forgetSession(browserDeps())
  return true
}

/** What to say about a failure: the API's own message, or the page's fallback for anything else. */
export function problemText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

/* eslint-disable no-unused-vars -- the names in these function types say what each argument is */
export interface AppCallOptions {
  // A section inside a page passes the page's handler, so a 401 in the section reaches the page.
  onExpired?: (error: unknown) => void
}

// The page's own words for a failure, or undefined for the usual ones. It may do more first, and wait for it (reload
// a list): an action stays busy until it is done.
export type OnError = (error: unknown) => string | undefined | Promise<string | undefined>
/* eslint-enable no-unused-vars */

export function useAppCall({ onExpired }: AppCallOptions = {}) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // A ref, not the busy state: a second call in the same render would still see busy false.
  const running = useRef(false)

  const expired = useCallback(
    (error: unknown) => {
      if (onExpired) onExpired(error)
      else sessionExpired(error)
    },
    [onExpired],
  )

  const fail = useCallback(
    async (error: unknown, fallback: string, onError?: OnError) => {
      expired(error)
      setProblem((await onError?.(error)) ?? problemText(error, fallback))
    },
    [expired],
  )

  /**
   * An action: ignored while another is running; otherwise busy, with the last notice and problem cleared. What it
   * says on success, and any second step, belong to `work`. Says whether `work` finished without throwing.
   */
  const run = useCallback(
    async (work: () => Promise<void>, fallback: string, onError?: OnError): Promise<boolean> => {
      if (running.current) return false
      running.current = true
      setBusy(true)
      setNotice(null)
      setProblem(null)
      try {
        await work()
        return true
      } catch (error) {
        await fail(error, fallback, onError)
        return false
      } finally {
        running.current = false
        setBusy(false)
      }
    },
    [fail],
  )

  /** A load, as a page opens: not busy, and nothing cleared. A failure is said as an action's is. */
  const load = useCallback(
    async (work: () => Promise<void>, fallback: string, onError?: OnError): Promise<boolean> => {
      try {
        await work()
        return true
      } catch (error) {
        await fail(error, fallback, onError)
        return false
      }
    },
    [fail],
  )

  return { busy, notice, problem, setNotice, setProblem, run, load, expired }
}
