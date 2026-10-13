# Contributing to the Midst Journal website

This is the website of the Midst Journal: the list of published poems, and the player that replays how
each poem was written. Thank you for helping.

## Where contributions go

Open issues and pull requests here, on GitHub (`midst-press/midst-web`). Pull requests target `main`.
A pull request is merged when its CI is green and a maintainer has reviewed it.

How the journal looks and reads is decided by its editor, so for a change in appearance or behaviour,
describe what you see and what you expect, and let the maintainers route the decision.

## Never commit poem content

The poems, their timelapses and process notes are the poets' work. They live in the journal's storage,
never in this repository, an issue, a pull request or a CI log. That includes poem text, and titles or
poets' names from unpublished work. Pre-commit hooks refuse poem data files, but they cannot recognise
text, so the responsibility is yours. The end-to-end tests generate synthetic poems (`npm run
e2e:fixtures`); use those.

## Licence

AGPL-3.0-or-later (`LICENSE`) for the site's source. By contributing you agree your contribution is
licensed the same way. Fonts, poem metadata, the journal's own text and third-party components keep their
own terms; see the README's licence section.

## Setting up

The README covers this in detail ("Before you start", "Use npm. Not yarn", "Development"). In short:
the Node version in `.nvmrc`, npm only, and `npm ci`, not `npm install`.

The fonts are not in this repository. Without a local copy the site falls back to system fonts, which is
fine for development; the README's "Fonts" section says how to use a copy.

## Before you open a pull request

`pre-commit` is a Python tool: `pipx install pre-commit==4.6.2` (the version CI uses; `uv tool install`
works too). Several hooks call tools from `node_modules`, so run `npm ci` first.

Some player helpers are copied from the editor and must stay identical to it, and a hook checks that.
It needs a current checkout of `midst-press/midst-editor`, named by `MIDST_EDITOR_ROOT`:

```
git clone https://github.com/midst-press/midst-editor.git ../midst-editor   # once; pull it before checking
export MIDST_EDITOR_ROOT=$PWD/../midst-editor
npx playwright install chromium                                             # once; the end-to-end tests need it

pre-commit install            # once per clone
pre-commit run --all-files    # formatting, type check, unused dependencies, project rules
npm test -- --coverage        # unit tests (Jest), with the per-file coverage thresholds, as CI runs them
npm run test:e2e              # end-to-end: does a poem still load and play (Playwright)
```

- **Tests come with the change.** A bug fix carries a test that fails without it.
- **Replay and scrolling.** If you change how the player follows the writing (`src/components/MidstPlayer/`,
  especially `follow.ts`), run `npm run e2e:frame-budget -- --headed` on a machine with a display if you can. These
  tests measure the scrolling over time, so they need real frame timing. They are not required locally:
  the `frame-budget` workflow runs them on every pull request.

## CI

On every pull request:

- `ci.yml`: the pre-commit checks, the unit tests with coverage, the build, and the end-to-end tests.
- `frame-budget.yml`: the replay-and-scroll tests, headed under Xvfb on Linux, three times. They refuse
  their own measurement if the machine cannot deliver frames, rather than passing.

`canary.yml` runs on a schedule and checks that every published poem can still be fetched.
