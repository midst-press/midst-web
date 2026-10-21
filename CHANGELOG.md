# 0.13.0

- **The publisher can edit an unpublished poem's process note**, to house style, with the same buttons and Preview
  as the submit form. The poet's own note is kept.

# 0.12.0

- **A poet writes a Process Note when submitting a poem**, with Bold, Italic and Link buttons and a Preview. The
  review page shows each submission's note.
- **Keyboard focus is visible:** the link, button or field reached with the keyboard has a dark red outline, the
  player's own colour.

# 0.11.0

- **An admin's group change sends the groups the page showed**, so once the API checks them (midst-infra #202), a
  change from a page loaded before another admin's is refused and the page shows the groups as they are.
- **The editor library is TipTap 3.32.0**, with midst-format 0.6.0. Nothing a reader sees changes.

# 0.10.0

- **A poem can be published as the replacement for one of its poet's published poems.** The old one leaves the
  list, and links to it lead to the new one.
- **Space plays and pauses after dragging the timeline.** Scrubbing no longer swallows the spacebar; the playhead
  keeps focus and Space toggles playback as it does everywhere else.
- **The player has a switch to show or hide the draft markers**, beside the playback controls, for a poem that has
  them. They are shown unless the reader turns them off, and the choice is kept in that browser, as the language is.

# 0.9.0

- **Each poem's address is the one it was given.** When the published list carries stored addresses, the site uses
  them as they are and no longer works them out from titles, so publishing or withdrawing another poem cannot move
  a poem's address. The list is refused if an address is missing, invalid or used twice. Until the list carries
  them, addresses are worked out exactly as before, so nothing changes for readers yet.
- **The publisher and review pages link to each other**, and the link to Review says how many submissions are
  waiting. On the publisher page, the poems waiting to be published come first, and the review player shows the
  poem's author and title above it, as the poem page does.
- **Dependencies are current**: TypeScript 6.0.3, with minor and patch updates to the rest. Nothing a reader sees
  changes.

# 0.8.0

- **About the App's help is two dropdowns**, Installation and Using Midst, each under construction until the help
  is written. The editor's "Need help?" still lands on it.

# 0.7.0

- **The zip reader is current**: @zip.js/zip.js 2.24.0, bundled from npm, in place of zip.js 1.x from 2013 and its
  three worker scripts. Poems and review copies are read the same way, their CRC still checked.

# 0.6.0

- **Analytics uses Google Analytics 4**, in place of the Universal Analytics tag Google stopped reading in 2023. It
  loads only when the site is built with a measurement id, with Google signals and ad personalisation off. The
  page's zip reader now comes from the site itself, no longer from the old production host.

# 0.5.0

- **The guides are under construction.** The reader's guide ("How to watch a poem") and the editor's guide on the
  About the App page say so for now. The links to them stay; the guides will come closer to the public release.

# 0.4.0

- **Choose the language the site speaks.** The languages the site has are at the top of every page, each
  by its own name, with the American flag beside English; for now that is English. The site starts in
  English until you choose, whatever your browser's language, and the words change at once. Your choice is
  kept in your browser only: it is not in the page's address, not in a cookie, and not sent to us.
- **Poems from the earlier editor keep the lines the old player drew**, converted with midst-format 0.5.0. A
  line break between paragraphs, a line written as a block of its own, and a hidden selection marker no longer
  add or lose a line.

# 0.3.0

- **The time under the timeline is easier to read** (GitHub #63). It shows the time over the date, such as
  "7:19 pm" above "November 5, 2019", in a box under the dot. The date is written the same way for everyone
  reading the English site, in the reader's own time zone. To make room for the box, the poem's area is
  20 pixels shorter.
- **The time under the timeline stays inside the timeline** when the window is resized, and when the
  site's font finishes loading after the poem appears.
- **The scroll bar beside a poem can be dragged along its whole length** (GitHub #62). The empty space
  around the previous and next arrows used to catch the drag.
- **Poems no longer show blank lines the old player never drew.** Poems written in the earlier editor are
  converted with midst-format 0.4.0. A paragraph the old player drew nothing for no longer adds an empty
  line, and neither does a line ending in coloured or resized text. The poems on the site have been
  converted again with these fixes.
- **The player's words come from the message catalog**: the names a screen reader gives its buttons and
  timeline, the speed readout, and "edit time unavailable". The catalog is the file the wording will be
  changed in, without a change to the code. Nothing a reader sees or hears is different.
- **Two published poems with the same title each have their own page.** The first one published keeps the
  title's address, and a later one adds its author's name to it.
- **The site asks AI crawlers not to collect it**, in `robots.txt`, a text-and-data-mining reservation and
  a tag in each page. Search engines are still allowed.
- **The reader's guide covers the process note**, opened from the poet's name and the poem's title, and
  says that Escape closes the speed slider.
- **For the people who run Midst:**
  - The admin page can resend the invitation to anyone still invited.
  - On the publisher's page, the Poets section offers Resend invitation and Disable only for poets who are
    nothing else, since the server refuses both for a publisher or an admin.
  - A change that was saved, but whose list could not be refreshed afterwards, now says it was saved and
    asks for a reload. It used to look like a failure.
- **A poem that fails to load always says so**, and trying again clears the old message while it loads.
- Under the hood:
  - The player takes the poem format from midst-format 0.4.0, the library shared with the editor. It is
    copied into the site, and CI checks the copy against that release.
  - Stored dates are written YYYY-MM-DD, and a poem's id, once given, never changes.
  - The bug report form asks for the build line from the About page.

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
