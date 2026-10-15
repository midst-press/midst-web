# 0.2.0

- **The list of patrons can be changed without a new release.** The patrons on the home page and the
  Funding page are now read from the site rather than written into it. In the publisher's pages, the
  **Patrons** section adds, removes, renames and reorders patrons. It also sets whether each one is
  named on the site (Public) or not (Private); a patron not yet asked shows as Undetermined until the
  publisher chooses. It edits the line shown after the names, such as "Anonymous donors". If the list
  cannot be loaded, the page says so.
- **The About page lists Stuart Swerdloff as software engineer**, and the Funding page names Juliet
  Shafto as one of Midst's two volunteer staff.
- **Poems from the archive appear on the review and poet pages.** A poem that came from the Midst
  archive, not through an upload, has no Play button, because there is no uploaded copy to play. One
  with no date says "from the archive". An upload whose date was lost says "date not recorded" and never
  shows a made-up date.
- **The review page offers Finish accepting** for an accepted submission whose poem was never made. If
  the list of poems cannot be read, the button is shown unavailable, with the reason.
- **The editor guide on About the App covers the editor's Find**: Command+F on a Mac or Ctrl+F on
  Windows and Linux, from **Edit** > **Find**. It also gives the new shortcut for switching between
  writing and Replay: **Edit** > **Toggle Timeline**, on Command+T or Ctrl+T, which was Command+E or
  Ctrl+E.
- Under the hood:
  - The site's files are uploaded with caching headers. Files whose names change with every build are kept
    for a year, and the pages are checked again on every visit, so a new release shows at once.
  - The player shows each frame as it was saved, and its timeline, draft markers and fonts have unit
    tests.
  - The packages built on React now use versions made for React 18, which the site already ran on, and
    dependencies nothing used are gone.

# 0.1.0

The first beta pre-release, 15 October 2026.

- **The web player for poems written in the Midst editor**, as of editor 0.4.0.
- **Pages for the people who run Midst:**
  - an admin page;
  - a publisher's page for reviewing, accepting and publishing poems;
  - a poet's page for submitting a poem.
