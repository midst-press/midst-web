const e = require('react').createElement

function iconItalic() {
  return e('svg', {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'feather feather-italic',
  },
    e('line', { x1: '19', y1: '4', x2: '10', y2: '4' }),
    e('line', { x1: '14', y1: '20', x2: '5', y2: '20' }),
    e('line', { x1: '15', y1: '4', x2: '9', y2: '20' }),
  )
}
