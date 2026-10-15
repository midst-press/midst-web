import React, { ReactElement, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet'
import { useNavigate } from 'react-router-dom'
import { BASE_SITE_PAGE_TITLE } from '../config'
import { SignInError, completeSignIn } from '../app/auth'
import { authSettings, browserDeps } from '../app/browser'

// Where Cognito's managed login sends the browser back to (docs/app-api.md). Finishes sign-in, then
// goes to the page the person was on.
function SignedIn(): ReactElement {
  const navigate = useNavigate()
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    completeSignIn(authSettings(), browserDeps(), window.location.search)
      .then(next => navigate(next, { replace: true }))
      .catch(error => setProblem(error instanceof SignInError ? error.message : 'Sign-in could not be completed. Please sign in again.'))
  }, [navigate])

  return (
    <div className="app-account-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} Signing in</title>
      </Helmet>
      <section className="heroine heroine--normal">
        {problem
          ? <><p role="alert">{problem}</p><p><a href="/me">Back to sign in</a></p></>
          : <p>Signing you in…</p>}
      </section>
    </div>
  )
}

export default SignedIn
