import React, { Children, PropsWithChildren, ReactElement } from 'react'
import { useLocation } from 'react-router'

interface IProps {
  fallback?: any
  from?: string[] | string
  fromAllBut?: string[] | string
}

function Hide({ from, fromAllBut, children, fallback }: PropsWithChildren<IProps>): ReactElement {
  const { pathname } = useLocation()

  if (typeof from === 'string') {
    from = [from]
  }

  if (typeof fromAllBut === 'string') {
    fromAllBut = [fromAllBut]
  }

  fallback = fallback || <></>

  let hide = false

  if (from) {
    for (const pathPart of from) {
      if (pathname.includes(pathPart)) {
        hide = true
        break
      }
    }
  }

  if (fromAllBut) {
    for (const pathPart of fromAllBut) {
      if (!pathname.includes(pathPart)) {
        hide = true
        break
      }
    }
  }

  return (
    hide
      ? <span />
      : <>{ children }</>
  )
}

export default Hide
