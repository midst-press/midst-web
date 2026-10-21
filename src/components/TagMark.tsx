import React, { ReactElement } from 'react'
import { textColourFor } from '../tagColour'

/** A tag's mark (#310): its own colour, with black or white text, whichever reads. The name is text, never markup. */
function TagMark({ name, colour }: { name: string, colour: string }): ReactElement {
  return <span className="tag-mark" style={{ backgroundColor: colour, color: textColourFor(colour) }}>{name}</span>
}

export default TagMark
