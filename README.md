# Midst Journal

This repository is the Midst Journal website. It shows each poem as a timelapse of its own composition, replayed keystroke by keystroke. It also holds the beta app: signed-in pages where poets submit poems and publishers review and publish them.

To contribute, read [CONTRIBUTING.md](CONTRIBUTING.md): the checks, the tests, and the rules about poem content.

## Before you start

Use the Node version pinned in `.nvmrc`. CI reads the same file.

```
nvm use          # or any version manager that reads .nvmrc
```

Install `pre-commit` before you install dependencies. It is a Python tool; CI uses version 4.6.2.

```
pipx install pre-commit==4.6.2
```

### Use npm. Not yarn

Use npm only. The one lockfile is `package-lock.json`. A hook refuses a second lockfile (`yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `npm-shrinkwrap.json`).

```
npm ci                 # install exactly what the lockfile says
npm install <pkg>      # only to change dependencies; commit the lockfile change
```

`npm ci` fails when `package.json` and `package-lock.json` disagree. That is the consistency check.

### Git hooks

`npm ci` installs the git hooks for this clone (the `prepare` script runs `tools/install-hooks.cjs`) and fails if it cannot. `npm test` refuses to run in a clone without them. Outside a git clone, or when `CI` is set, the install does nothing.

The hooks are the checks CI runs. They cover formatting (prettier), `tsc --noEmit`, unused dependencies, relative-import letter case, poem ids, the generated poem index, copies kept from other repositories, and rules that refuse poem data, font files, log files and a second lockfile. A `commit-msg` hook refuses closing keywords such as `fixes #12`; write `Refs #12`.

One hook needs a checkout of `midst-editor` (see "Copies of midst-editor files"):

```
git clone https://github.com/midst-press/midst-editor.git ../midst-editor   # once; fetch before each check
export MIDST_EDITOR_ROOT=$PWD/../midst-editor
pre-commit run --all-files --show-diff-on-failure                           # what CI runs
```

Several hooks call tools from `node_modules`, so run `npm ci` first.

## Run it locally

### Development

```
MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=bundled npm start        # dev server
MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=bundled npm run build    # production build into ./dist
```

Both refuse to start without `MIDST_KEY_SCHEME` and `MIDST_POEM_LIST`. See "Key scheme" and "Poem list" for which values to use.

Both pass `--no-autoinstall` to Parcel on purpose. A missing dependency fails where you can see it, not only in CI.

Without all three `MIDST_APP_*` variables the beta app is not available: its pages are still in the build, and each says so (see "The beta app"). Without `MIDST_POEMS_URL` the site reads poems from the production bucket.

## Tests

### Unit tests

```
npm test                       # Jest: src/**/__tests__/**/*.test.ts and tools/__tests__/**/*.test.cjs
npm test -- --coverage         # with the per-file coverage floors, as CI runs it
npm run test:coverage-control  # the coverage report's own control, with node's test runner
```

Unit tests set `MIDST_KEY_SCHEME=legacy` and `MIDST_POEM_LIST=bundled` themselves, whatever your shell has.

Each file in `jest.collectCoverageFrom` (15 files) has its own floor in `package.json`. A file with no tests counts as 0% and fails. Every floor is 100% except these:

- `src/store/reducer.ts`: branches 94, lines 99, statements 99.
- `src/app/auth.ts`: branches 97.

### End-to-end tests

Install the browser once:

```
npx playwright install chromium
```

The bundled-list suite:

```
MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=bundled npm run test:e2e
```

The published-list suite builds its own bundle (`dist-published`) and fixtures, and serves them on its own port:

```
MIDST_KEY_SCHEME=legacy npm run test:e2e:published
```

Both suites use synthetic poems. The tests build the site against a local server, so they need no network, no credentials and no poem data. Each run starts its own server and builds first.

| Variable | Default | What it sets |
|---|---|---|
| `MIDST_E2E_PORT` | 8099 | port of the bundled-list suite |
| `MIDST_E2E_PUBLISHED_PORT` | 8098 | port of the published-list suite |

The server takes its port before it builds and exits with code 3 if the port is taken.

To generate fixtures alone: `MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=bundled npm run e2e:fixtures`.

CI also runs four specs under `MIDST_KEY_SCHEME=canonical` and the whole published suite.

The replay-and-scroll tests measure real frame timing. Run them on a machine with a display if you change `src/components/MidstPlayer/`:

```
MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=bundled npm run e2e:frame-budget -- --headed
```

`npm run e2e:frame-budget:attest` prints an attestation block of numbers for a pull request comment. The `frame-budget` workflow runs the same tests on every pull request.

### Coverage report

```
MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=bundled npm run coverage
```

This runs the unit tests, then the end-to-end suite with `MIDST_COVERAGE=1`, and prints lines, branches and functions for every code file under `src/` and in total. It is opt-in. An ordinary `npm test` or `npm run test:e2e` records nothing extra. `MIDST_COVERAGE_TEST_ARGS` adds arguments to the Playwright run.

- `e2e/coverage.ts` records Chromium's V8 coverage for each test's page, and `scripts/coverage-jest-reporter.cjs` keeps Jest's V8 coverage for each unit test file. `scripts/coverage-merge.mjs` maps both back to `src/` through source maps with `monocart-coverage-reports`. It writes `coverage/unit-istanbul.json` and `coverage/e2e-istanbul.json` and prints the table. The output is git-ignored.
- The coverage run builds the end-to-end bundle without minifying (`--no-optimize`), because a minified bundle cannot be mapped back. So it does not test the build that ships.
- It reports three layers over every file: unit only, end-to-end only, and combined. A file no test loads is listed at 0%.
- Jest also writes `coverage/unit/coverage-final.json`. The report does not read it, because Jest's converter counts every line as a statement and its maps cannot be merged with these. The floors in `package.json` are Jest's own figures.
- `e2e/coverage-control.ts` holds one function that runs when the module loads and one that nothing calls. The script withholds every figure unless the end-to-end layer, and the unit layer when one was recorded, shows exactly that. With no unit layer recorded (`coverage/unit-raw` absent) it says so and reports end-to-end figures only, the combined equal to them.
- It prints file paths and percentages, never source text. The raw recordings in `coverage/raw/` hold built JavaScript and stay on disk.

The `asset-canary`, `asset-fetch` and `midst-file` specs run `src/` code in Node, not in a page, so this report does not count what they execute. Coverage shows what ran, not what was asserted. The combined figure is not a gate.

## Build inputs

The site reads these variables at build time. Parcel writes the values into the bundle, so they are chosen when you build, not in the browser.

| Variable | Default | What it sets |
|---|---|---|
| `MIDST_KEY_SCHEME` | none, required | `legacy` or `canonical`: which object names the site asks the poems bucket for. See "Key scheme". |
| `MIDST_POEM_LIST` | none, required | `bundled` or `published`: where the site gets its list of poems. See "Poem list". |
| `MIDST_POEMS_URL` | production authors URL | where timelapses, process notes and `published.json` are read from |
| `MIDST_MEDIA_URL` | production authors URL | author photographs |
| `MIDST_SHAPES_URL` | production shapes URL | decorative shapes |
| `MIDST_FONTS_URL` | `/fonts/` | the font files named in `src/font-faces.json` |
| `MIDST_APP_API_URL` | none | the beta app's API |
| `MIDST_APP_AUTH_DOMAIN` | none | the Cognito managed login domain, with or without `https://` |
| `MIDST_APP_CLIENT_ID` | none | the user pool's app client for this site |
| `MIDST_BUILD_TAG` | none | the release tag the commit carries, for the About page |
| `MIDST_BUILD_COMMIT` | none | the short commit id, with `-dirty` if the tree was modified |
| `MIDST_BUILD_DATE` | none | the commit's date (ISO 8601), not the build time |

When any of `MIDST_POEMS_URL`, `MIDST_MEDIA_URL` or `MIDST_SHAPES_URL` differs from production, the site shows that it is a non-production build. The beta app is available only when all three `MIDST_APP_*` values are set. Without them the signed-in pages say the app is not available here.

### Fonts

The font files are not in this repository, and a hook refuses any that are added. Some are commercial, and a public repository is not a webfont licence. The site asks for them at `MIDST_FONTS_URL`, which defaults to `/fonts/` at the site's own origin. A deployment uploads the font files beside the site under `fonts/`. `src/font-faces.json` lists every file the site asks for. `src/fonts.ts` writes the `@font-face` rules from it when the page loads.

To see the real fonts in local development, put the files in `static/fonts/`. Git ignores that directory. Without them the site falls back to system fonts.

If `MIDST_FONTS_URL` points at a different origin, that host must answer font requests with an `Access-Control-Allow-Origin` header naming the site (or `*`). Browsers load cross-origin fonts only with it.

The end-to-end tests do not need real fonts. The fixture maker writes a synthetic font under each name in `src/font-faces.json`.

## Poems

Poem data never enters this repository. [DATA.md](DATA.md) says where it lives, why, and what the data formats are. Do not put poem text, titles, poets' names or donor names in code, issues, pull requests or logs.

### Publishing a poem

`src/poems/index.ts` is generated. Do not edit it.

1. Add `src/poems/<Poet_Name>.json` with the poem's metadata, including `"published": true`.
2. Give it an id: `node tools/poem-ids.mjs --mint`.
3. Add its file name, without `.json`, to the `order` array in `src/poems/order.json`. The order is editorial data. It is not sorted by date.
4. Regenerate the index: `node tools/generate-poem-index.mjs --write`.

To unpublish, set `"published": false`, remove the poem from `order.json`, and regenerate.

The hooks refuse a poem with no `published` field, a published poem with no place in the order, an order entry with no metadata file, a hand-edited index, a poem without an id, and two poems with one id.

### Poem ids

Every poem file has an `id`: a random version-4 UUID, minted once, that says nothing about the poem. Poets' names and poem titles change, so storage is keyed on the id. Never edit an id, reuse one, or build one from anything.

```
node tools/poem-ids.mjs --mint    # after adding a poem file: gives it an id
node tools/poem-ids.mjs           # the check the commit hook runs
```

A poem file can be left without an id only by listing it, with the reason, in `PENDING` in `tools/poem-ids.mjs`. Under the `canonical` key scheme the id is the poem's object name. Under `legacy` nothing reads it.

### Key scheme

`MIDST_KEY_SCHEME` says which object names the site asks a bucket for. It has no default. A build, the canary, the fixture maker (for the bundled list) and the end-to-end suite each refuse to start without it.

- `legacy`: names built from the author and title, as production holds them. Built by `src/poems/poem-names.js`.
- `canonical`: `<id>/timelapse.midst.zip` and `<id>/process-note.md`, from the poem's id. Every published poem must have an id.

```
MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=bundled npm run build
MIDST_KEY_SCHEME=canonical MIDST_POEM_LIST=bundled npm run test:e2e
MIDST_KEY_SCHEME=legacy node tools/poem-canary.mjs
```

The scheme is built into the site. It must match what the bucket at `MIDST_POEMS_URL` holds, or every poem shows as not found. The names come from `src/poems/key-scheme.js`.

### Poem list

`MIDST_POEM_LIST` says where the site gets its list of poems. It has no default. The build, the fixture maker and both end-to-end suites refuse to start without it.

- `bundled`: the list built into the site (`src/poems/index.ts`), asked for under `MIDST_KEY_SCHEME`.
- `published`: `published.json` under `MIDST_POEMS_URL`, fetched once when the site starts. `MIDST_POEMS_URL` must end in `/poems/`. The array order is the reading order. Each entry records the keys its poem is fetched under, a timelapse and a process note or `null`: `poems/<id>/timelapse.midst.zip` for the seeded poems, `poems/<id>/<generation>/…` for one published from the app. The site fetches `MIDST_POEMS_URL` plus the key without its leading `poems/`, and derives no name. If the list cannot be fetched or is malformed, the site says the poems could not be loaded. It never falls back to the bundled list. `MIDST_KEY_SCHEME` is still required under `published`, but the build does not ask the bundled poem files for ids.

```
MIDST_KEY_SCHEME=legacy MIDST_POEM_LIST=published npm run build
MIDST_KEY_SCHEME=legacy npm run test:e2e:published
```

The checks on the list are in `src/poems/poem-list.js`. The first list is written by `tools/seed-published.mjs`:

```
node tools/seed-published.mjs --staged <dir> --out <file> [--poems <dir>]
```

`--staged` is the staged canonical objects; every key in the list must be a file there. `--out` is refused inside a git work tree and never overwrites an existing file. Upload the result with `If-None-Match: *`, so it cannot replace a list the publisher has changed.

### Checking the poems are still reachable

```
MIDST_KEY_SCHEME=legacy node tools/poem-canary.mjs
```

This asks the bucket for every published poem in `src/poems` and reports anything unreachable. It needs no credentials and prints status codes, never poem content. It checks the bundled files only; for a published list, `deploy/beta/check_published_list.py` runs during a deploy. Optional variables:

| Variable | Default | What it sets |
|---|---|---|
| `MIDST_ASSETS_URL` | production authors URL | the bucket to ask |
| `MIDST_POEMS_DIR` | `src/poems` | the poem metadata directory |
| `MIDST_CANARY_TIMEOUT` | 45000 | per-request timeout in milliseconds |

The `canary` workflow runs it daily at 06:17 UTC under `legacy` and opens an issue labelled `canary` if anything is unreachable.

## The beta app

The beta app is a set of signed-in pages in the same bundle: a poet submits a poem, a publisher reviews and publishes, an admin manages publishers. Sign-in is Cognito's managed login. The app is available only when `MIDST_APP_API_URL`, `MIDST_APP_AUTH_DOMAIN` and `MIDST_APP_CLIENT_ID` are all set; otherwise its routes are still there and each page says the app is not available.

| Path | Who | What |
|---|---|---|
| `/app` | anyone | about the app |
| `/signed-in` | anyone | where managed login returns; finishes sign-in |
| `/me` | signed in | who you are and your groups; sign out |
| `/submit` | poet | submit a poem; see where each submission stands |
| `/review` | publisher | play, accept or decline submissions |
| `/publisher` | publisher | publish, unpublish, reorder; register poets |
| `/admin` | admin | invite and manage publishers and admins |

The pages live in `src/routes/`, and the code behind them in `src/app/`. [docs/app-api.md](docs/app-api.md) is the contract with the back end. Change that file first when either side needs something different.

## Deploying

The site is static. `npm run build` produces `./dist`.

The beta site is deployed by the `deploy` workflow when a pre-release is published, or when you run the workflow from a release tag. The tag must be on `main`, must match `vMAJOR.MINOR.PATCH[-suffix]`, and its GitHub release must be published with the pre-release box ticked. A tag of `v1.0.0` or later with no suffix is a full release; no production environment exists yet, so it is refused.

The workflow runs `deploy/beta/deploy_site.sh`. The script builds at the tag, checks that every poem is reachable (the canary for `bundled`, `check_published_list.py` for `published`), uploads to the site bucket with `index.html` last, writes `deployed.json`, invalidates the CloudFront distribution, and checks that every poem page mounts the player. No font files are in the repository, so none are uploaded; the script itself does not exclude a `fonts/` folder.

The workflow takes its settings from the `Beta` environment: `MIDST_KEY_SCHEME`, `MIDST_POEM_LIST`, `MIDST_SITE_BUCKET`, `MIDST_SITE_DISTRIBUTION`, `MIDST_POEMS_URL`, `MIDST_SITE_URL`, `AWS_REGION`, the three `MIDST_APP_*` values, and `MIDST_VERIFIER` (the person the released issues are handed to); and the secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. After a successful deploy, `tools/issue_flow.py released` hands the release's issues to the verifier.

Run the script by hand with `--dry-run` to build and print what would be uploaded without writing to AWS. It always needs AWS credentials: it checks who it is running as (`aws sts get-caller-identity`) and lists the upload with `aws s3 sync --dryrun`. It also reads the site's CloudFormation stack (`--stack`, default `midst-press-beta-site`); give the four values with `--site` to avoid needing permission to read the stack:

```
bash deploy/beta/deploy_site.sh --web-repo <clone> --key-scheme legacy --poem-list bundled --dry-run
```

`deploy/beta/`, `tools/closing_refs.py` and `tools/issue_flow.py` are copies from midst-infra. Change them there first, then copy them here and update `tools/midst-infra-copies.sha256`. The `midst-infra-copies` hook checks them:

```
shasum -a 256 -c tools/midst-infra-copies.sha256
```

## Copies of midst-editor files

Four files are copied byte for byte from midst-editor, and four editor test files are copied with them:

- `src/components/MidstPlayer/follow.ts` and `helpers.ts`
- `src/buildLabel.ts`
- `src/guide/editor-user-guide.md`
- tests: `src/__tests__/editor-follow.test.ts`, `editor-followMore.test.ts`, `editor-trackingUtils.test.ts`, `editor-buildLabel.test.ts`

A test copy must equal its original except for a header note and the import path.

The copies are held to one editor commit, recorded in `tools/editor-copies-pin`, and not to whatever editor `main` is now. So an editor merge that changes a copied file doesn't turn every website branch red (#152). The `editor-helpers-identical` hook fails when:
- a copy differs from that commit;
- the pin is not a full SHA, or not on editor `main`;
- your editor checkout doesn't have the pinned commit, or its origin is not `midst-editor`;
- `MIDST_EDITOR_ROOT` is not set;
- `origin/main` moves during the comparison.

When editor `main` has changed a copied file since the pin, every run prints a WARNING naming the files: a copy PR is due. It doesn't fail.

```
git -C "$MIDST_EDITOR_ROOT" fetch origin
node tools/check-editor-helpers.mjs
```

A copy PR copies the originals (reapplying each test copy's header note and import path), then moves the pin to editor `main` and checks in one step, committing the pin with the copies:

```
node tools/check-editor-helpers.mjs --pin-to-main
```

Hooks that write files skip `follow.ts`, `helpers.ts` and three of the test copies, so formatting does not change them.

CI on Gitea clones editor `main`, with its history, using a read-only deploy key (`MIDST_EDITOR_DEPLOY_KEY`). CI on GitHub checks out the public repository, also with history, and with no credential. So on GitHub the pin must be an editor commit that has been published there.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for where contributions go, the rule about poem content, the checks before a pull request, how an issue gets closed, and what CI runs.

The import-case hook (`tools/check-import-case.mjs`) fails when a relative import is spelled in a different letter case than git has the file. It compares against `git ls-files`, never the filesystem, so macOS and Linux give the same answer.

## License

The website's source code is licensed under the GNU Affero General Public License, version 3 or (at your option) any later version: see `LICENSE`. That license does not cover the following, which keep their own terms:

- the font files the site serves (for example Bell MT, a Monotype font, and other commercial fonts), which are not in this repository,
- poets' names, poem titles and other poem metadata, and the journal's own written text,
- third-party components that declare their own license.
