import React, { ReactElement, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { APP_API_URL, APP_AVAILABLE } from '../app/config'
import { ApiError, Me as MeResult, apiFetch } from '../app/api'
import { currentSession, signInUrl, signOut } from '../app/auth'
import { authSettings, browserDeps } from '../app/browser'

// Who you are on the beta app, and your groups (docs/app-api.md, GET /me). The first signed-in page:
// it proves sign-in end to end before any feature is built on it (#110).
function Me(): ReactElement {
  const session = APP_AVAILABLE ? currentSession(browserDeps()) : null
  const [me, setMe] = useState<MeResult | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    apiFetch<MeResult>(APP_API_URL, session.idToken, '/me')
      .then(setMe)
      .catch(error => setProblem(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'))
    // The session is read once per visit to the page.
  }, [])

  const signIn = async () => {
    window.location.assign(await signInUrl(authSettings(), browserDeps(), '/me'))
  }
  const leave = () => {
    window.location.assign(signOut(authSettings(), browserDeps()))
  }

  let content: ReactElement
  if (!APP_AVAILABLE) {
    content = <p>Signing in is not available on this site.</p>
  } else if (!session) {
    content = <p><button type="button" className="app-button" onClick={signIn}>Sign in</button></p>
  } else if (problem) {
    content = <p role="alert">{problem}</p>
  } else if (!me) {
    content = <p>Loading…</p>
  } else {
    content = (
      <>
        <p>You are signed in as <strong>{me.email}</strong>.</p>
        <p>{me.groups.length ? `Your roles: ${me.groups.join(', ')}.` : 'You have no roles yet. Ask the editor to add you.'}</p>
      </>
    )
  }

  return (
    <div className="app-account-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} Your account</title>
      </Helmet>
      <section className="heroine heroine--normal">
        <h2>Your account</h2>
        {content}
        {session && <p><button type="button" className="app-button" onClick={leave}>Sign out</button></p>}
      </section>
    </div>
  )
}

export default Me
