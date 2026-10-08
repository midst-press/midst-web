import React, { ReactElement, useEffect, useState } from 'react'
import { Routes, Route, Link, NavLink } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
//@ts-ignore
import smoothscroll from 'smoothscroll-polyfill'
import useWindowSize from '@rooks/use-window-size'
import Hide from './Hide'
import CampaignMonitorForm from './CampaignMonitorForm'
import Shapes from './Shapes'
import PoemNav from './PoemNav'
import SiteNavLinks from './SiteNavLinks'
import { RootState } from '../store'
import { setMobileNavOpen } from '../store/actions'
import ProcessNote from './ProcessNote'
import LogoSvg from './LogoSvg'

import {
  About,
  AboutTheApp,
  Contact,
  Faq,
  FaqForPoets,
  Funding,
  Home,
  Nominate,
  Poem,
  Read,
} from '../routes'

smoothscroll.polyfill()

function App(): ReactElement {
  const { mobileNavOpen } = useSelector((state: RootState) => ({
    mobileNavOpen: state.app.mobileNavOpen,
  }))

  const dispatch = useDispatch()

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
    <div className="hem-application">
      <main>
        <Routes>
          {/* <Route path="/poem/:poemUrl" element={<Poem />} /> */}
        </Routes>
      </main>
    </div>
  )
}

export default App
