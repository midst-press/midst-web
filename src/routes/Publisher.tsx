import React, { ReactElement, useCallback, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet'
import { Link } from 'react-router-dom'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { APP_API_URL, APP_AVAILABLE } from '../app/config'
import { ApiError } from '../app/api'
import PublisherPatrons from './PublisherPatrons'
import PublisherPoets from './PublisherPoets'
import PublisherNote from './PublisherNote'
import ReplacesChoice, { detailsFor, localToday, publishWithChoice } from './PublisherReplaces'
import { currentSession, forgetSession, signInUrl } from '../app/auth'
import { authSettings, browserDeps } from '../app/browser'
import { reviewSubmissions, waitingCount } from '../app/review'
import {
  Call, Poem, PublisherList, callerFor, lastEditedWords, leftInCache, loadList, moved, orderChanged, saveDetails, saveOrder, unpublish,
} from '../app/publisher'

// The publisher's page (docs/app-api.md, "Publisher"; #12, #110): publish, unpublish, reorder, and set a
// published poem's date and highlight. A prototype for Annelyse to react to.

const SAVED_NOT_RELOADED = 'The change was saved, but the list could not be refreshed. Reload the page to see it.'
// When CloudFront did not take the request to clear withdrawn copies (#239). The copies are kept for a day.
const LEFT_IN_CACHE = {
  unpublish: 'Its copies could not be cleared from the site\'s cache, so anyone who already has their address may still open them for up to a day.',
  publish: 'The copies of the version it replaced could not be cleared from the site\'s cache, so anyone who already has their address may still open them for up to a day.',
}
const CONFLICT = 'Someone else changed the published list while you were working. It has been reloaded; please check it and try again.'

function PoemLine({ poem }: { poem: Poem }): ReactElement {
  const edited = lastEditedWords(poem.lastEdited)
  return <span className="publisher-poem">
    <strong>{poem.title}</strong> <span className="publisher-author">by {poem.author}</span>
    {edited && <span className="publisher-last-edited">, {edited}</span>}
  </span>
}

function Publisher(): ReactElement {
  const session = APP_AVAILABLE ? currentSession(browserDeps()) : null
  const [list, setList] = useState<PublisherList | null>(null)
  const [order, setOrder] = useState<Poem[]>([]) // the published list as shown, before Save order
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  // Bumped on every failed change, so fields typed into are remade from the server's values (see the date input).
  const [failures, setFailures] = useState(0)
  // For each unpublished poem, the published poem it is to replace, if one was chosen.
  const [replacing, setReplacing] = useState<Record<string, string>>({})
  // For each unpublished poem, the date or highlight the publisher changed from where they start (detailsFor, #305).
  const [publishing, setPublishing] = useState<Record<string, { publishDate?: string, highlighted?: boolean }>>({})
  // Submissions waiting on the review page (#289); null until read, or when they could not be.
  const [waiting, setWaiting] = useState<number | null>(null)

  // Only a publisher's page asks for the list; the API would refuse anyone else anyway.
  const call: Call | null = session && session.groups.includes('publisher') ? callerFor(APP_API_URL, session.idToken) : null

  const reload = useCallback(async (c: Call) => {
    const next = await loadList(c)
    setList(next)
    setOrder(next.published)
  }, [])

  // Any 401: the token is no longer accepted. Forget it, so the page offers sign-in again (docs/app-api.md).
  // Sets state here too, so the whole page renders again and offers sign-in, even when the 401 came from the
  // Poets section, whose own state is not this page's.
  const expired = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      forgetSession(browserDeps())
      setProblem(error.message)
    }
  }

  useEffect(() => {
    if (call) reload(call).catch(error => { expired(error); setProblem(error instanceof ApiError ? error.message : 'The list could not be loaded.') })
    // The count is only a pointer to the review page: if it cannot be read, the link is shown without it.
    if (call) reviewSubmissions(call).then(r => setWaiting(waitingCount(r.submissions))).catch(error => expired(error))
    // Loaded once per visit; each change reloads it.
  }, [])

  // Every change: run it, then reload, so the page always shows what the server now holds.
  const change = async (action: (c: Call, etag: string) => Promise<unknown>, done: string, cacheNote?: string) => {
    if (!call || !list) return
    setBusy(true)
    setNotice(null)
    setProblem(null)
    let result: unknown
    try {
      result = await action(call, list.listEtag)
    } catch (error) {
      expired(error)
      setFailures(count => count + 1)
      await reload(call).catch(() => undefined)
      if (error instanceof ApiError && error.code === 'conflict') {
        setProblem(CONFLICT)
      } else {
        setProblem(error instanceof ApiError ? error.message : 'That did not work. Please try again.')
      }
      setBusy(false)
      return
    }
    // The change is saved. Whatever the reload does, never say otherwise, or it may be made again (#127). Copies
    // left in the cache are said either way.
    const left = cacheNote && leftInCache(result) ? ` ${cacheNote}` : ''
    try {
      await reload(call)
      setNotice(`${done}${left}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) forgetSession(browserDeps())
      setProblem(`${SAVED_NOT_RELOADED}${left}`)
    } finally {
      setBusy(false)
    }
  }

  const signIn = async () => window.location.assign(await signInUrl(authSettings(), browserDeps(), '/publisher'))

  let content: ReactElement
  if (!APP_AVAILABLE) {
    content = <p>Publishing is not available on this site.</p>
  } else if (!session) {
    content = (
      <>
        {problem && <p role="alert">{problem}</p>}
        <p>Sign in to publish. <button type="button" className="app-button" onClick={signIn}>Sign in</button></p>
      </>
    )
  } else if (!session.groups.includes('publisher')) {
    content = <p>Your account cannot publish. Ask the editor to add you as a publisher.</p>
  } else if (!list) {
    content = problem ? <p role="alert">{problem}</p> : <p>Loading…</p>
  } else {
    const reordered = orderChanged(list.published, order)
    content = (
      <>
        {notice && <p role="status" className="publisher-notice">{notice}</p>}
        {problem && <p role="alert" className="publisher-problem">{problem}</p>}
        <p className="portal-link">
          <Link to="/review">{waiting === null ? 'Review submissions' : `Review submissions (${waiting} waiting)`}</Link>
        </p>

        <h3>Not published</h3>
        {list.unpublished.length === 0 ? <p>There is nothing waiting to be published.</p> : (
          <ul className="publisher-list" aria-label="Poems not published">
            {list.unpublished.map(poem => (
              <li key={poem.poemId}>
                <PoemLine poem={poem} />
                <span className="publisher-actions">
                  <ReplacesChoice poem={poem} published={list.published} value={replacing[poem.poemId] ?? ''} disabled={busy || reordered}
                    onChange={poemId => setReplacing(chosen => ({ ...chosen, [poem.poemId]: poemId }))} />
                  {(() => {
                    const details = { ...detailsFor(poem, list.published, replacing[poem.poemId], localToday()), ...publishing[poem.poemId] }
                    const edit = (field: { publishDate?: string, highlighted?: boolean }) =>
                      setPublishing(edits => ({ ...edits, [poem.poemId]: { ...edits[poem.poemId], ...field } }))
                    return <>
                      <label>
                        Date{' '}
                        <input type="date" required disabled={busy || reordered} value={details.publishDate}
                          aria-label={`Publish date of ${poem.title}`} onChange={event => edit({ publishDate: event.target.value })} />
                      </label>
                      <label>
                        <input type="checkbox" disabled={busy || reordered} checked={details.highlighted}
                          aria-label={`Highlighted, for ${poem.title}`} onChange={event => edit({ highlighted: event.target.checked })} />
                        {' '}Highlighted
                      </label>
                      <button type="button" disabled={busy || reordered || !details.publishDate}
                        onClick={() => change((c, etag) => publishWithChoice(c, etag, poem, list.published, replacing[poem.poemId], details,
                          poemId => {
                            setReplacing(({ [poemId]: _done, ...rest }) => rest)
                            setPublishing(({ [poemId]: _done, ...rest }) => rest)
                          }), `Published ${poem.title}.`, LEFT_IN_CACHE.publish)}>
                        Publish
                      </button>
                    </>
                  })()}
                </span>
                {call && <PublisherNote call={call} poemId={poem.poemId} title={poem.title} disabled={busy} onExpired={expired} />}
              </li>
            ))}
          </ul>
        )}
        {reordered && <p className="publisher-hint">Save or undo the new order before publishing or changing anything else.</p>}

        <h3>Published, in reading order</h3>
        {order.length === 0 ? <p>Nothing is published yet.</p> : (
          <ol className="publisher-list" aria-label="Published poems">
            {order.map((poem, index) => (
              <li
                key={poem.poemId}
                draggable={!busy}
                onDragStart={() => setDragging(index)}
                onDragOver={event => event.preventDefault()}
                onDrop={() => { if (dragging !== null) setOrder(moved(order, dragging, index)); setDragging(null) }}
                className={dragging === index ? 'publisher-dragging' : undefined}
              >
                <PoemLine poem={poem} />
                <span className="publisher-actions">
                  <button type="button" disabled={busy || index === 0} onClick={() => setOrder(moved(order, index, index - 1))}
                    aria-label={`Move ${poem.title} up`}>↑</button>
                  <button type="button" disabled={busy || index === order.length - 1} onClick={() => setOrder(moved(order, index, index + 1))}
                    aria-label={`Move ${poem.title} down`}>↓</button>
                  <label>
                    Date{' '}
                    {/* Keyed on the server's date and on the failure count as well as the poem: after a reload,
                        or any failed change, the field is made again from what the server holds, so a date that
                        did not save does not stay looking saved. */}
                    <input key={`${poem.poemId}:${poem.publishDate ?? ''}:${failures}`}
                      type="date" disabled={busy || reordered} defaultValue={poem.publishDate ?? ''}
                      aria-label={`Publish date of ${poem.title}`}
                      onBlur={event => {
                        const publishDate = event.target.value || null
                        if (publishDate !== poem.publishDate) {
                          change((c, etag) => saveDetails(c, poem.poemId, { publishDate, highlighted: poem.highlighted }, etag), `Saved the date of ${poem.title}.`)
                        }
                      }} />
                  </label>
                  <label>
                    <input type="checkbox" disabled={busy || reordered} checked={poem.highlighted}
                      onChange={event => change((c, etag) => saveDetails(c, poem.poemId, { publishDate: poem.publishDate, highlighted: event.target.checked }, etag),
                        event.target.checked ? `Highlighted ${poem.title}.` : `${poem.title} is no longer highlighted.`)} />
                    {' '}Highlighted
                  </label>
                  <button type="button" disabled={busy || reordered} onClick={() => change((c, etag) => unpublish(c, poem.poemId, etag), `Unpublished ${poem.title}.`, LEFT_IN_CACHE.unpublish)}>
                    Unpublish
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
        {reordered && (
          <p>
            <button type="button" className="app-button" disabled={busy}
              onClick={() => change((c, etag) => saveOrder(c, order.map(poem => poem.poemId), etag), 'Saved the new order.')}>
              Save order
            </button>{' '}
            <button type="button" disabled={busy} onClick={() => setOrder(list.published)}>Undo changes</button>
          </p>
        )}

        {call && <PublisherPoets call={call} onExpired={expired} />}
        {call && <PublisherPatrons call={call} onExpired={expired} />}
      </>
    )
  }

  return (
    <div className="app-account-page publisher-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} Publish</title>
      </Helmet>
      <section className="heroine heroine--normal">
        <h2>Publish</h2>
        {content}
      </section>
    </div>
  )
}

export default Publisher
