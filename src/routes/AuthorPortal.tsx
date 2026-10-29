import React, { FormEvent, ReactElement, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { APP_API_URL, APP_AVAILABLE } from '../app/config'
import { currentSession, signInUrl } from '../app/auth'
import { authSettings, browserDeps } from '../app/browser'
import { callerFor } from '../app/publisher'
import { PHOTO_TYPES, STATUS_WORDS, Submission, fileProblem, mySubmissions, photoProblem, submitPoem, whenWords } from '../app/submit'
import NoteEditor from '../components/NoteEditor'
import { useAppCall } from '../app/useAppCall'

// The author portal (#360, GitHub midst-press/midst-web#96): where a poet signs in, sends a poem as a .midst file and
// sees where each submission stands (docs/app-api.md, "Poet"; #110, GitHub midst-press/midst-web#21). For now it is
// only for poems already accepted by email, so nothing on the site links here and search engines are asked not to
// list it; Annelyse gives poets the address. The Submit page keeps her text (Submit.tsx).

const putFile = async (url: string, headers: Record<string, string>, file: Blob) => {
  const response = await fetch(url, { method: 'PUT', headers, body: file })
  return { ok: response.ok }
}

function AuthorPortal(): ReactElement {
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
  // Busy, notice and problem, and a 401 that forgets the session, as on every app page (#387).
  const { busy, notice, problem, setNotice, setProblem, run, load, expired } = useAppCall()
  // Which control the problem is about, so it is shown beside it (#253): the file chosen, the photo chosen, or the
  // sending of them. null: none, such as the list failing to load; shown above the form.
  const [problemAt, setProblemAt] = useState<'file' | 'photo' | 'send' | null>(null)

  const call = session && isPoet ? callerFor(APP_API_URL, session.idToken) : null
  useEffect(() => {
    if (call) {
      load(async () => setSubmissions((await mySubmissions(call)).submissions), 'Your submissions could not be loaded.', () => {
        setProblemAt(null)
        return undefined
      })
    }
    // Loaded once per visit, and again after each submission.
  }, [])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!call || !file) return
    const wrong = fileProblem(file)
    if (wrong) { setProblem(wrong); setProblemAt('file'); return }
    const wrongPhoto = photo ? photoProblem(photo) : null
    if (wrongPhoto) { setProblem(wrongPhoto); setProblemAt('photo'); return }
    await run(async () => {
      setProblemAt(null)
      let sent
      try {
        sent = await submitPoem(call, putFile, { title: title.trim(), author: author.trim(), processNote }, file, photo)
      } catch (error) {
        setProblemAt('send')
        throw error
      }
      setNotice(`Thank you. We have received “${sent.title}”. You will get an email to say so.`)
      setTitle('')
      setProcessNote('')
      setFile(null)
      setPhoto(null)
      setFormKey(k => k + 1)
      // The poem is in. A failure from here on is only the list: saying "could not be sent" would make a poet
      // send it twice.
      try {
        setSubmissions((await mySubmissions(call)).submissions)
      } catch (error) {
        expired(error)
        setProblem('Your poem was received, but the list below could not be refreshed. Reload the page to see it.')
        setProblemAt(null)
      }
    }, 'Your poem could not be sent. Please try again.')
  }

  const signIn = async () => window.location.assign(await signInUrl(authSettings(), browserDeps(), '/authorportal'))

  // Nothing on a site without the app; otherwise sign-in, or the poet's form.
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
        <title>{BASE_SITE_PAGE_TITLE} Author portal</title>
        <meta name="robots" content="noindex, nofollow, noai, noimageai" />
      </Helmet>
      <section className="heroine heroine--normal">
        <h2>Submit a poem</h2>
        {content}
      </section>
    </div>
  )
}

export default AuthorPortal
