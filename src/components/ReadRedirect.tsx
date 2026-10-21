import { ReactElement, useEffect } from 'react'
import { useLocation, useParams } from 'react-router-dom'

// A poem's address under /read, as a reader may type it (midst.press/read/<poem>), goes to the poem's page at
// /poem/<poem>/, the address the Table of Contents links to. Without this it rendered a blank page (midst-web #303).
// It is a real request, not a router change: old links are followed at the edge for /poem/* (midst-infra oldlinks.mjs),
// so an old address of a retitled poem must reach it (cora-2f1e43dc, review of #317).
export default function ReadRedirect({ go = (url: string) => window.location.replace(url) }: { go?: (url: string) => void }): ReactElement | null {
  const { poemUrl } = useParams()
  const { search, hash } = useLocation()
  useEffect(() => {
    go(`/poem/${encodeURIComponent(poemUrl ?? '')}/${search}${hash}`)
  }, [])
  return null
}
