# Midst Journal

The journal: a poem is shown as a timelapse of its own composition, replayed keystroke by keystroke.

## Before you start

**Node 24** (the current LTS). The version is pinned in `.nvmrc`, and CI reads that same file, so the
easiest way to match CI is a version manager that respects it:

```
nvm use          # or: fnm use / asdf install
```

Newer Node generally works — the site builds on 26 — but 24 is what CI verifies.

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
a freshly fetched editor main. Locally, set `MIDST_EDITOR_ROOT` to your editor checkout
after fetching its `origin/main`. CI checks out editor main through scoped read-only
access: `MIDST_EDITOR_DEPLOY_KEY` on Gitea and `MIDST_REPO_READ_TOKEN` on GitHub.

TipTap and its transitive extensions are pinned to 2.5.4, matching the editor lockfile.
`@tiptap/pm` is explicit because this website installs with `--legacy-peer-deps`.
Playback waits during a follow glide; pause, seek, navigation and unmount manage the
timer lifecycle. Cursor-following and scrollbar metadata overrides remain supported.

The synthetic follow tests cover end/middle writing jumps at 600px and 720px page
heights. The recorder also checks quiet final edits and distinguishes a forced browser
clamp from a voluntary jump. Real poem content is never needed for these CI tests.
