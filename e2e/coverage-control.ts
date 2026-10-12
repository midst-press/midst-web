// Positive control for the coverage measurement. Issue #13.
//
// Loaded only by the e2e harness page. One function runs when the page loads; the other is never
// called by anything. scripts/coverage-merge.mjs refuses to report unless it sees exactly that: a
// measurement that shows the uncalled function as covered (a V8 dump can carry a section that makes
// everything read 100%, see midst-editor #36) or the called one as uncovered is not a measurement.
//
// Both are kept on `window` so the bundler cannot drop the uncalled one as dead code.
export function coverageControlCalled(): number {
  return 1
}

export function coverageControlNeverCalled(): number {
  return 2
}

;(window as any).coverageControl = { coverageControlCalled, coverageControlNeverCalled }
coverageControlCalled()
