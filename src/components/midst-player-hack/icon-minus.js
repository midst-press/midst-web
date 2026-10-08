const e = require('react').createElement

function iconMinus() {
  return e('svg', {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'feather feather-minus',
  },
    e('line', { x1: '5', y1: '12', x2: '19', y2: '12' }),
  )
}
