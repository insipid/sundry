# PLAN: Finish week, per-week sidebars, saved UI state, print page 2

**For:** Drew · **Status:** approved 2026-09-28, building · **Branch:** `schedule-ish`

The v1 push. Agreed in chat on 2026-09-28; this records what was decided.

## 1. PDF → Print

The header button says **Print**. Behaviour is unchanged (the browser's
print dialog, which can save a PDF).

## 2. Regulars and one-offs belong to a week

Until now `regulars` and `unplaced` (shown as *one-offs*) were shared by
every week. They move into each week:

```
week: { ..., regulars: [...], unplaced: [...] }
```

- **Tags** and **timeHolders** stay global: they are a vocabulary, not
  intents.
- **Migration (plan v6):** a v5-or-older plan gives every week its own copy
  of the old global regulars and one-offs (fresh ids per week), so nothing
  disappears.
- Import accepts both shapes; export writes v6.

## 3. Carrying things into a week

One set of three tick-boxes, used by two dialogs:

- ☐ **Keep the schedule**: the planned blocks, their open focus lines. All
  review (ratings, tags, reviews, actual positions, unplanned blocks, day
  notes, session lines, ticked focus lines) is cleared.
- ☑ **Keep regulars** (with their default notes)
- ☑ **Keep one-offs**

All ticked = redo the week; regulars + one-offs = an empty calendar;
nothing = blank all round. Zone sizes and early/evening view are kept
when the schedule is kept, reset otherwise.

**New week** (weeks menu) asks for a name and shows the tick-boxes, copying
from the current week. It replaces "New blank week" / "New from this week".

**Finish week** appears in Review mode only. Its dialog:

- **Print this week** and **Export this week** (JSON of just this week, as
  it is now). Neither finishes anything.
- The tick-boxes, then **Finish week** / Cancel.
- Nothing is saved until **Finish week** is pressed. Then:
  1. The week, as it stands, is appended to the archive.
  2. The week is reset in place (same id and name) using the ticks.
  3. Mode switches to Plan. A toast: "Week finished. Saved to the archive."
- ⌘Z undoes the finish as one step. The archive entry stays (keep
  everything).

Each dialog remembers its own ticks in `settings.newWeek` and
`settings.finishWeek`.

## 4. The archive

A separate localStorage key, `schedule-ish:archive`, holding an object keyed
by the finish time (ISO string):

```
{ "2026-09-28T17:47:03.120Z": {
    label: "My week (finished Mon 28 Sep)",
    finishedAt: "2026-09-28T17:47:03.120Z",
    version: 6,
    week: { ...the whole week, including its regulars and one-offs },
    tags: [...], timeHolders: [...] } }
```

- Written only by Finish week. Never read back by the app yet; browsing
  comes later.
- Not included in ⋯ Export for now.
- If storage is full, the finish is refused with a message and nothing
  changes.

## 5. Saved UI state

Rule from now on: anything the person sets or leaves open is saved.
Already saved: mode, sidebar side/hidden, visible days, early/evening,
"show what's next". Added:

- the tick-boxes of both dialogs (above);
- the selected block and the board's scroll position, per week, in a
  separate small key, `schedule-ish:ui`, so selecting and scrolling never
  touch undo or the plan. Switching weeks brings back where you were in
  that week. A selection whose block is gone is dropped.

Menus and dialogs mid-open are not restored.

## 6. Print page 2

Page 2 gets everything, with more framing:

- a header: week name (and, for a finished week, nothing extra yet);
- a section per visible day: the day's note (the summary at the bottom of
  the column), then its blocks in order with rating, tags, session line and
  review; unplanned blocks marked as such;
- focus lists per name, as now.

Drew reviews that and gives more specific feedback.

## Build order (one commit each, no push)

1. Print label
2. Per-week regulars and one-offs + migration + tests
3. Shared tick-box dialog: New week and Finish week, archive, undo
4. Saved UI state
5. Print page 2
