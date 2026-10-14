import React, { ReactElement } from 'react'
import { useSelector } from 'react-redux'
import { RootState } from '../store'

export const POEM_LIST_FAILED_MESSAGE = 'The poems could not be loaded. Please try again later.'
export const POEM_LIST_LOADING_MESSAGE = 'Loading the poems.'

// Says so when the list of poems is not there (MIDST_POEM_LIST=published, #110). Renders nothing once it is,
// and always under `bundled`. A failed list is only ever reported: no other list is shown in its place.
function PoemListStatus(): ReactElement | null {
  const status = useSelector((state: RootState) => state.app.poemList)

  if (status === 'failed') {
    return <p className="poem-list__failure" role="alert">{POEM_LIST_FAILED_MESSAGE}</p>
  }
  if (status === 'loading') {
    return <p className="poem-list__loading" role="status">{POEM_LIST_LOADING_MESSAGE}</p>
  }
  return null
}

export default PoemListStatus
