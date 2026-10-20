import { buildLabel } from '@midst-press/midst-format/build-label'

/*
 * Which build is this? Shown at the foot of the About page, so someone checking an issue against a
 * deployed site can say which release is in front of them (issue #77).
 *
 * Parcel inlines process.env.* at BUILD time (see config.ts), so the three values are build inputs.
 * The deploy step sets them from the commit it is deploying:
 *
 *   MIDST_BUILD_TAG     the tag that commit carries, exactly as written (git describe --tags --exact-match).
 *                       Empty when the commit has no tag; never the nearest older tag.
 *   MIDST_BUILD_COMMIT  the short commit id, with "-dirty" appended if the tree had uncommitted changes
 *   MIDST_BUILD_DATE    that commit's own date, ISO 8601 (git log -1 --format=%cI). Not the build time.
 *
 * A build with none of them set says "Development build" and does not invent a version.
 *
 * The wording is the editor's: buildLabel comes from midst-format's build-label, which the editor
 * imports too (midst-web #194), so the site and the editor describe a build the same way.
 */
export const BUILD_DESCRIPTION: string = buildLabel({
  tag: process.env.MIDST_BUILD_TAG,
  commit: process.env.MIDST_BUILD_COMMIT,
  committedAt: process.env.MIDST_BUILD_DATE,
})
