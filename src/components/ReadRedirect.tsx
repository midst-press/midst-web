import React, { ReactElement } from 'react'
import { Navigate, useParams } from 'react-router-dom'

// A poem's address under /read, as a reader may type it (midst.press/read/<poem>), goes to the poem's page at
// /poem/<poem>/, the address the Table of Contents links to. Without this it rendered a blank page (midst-web #303).
export default function ReadRedirect(): ReactElement {
  const { poemUrl } = useParams()
  return <Navigate to={`/poem/${encodeURIComponent(poemUrl ?? '')}/`} replace />
}
