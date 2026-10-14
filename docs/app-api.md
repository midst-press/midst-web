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
| 409 | `already_registered` | registering an email that already has an account |
| 409 | `already_signed_in` | resending an invitation to someone who has already set their password |
| 409 | `last_admin` | the change would leave nobody in `admin` (removing the group from, or disabling, the last one) |
| 500 | `server` | anything else; `message` is safe to show and carries no internals |

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
  "highlighted": false
}
```

`poemId` is the opaque id minted when a submission arrives (#41). Names never appear in a key; keys are
recorded, not derived. `publishDate` and `highlighted` are `null` / `false` until the publisher sets them.

**Submission:**

```json
{
  "submissionId": "3f6c2b1e-8a4d-4c55-9b0e-2d7a1c9e4f10",
  "title": "Zq xv",
  "author": "Qz Vb",
  "poet": "qz@example.invalid",
  "submittedAt": "2026-10-15T09:30:00Z",
  "status": "received",
  "note": null
}
```

`status` is one of `uploading` (the id exists, the file has not arrived), `received`, `accepted`, `declined`,
`published`. An accepted submission is an unpublished poem with the same id. `note` is the publisher's note to
the poet on a decision, or `null`. `poet` (the poet's email) is included only on the publisher's routes.

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
- `POST /publisher/publish` `{ "poemId", "listEtag" }` → `{ "listEtag", "published" }`
  Copies the poem into the publishing bucket and adds it at the end of the list.
- `POST /publisher/unpublish` `{ "poemId", "listEtag" }` → `{ "listEtag", "published" }`
  Removes it from the list and deletes the publishing copy. The draft stays.
- `PUT /publisher/order` `{ "poemIds": [...], "listEtag" }` → `{ "listEtag", "published" }`
  400 `invalid` unless `poemIds` is exactly the published set, each once.
- `PUT /publisher/poems/{poemId}` `{ "publishDate", "highlighted", "listEtag" }` → `{ "listEtag", "published" }`
  For a published poem.

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

### Poet (`poet`)

Submitting is three steps, so the file goes straight to the bucket and never through the Lambda:

1. `POST /submissions` `{ "title", "author", "fileName", "sizeBytes" }` →
   `{ "submissionId", "uploadUrl", "uploadHeaders": { ... }, "expiresAt" }`
   `uploadUrl` is a pre-signed PUT for one key, valid for a few minutes. 400 `invalid` when the file is not a
   `.midst` file or is too large (the limit is in `message`).
2. The browser `PUT`s the file to `uploadUrl` with exactly `uploadHeaders`.
3. `POST /submissions/{submissionId}/complete` → `Submission` with status `received`.
   The Lambda checks the file arrived and reads as a Midst file, converting an old-format one (#21), and writes
   a zipped copy for review next to it, in the form the player already reads (`timelapse.midst.zip`).
   400 `invalid` with a reason when it does not; the submission stays `uploading` and can be tried again.

- `GET /submissions/mine` → `{ "submissions": [Submission, ...] }`, newest first. A submission still `uploading`
  is left out: its file never arrived or was refused, and sending again starts a new submission (#123).

### Review (`publisher`)

- `GET /review/submissions` → `{ "submissions": [Submission, ...] }`, every status, newest first.
- `GET /review/submissions/{submissionId}/timelapse` → `{ "url", "expiresAt" }`
  A pre-signed GET of the review copy written by `complete`, so the review page plays it with the player as it is.
- `POST /review/submissions/{submissionId}/decision` `{ "decision": "accept" | "decline", "note" }` →
  `Submission`. Accepting makes it an unpublished poem.

### Admin (`admin`)

- `GET /admin/users` → `{ "users": [Person, ...] }`
- `POST /admin/users` `{ "name", "email", "groups": [...] }` → `Person`
  Invites the person: Cognito emails them a temporary password. Nobody can sign up on their own.
- `PUT /admin/users/{username}/groups` `{ "groups": [...] }` → `Person`
- `POST /admin/users/{username}/disable` and `/enable` → `Person`

Both answer 409 `last_admin` rather than leave the pool with no admin: with none, nobody could invite anyone or
change a group without going to the AWS console, which is how the first admin is added.

## The pages

| path | who | what |
|---|---|---|
| `/signed-in` | anyone | where the managed login returns to; finishes sign-in and goes on |
| `/me` | signed in | who you are and your groups; sign out |
| `/publisher` | publisher | unpublished and published poems: publish, unpublish, reorder, date and highlight; poets: register, resend, disable |
| `/submit` | poet | submit a poem, and your submissions and where each stands |
| `/review` | publisher | submissions: play, accept or decline with a note |
| `/admin` | admin | publishers and admins: invite, change groups, disable |

Sign-in is Cognito's managed login, authorisation code with PKCE. The tokens are held in memory and in
`sessionStorage` (so a reload keeps you signed in), never in `localStorage`.
