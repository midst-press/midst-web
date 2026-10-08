/*
 * Pointer geometry helpers.
 *
 * Typed structurally rather than as DOM MouseEvent, because callers pass BOTH native DOM events and
 * React synthetic events, and React's SyntheticEvent is not assignable to MouseEvent. Naming only
 * the four coordinates these functions actually read keeps both callers valid without `any`.
 */
type PointerLike = Pick<MouseEvent, 'pageX' | 'pageY' | 'clientX' | 'clientY'>

export const mouseTheta = (evt: PointerLike, el: Element) => {
  const rect = el.getBoundingClientRect()
  const deltaX = evt.pageX - rect.left - rect.width / 2
  const deltaY = evt.pageY - rect.top - rect.height / 2
  const thetaR = Math.atan2(deltaY, deltaX)
  const thetaD = ((thetaR > 0 ? thetaR : (2 * Math.PI + thetaR)) * 360 / (2 * Math.PI))
  const thetaN = thetaD < 270 ? thetaD + 90 : thetaD - 270
  const thetaNF = thetaN === 0 ? 180 : thetaN === 180 ? 0 : thetaN
  return thetaNF
}

export const isMouseIn = (evt: PointerLike, el: Element, invert = false) => {
  const rect = el.getBoundingClientRect()
  const mouseIn =
    evt.clientX > rect.left &&
    evt.clientX < rect.left + rect.width &&
    evt.clientY > rect.top &&
    evt.clientY < rect.top + rect.height

  let percent
  if (invert) {
    percent = {
      x: (rect.left - evt.clientX) / rect.width,
      y: (rect.top - evt.clientY) / rect.height * -1,
    }
  }

  else {
    percent = {
      x: (evt.clientX - rect.left) / rect.width,
      y: (evt.clientY - (rect.top + rect.height)) / rect.height * -1,
    }
  }

  return {
    mouseIn,
    percent,
  }
}

export const coords = (evt: PointerLike, el: Element, inverted = false) => {
  const m = isMouseIn(evt, el, inverted).percent
  return {
    x: m.x >= 0 && m.x <= 1 ? m.x : m.x < 0 ? 0 : m.x > 1 ? 1 : 0,
    y: m.y >= 0 && m.y <= 1 ? m.y : m.y < 0 ? 0 : m.y > 1 ? 1 : 0,
  }
}
