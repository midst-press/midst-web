import React from 'react'
import ReactDOM from 'react-dom'
import Midst from './legacy-player/Midst'
import { parseMidstFile } from '../src/store/midst-file'
import MidstPlayer from '../src/components/MidstPlayer/MidstPlayer'
import { IMidstFile } from '../src/store/types'
import '../src/index.css'
import './coverage-control'

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

// Re-rendering at the same root updates props on the mounted player (including during playback).
;(window as any).mountPlayerOptions = (data: IMidstFile, options: {
  activePlayer: boolean, cursorFollowing: boolean, hasScrollbar: boolean
}) => {
  ReactDOM.render(
    <div id="player-options-control" style={{ height: 600, position: 'relative' }}>
      <MidstPlayer data={data} {...options} />
    </div>, document.getElementById('legacy-root'),
  )
}

// Synthetic-only paired players for testing that local controls do not leak across instances.
;(window as any).mountTwoPlayerOptions = (data: IMidstFile) => {
  ReactDOM.render(
    <div style={{ display: 'flex' }}>
      {['first', 'second'].map(id =>
        <div key={id} id={`player-options-${id}`} style={{ width: '50%', height: 600, position: 'relative' }}>
          <MidstPlayer data={data} activePlayer={true} cursorFollowing={false} hasScrollbar={true} />
        </div>,
      )}
    </div>, document.getElementById('legacy-root'),
  )
}
