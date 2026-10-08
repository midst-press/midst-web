const e = require('react').createElement

module.exports = function iconCloseX() {
  return e('svg', {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'feather feather-close-x',
  },
    e('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
    e('line', { x1: '6', y1: '6', x2: '18', y2: '18' }),
  )
}
