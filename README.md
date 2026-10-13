# Midst Journal

The journal: a poem is shown as a timelapse of its own composition, replayed keystroke by keystroke.

To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md): the checks, the tests, and the rules about poem content.

## Before you start

**Node: the version pinned in `.nvmrc`.** CI reads that same file, so the easiest way to match CI is a
version manager that respects it:

```
nvm use          # or: fnm use / asdf install
```

Other versions may work, but the one in `.nvmrc` is what CI verifies.

## Use npm. Not yarn

**This project uses npm, and only npm.** There is one lockfile, `package-lock.json`.

This is not a preference, it is a defect we already paid for. The repository used to carry
`package-lock.json` **and** `yarn.lock` while the README told you to run `yarn`, and the two
disagreed:

- `yarn.lock` described **Parcel 1** for a while after the migration to Parcel 2, so following this
  README installed the dead bundler the migration existed to escape
- it was missing the `process` polyfill, without which the build fails — but only in CI
- it was missing `lazy-require`, a declared dependency, **entirely**

So `yarn install` produced a tree that did not match `package.json`, and nothing reported it. A
pre-commit hook now refuses to commit a second lockfile, because this is the kind of rule that has to
be mechanical rather than remembered.

```
npm ci                 # install exactly what the lockfile says. Use this, not `npm install`
npm install <pkg>      # only when you intend to CHANGE dependencies -- commit the lockfile change
```

`npm ci` fails if `package.json` and `package-lock.json` disagree. That is the point of it: the
install itself is the consistency check.

`.npmrc` carries `legacy-peer-deps=true`, which this project currently needs — React 18 is installed
against `@types/react` 16.9. That is a real mismatch rather than a flag to paper over it; see the open
issue about aligning the React types.

## Development

```
npm start              # dev server
npm run build          # production build into ./dist
```

Both pass `--no-autoinstall` deliberately. Without it, Parcel silently installs missing polyfills on
your machine and the build then fails only in CI, where autoinstall is off. A missing dependency
should fail where you can see it.

## The gates

The same checks run on your machine and in CI, from one definition in `.pre-commit-config.yaml`.
Install them once per clone:

```
pre-commit install
pre-commit run --all-files     # what CI runs, verbatim
```

They cover formatting, `tsc --noEmit`, unused dependencies, and three project-specific rules: poem
data and log files can never be committed, and `src/poems/index.ts` must stay consistent with the poem
metadata.

One more exists because the gate runs on macOS: `tools/check-import-case.mjs` fails when a relative
import is spelled in a different letter case (or Unicode form) than git has the file. macOS resolves
such an import and Linux does not, and this site has shipped that once. It compares against
`git ls-files`, never the filesystem, so it gives the same answer on both.

## Publishing a poem

`src/poems/index.ts` is **generated**. Do not edit it.

1. add `src/poems/<Poet_Name>.json` with the poem's metadata, including `"published": true`
2. give it a position in `src/poems/order.json` — newest first
3. `node tools/generate-poem-index.mjs --write`

To unpublish, set `"published": false` and remove it from `order.json`, then regenerate. A poem used to
be unpublished by commenting out a line of TypeScript, which meant publication state was only legible
to a developer.

The gates will refuse a poem with no `published` field, a published poem with no place in the order, an
order entry with no metadata file, and a hand-edited index.

## Deploying

The site is static. `npm run build` produces `./dist`, which is served from **Amazon S3 behind
CloudFront**.

> An earlier version of this README said to copy `./src/.htaccess` to the server. There is no Apache
> here and that step did nothing. Single-page-app routes such as `/poem/december` do need a fallback to
> `index.html`, but on this stack that is a CloudFront error-response rule, not a file.

There is no automated deployment yet, and there is an open issue about who controls the AWS account —
until that is answered, nothing can be deployed from CI.

## Fonts

The font files are not in this repository, and a commit hook refuses any that are added: some are
commercial, and a public repository is not a webfont licence. The site asks for them at
`MIDST_FONTS_URL`, which defaults to `/fonts/` at its own origin, so a deployment uploads the font
files beside the site under `fonts/`. `src/font-faces.json` lists every file the site asks for and
`src/fonts.ts` writes the `@font-face` rules from it when the page loads.

To see the real fonts in local development, put the files in `static/fonts/` (ignored by git); the
build copies `static/` into `dist/`, so they are served at `/fonts/`. Without them the site falls
back to system fonts and nothing else changes. The end-to-end tests do not need them: the fixture
maker writes a synthetic font under each name and the tests check that the faces load.

## Checking the poems are still reachable

```
node tools/poem-canary.mjs
```

Asks the bucket for every published poem and reports anything unreachable. It needs no credentials. It
exists because a poem was unreachable for an unknown length of time and nobody found out from the
software.
## TipTap website replay

The poem route uses `src/components/MidstPlayer/MidstPlayer.tsx`, adapted from
`reimplement-2026` at `05c727544f47dcee1d40ddaaa06ab994299dd875`. The existing loader
still validates B/C archives and preserves the Unicode asset fallback. Each validated
snapshot becomes a full replacement for the editor's reconstruction helper, including
unchanged frames. Seeking reconstructs only the selected replacement.

`follow.ts` and `helpers.ts` are copied byte-for-byte from midst-editor main. All writing
hooks exclude these copies from formatting, and the provenance hook compares them with
a freshly fetched editor main. The same hook holds the editor's tests for them, copied to
`src/__tests__/editor-*.test.ts`: each must equal its original apart from a header note and
the import path. To bring a copy up to date, copy the original and reapply those two. Locally, set `MIDST_EDITOR_ROOT` to your editor checkout
after fetching its `origin/main`. CI checks out editor main through scoped read-only
access: `MIDST_EDITOR_DEPLOY_KEY` on Gitea. On GitHub midst-editor is public, so the checkout needs no credential.

TipTap and its transitive extensions are pinned to 2.5.4, matching the editor lockfile.
`@tiptap/pm` is explicit because this website installs with `--legacy-peer-deps`.
Playback waits during a follow glide; pause, seek, navigation and unmount manage the
timer lifecycle. Cursor-following and scrollbar metadata overrides remain supported.

The synthetic follow tests cover end/middle writing jumps at 600px and 720px page
heights. The recorder also checks quiet final edits and distinguishes a forced browser
clamp from a voluntary jump. Real poem content is never needed for these CI tests.

Presentation follows midst-format `docs/META.md` at
`d0ed7fa6e3393836a53dd0d89ae5481a73b27a4e`: C's optional font family, CSS-pixel font
size and draft markers reach the player. Unknown metadata and out-of-range markers
remain in the loaded data; only in-range integer marker indices are displayed. The
synthetic frame used for a static document does not create a source history index.
Marker names stay in the reader UI, never diagnostics. Missing/unusable rendering
values fall back to Helvetica/14; other positive finite sizes remain supported.
Existing vendored font faces are included. A CSS family declaration with a generic
fallback does not certify availability of Bell/Garamond or grant new font licenses.

## Coverage: what the tests execute

```
npm run coverage
```

Runs the unit tests, then the end-to-end suite with `MIDST_COVERAGE=1`, and prints lines, branches
and functions for every code file under `src/`, and in total. It is opt-in: an ordinary `npm test`
or `npm run test:e2e` records nothing extra and is no slower.

- **How.** `e2e/coverage.ts` records Chromium's own V8 coverage for each test's page, and
  `scripts/coverage-jest-reporter.cjs` keeps the V8 coverage Jest collects for each unit test file.
  `scripts/coverage-merge.mjs` maps both back to `src/` through each build's source maps with
  `monocart-coverage-reports`, writes istanbul JSON to `coverage/unit-istanbul.json` and
  `coverage/e2e-istanbul.json`, and prints the table. Output is git-ignored.
- **A different build.** Under `MIDST_COVERAGE` the e2e build is not minified (`--no-optimize`),
  because a minified bundle cannot be mapped back function by function. So the coverage run does
  not test the build that ships; the ordinary e2e run does.
- **Three layers.** Unit-only, e2e-only and combined, all three over every file.
- **One converter for both layers.** Jest also writes `coverage/unit/coverage-final.json`, and this
  report does not read it. Jest's converter counts every source line as a statement, so its figures are not comparable with these and its maps cannot be
  merged with them. The thresholds in `package.json` are Jest's own figures and are unaffected.
- **Combined is a merge only where both layers ran a file.** The two layers run two builds of the
  same source, and the builds do not always agree on what the items are (an import is a statement in
  one and gone in the other). Items are paired by where each begins; the report prints how many
  could not be paired. Those count once per build, so for such a file the combined branch and
  function figures can read slightly low. A line counts once however many items begin on it.
- **Every file counts.** A file no test loads is listed at 0%, not left out.
- **The control.** `e2e/coverage-control.ts` holds one function that runs when the module loads and
  one nothing calls. The harness page loads it for the e2e layer and
  `src/__tests__/coverage-control.test.ts` for the unit layer. The script withholds every figure
  unless each layer shows exactly that.
- **Numbers only.** It prints file paths and percentages, never source text. The raw recordings in
  `coverage/raw/` hold the built JavaScript and stay on disk.

What it does not measure: the `asset-canary`, `asset-fetch` and `midst-file` Playwright specs run
`src/` code in Node, not in a page, so what they execute is not counted here. Coverage is what ran,
not what was asserted, and no figure from this report is used as a gate.

## License

The website's source code is licensed under the GNU Affero General Public License, version 3 or (at your
option) any later version: see `LICENSE`. That license does not cover the following, which keep their own
terms:

- font files (for example Bell MT, a Monotype font, and the other commercial fonts under `static/` and `src/`),
- poets' names, poem titles and other poem metadata, and the journal's own written text,
- third-party components that declare their own license (for example the player component's `package.json`).
