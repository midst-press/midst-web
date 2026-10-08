import React, { ReactElement } from 'react'
import { useLocation } from 'react-router'
import { NavLink } from 'react-router-dom'

function SiteNavLinks(): ReactElement {
  const { pathname } = useLocation()
  const wrapperClassName = pathname.split(/\//g)[1] === 'poem'
    ? 'poem'
    : 'normal'

  return (
    <div className={`nav-links-wrapper nav-links-wrapper--${wrapperClassName}`}>
      <NavLink to="/read">Read</NavLink>
      <NavLink to="/nominate">Nominate</NavLink>
      <NavLink to="/app">App</NavLink>
      <NavLink to="/funding" style={{ fontSize: '26px' }}>$</NavLink>
      <NavLink
        className="about-link--mobile"
        to="/about"
      >
        ?
      </NavLink>
    </div>
  )
}

export default SiteNavLinks
