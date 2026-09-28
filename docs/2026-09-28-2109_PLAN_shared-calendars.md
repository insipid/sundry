# PLAN: Shared calendars loaded from the URL

**For:** Drew · **Status:** approved and built 2026-09-28 · **Branch:** `schedule-ish`

Separate from `2026-09-28-1747_PLAN_finish-week.md`. The two share only the
data format, which is already settled (a full export, plan v6).

## Why

To publish instances of schedule-ish that come with data, and share a link
to them. A shared calendar is a starting point: whoever opens it can play
with it, but only in their own browser. The published file never changes.

## How it behaves

- **`?cal=<id>`** loads `calendars/<id>.json`, which sits next to
  `index.html`. The page works out the file's URL from the id; the link
  never contains a path.
- **The id** is letters, numbers and hyphens only (a UUID or a readable name
  both fit), so a link can't reach anything outside `calendars/`. An invalid
  id is treated like a missing file.
- **The file** is any full export (⋯ → Export). It goes through the same
  checks and upgrades as Import, so older files still load.
- **Its own storage.** A shared calendar never touches your own calendar.
  Everything it saves goes under keys named after the id:
  - `schedule-ish:cal:<id>:v1` (the plan, and the tick-box settings),
  - `schedule-ish:cal:<id>:archive` (Finish week),
  - `schedule-ish:cal:<id>:ui` (selection and scroll),
  - `schedule-ish:cal:<id>:source` (the published file's fingerprint, and
    one that was ignored).
  A plain URL (no `?cal=`) opens your own calendar, exactly as today.
- **First visit:** fetch the file, save a copy under the calendar's keys,
  show it. **Later visits:** show the saved copy straight away; edits
  (including undo, Finish week, New week) change only that copy.
- **A banner** says which calendar this is and that changes stay in this
  browser, with **Reset to the published version**. Reset asks first, and
  can be undone.

## When the published file changes

On each visit the page fetches the file in the background and compares it
with the version the saved copy started from. The copy keeps a fingerprint
(a hash) of the file it came from. If they differ, the banner says **"The
published version has changed"** and offers **Reset** or **Ignore**. Ignore
hides the notice until the file changes again. Nothing is replaced unless
you choose Reset.

## When it can't load

- **404, bad JSON, invalid id, or a network error, on a first visit:** the
  page shows a plain "This calendar couldn't be loaded" message instead of a
  board. It never falls back to your own calendar under a shared name.
- **The same on a later visit:** the saved copy still shows. The background
  check fails quietly.
- **Opened straight from disk (`file://`):** browsers block the fetch, so the
  message says the page needs to be served over http.

## Publishing one

1. Build the calendar, then ⋯ → Export.
2. Save the file as `schedule-ish/calendars/<id>.json`.
3. Share `…/index.html?cal=<id>`.

## Code

- `model.js`: `validCalId(id)`, and a small, stable `fingerprint(text)`
  string hash. Tests for both.
- `share.js` (new, loaded before `app.js`, which it starts): reads `?cal=`,
  works out the storage keys, does the first-visit fetch, shows the error
  screen. Built this way so `app.js` can stay synchronous.
- `app.js`: takes its keys from `share.js`; the background freshness check
  and the banner (Reset / Ignore).
- `index.html`: banner and error-screen styles.
- `README.md`: a "Sharing a calendar" section.
- One example file, `calendars/example.json`, so the feature can be tried.

## Not now (too far ahead)

- Copying a shared calendar's weeks into your own.
- Loading from full URLs on other sites (needs CORS and raises trust
  questions).
- Read-only viewing, a list of shared calendars, publishing from the app.
