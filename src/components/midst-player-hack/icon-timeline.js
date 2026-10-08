const e = require('react').createElement

module.exports = function iconTimeline() {
  return e('svg', {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'feather feather-pin',
  },
    e('circle', { cx: '12', cy: '12', r: '10' }),
    e('polyline', { points: '12 6 12 12 16 14' }),
  )
}
