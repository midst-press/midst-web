import React, { FormEvent, ReactElement, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { APP_API_URL, APP_AVAILABLE } from '../app/config'
import { ApiError } from '../app/api'
import { currentSession, forgetSession, signInUrl } from '../app/auth'
import { authSettings, browserDeps } from '../app/browser'
import { callerFor } from '../app/publisher'
import { STATUS_WORDS, Submission, fileProblem, mySubmissions, submitPoem, whenWords } from '../app/submit'
import NoteEditor from '../components/NoteEditor'
import { Link } from 'react-router-dom'

// The Submit page (#326, GitHub midst-press/midst-web#88). Everyone reads Annelyse's text about submitting; a signed-in poet
// also gets, under it, the form to send a poem as a .midst file and the list of where each submission stands
// (docs/app-api.md, "Poet"; #110, GitHub midst-press/midst-web#21).

// Annelyse's words, as she wrote them (GitHub #88, 21 Oct). They move to her content/ folder once #281 has landed.
function SubmissionsText(): ReactElement {
  return (
    <div className="submit-text">
      <p>Midst is currently <strong>closed</strong> to submissions.</p>
      <p>
        Please note that we <em>only</em> consider .midst files—poems written and edited with <Link to="/app">the Midst app</Link>.
        We do not accept poems in any other format made with any other software (.doc, .docx, .pdf, .txt, etc.).
      </p>
      <p>
        The app is free to download and free to use, built by and for writers. Everything you write with it is completely
        private and belongs 100% to you. It works on Mac, Windows, and Linux. <Link to="/app">Download it here</Link>.
      </p>
      <p><a href="#newsletter">Sign up to our newsletter</a> to find out about open submission windows and other opportunities.</p>
    </div>
  )
}

const putFile = async (url: string, headers: Record<string, string>, file: Blob) => {
  const response = await fetch(url, { method: 'PUT', headers, body: file })
  return { ok: response.ok }
}

function Submit(): ReactElement {
  const session = APP_AVAILABLE ? currentSession(browserDeps()) : null
  const isPoet = Boolean(session && session.groups.includes('poet'))
  const [submissions, setSubmissions] = useState<Submission[] | null>(null)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // The process note (#292), in Markdown.
  const [processNote, setProcessNote] = useState('')
  const [formKey, setFormKey] = useState(0) // remakes the file input after a submission
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // Which control the problem is about, so it is shown beside it (#253): the file chosen, or the sending of it.
  // null: neither, such as the list failing to load; shown above the form.
  const [problemAt, setProblemAt] = useState<'file' | 'send' | null>(null)

  const call = session && isPoet ? callerFor(APP_API_URL, session.idToken) : null
  const failed = (error: unknown, fallback: string, at: 'send' | null = null) => {
    if (error instanceof ApiError && error.status === 401) forgetSession(browserDeps())
    setProblem(error instanceof ApiError ? error.message : fallback)
    setProblemAt(at)
  }

  useEffect(() => {
    if (call) mySubmissions(call).then(r => setSubmissions(r.submissions)).catch(error => failed(error, 'Your submissions could not be loaded.'))
    // Loaded once per visit, and again after each submission.
  }, [])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!call || !file) return
    const wrong = fileProblem(file)
    if (wrong) { setProblem(wrong); setProblemAt('file'); return }
    setBusy(true)
    setNotice(null)
    setProblem(null)
    setProblemAt(null)
    try {
      const sent = await submitPoem(call, putFile, { title: title.trim(), author: author.trim(), processNote }, file)
      setNotice(`Thank you. We have received “${sent.title}”. You will get an email to say so.`)
      setTitle('')
      setProcessNote('')
      setFile(null)
      setFormKey(k => k + 1)
    } catch (error) {
      failed(error, 'Your poem could not be sent. Please try again.', 'send')
      setBusy(false)
      return
    }
    // The poem is in. A failure from here on is only the list: saying "could not be sent" would make a poet
    // send it twice.
    try {
      setSubmissions((await mySubmissions(call)).submissions)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) forgetSession(browserDeps())
      setProblem('Your poem was received, but the list below could not be refreshed. Reload the page to see it.')
      setProblemAt(null)
    } finally {
      setBusy(false)
    }
  }

  const signIn = async () => window.location.assign(await signInUrl(authSettings(), browserDeps(), '/submit'))

  // Under her text: nothing on a site without the app; otherwise sign-in, or the poet's form.
  let content: ReactElement | null
  if (!APP_AVAILABLE) {
    content = null
  } else if (!session) {
    content = (
      <>
        {problem && <p role="alert">{problem}</p>}
        <p>Sign in to submit a poem. <button type="button" className="app-button" onClick={signIn}>Sign in</button></p>
      </>
    )
  } else if (!isPoet) {
    content = <p>Your account cannot submit poems. Ask the editor to register you as a poet.</p>
  } else {
    content = (
      <>
        {notice && <p role="status" className="publisher-notice">{notice}</p>}
        {problem && problemAt === null && <p role="alert" className="publisher-problem">{problem}</p>}
        <form className="submit-form" onSubmit={send} key={formKey}>
          <p><label>Title <input type="text" required value={title} onChange={e => setTitle(e.target.value)} disabled={busy} /></label></p>
          <p><label>Your name as it should appear <input type="text" required value={author} onChange={e => setAuthor(e.target.value)} disabled={busy} /></label></p>
          <NoteEditor id="process-note" label="Process Note" value={processNote} onChange={setProcessNote} disabled={busy} />
          <p><label>The poem, as a Midst file (.midst) <input type="file" accept=".midst" required onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={busy} /></label></p>
          {problem && problemAt === 'file' && <p role="alert" className="publisher-problem">{problem}</p>}
          <p><button type="submit" className="app-button" disabled={busy || !file}>{busy ? 'Sending…' : 'Submit poem'}</button></p>
          {problem && problemAt === 'send' && <p role="alert" className="publisher-problem">{problem}</p>}
        </form>

        <h3>Your submissions</h3>
        {submissions === null ? <p>Loading…</p> : submissions.length === 0 ? <p>You have not submitted anything yet.</p> : (
          <ul className="publisher-list" aria-label="Your submissions">
            {submissions.map(s => (
              <li key={s.submissionId}>
                <span className="publisher-poem"><strong>{s.title}</strong> <span className="publisher-author">{whenWords(s)}</span></span>
                <span className="publisher-actions">{STATUS_WORDS[s.status]}{s.note ? `: ${s.note}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  return (
    <div className="app-account-page submit-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} Submit</title>
      </Helmet>
      <section className="heroine heroine--normal">
        <SubmissionsText />
        {content && (
          <>
            <h2>Submit a poem</h2>
            {content}
          </>
        )}
      </section>
    </div>
  )
}

export default Submit
