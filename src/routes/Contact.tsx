import React, { ReactElement } from 'react'
import { Helmet } from 'react-helmet'
import { BASE_SITE_PAGE_TITLE } from '../config'

function Contact(): ReactElement {
  return (
    <div className="contact-page">
      <Helmet>
        <title>{BASE_SITE_PAGE_TITLE} Contact</title>
        <meta name="description" content="" />
      </Helmet>

      <div className="nominate-form">
        <form action="https://docs.google.com/forms/d/e/1FAIpQLSdKCn_TEKC8rHn6jiVdtvFzEeI1wzO2rRz-nz2hFYTvPMdfZQ/formResponse?embedded=true" target="_blank">
          <div className="form-block">
            <p>Give us a shout here:</p>
          </div>

          <div className="form-block">
            <label htmlFor="emailAddress">Your email address <sup>*</sup></label>
            <input name="emailAddress" type="email" required />
          </div>

          <div className="form-block">
            <label htmlFor="entry.237238107">Your name <sup>*</sup></label>
            <input name="entry.237238107" type="text" required />
          </div>

          <div className="form-block">
            <label htmlFor="entry.172247992">Message <sup>*</sup></label>
            <textarea name="entry.172247992" required></textarea>
          </div>

          <div className="form-block">
            <button type="submit">SUBMIT</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Contact
