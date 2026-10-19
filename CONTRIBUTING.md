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
text, so the responsibility is yours. The end-to-end tests generate synthetic poems
(`MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=bundled npm run e2e:fixtures`); use those.

## Words people see or hear

Every word a reader, poet or publisher sees or hears lives in a message catalog under `locales/`, never in the
code, so the journal's editor can change the wording without changing any code. The design is midst-infra
`docs/design/message-catalog.md`.

- **Short texts** (labels, buttons, notices, error messages, page titles, accessible names, tooltips and alt
  text) are messages in `locales/en/messages.po`. Each has a stable id such as `player.speed.label`, never the
  English text, and placeholders use ICU syntax (`{fileName}`).
- **Pages and guides that are mostly prose** are one Markdown file per language in `locales/en/docs/`, the
  reader's guide among them. The editor's user guide is a byte-identical copy of midst-editor's, checked as it
  is today.
- **Text you add or move goes in marked as a draft** (`#, fuzzy` on a message, `status: draft` in a document's
  front matter), so it appears on the journal's editor's review list. Move existing text without rewording it;
  the wording is the journal's editor's to change.
- **English is complete and is the source.** Another language sits beside it (`locales/fr/...`) with the same
  structure, and anything it doesn't have yet shows in English.
- **Not catalog text:** poem content, poets' names and titles, log and console output, code comments, and test
  fixtures.

The catalog is being introduced now, in the order the design gives. Until it has reached the part of the code
you're changing, put new user-facing text where the existing text lives and list it in the pull request, so it
moves with the rest.

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
works too). Install it before `npm ci`: `npm ci` installs this clone's git hooks for you
(`tools/install-hooks.cjs`) and fails if it cannot, and `npm test` does not run in a clone without them. A
commit made without the hooks skips every check below and the rule about closing keywords. One hook runs on
push and refuses to rewrite a branch the remote already has: merge main in instead of rebasing, and add a commit
instead of amending one that is pushed. A clone set up before that hook existed fails each commit, saying so, until
`npm ci` (or `pre-commit install`) runs again.

Several hooks call tools from `node_modules`, so run `npm ci` first.

Some player helpers are copied from the editor and must stay identical to it, and a hook checks that.
It needs a current checkout of `midst-press/midst-editor`, named by `MIDST_EDITOR_ROOT`:

```
git clone https://github.com/midst-press/midst-editor.git ../midst-editor   # once; pull it before checking
export MIDST_EDITOR_ROOT=$PWD/../midst-editor
npx playwright install chromium                                             # once; the end-to-end tests need it

pre-commit run --all-files    # formatting, type check, unused dependencies, project rules
npm test -- --coverage        # unit tests (Jest), with the per-file coverage thresholds, as CI runs them
MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=bundled npm run test:e2e   # end-to-end: does a poem still load and play (Playwright)
MIDST_KEY_SCHEME=legacy npm run test:e2e:published                  # the same site with the published poem list
```

The end-to-end commands, the fixture maker and the build refuse to start without `MIDST_KEY_SCHEME` and
`MIDST_POEM_LIST` (README, "Key scheme", "Poem list"). `legacy` is what CI's main pass uses.

- **Tests come with the change.** A bug fix carries a test that fails without it.
- **Titles, descriptions and commit messages say `Refs #12`, not `Fixes #12` or `Closes #12`.** A closing
  keyword closes the issue the moment the commit reaches `main`, before anyone has checked the fix in a
  release. The `commit-msg` hook that `pre-commit install` sets up refuses one, and so does a check on the
  pull request. In the pull request that finishes an issue, write `Completes #12`: see "How an issue gets
  closed" below.
- **Replay and scrolling.** If you change how the player follows the writing (`src/components/MidstPlayer/`,
  especially `follow.ts`), run `MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=bundled npm run e2e:frame-budget -- --headed` on a machine with a display if you can. These
  tests measure the scrolling over time, so they need real frame timing. They are not required locally:
  the `frame-budget` workflow runs them on every pull request.

## How an issue gets closed

An issue is closed by the person who checks the fix on the deployed site, not by the merge.

1. A pull request whose title or description says `Completes #12` merges. Issue 12 is labelled
   `awaiting release`. `Refs #12` is only a link, for a pull request that is part of the work.
2. A release that contains that merge is deployed. The issue is labelled `needs verifying`, put on the
   release's milestone and assigned to the verifier, with a comment naming the release and quoting the
   issue's own "How will we know this works?" steps.
3. The verifier follows the steps on the site. If it works they close the issue, saying what they did and
   saw. If not, they say what happened and it stays open.

An issue closed while it is still `awaiting release` is reopened, with a comment saying why. The
workflow is `.github/workflows/issue-flow.yml`; the verifier is the repository variable `MIDST_VERIFIER`.
Publishing a release does not start step 2: the deployment has to have succeeded first. The deploy
workflow runs it as its last step; after a deployment made by hand, run `issue-flow` with the tag.

## CI

On every pull request:

- `ci.yml`: the pre-commit checks, the unit tests with coverage, the build, and the end-to-end tests.
- `frame-budget.yml`: the replay-and-scroll tests, headed under Xvfb on Linux, three times. They refuse
  their own measurement if the machine cannot deliver frames, rather than passing.
- `closing-keywords.yml`: no closing keyword in the title, the description or the commit messages.

`canary.yml` runs on a schedule and checks that every published poem can still be fetched.
