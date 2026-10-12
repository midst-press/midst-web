import React from 'react'
import ReactDOM from 'react-dom'
import Midst from '../src/components/midst-player-hack/Midst'
import { parseMidstFile } from '../src/components/midst-player-hack/midst-file'
import '../src/index.css'

// Separate e2e entry: the production build never includes this legacy-control API or runtime.
;(window as any).mountLegacyReplay = (raw: string) => {
  const data = parseMidstFile(raw)
  ReactDOM.render(
    <div id="legacy-control" className="sliding-poems__poem sliding-poems__poem--loaded">
      <Midst activePlayer={true} appCursorFollowing={true} hasScrollbar={true} isPlayer={true}
        MIDST_DATA_JS_KEY="synthetic-legacy-control" MIDST_DATA_JS={data} />
    </div>, document.getElementById('legacy-root'),
  )
}
