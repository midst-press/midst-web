# The site's words, in English

Each file in this folder holds the words for one part of the site. You can change the words here without touching any code.

| File | Where its words appear |
|---|---|
| `player.json` | The player that replays a poem: its buttons, the timeline and the speed control |
| `readers-guide.json` | The reader's guide page (`/guide`) |

More files will join these as the rest of the site's words move here.

## Changing a word

Most entries look like this:

```json
"skipToStart": {
  "text": "Skip to start",
  "note": "The button that goes back to the poem's first moment. ..."
}
```

- **`text`** is what the reader sees or hears. Change this.
- **`note`** says where the words appear and anything to keep in mind, such as a length limit. It is for you and is never shown on the site. You can improve it too.
- Leave the name before the colon (`"skipToStart"`) as it is. That is how the code finds the words.

Some words are only heard, never seen. A screen reader speaks them to people who cannot see the screen, so they still matter. The note says when an entry is one of these.

## Two marks to keep

- **`{draft}`, `{fps}` and anything else in curly brackets** is filled in by the site, with a draft's name or a number for example. Keep it exactly as written, curly brackets included. You can move it within the sentence.
- **`**two stars**`** on each side of some words make them bold. Keep the stars in pairs.

A check runs on every change and points out a missing or misspelled `{...}`.

## Punctuation

The files use a format called JSON, which is strict about punctuation:

- words go inside "double quotes";
- every entry ends with a comma, except the last one before a `}`.

If something is wrong, the check names the file and the line, for example: `src/i18n/en/player.json, line 12: a comma is missing at the end of this line.`

## The reader's guide

`readers-guide.json` is laid out by section rather than as a list of entries. Its `labels` lists the player controls each section explains. When the guide names a control in **bold**, the name must match the control's `text` in `player.json`. If you rename a control, change it in both places, and the check will tell you if they disagree.

## Rather not edit the files?

Send the new wording to whoever looks after the site, and they will put it in for you.
