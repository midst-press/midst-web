// Positive control for the unit layer of `npm run coverage` (see e2e/coverage-control.ts). Importing
// the module runs one of its two functions and leaves the other uncalled; scripts/coverage-merge.mjs
// refuses to report a unit layer that does not show exactly that.
import '../../e2e/coverage-control'

test('the coverage control module loaded', () => {
  expect(Object.keys((globalThis as any).coverageControl)).toEqual(['coverageControlCalled', 'coverageControlNeverCalled'])
})
