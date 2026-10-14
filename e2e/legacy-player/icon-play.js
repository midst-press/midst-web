const e = require('react').createElement

module.exports = function iconPlay() {
  return e('svg', {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'feather feather-play',
  },
    e('polygon', { points: '5 3 19 12 5 21 5 3' }),
  )
}
