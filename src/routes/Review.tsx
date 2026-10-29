import React, { ReactElement, useEffect, useRef, useState } from 'react'
import { Helmet } from 'react-helmet'
import { Link } from 'react-router'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { APP_API_URL, APP_AVAILABLE } from '../app/config'
import { ApiError } from '../app/api'
import { currentSession, signInUrl } from '../app/auth'
import { authSettings, browserDeps } from '../app/browser'
import { Call, callerFor, loadList } from '../app/publisher'
import { STATUS_WORDS, Submission, canPlay, reviewByline } from '../app/submit'
import { Decision, PlayError, PoemIds, decide, fetchTimelapse, needsFinishing, poemIdsOf, photoOf, processNoteOf, reviewSubmissions, timelapseTicket } from '../app/review'
import { renderProcessNote } from '../processNote'
import { problemText, sessionExpired, useAppCall } from '../app/useAppCall'
import { IMidstFile } from '../store/types'
import MidstPlayer from '../components/MidstPlayer/MidstPlayer'

// The publisher's review page (docs/app-api.md, "Review"; #110): play a submission, accept or decline it
// with a note. A prototype for Annelyse to react to.

function Review(): ReactElement {
  const session = APP_AVAILABLE ? currentSession(browserDeps()) : null
  const [submissions, setSubmissions] = useState<Submission[] | null>(null)
  // 'loading' while read; null when it could not be read, and then we cannot tell which accepted submissions lack a poem.
  const [poemIds, setPoemIds] = useState<PoemIds>('loading')
  const [notes, setNotes] = useState<Record<string, string>>({})
  // Each process note shown (#292), as Markdown, by submission; null for one made before notes were asked for.
  const [processNotes, setProcessNotes] = useState<Record<string, string | null>>({})
  // The poet's photo, shown with the note (#312): a link to it, or null when the submission has none.
  const [photos, setPhotos] = useState<Record<string, string | null>>({})
  // Busy, notice and problem, and a 401 that forgets the session, as on every app page (#387).
  const { busy, notice, problem, setNotice, setProblem, run, load, expired } = useAppCall()
  const [playing, setPlaying] = useState<{ title: string, author: string, data: IMidstFile } | null>(null)
  const playerDialog = useRef<HTMLDialogElement>(null)
  const playButton = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!playing) return
    const modal = playerDialog.current!
    const returnFocus = playButton.current
    // The top layer keeps even the site's fixed newsletter bar below the player, and contains keyboard focus.
    modal.showModal()
    document.body.classList.add('review-player-open')
    return () => {
      modal.close()
      document.body.classList.remove('review-player-open')
      if (returnFocus?.isConnected) returnFocus.focus()
    }
  }, [playing])

  // Only a publisher's page asks for the list; the API would refuse anyone else anyway.
  const call: Call | null = session && session.groups.includes('publisher') ? callerFor(APP_API_URL, session.idToken) : null

  // A timelapse that cannot be played says why in its own words, as the API's errors do.
  const playMessage = (error: unknown): string | undefined => (error instanceof PlayError ? error.message : undefined)
  // A failure beside another call, which must not stop it: said, and a 401 forgets the session.
  const failed = (error: unknown, fallback: string) => {
    expired(error)
    setProblem(playMessage(error) ?? problemText(error, fallback))
  }

  const reloadPoemIds = async (c: Call) => {
    try {
      setPoemIds(poemIdsOf(await loadList(c)))
    } catch (error) {
      // Otherwise quiet: without the list the page only cannot tell which accepted poems lack one. A 401 is said, so
      // the sign-in the page now offers comes with its reason (#387).
      if (sessionExpired(error)) setProblem(problemText(error, ''))
      setPoemIds(null)
    }
  }

  useEffect(() => {
    if (call) reloadPoemIds(call)
    if (call) load(async () => setSubmissions((await reviewSubmissions(call)).submissions), 'The submissions could not be loaded.', playMessage)
    // Loaded once per visit, and again after each decision.
  }, [])

  const play = async (submission: Submission, trigger: HTMLButtonElement) => {
    if (!call) return
    // Disabling the busy button may blur it before the file arrives, so remember the actual trigger now.
    playButton.current = trigger
    await run(async () => {
      const ticket = await timelapseTicket(call, submission.submissionId)
      const data = await fetchTimelapse(ticket.url, { fetch: url => fetch(url) })
      setPlaying({ title: submission.title, author: submission.author, data })
    }, 'That submission could not be played. Please try again.', playMessage)
  }

  const showProcessNote = async (submission: Submission) => {
    if (!call) return
    const id = submission.submissionId
    if (id in processNotes) {
      setProcessNotes(({ [id]: _shown, ...rest }) => rest)
      return
    }
    await run(async () => {
      // The photo is asked for beside the note. A photo that cannot be loaded does not hold back the note, and says so.
      const photo = photoOf(call, id).then(
        ({ url }) => setPhotos(p => ({ ...p, [id]: url })),
        error => {
          if (error instanceof ApiError && error.status === 404) setPhotos(p => ({ ...p, [id]: null }))
          else failed(error, 'The photo sent with that poem could not be loaded. Please try again.')
        },
      )
      try {
        const { processNote } = await processNoteOf(call, id)
        setProcessNotes(n => ({ ...n, [id]: processNote }))
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error
        setProcessNotes(n => ({ ...n, [id]: null }))
      } finally {
        await photo
      }
    }, 'That process note could not be loaded. Please try again.', playMessage)
  }

  const decideOn = async (submission: Submission, decision: Decision, finishing = false) => {
    if (!call) return
    await run(async () => {
      const decided = await decide(call, submission.submissionId, decision, (notes[submission.submissionId] ?? '').trim())
      // The decision is saved. A failure from here on is only the list.
      setNotice(`${finishing ? 'Finished accepting' : decision === 'accept' ? 'Accepted' : 'Declined'} “${submission.title}”.`)
      setNotes(n => ({ ...n, [submission.submissionId]: '' }))
      // Show it decided at once, so its buttons go even if the reload below fails.
      setSubmissions(list => list && list.map(s => (s.submissionId === submission.submissionId ? { ...s, ...decided } : s)))
      // An accept makes a poem, so the old poem list is out of date until it is read again.
      setPoemIds('loading')
      const poems = reloadPoemIds(call)
      try {
        setSubmissions((await reviewSubmissions(call)).submissions)
      } catch (error) {
        // Whatever went wrong, the decision itself is saved: never say otherwise, or it may be made again.
        expired(error)
        setProblem('The decision was saved, but the list could not be refreshed. Reload the page to see it.')
      } finally {
        await poems
      }
    }, 'That did not work. Please try again.', playMessage)
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
        <p className="portal-link"><Link to="/publisher">Publish poems</Link></p>
        {submissions === null ? (problem ? null : <p>Loading…</p>) : submissions.length === 0 ? <p>Nothing has been submitted yet.</p> : (
          <ul className="publisher-list" aria-label="Submissions">
            {submissions.map(s => (
              <li key={s.submissionId}>
                <div className="publisher-poem">
                  <strong>{s.title}</strong> <span className="publisher-author">{reviewByline(s)}</span>
                  <br />
                  {STATUS_WORDS[s.status]}{s.note ? `: ${s.note}` : ''}
                  {s.submissionId in processNotes && (processNotes[s.submissionId] === null
                    ? <div className="review-process-note">No process note.</div>
                    // The poet's Markdown, with the narrow list: this page holds a publisher's session.
                    : <div className="review-process-note" role="region" aria-label={`Process note for ${s.title}`}
                      dangerouslySetInnerHTML={{ __html: renderProcessNote(processNotes[s.submissionId] as string) }} />)}
                  {/* At the foot of the note, as the poem page shows it (#312). */}
                  {s.submissionId in processNotes && photos[s.submissionId] && (
                    <img className="review-photo" src={photos[s.submissionId] as string} alt={`Photo sent with ${s.title}`}
                      style={{ display: 'block', maxWidth: '100%', maxHeight: '16rem' }} />)}
                </div>
                <span className="publisher-actions">
                  {/* An upload that never completed has no review copy to play, and nor does an archive record. */}
                  {canPlay(s) && <button type="button" disabled={busy} onClick={event => play(s, event.currentTarget)} aria-label={`Play ${s.title}`}>Play</button>}
                  {canPlay(s) && <button type="button" disabled={busy} onClick={() => showProcessNote(s)} aria-expanded={s.submissionId in processNotes}
                    aria-label={`Process note for ${s.title}`}>Process note</button>}
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
                  {(() => {
                    const finishing = needsFinishing(s, poemIds)
                    if (!finishing.offer) return null
                    const reasonId = `finish-reason-${s.submissionId}`
                    return <>
                      <button type="button" disabled={busy || !finishing.enabled} onClick={() => decideOn(s, 'accept', true)}
                        aria-label={`Finish accepting ${s.title}`} aria-describedby={finishing.enabled ? undefined : reasonId}>Finish accepting</button>
                      {!finishing.enabled && <span id={reasonId} className="publisher-problem">{finishing.reason}</span>}
                    </>
                  })()}
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
        <dialog ref={playerDialog} className="sliding-poems review-player" aria-label={`Playing ${playing.title}`}
          onCancel={event => { event.preventDefault(); setPlaying(null) }}>
          <button type="button" className="app-button review-player-close" autoFocus onClick={() => setPlaying(null)}>Close</button>
          {/* Author and title above the poem, as on the public poem page (PoemNav), as text: a submission's title is the
              poet's own and is never read as markup (#289). */}
          <p className="poem-credit review-player-credit">
            <i className="author-name">{playing.author}</i>
            <span className="divider">&nbsp;|&nbsp;</span>
            <span className="poem-title">{playing.title}</span>
          </p>
          <div className="sliding-poems__frame" style={{ width: '200%' }}>
            <div className="sliding-poems__poem sliding-poems__poem--loaded" data-trigger="false">
              <div className="scrolling-area-border" />
              <MidstPlayer activePlayer={true} cursorFollowing={true} hasScrollbar={true} data={playing.data} />
            </div>
          </div>
        </dialog>
      )}
    </div>
  )
}

export default Review
