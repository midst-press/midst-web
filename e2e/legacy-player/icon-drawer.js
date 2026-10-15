const e = require('react').createElement

module.exports = function iconDrawer() {
  return e('svg', {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'feather feather-list',
  },
    e('line', { x1: '8', y1: '6', x2: '21', y2: '6' }),
    e('line', { x1: '8', y1: '12', x2: '21', y2: '12' }),
    e('line', { x1: '8', y1: '18', x2: '21', y2: '18' }),
    e('line', { x1: '3', y1: '6', x2: '3', y2: '6' }),
    e('line', { x1: '3', y1: '12', x2: '3', y2: '12' }),
    e('line', { x1: '3', y1: '18', x2: '3', y2: '18' }),
  )
}
