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
 */
export interface BuildInputs {
  tag?: string
  commit?: string
  date?: string
}

// The date in UTC, so it reads the same wherever the builder and the reader are.
function utc(date: string): string {
  const parsed = new Date(date)
  // A date that cannot be read is shown as given: a wrong input should be seen, not hidden.
  if (Number.isNaN(parsed.getTime())) return date
  return `${parsed.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export function describeBuild(inputs: BuildInputs): string {
  const tag = (inputs.tag || '').trim()
  const commit = (inputs.commit || '').trim()
  const date = (inputs.date || '').trim()
  if (!tag && !commit && !date) return 'Development build'
  const parts = [tag ? `Version ${tag}` : 'Untagged build']
  if (commit) parts.push(`commit ${commit}`)
  if (date) parts.push(`committed ${utc(date)}`)
  return parts.join(', ')
}

export const BUILD_DESCRIPTION: string = describeBuild({
  tag: process.env.MIDST_BUILD_TAG,
  commit: process.env.MIDST_BUILD_COMMIT,
  date: process.env.MIDST_BUILD_DATE,
})
