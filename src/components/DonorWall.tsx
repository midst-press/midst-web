import React, { PropsWithChildren, ReactElement, useEffect, useState } from 'react'
import { Patrons, loadPatrons } from '../patrons'

// The patrons, under the heading the page gives. The names come from patrons.json (src/patrons.ts), which the
// publisher edits, so none are written here (#58).

export const PATRONS_UNAVAILABLE = 'The list of patrons could not be loaded just now.'

interface IProps {
  load?: () => Promise<Patrons>
}

function DonorWall({ children, load = loadPatrons }: PropsWithChildren<IProps>): ReactElement {
  const [patrons, setPatrons] = useState<Patrons | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    load().then(
      found => { if (current) setPatrons(found) },
      () => {
        if (!current) return
        console.error('Unable to load the patrons')
        setFailed(true)
      },
    )
    return () => { current = false }
  }, [])

  return (
    <div className="donor-wall">
      { children }
      {failed && <p className="donor-list-unavailable">{PATRONS_UNAVAILABLE}</p>}
      {patrons && (
        <ul className="donor-list">
          {/* Two patrons may share a name, so the key is the position. */}
          {patrons.patrons.map((name, i) => <li key={i}>{ name }</li>)}
          {patrons.closing && <li key="closing">{ patrons.closing }</li>}
        </ul>
      )}
    </div>
  )
}

export default DonorWall
