import React, { ReactElement, useEffect, useState } from 'react'
import { Routes, Route, Link, NavLink } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
//@ts-ignore
import smoothscroll from 'smoothscroll-polyfill'
import useWindowSize from '@rooks/use-window-size'
import Hide from './Hide'
import CampaignMonitorForm from '../components/CampaignMonitorForm'
import Shapes from '../components/Shapes'
import PoemNav from '../components/PoemNav'
import SiteNavLinks from '../components/SiteNavLinks'
import { RootState } from '../store'
import { setMobileNavOpen } from '../store/actions'
import ProcessNote from './ProcessNote'
import LogoSvg from './LogoSvg'
import LanguageSelector from './LanguageSelector'
import { LocaleContext, useSiteLocale } from '../locale'

import {
  About,
  AboutTheApp,
  Admin,
  Contact,
  Faq,
  FaqForPoets,
  Funding,
  Home,
  Nominate,
  Poem,
  Read,
  ReadersGuide,
  Me,
  Publisher,
  Review,
  SignedIn,
  Submit,
} from '../routes'

smoothscroll.polyfill()

function App(): ReactElement {
  const { mobileNavOpen } = useSelector((state: RootState) => ({
    mobileNavOpen: state.app.mobileNavOpen,
  }))

  const dispatch = useDispatch()
  const siteLocale = useSiteLocale()

  const { innerWidth } = useWindowSize()

  const [windowSizeWarningDismissed, setWindowSizeWarningDismissed] = useState<boolean>(false)

  function handleEsc(evt: any) {
    if (evt.keyCode === 27) {
      dispatch(setMobileNavOpen(false))
    }
  }

  function dismissWindowSizeWarning() {
    setWindowSizeWarningDismissed(true)
  }

  useEffect(() => {
    document.body.addEventListener('keydown', handleEsc)
  }, [])

  return (
    <LocaleContext.Provider value={siteLocale}>
      <div className="hem-application">
        <Shapes />
        <Routes>

          <Route
            path="/poem/:poemUrl"
            element={<ProcessNote />}
          />
        </Routes>

        <header className="site-header">
          <h1>
            <Link to="/">
              <span>Midst</span>
              <LogoSvg />
            </Link>
          </h1>

          <div
            className={mobileNavOpen ? 'open' : ''}
            id="mobile-nav-toggle"
            onClick={() => dispatch(setMobileNavOpen(!mobileNavOpen))}
          >
            <span></span>
            <span></span>
            <span></span>
          </div>

          {/* TODO: Move PoemNav out of the Switch/Route and directly into the Poem component */}
          <Routes>
            <Route path="/poem/:poemUrl" element={<PoemNav />} />
          </Routes>

          <nav
            className={mobileNavOpen ? 'open' : ''}
            onClick={() => dispatch(setMobileNavOpen(false))}
          >
            <SiteNavLinks />

            <Hide from="poem">
              <NavLink
                className="about-link--desk"
                to="/about"
              >?</NavLink>
            </Hide>
            <Hide fromAllBut="poem">
              <NavLink
                className="about-link--desk light"
                to="/about"
              >?</NavLink>
            </Hide>
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/faq-for-poets" element={<FaqForPoets />} />
            <Route path="/" element={<Home />} />
            <Route path="/nominate" element={<Nominate />} />
            <Route path="/read" element={<Read />} />
            <Route path="/guide" element={<ReadersGuide />} />
            <Route path="/app" element={<AboutTheApp />} />
            <Route path="/funding" element={<Funding />} />
            <Route path="/me" element={<Me />} />
            <Route path="/publisher" element={<Publisher />} />
            <Route path="/review" element={<Review />} />
            <Route path="/submit" element={<Submit />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/signed-in" element={<SignedIn />} />
            <Route path="/poem/:poemUrl" element={<Poem />} />
          </Routes>
        </main>
        <footer className="site-footer">
          <LanguageSelector />
          <Hide from="poem">
            <>
              <CampaignMonitorForm
                labelForName="Newsletter &nbsp;🚀"
                submitButtonText="Submit"
              />
              <a
                href="http://patreon.com/midstpoetry"
                className="patreon-logo"
              />
            </>
          </Hide>
        </footer>

        {windowSizeWarningDismissed === false && innerWidth && innerWidth < 600 && (
          <div
            className="window-size-popup"
            onClick={dismissWindowSizeWarning}
          >
            <h2>Hi there!</h2>
            <p>It looks like you might be viewing this site on a screen for which Midst isn't optimized yet.</p>
            <p>Consider coming back with a larger device; click anywhere to dismiss this notice.</p>
            <p>💖,<br />Team Midst</p>
          </div>
        )}
      </div>
    </LocaleContext.Provider>
  )
}

export default App
