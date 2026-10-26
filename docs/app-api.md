# The beta app's API (prototype)

The contract between the beta site's signed-in pages (poet, publisher, admin) and the one Lambda behind
them. Tracking: #110. The pages are built against a local mock of this document and the Lambda against the
document itself, so **change this file first** when either side needs something different.

It is a prototype: the aim is something Annelyse can use and react to. Every name below may change.

## Calling it

- **Build inputs**, set at build time like the other `MIDST_*_URL` values and taken from the stack's outputs
  (midst-infra `beta/app.yaml`):
  - `MIDST_APP_API_URL`: the HTTP API's endpoint (API Gateway, in front of the Lambda), the base of every route below.
  - `MIDST_APP_AUTH_DOMAIN`: the managed login, `https://<prefix>.auth.<region>.amazoncognito.com`.
  - `MIDST_APP_CLIENT_ID`: the user pool's client for this site.

  There is no redirect input: the pages use `<the site's own origin>/signed-in`, which is the one callback the
  client allows. Without all three, the signed-in pages say the app is not available here.
- **Who you are:** every request carries `Authorization: Bearer <ID token>`, the Cognito ID token from
  sign-in. The API's JWT authoriser verifies it (signature, issuer, audience, expiry) before the Lambda runs;
  the Lambda verifies it again and reads `cognito:groups`.
- **Groups:** `poet`, `publisher`, `admin`. A person may be in more than one. Each route below names the group
  it needs; `signed in` means any valid token.
- **Bodies** are JSON, `Content-Type: application/json`, in both directions.
- **CORS:** the API allows the site's own origin only.

### Errors

Every error has the same body:

```json
{ "error": "conflict", "message": "The published list changed since you loaded it." }
```

| status | `error` | when |
|---|---|---|
| 400 | `invalid` | the body or a parameter is wrong; `message` says which |
| 401 | `unauthenticated` | no token, or it is not valid or has expired: sign in again |
| 403 | `forbidden` | signed in, but not in the group the route needs |
| 404 | `not_found` | no such poem, submission or person, or one that is not yours: a poet asking for another poet's submission gets 404, never 403, so the answer does not say whether it exists |
| 409 | `conflict` | the published list changed since it was read; the body also carries the current `listEtag` |
| 409 | `archive` | an upload-only action on an archive record: `complete`, the review copy's timelapse, or a decision |
| 409 | `already_registered` | registering an email that already has an account |
| 409 | `already_signed_in` | resending an invitation to someone who has already set their password |
| 409 | `disabled` | resending an invitation to someone whose account is disabled: enable them first |
| 409 | `busy` | another change to a person's groups or enabled state is in progress; try again |
| 409 | `groups_changed` | the person's groups are no longer the `fromGroups` the page sent: someone else changed them; reload |
| 409 | `last_admin` | the change would leave nobody in `admin` (removing the group from, or disabling, the last one) |
| 500 | `server` | anything else; `message` is safe to show and carries no internals |
| 503 | `unavailable` | the request could not be recorded, so nothing was changed (a change), or nothing returned (a read of unpublished content); try again |

`message` is a sentence a person can read. It never contains a poem's text, and never a token.

**One exception: answers from API Gateway itself.** Some answers come from the gateway before the Lambda runs,
and have the gateway's own body, `{ "message": "..." }`, with no `error`:

| status | from the gateway when |
|---|---|
| 401 | the authoriser refused the token (`Unauthorized`) |
| 403 | the gateway refused the request |
| 404 | no route takes that method and path (the API has `GET`, `POST` and `PUT` on paths below `/` only) |
| 429 | throttled: the API's rate limit was reached (`Too Many Requests`) |
| 500, 502, 503, 504 | the Lambda could not be run, failed outside our code, or timed out |

So a page reads `error` only when it is there. Otherwise it decides on the status alone and shows its own
sentence, never the gateway's text. Any 401, from either source, means forget the session and sign in again.
A 429 means wait and try again.

## Things the routes return

**Poem** (one entry of the published list, or a poem not yet published):

```json
{
  "poemId": "3f6c2b1e-8a4d-4c55-9b0e-2d7a1c9e4f10",
  "title": "Zq xv",
  "author": "Qz Vb",
  "timelapseKey": "poems/3f6c2b1e-8a4d-4c55-9b0e-2d7a1c9e4f10/timelapse.midst.zip",
  "processNoteKey": null,
  "publishDate": "2026-10-20",
  "highlighted": false,
  "tags": ["7d0f6a2e-3b1c-4e8a-9f25-6c4d8b1a0e37"],
  "lastEdited": "2026-10-19T21:14:03.512Z"
}
```

`poemId` is the opaque id minted when a submission arrives (#41). Names never appear in a key; keys are
recorded, not derived. `publishDate` and `highlighted` are `null` / `false` until the publisher sets them.
`lastEdited` is when the poet last edited the poem: the latest time in its timelapse, recorded when it is accepted
(#305; midst-infra #208). Only `GET /publisher/poems` carries it, `null` where it is not known. The publisher's page
shows it and nothing sets it; it is never written to the published list, so the site never shows it.
`tags` is a published poem's tag ids (#310; midst-infra #217), always a list. A legacy entry's own words may be in it
too; they match no tag.

A list entry also carries `firstPublishedAt`, the ISO time of the poem's first publication. It is kept across an
unpublish and a republish, and a revision takes it over from the version it replaces (midst-infra #83). Entries
from before it was recorded have none. The site derives each poem's address from the list (#141):
- the title's address (`/poem/<title>`) goes to whichever poem with that title was published first, so publishing
  a second never moves the first;
- each later one is `<title>--<author>`, numbered if that is taken too;
- a poem with no first publication time counts as first, and a tie goes by `poemId`.

Reordering the list never moves an address. Because addresses come from the poems listed now, two things do move
one: unpublishing a poem can move a later poem of the same title onto its address, and republishing a poem from
before `firstPublishedAt` was recorded takes the title's address back. Ids are compared by code unit, so every
browser gives the same addresses.

**Submission:**

```json
{
  "submissionId": "3f6c2b1e-8a4d-4c55-9b0e-2d7a1c9e4f10",
  "title": "Zq xv",
  "author": "Qz Vb",
  "poet": "qz@example.invalid",
  "origin": "upload",
  "submittedAt": "2026-10-15T09:30:00.000Z",
  "status": "received",
  "note": null
}
```

`status` is one of `uploading` (the id exists, and `complete` has not yet accepted a file), `received`, `accepted`, `declined`,
`published`. An accepted submission is an unpublished poem with the same id. `note` is the publisher's note to
the poet on a decision, or `null`. `poet` (the poet's email) is included only on the publisher's routes, and is
`null` for an archive record with no poet.

`origin` is always there: `upload` for a poem sent through the app, `archive` for a poem that came from an
archive and was never uploaded. An **archive record**'s `submittedAt` is the time of the last edit in the poem's
own file (Stuart, 16 Oct), or `null` when the file has no times. It is stored `accepted` (shown as `published`
while its poem is on the published list), and has no review copy. It may also carry `recordedBy`, a string saying
who recorded it; the field is left out when there is none, and only a migration writes it. A page never makes a date
of a `null` `submittedAt`: it shows "from the archive" for an archive record and "date not recorded" for any other.

**Person:**

```json
{ "username": "a1b2c3d4", "name": "Qz Vb", "email": "qz@example.invalid", "groups": ["poet"], "status": "invited" }
```

`status` is `invited` (has not signed in yet), `active` or `disabled`. `username` is Cognito's own id for the
person, not their email; it is what the routes below take.

## Routes

### Anyone signed in

`GET /me` → `{ "username", "email", "groups": [...] }`

### Publisher (`publisher`)

The published list is `poems/published.json` in the publishing bucket (#12). Every change to it is a
conditional write on its ETag, so each changing route takes the `listEtag` the page last read and answers
409 `conflict` with the current one when the list moved. The page then reloads the list and says so.

- `GET /publisher/poems` → `{ "listEtag", "published": [Poem, ...], "unpublished": [Poem, ...] }`
  `published` is in reading order. `unpublished` is every accepted poem not in the list, newest first.
  `removed` is the ids of the poems removed from the portal (#308), and `deleted` is those poems for the Deleted
  section (#349; midst-infra #227): each a Poem plus `removedAt`, most recently removed first. An API before those
  sends neither, and the page then shows no Deleted section.
- `POST /publisher/publish` `{ "poemId", "listEtag", "publishDate", "highlighted" }` → `{ "listEtag", "published", "edgeCleared"? }`
  Copies the poem into the publishing bucket and adds it at the end of the list. `publishDate` (YYYY-MM-DD) and
  `highlighted` are the date the Table of Contents shows and the highlight (#305): sent together, both valid, and
  they win over what a republish kept or a revision inherits; both absent, the poem keeps what it had. One without
  the other is 400 `invalid`. The page fills them in: the replaced poem's, else a same-titled published poem's by the
  same author, else what the poem had, else today and not highlighted. A revision replaces the version
  it revises; that version's copies are cleared from CloudFront, and `edgeCleared` says whether CloudFront took the
  request. They are deleted a day later, not at once, so a reader still on a page that loaded the old list can open
  them (midst-infra #179, #210).
- `POST /publisher/unpublish` `{ "poemId", "listEtag" }` → `{ "listEtag", "published", "edgeCleared" }`
  Removes it from the list and deletes the publishing copy. The draft stays. The copy is cleared from CloudFront's
  cache too. `edgeCleared` is false when CloudFront did not take that request; the copy may then be served for up
  to a day (`max-age=86400`), and the publisher's page says so (midst-infra #117).
- `POST /publisher/remove` `{ "poemId" }` → `{ "removed" }`
  Removes an unpublished poem from the portal (#308): its draft record is marked `removed`, and nothing is deleted.
  `GET /publisher/poems` lists it under `deleted` instead of `unpublished`, and publishing it is 409 `removed`. A
  published poem is 409 `published`: unpublish it first. The list is not written, so it takes no `listEtag`.
- `POST /publisher/restore` `{ "poemId" }` → `{ "restored" }`
  Puts a removed poem back under `unpublished` (#349): the mark is lifted, and the record keeps the removal undone in
  `restored`. A poem not removed is 409 `not_removed`. Like remove, it takes no `listEtag`.
- `PUT /publisher/order` `{ "poemIds": [...], "listEtag" }` → `{ "listEtag", "published" }`
  400 `invalid` unless `poemIds` is exactly the published set, each once.
- `GET /publisher/poems/{poemId}/process-note` → `{ "processNote", "noteVersion" }`, a draft poem's note as
  Markdown (#312), both `null` for a poem with none. Audited as a read.
- `PUT /publisher/poems/{poemId}/process-note` `{ "processNote", "noteVersion" }` → the same, at the new version.
  The note is validated as at submission. `noteVersion` is the one read (`null` for none); a stale one is 409
  `conflict`. Each edit is kept beside the poet's own note and every earlier edit, never written over them. A
  published poem is 409 `published`: readers see the copy made when it was published, so unpublish, edit and publish
  again.
- `PUT /publisher/poems/{poemId}` `{ "publishDate", "highlighted", "tags"?, "listEtag" }` → `{ "listEtag", "published" }`
  For a published poem. `tags` is a list of tag ids, each a tag and each once (else 400 `invalid`); without it the
  poem keeps the tags it has.

**Tags** (#310; midst-infra #214): named, coloured marks for a collection, such as a folio.

- The tags are public: `site/tags.json` in the publishing bucket, served at `/site/tags.json` with a one-minute
  `Cache-Control`, `{ "version": 1, "updated", "tags": [{ "id", "name", "colour" }, ...] }`. A poem names its tags by
  id in its list entry; the site ignores an id that is not a tag. The Table of Contents reads the file once some poem
  names a tag, and marks each such poem's line; if the file cannot be read it shows no marks (src/tags.ts).
- `GET /publisher/tags` → `{ "tagsEtag", "tags": [{ "id", "name", "colour" }, ...] }`. Before the first save:
  `"tagsEtag": "none"`, no tags.
- `PUT /publisher/tags` `{ "tagsEtag", "tags": [{ "id"?, "name", "colour" }, ...] }` → the same shape as GET, as
  saved. Replaces the whole list: add (no `id`; the server makes one), rename or recolour (same `id`), remove (left
  out). Each name is 1 to 40 characters after trimming, and no two alike ignoring case; a colour is `#rrggbb`, stored
  in lower case; at most 100 tags; otherwise 400 `invalid`. A changed `tagsEtag` is 409 `conflict`. Removing a tag a
  published poem names is 409 `in_use`, with its ids as `tagIds`, and nothing is saved.

**Poets** (Stuart, 14 Oct: the publisher registers poets, and never sees a password):

- `GET /publisher/poets` → `{ "poets": [Person, ...] }`, the people in `poet`.
- `POST /publisher/poets` `{ "name", "email" }` → `Person`, status `invited`. Creates the account (its sign-in
  name is the email) in `poet`; Cognito emails a temporary password and a link, and the poet must choose
  their own password at first sign-in. 409 `already_registered` when the email has an account.
- `POST /publisher/poets/{username}/resend` → `Person`. Sends the invitation again, with a new temporary
  password. 409 `already_signed_in` once the poet has set their password; forgetting it is then Cognito's own
  "forgot password" on the sign-in page.
- `POST /publisher/poets/{username}/disable` → `Person`.

Resend and disable act only on someone whose one group is `poet`: anyone else is 403 `forbidden`, so a
publisher cannot reset a publisher's or an admin's invitation, or disable them. Admin manages those. An
unknown `username` is 404.

**Patrons** (#58). Every patron has a `visibility`: `public`, `private` or `undetermined` (not yet asked). Only
public patrons are named on the site.

- The full list is private: `patrons/patrons.json` in the draft bucket,
  `{ "version": 1, "updated", "patrons": [{ "id", "name", "visibility" }, ...], "closing": "<line>" | null }`.
- Every save also writes the site's copy, `site/patrons.json` in the publishing bucket, served at
  `/site/patrons.json` with a one-minute `Cache-Control`. It holds the public names only, in order:
  `{ "version": 1, "updated", "patrons": ["<name>", ...], "closing" }`. The site reads that file, never the routes.

The routes:

- `GET /publisher/patrons` → `{ "patronsEtag", "patrons": [{ "id", "name", "visibility" }, ...], "closing" }`. Before
  the first save: `"patronsEtag": "none"`, no patrons, `"closing": null`.
- `PUT /publisher/patrons` `{ "patronsEtag", "patrons": [{ "id"?, "name", "visibility" }, ...], "closing" }` → the
  same shape as GET, as saved. Replaces the whole list in the order given: add (no `id`; the server makes one),
  remove, reorder, rename, change visibility. Each name, and `closing` unless it is null, is one line of 1 to 200
  characters after trimming; at most 1000 patrons; otherwise 400 `invalid`.
- Visibility, per patron, against what is stored:
  - public to private, and private to public: allowed;
  - undetermined to public or private: allowed (someone who says no becomes private);
  - anything to undetermined, or a new patron as undetermined: 400 `refused`, with a message naming the patron and
    why. Only the Patreon sync (a later PR) makes someone undetermined.
- 409 `conflict`, with the current `patronsEtag`, when someone else saved first.
- 500 `public_copy_failed`, with the new `patronsEtag`, when the list was saved but the site's copy was not
  written; until the next save, the copy may still name someone just made private. Saving again writes it.
- The site's copy may briefly be one save behind when two saves overlap; a save that answers 200 leaves it derived
  from a list at least as new as its own.

### Poet (`poet`)

Submitting is three steps, so the file goes straight to the bucket and never through the Lambda:

1. `POST /submissions` `{ "title", "author", "processNote", "fileName", "sizeBytes" }` →
   `{ "submissionId", "uploadUrl", "uploadHeaders": { ... }, "expiresAt" }`
   `uploadUrl` is a pre-signed PUT for one key, valid for five minutes. 400 `invalid` when the file name does not
   end in `.midst`, or `sizeBytes` is not a whole number from 1 to 20 MB (20,971,520 bytes); `message` says so.
   `processNote` is the poet's process note as Markdown (#292): required, not blank, at most 20,000 characters
   counted as UTF-16 code units (as a textarea's `maxlength` counts). It is stored once, never logged, and on accept
   becomes the poem's `processNoteKey`.
   `photo` is optional (#312; Annelyse, 26 Oct): `{ "contentType", "sizeBytes" }`, an `image/jpeg`, `image/png` or
   `image/webp` of at most 5 MB, or 400 `invalid`. With one, the answer adds `photoUploadUrl` and `photoUploadHeaders`, a
   second pre-signed PUT; `complete` checks that it arrived at that size and that its first bytes are that type, keeps
   a checked copy written with the declared type, and on accept that copy becomes the poem's `photoKey`. Publishing
   copies it beside the note, and the list entry names it as `photo`; the poem page shows it at the foot of the note,
   and the archive's photo for the author when there is none.
2. The browser `PUT`s the file to `uploadUrl` with exactly `uploadHeaders`.
3. `POST /submissions/{submissionId}/complete` → `Submission` with status `received`.
   The Lambda checks that the file arrived, is the size declared, and is a current-format Midst file, then writes
   a zipped copy for review next to it, in the form the player already reads (`timelapse.midst.zip`).
   **Older files are not converted** (decision on #110, 14 Oct): the desktop editor converts one when it is
   opened ("Convert File"), and the converter lives only in midst-editor. Such a file is 400 `invalid` with
   "This file is from an older version of Midst. Open it in Midst, choose Convert File, and submit the new file."
   Any other refusal is 400 `invalid` with its reason. The upload is then discarded and the submission stays
   `uploading`; sending again starts a new submission. Completing one already `received` answers it again,
   unchanged.

- `GET /submissions/mine` → `{ "submissions": [Submission, ...] }`. A submission still `uploading`
  is left out: `complete` never accepted a file for it, and sending again starts a new submission (#123, #125).
  An archive record is listed only when its poet's username equals the caller's; one with no poet matches nobody.
  Newest `submittedAt` first; records whose `submittedAt` is `null` come after all the others, newest `decidedAt`
  first.

`complete` on an archive record is 409 `archive`: it was never uploaded.

### Review (`publisher`)

- `GET /review/submissions` → `{ "submissions": [Submission, ...] }`, every status, archive records included.
  Newest `submittedAt` first; records whose `submittedAt` is `null` come after all the others, newest `decidedAt`
  first.
- `GET /review/submissions/{submissionId}/timelapse` → `{ "url", "expiresAt" }`
  A pre-signed GET of the review copy written by `complete`, valid for five minutes, so the review page plays it
  with the player as it is. 404 for a submission still `uploading`, which has no review copy. 409 `archive` for
  an archive record, which never had one; the review page does not offer Play for it.
- `GET /review/submissions/{submissionId}/process-note` → `{ "processNote" }`, the poet's Markdown, which the
  review page renders as the poem page does. Audited as a read. 404 for a submission still `uploading`, or one made
  before process notes were asked for; 409 `archive` for an archive record.
- `GET /review/submissions/{submissionId}/photo` → `{ "url", "expiresAt" }`, a one-minute link to the checked copy of
  the poet's photo (#312). Audited as a read. 404 for a submission still `uploading` or sent without a photo; 409
  `archive` for an archive record.
- `POST /review/submissions/{submissionId}/decision` `{ "decision": "accept" | "decline", "note" }` →
  `Submission`. Accepting makes it an unpublished poem. `note` is optional, at most 2,000 characters; blank is
  `null`. A decision is made only on a submission that is `received`, with one exception: accepting one that
  is already `accepted` is allowed, and idempotent. The decision is recorded before the poem is made, so if making
  the poem fails the submission is left `accepted` without one; accepting again makes the poem if it is missing,
  leaves the recorded decision and note as they were (a `note` sent with it is still checked, but not recorded)
  and returns the current `Submission` with 200. The review page offers this as "Finish accepting" when an
  `accepted` submission's poem is not on the publisher's list (`GET /publisher/poems`), and, if that list could
  not be loaded, shows the button disabled with the reason. Any other decision on a submission that is not
  `received` is 400 `invalid`. On an archive record it is 409 `archive`.

A submission's status becomes `published` when its poem is published, and `accepted` again if it is unpublished.

### Admin (`admin`)

- `GET /admin/users` → `{ "users": [Person, ...] }`
- `POST /admin/users` `{ "name", "email", "groups": [...] }` → `Person`
  Invites the person: Cognito emails them a temporary password. Nobody can sign up on their own.
- `POST /admin/users/{username}/resend` → `Person`. Sends the invitation again, with a new temporary password, to
  anyone still `invited`, whatever their groups: the publisher's resend reaches poets only. 409 `already_signed_in`
  once they have set their password; 409 `disabled` while the account is disabled. Unknown `username`: 404.
- `PUT /admin/users/{username}/groups` `{ "groups": [...], "fromGroups": [...] }` → `Person`. `fromGroups` are the
  groups the page showed; if the person's groups are no longer those, 409 `groups_changed` and nothing changes.
- `POST /admin/users/{username}/disable` and `/enable` → `Person`

Both answer 409 `last_admin` rather than leave the pool with no admin: with none, nobody could invite anyone or
change a group without going to the AWS console, which is how the first admin is added.

## The pages

| path | who | what |
|---|---|---|
| `/signed-in` | anyone | where the managed login returns to; finishes sign-in and goes on |
| `/me` | signed in | who you are and your groups; sign out |
| `/publisher` | publisher | unpublished and published poems: publish, unpublish, reorder, date and highlight; poets: register, resend, disable; patrons: edit the list |
| `/submit` | poet | submit a poem, and your submissions and where each stands |
| `/review` | publisher | submissions: play, accept or decline with a note |
| `/admin` | admin | publishers and admins: invite, resend an invitation, change groups, disable |

Sign-in is Cognito's managed login, authorisation code with PKCE. The tokens are held in memory and in
`sessionStorage` (so a reload keeps you signed in), never in `localStorage`.
