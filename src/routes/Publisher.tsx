import React, { ReactElement, useCallback, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { APP_API_URL, APP_AVAILABLE } from '../app/config'
import { ApiError } from '../app/api'
import { currentSession, forgetSession, signInUrl } from '../app/auth'
import { authSettings, browserDeps } from '../app/browser'
import {
  Call, Poem, PublisherList, callerFor, loadList, moved, orderChanged, publish, saveDetails, saveOrder, unpublish,
} from '../app/publisher'

// The publisher's page (docs/app-api.md, "Publisher"; #12, #110): publish, unpublish, reorder, and set a
// published poem's date and highlight. A prototype for Annelyse to react to.

const CONFLICT = 'Someone else changed the published list while you were working. It has been reloaded; please check it and try again.'

function PoemLine({ poem }: { poem: Poem }): ReactElement {
  return <span className="publisher-poem"><strong>{poem.title}</strong> <span className="publisher-author">by {poem.author}</span></span>
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

  // Only a publisher's page asks for the list; the API would refuse anyone else anyway.
  const call: Call | null = session && session.groups.includes('publisher') ? callerFor(APP_API_URL, session.idToken) : null

  const reload = useCallback(async (c: Call) => {
    const next = await loadList(c)
    setList(next)
    setOrder(next.published)
  }, [])

  // Any 401: the token is no longer accepted. Forget it, so the page offers sign-in again (docs/app-api.md).
  const expired = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) forgetSession(browserDeps())
  }

  useEffect(() => {
    if (call) reload(call).catch(error => { expired(error); setProblem(error instanceof ApiError ? error.message : 'The list could not be loaded.') })
    // Loaded once per visit; each change reloads it.
  }, [])

  // Every change: run it, then reload, so the page always shows what the server now holds.
  const change = async (action: (c: Call, etag: string) => Promise<unknown>, done: string) => {
    if (!call || !list) return
    setBusy(true)
    setNotice(null)
    setProblem(null)
    try {
      await action(call, list.listEtag)
      await reload(call)
      setNotice(done)
    } catch (error) {
      expired(error)
      setFailures(count => count + 1)
      await reload(call).catch(() => undefined)
      if (error instanceof ApiError && error.code === 'conflict') {
        setProblem(CONFLICT)
      } else {
        setProblem(error instanceof ApiError ? error.message : 'That did not work. Please try again.')
      }
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
                  <button type="button" disabled={busy || reordered} onClick={() => change((c, etag) => unpublish(c, poem.poemId, etag), `Unpublished ${poem.title}.`)}>
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

        <h3>Not published</h3>
        {list.unpublished.length === 0 ? <p>There is nothing waiting to be published.</p> : (
          <ul className="publisher-list" aria-label="Poems not published">
            {list.unpublished.map(poem => (
              <li key={poem.poemId}>
                <PoemLine poem={poem} />
                <span className="publisher-actions">
                  <button type="button" disabled={busy || reordered} onClick={() => change((c, etag) => publish(c, poem.poemId, etag), `Published ${poem.title}.`)}>
                    Publish
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {reordered && <p className="publisher-hint">Save or undo the new order before publishing or changing anything else.</p>}
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
