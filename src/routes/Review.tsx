import React, { ReactElement, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { APP_API_URL, APP_AVAILABLE } from '../app/config'
import { ApiError } from '../app/api'
import { currentSession, forgetSession, signInUrl } from '../app/auth'
import { authSettings, browserDeps } from '../app/browser'
import { Call, callerFor } from '../app/publisher'
import { STATUS_WORDS, Submission } from '../app/submit'
import { Decision, PlayError, decide, fetchTimelapse, reviewSubmissions, timelapseTicket } from '../app/review'
import { IMidstFile } from '../store/types'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'

// The publisher's review page (docs/app-api.md, "Review"; #110): play a submission, accept or decline it
// with a note. A prototype for Annelyse to react to.

const readText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.addEventListener('loadend', () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('unreadable'))))
  reader.readAsText(blob)
})

function Review(): ReactElement {
  const session = APP_AVAILABLE ? currentSession(browserDeps()) : null
  const [submissions, setSubmissions] = useState<Submission[] | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [playing, setPlaying] = useState<{ title: string, data: IMidstFile } | null>(null)

  // Only a publisher's page asks for the list; the API would refuse anyone else anyway.
  const call: Call | null = session && session.groups.includes('publisher') ? callerFor(APP_API_URL, session.idToken) : null

  // Any 401: the token is no longer accepted. Forget it, so the page offers sign-in again (docs/app-api.md).
  const failed = (error: unknown, fallback: string) => {
    if (error instanceof ApiError && error.status === 401) forgetSession(browserDeps())
    setProblem(error instanceof ApiError || error instanceof PlayError ? error.message : fallback)
  }

  useEffect(() => {
    if (call) reviewSubmissions(call).then(r => setSubmissions(r.submissions)).catch(error => failed(error, 'The submissions could not be loaded.'))
    // Loaded once per visit, and again after each decision.
  }, [])

  const play = async (submission: Submission) => {
    if (!call) return
    setBusy(true)
    setNotice(null)
    setProblem(null)
    try {
      const ticket = await timelapseTicket(call, submission.submissionId)
      const data = await fetchTimelapse(ticket.url, {
        fetch: url => fetch(url),
        zip: (window as any).zip,
        readText,
      })
      setPlaying({ title: submission.title, data })
    } catch (error) {
      failed(error, 'That submission could not be played. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const decideOn = async (submission: Submission, decision: Decision) => {
    if (!call) return
    setBusy(true)
    setNotice(null)
    setProblem(null)
    try {
      await decide(call, submission.submissionId, decision, (notes[submission.submissionId] ?? '').trim())
    } catch (error) {
      failed(error, 'That did not work. Please try again.')
      setBusy(false)
      return
    }
    // The decision is saved. A failure from here on is only the list.
    setNotice(`${decision === 'accept' ? 'Accepted' : 'Declined'} “${submission.title}”.`)
    setNotes(n => ({ ...n, [submission.submissionId]: '' }))
    try {
      setSubmissions((await reviewSubmissions(call)).submissions)
    } catch (error) {
      failed(error, 'The decision was saved, but the list could not be refreshed. Reload the page to see it.')
    } finally {
      setBusy(false)
    }
  }

  const signIn = async () => window.location.assign(await signInUrl(authSettings(), browserDeps(), '/review'))

  let content: ReactElement
  if (!APP_AVAILABLE) {
    content = <p>Reviewing is not available on this site.</p>
  } else if (!session) {
    content = (
      <>
        {problem && <p role="alert">{problem}</p>}
        <p>Sign in to review submissions. <button type="button" className="app-button" onClick={signIn}>Sign in</button></p>
      </>
    )
  } else if (!session.groups.includes('publisher')) {
    content = <p>Your account cannot review submissions. Ask the editor to add you as a publisher.</p>
  } else {
    content = (
      <>
        {notice && <p role="status" className="publisher-notice">{notice}</p>}
        {problem && <p role="alert" className="publisher-problem">{problem}</p>}
        {submissions === null ? (problem ? null : <p>Loading…</p>) : submissions.length === 0 ? <p>Nothing has been submitted yet.</p> : (
          <ul className="publisher-list" aria-label="Submissions">
            {submissions.map(s => (
              <li key={s.submissionId}>
                <span className="publisher-poem">
                  <strong>{s.title}</strong> <span className="publisher-author">by {s.author}, {s.poet}, {new Date(s.submittedAt).toLocaleDateString()}</span>
                  <br />
                  {STATUS_WORDS[s.status]}{s.note ? `: ${s.note}` : ''}
                </span>
                <span className="publisher-actions">
                  {/* An upload that never completed has no review copy to play. */}
                  {s.status !== 'uploading' && <button type="button" disabled={busy} onClick={() => play(s)} aria-label={`Play ${s.title}`}>Play</button>}
                  {/* Only a submission still waiting to be read is decided here; a decided one shows its status. */}
                  {s.status === 'received' && <>
                  <label>
                    Note{' '}
                    <input type="text" disabled={busy} value={notes[s.submissionId] ?? ''} aria-label={`Note on ${s.title}`}
                      onChange={e => setNotes(n => ({ ...n, [s.submissionId]: e.target.value }))} />
                  </label>
                  <button type="button" disabled={busy} onClick={() => decideOn(s, 'accept')} aria-label={`Accept ${s.title}`}>Accept</button>
                  <button type="button" disabled={busy} onClick={() => decideOn(s, 'decline')} aria-label={`Decline ${s.title}`}>Decline</button>
                  </>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <div className="app-account-page review-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} Review</title>
      </Helmet>
      <section className="heroine heroine--normal">
        <h2>Review</h2>
        {content}
      </section>
      {playing && (
        <div className="sliding-poems" role="dialog" aria-label={`Playing ${playing.title}`}>
          <button type="button" className="app-button review-player-close" onClick={() => setPlaying(null)}>Close</button>
          <div className="sliding-poems__frame" style={{ width: '200%' }}>
            <div className="sliding-poems__poem sliding-poems__poem--loaded" data-trigger="false">
              <div className="scrolling-area-border" />
              <MidstPlayer activePlayer={true} cursorFollowing={true} hasScrollbar={true} data={playing.data} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Review
