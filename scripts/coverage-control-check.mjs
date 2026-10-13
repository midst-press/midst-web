// Which of the positive control's four checks failed, as messages. Kept apart from
// coverage-merge.mjs so that scripts/coverage-control-check.test.mjs can make each one fire.
//
// Every failed check is named, not only the first. The converter derives a function's count and its
// statements' counts from the same ranges, so two of these usually fail together, and stopping at
// the first would leave the second as a message nobody has ever seen fire.
export function controlFailures({ called, never, calledBody, neverBody }) {
  return [
    !(called > 0) && 'the function the module calls reads as never run',
    never !== 0 && 'the function nothing calls reads as run',
    !(calledBody > 0) && 'the statement inside the called function reads as never run',
    neverBody !== 0 && 'the statement inside the uncalled function reads as run',
  ].filter(Boolean)
}
