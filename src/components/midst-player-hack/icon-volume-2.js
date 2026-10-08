const e = require('react').createElement

module.exports = function iconVolume2() {
  return e('svg', {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'feather feather-volume-2',
  },
    e('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }),
    e('path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07' }),
  )
}
