import React, { FormEvent, ReactElement, useCallback, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { APP_API_URL, APP_AVAILABLE } from '../app/config'
import { ApiError } from '../app/api'
import { currentSession, forgetSession, signInUrl } from '../app/auth'
import { authSettings, browserDeps } from '../app/browser'
import { Call, callerFor } from '../app/publisher'
import { GROUPS, Person, disable, enable, invite, loadPeople, resendInvitation, setGroups } from '../app/admin'

// The admin's page (docs/app-api.md, "Admin"): see everyone, invite, resend an invitation, change groups, disable and
// enable.
// A prototype for Annelyse to react to.

// What a failed change says. An answer not in the API's error shape (a gateway's own, such as the 404 of a route the
// deployed API does not have yet) only says something went wrong, so its status is added: it is what tells an admin
// why (#241).
const problemOf = (error: unknown): string => {
  if (!(error instanceof ApiError)) return 'That did not work. Please try again.'
  return error.code === 'server' ? `${error.message} (HTTP ${error.status})` : error.message
}

const sameGroups = (a: string[], b: string[]) => a.length === b.length && a.every(group => b.includes(group))

function GroupBoxes({ label, chosen, disabled, onChange }: {
  label: string, chosen: string[], disabled: boolean, onChange: (groups: string[]) => void,
}): ReactElement {
  return (
    <span role="group" aria-label={label}>
      {GROUPS.map(group => (
        <label key={group}>
          <input type="checkbox" disabled={disabled} checked={chosen.includes(group)}
            onChange={event => onChange(event.target.checked ? [...chosen, group] : chosen.filter(g => g !== group))} />
          {' '}{group}{' '}
        </label>
      ))}
    </span>
  )
}

function Admin(): ReactElement {
  const session = APP_AVAILABLE ? currentSession(browserDeps()) : null
  const [people, setPeople] = useState<Person[] | null>(null)
  const [edits, setEdits] = useState<Record<string, string[]>>({}) // groups being changed, by username, before Save groups
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [inviteGroups, setInviteGroups] = useState<string[]>(['poet'])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // Whose row a change was made from, so its result is shown there, beside the button, and not above the invite form
  // where it may be out of view (#241). null: the invite form, or the page.
  const [about, setAbout] = useState<string | null>(null)

  // Only an admin's page asks for anything; the API would refuse anyone else anyway.
  const call: Call | null = session && session.groups.includes('admin') ? callerFor(APP_API_URL, session.idToken) : null

  const reload = useCallback(async (c: Call) => {
    setPeople((await loadPeople(c)).users)
    setEdits({})
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
  const change = async (action: (c: Call) => Promise<unknown>, done: string, username: string | null = null): Promise<boolean> => {
    if (!call) return false
    setBusy(true)
    setNotice(null)
    setProblem(null)
    setAbout(username)
    try {
      await action(call)
      await reload(call)
      setNotice(done)
      return true
    } catch (error) {
      expired(error)
      await reload(call).catch(() => undefined)
      setProblem(problemOf(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  const sendInvite = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    if (!address) return
    if (await change(c => invite(c, name.trim(), address, inviteGroups), `Invited ${address}. They will be emailed a temporary password.`)) {
      setName('')
      setEmail('')
    }
  }

  const signIn = async () => window.location.assign(await signInUrl(authSettings(), browserDeps(), '/admin'))

  const result = (
    <>
      {notice && <p role="status" className="publisher-notice">{notice}</p>}
      {problem && <p role="alert" className="publisher-problem">{problem}</p>}
    </>
  )

  let content: ReactElement
  if (!APP_AVAILABLE) {
    content = <p>Administration is not available on this site.</p>
  } else if (!session) {
    content = (
      <>
        {problem && <p role="alert">{problem}</p>}
        <p>Sign in to administer. <button type="button" className="app-button" onClick={signIn}>Sign in</button></p>
      </>
    )
  } else if (!session.groups.includes('admin')) {
    content = <p>Your account cannot administer. Ask an admin to add you to the admin group.</p>
  } else if (!people) {
    content = problem ? <p role="alert">{problem}</p> : <p>Loading…</p>
  } else {
    content = (
      <>
        {about === null && result}

        <h3>Invite someone</h3>
        <form onSubmit={sendInvite} aria-label="Invite someone">
          <label>
            Name{' '}
            <input type="text" required value={name} disabled={busy} onChange={event => setName(event.target.value)} />
          </label>{' '}
          <label>
            Email to invite{' '}
            <input type="email" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
          </label>{' '}
          <GroupBoxes label="Groups for the invitation" chosen={inviteGroups} disabled={busy} onChange={setInviteGroups} />
          <button type="submit" className="app-button" disabled={busy || !email.trim()}>Invite</button>
        </form>

        <h3>People</h3>
        {people.length === 0 ? <p>Nobody is listed.</p> : (
          <ul className="publisher-list" aria-label="People">
            {people.map(person => {
              const chosen = edits[person.username] ?? person.groups
              const edited = !sameGroups(chosen, person.groups)
              return (
                <li key={person.username}>
                  <span className="publisher-poem">
                    <strong>{person.name}</strong> <span className="publisher-author">{person.email}, {person.status}</span>
                  </span>
                  <span className="publisher-actions">
                    <GroupBoxes label={`Groups of ${person.name}`} chosen={chosen} disabled={busy}
                      onChange={groups => setEdits(current => ({ ...current, [person.username]: groups }))} />
                    <button type="button" disabled={busy || !edited}
                      onClick={() => change(c => setGroups(c, person.username, chosen, person.groups), `Saved the groups of ${person.name}.`, person.username)}>
                      Save groups
                    </button>
                    {person.status === 'invited' && (
                      <button type="button" disabled={busy}
                        onClick={() => change(c => resendInvitation(c, person.username), `Sent the invitation to ${person.name} again.`, person.username)}>
                        Resend invitation
                      </button>
                    )}
                    {person.status === 'disabled' ? (
                      <button type="button" disabled={busy} onClick={() => change(c => enable(c, person.username), `Enabled ${person.name}.`, person.username)}>
                        Enable
                      </button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => change(c => disable(c, person.username), `Disabled ${person.name}.`, person.username)}>
                        Disable
                      </button>
                    )}
                  </span>
                  {about === person.username && result}
                </li>
              )
            })}
          </ul>
        )}
      </>
    )
  }

  return (
    <div className="app-account-page publisher-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} Administer</title>
      </Helmet>
      <section className="heroine heroine--normal">
        <h2>Administer</h2>
        {content}
      </section>
    </div>
  )
}

export default Admin
