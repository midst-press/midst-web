import React, { FormEvent, MouseEvent, ReactElement, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { APP_API_URL, APP_AVAILABLE } from '../app/config'
import { ApiError } from '../app/api'
import { currentSession, forgetSession, signInUrl } from '../app/auth'
import { authSettings, browserDeps } from '../app/browser'
import { callerFor } from '../app/publisher'
import { PHOTO_TYPES, STATUS_WORDS, Submission, fileProblem, mySubmissions, photoProblem, submitPoem, whenWords } from '../app/submit'
import NoteEditor from '../components/NoteEditor'
import { SUBMIT_TEXT, renderContent } from '../content'
import { isSitePath } from '../sitePath'
import { useNavigate } from 'react-router'

// The Submit page (#326, GitHub midst-press/midst-web#88). Everyone reads Annelyse's text about submitting; a signed-in poet
// also gets, under it, the form to send a poem as a .midst file and the list of where each submission stands
// (docs/app-api.md, "Poet"; #110, GitHub midst-press/midst-web#21).

// Annelyse's words, from her content/ folder (content/submit.md; #281). A link to one of the site's own pages goes
// through the router, as a Link would, rather than reloading the site.
const SUBMIT_HTML = renderContent(SUBMIT_TEXT)

function SubmissionsText(): ReactElement {
  const navigate = useNavigate()
  const follow = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest('a')
    const href = link?.getAttribute('href')
    if (!href || !isSitePath(href)) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(href)
  }
  return <div className="submit-text" onClick={follow} dangerouslySetInnerHTML={{ __html: SUBMIT_HTML }} />
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
  // The author photo (#312): optional, shown at the foot of the process note.
  const [photo, setPhoto] = useState<File | null>(null)
  // The process note (#292), in Markdown.
  const [processNote, setProcessNote] = useState('')
  const [formKey, setFormKey] = useState(0) // remakes the file input after a submission
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // Which control the problem is about, so it is shown beside it (#253): the file chosen, the photo chosen, or the
  // sending of them. null: none, such as the list failing to load; shown above the form.
  const [problemAt, setProblemAt] = useState<'file' | 'photo' | 'send' | null>(null)

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
    const wrongPhoto = photo ? photoProblem(photo) : null
    if (wrongPhoto) { setProblem(wrongPhoto); setProblemAt('photo'); return }
    setBusy(true)
    setNotice(null)
    setProblem(null)
    setProblemAt(null)
    try {
      const sent = await submitPoem(call, putFile, { title: title.trim(), author: author.trim(), processNote }, file, photo)
      setNotice(`Thank you. We have received “${sent.title}”. You will get an email to say so.`)
      setTitle('')
      setProcessNote('')
      setFile(null)
      setPhoto(null)
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
          <p><label>A photo of you, if you would like one shown under your process note (JPEG, PNG or WebP, at most 5 MB) <input type="file" accept={PHOTO_TYPES.join(',')} onChange={e => setPhoto(e.target.files?.[0] ?? null)} disabled={busy} /></label></p>
          {problem && problemAt === 'photo' && <p role="alert" className="publisher-problem">{problem}</p>}
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
