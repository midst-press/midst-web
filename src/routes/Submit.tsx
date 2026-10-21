import React, { FormEvent, ReactElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { APP_API_URL, APP_AVAILABLE } from '../app/config'
import { ApiError } from '../app/api'
import { currentSession, forgetSession, signInUrl } from '../app/auth'
import { authSettings, browserDeps } from '../app/browser'
import { callerFor } from '../app/publisher'
import { STATUS_WORDS, Submission, fileProblem, mySubmissions, submitPoem, whenWords } from '../app/submit'
import { MAX_NOTE_CHARACTERS, Markup, applyMarkup, renderProcessNote } from '../processNote'

// The poet's page (docs/app-api.md, "Poet"; #110, GitHub midst-press/midst-web#21): send a poem as a .midst
// file, and see where each submission stands. A prototype; the wording is Annelyse's to choose.

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
  // The process note (#292): Markdown, with buttons that wrap the selection, and a preview rendered as the poem page will.
  const [processNote, setProcessNote] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const noteBox = useRef<HTMLTextAreaElement>(null)
  const [selection, setSelection] = useState<{ start: number, end: number } | null>(null)
  const [formKey, setFormKey] = useState(0) // remakes the file input after a submission
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // Which control the problem is about, so it is shown beside it (#253): the file chosen, or the sending of it.
  // null: neither, such as the list failing to load; shown above the form.
  const [problemAt, setProblemAt] = useState<'file' | 'send' | null>(null)

  // After a button has changed the note, put the selection where applyMarkup says, once the text is in the box.
  useLayoutEffect(() => {
    if (!selection || !noteBox.current) return
    noteBox.current.focus()
    noteBox.current.setSelectionRange(selection.start, selection.end)
    setSelection(null)
  }, [selection])

  const markUp = (kind: Markup) => {
    const box = noteBox.current
    if (!box) return
    const edit = applyMarkup(processNote, box.selectionStart, box.selectionEnd, kind)
    if (edit.text.length > MAX_NOTE_CHARACTERS) return
    setProcessNote(edit.text)
    setSelection({ start: edit.start, end: edit.end })
  }

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
      setPreviewing(false)
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

  let content: ReactElement
  if (!APP_AVAILABLE) {
    content = <p>Submitting is not available on this site.</p>
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
          <div className="process-note-field">
            <label htmlFor="process-note">Process Note</label>
            <div className="process-note-toolbar" role="toolbar" aria-label="Process Note formatting">
              <button type="button" className="app-button" onClick={() => markUp('bold')} disabled={busy}>Bold</button>
              <button type="button" className="app-button" onClick={() => markUp('italic')} disabled={busy}>Italic</button>
              <button type="button" className="app-button" onClick={() => markUp('link')} disabled={busy}>Link</button>
              <button type="button" className="app-button" aria-pressed={previewing} onClick={() => setPreviewing(p => !p)} disabled={busy}>Preview</button>
            </div>
            {/* The preview shows below the box rather than replacing it, so the box stays in reach of `required`. */}
            <textarea id="process-note" ref={noteBox} required maxLength={MAX_NOTE_CHARACTERS} rows={10} value={processNote}
              onChange={e => setProcessNote(e.target.value)} disabled={busy} />
            {/* The note is the poet's own Markdown, shown through the same sanitiser as the poem page. */}
            {previewing && <div className="process-note-preview" aria-label="Process Note preview" role="region"
              dangerouslySetInnerHTML={{ __html: renderProcessNote(processNote) }} />}
          </div>
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
        <title>{BASE_SITE_PAGE_TITLE} Submit a poem</title>
      </Helmet>
      <section className="heroine heroine--normal">
        <h2>Submit a poem</h2>
        {content}
      </section>
    </div>
  )
}

export default Submit
