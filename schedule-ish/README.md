# schedule-ish

Back-of-a-napkin planning. Rough out chunks of time ("a good bit of gym in the
morning, a big chunk of writing after lunch") with no clock times. It's
meant to show roughly where your focus goes, not to be a timetable.

![schedule-ish](screenshot.png)

It's entirely client-side: one HTML page and two small scripts, with no build
step and no install.

## Running it

Open `index.html` in a browser. That's it.

If you'd rather serve it (some browsers are fussy about `file://`):

```bash
python3 -m http.server 8000 --directory schedule-ish
```

Then go to <http://localhost:8000>.

The page loads Tailwind (jsDelivr) and the Figtree font (Google Fonts) from
CDNs, so it needs a network connection on first load.

## Using it

**Weeks.** The dropdown next to the title shows which week you're on, e.g.
*My week ▾*. Each week is its own live board, with its own blocks, regulars,
one-offs, zone breaks and early/evening. Whatever you change is saved into the week you're
on. The dropdown can:
- switch to another week;
- start a **new week** from this one, ticking what to keep: **the plan**
  (the planned blocks, without any review), **regulars**, **one-offs**. The
  ticks are remembered for next time;
- **rename** or **delete** this week (deleting asks first, and ⌘Z brings it
  back).

Days shown and tags are shared by all weeks.

**The day** has no hours. It's split into soft zones: *morning*, *noon-ish*
(tinted, the middle of the day) and *afternoon*. Faint lines mark the day off, and
blocks snap to each line and halfway between lines, so they can be small
and move smoothly. The visible zones always fill the board's full height.
- **Move a break:** hover a zone name (*noon-ish*, *afternoon*, …) until the
  cursor shows ↕, then drag. That moves where the zone starts, trading
  steps only with the zone above it. Every zone keeps at least one step, and
  the day's overall length stays the same. The moving line **pushes** the
  blocks in the zone that shrinks, and they push the next ones. If they run
  out of room they **compress**, biggest first. Drag the line back (in the
  same drag) and they return; otherwise ⌘Z.
- **Early and evening** are optional. Click **+ early** or **+ evening** to
  add one. Once it's open, **click its name** to tuck it away again (a faint
  − shows on hover). Evening's name can also be dragged to move its break:
  a click tucks it away, a drag moves it. A zone won't hide while blocks are
  still in it.
- Opening one takes a quarter of the height (a fifth each if both are open),
  and the other zones shrink proportionally. Collapsing it puts everything
  back exactly.

**Blocks**
- **Drag down** in a day to rough out a chunk, or **click** for a default one.
  Type a name and press Enter. Escape (or leaving it blank) throws it away.
- **Drag** a block to move it, including to another day.
- **Drag its top or bottom edge** to resize it.
- **Double-click** (or select it and press **Enter**) to open its **focus
  notes**. Rename it there: the name at the top is editable.
- **Arrow keys** move between blocks: ↑/↓ within a day; ←/→ to the nearest
  block in the next day that has any, in that direction. With nothing
  selected, an arrow picks the first block. They work in review mode too.
- Hover for tools: ● change colour, ⧉ duplicate, ☆ save as a regular,
  × delete. Delete or Backspace also removes the selected block.
- **Duplicate** puts the copy straight after the original. If there's no
  room there, it goes to the same spot on the next day (a note says so), and
  failing that, the first free gap on the same day. Or **⌥-drag** a block to
  drag a copy wherever you like.
- Blocks that overlap sit side by side. Sizes read as *a smidge*, *a bit*,
  *a good bit* or *a big chunk* rather than durations.
- Blocks with the same name get the same colour.

**Focus notes.** Blocks are broad intents, not tasks, so notes are just a
light "what's next" to keep you moving, not a to-do list.
- Every block with the **same name this week shares one focus list**. The
  dialog says so: "Shared by 3 blocks this week: Mon · Wed · Thu".
- The top open line is **next** (a small pill). Drag lines by the ⋮⋮ grip to
  change what comes first. Tick a line and it folds into "done this week".
  Past five open lines, a gentle hint asks whether it's still broad.
- **This session** is an optional line for just the block you opened.
- **Just holding time:** some blocks (gym, lunch) need nothing. The small
  "just holding time" button in the dialog marks that name as a time-holder
  everywhere: its dialog becomes a single free-text box per block. Click it
  again to undo.
- **Show what's next on blocks** (Settings, on by default) puts "→ next"
  under each block's name. With it off, blocks with notes show ⋯ instead.
- Renaming the last block of a name takes its focus along. Regulars can
  hold lines that **start each week's focus** the first time you drop them
  into a week. "New from this week" carries over open lines only.

**Regulars** (sidebar) are templates for things you do often: a name, a
rough size, a colour, and optionally a usual zone ("usually …", or
*whenever*). Dragging one onto the week drops a *copy*, and the regular stays
in the list.
- Drop it **inside a day** to place it where you let go.
- Drop it **on a day's name** to put it in the first free gap in its usual
  zone, or, with *whenever*, the first free gap from the top of the day. While
  you drag, the day names are outlined as drop targets, and the one under
  the pointer says where it will land (e.g. *Tue → morning*). One-offs
  work the same way, as *whenever*.
- Click a regular to edit or delete it; **+ regular** makes a new one.
- **Reorder** regulars by dragging one up or down within the list. A line
  shows where it will land. One-offs reorder the same way.

**One-offs** (sidebar) are the extras for this week: things you want to
add that aren't regulars. Type one in and press Enter. Dragging it onto the week *moves* it
there. Dragging a block from the week back onto this list takes it off the
week.

**Review** (the *Plan / Review* switch next to the week name) is for looking
back at how the week went. Nothing you do in review changes the plan.
- **What actually happened:** drag a block to where it really happened, or
  drag its edges if it took longer or shorter. A faint dashed ghost marks
  where it was planned; it lights up when you select or hover its block.
  Right-click, then **Back to plan**, to undo that for one block. Plan mode always shows the plan.
- **Unplanned blocks:** draw on empty space for something that happened
  without being planned. It's hatched, can be rated, tagged and reviewed like
  any block (its "What happened" box doubles as a description). Rename it with
  Enter or in its dialog; delete it with the hover ×, the Delete key, or
  right-click. In plan mode it shows
  faintly, so you can see where reality didn't match the plan.
- Planned blocks can't be deleted or renamed while reviewing. Mark them
  *didn't happen* instead.
- **Rate a block:** hover it and tap the **✓?** in its corner to cycle **✓ → ✓✓ → ✓✓✓** and
  back to unrated. **Right-click** a block for *didn't happen* or
  *unproductive*. Or select a block and press **1 / 2 / 3**, **−**
  (unproductive), **s** (didn't happen) or **0** (clear). Rating is optional;
  unrated blocks just look a little faded.
- **Tag it:** the bar along the bottom shows tag chips for the selected block
  (*flow*, *interrupted*, *wrong time*, …). Tap to toggle. **+ tag** adds
  your own to the shared list. Tags show under the block's name.
- **Review a block:** double-click it. The plan side (focus list, session
  note) shows read-only, "as planned", and there's a **Review** box for how
  this particular block went. Blocks with a review show ⋯.
- **How was Tue?:** a one-line note per day, in a row under the grid.
- Today's day name has a small dot.
- Plan mode hides all of this. New blocks, duplicates and copies of a week
  start unrated.

**Finish week…** (in the header, Review mode only) closes out the week.
The dialog has **Print this week** and **Export this week** (a JSON file of
just this week; Import adds it back as a week). Then tick what to keep for
the next week: the same three as New week, remembered separately. Nothing
happens until you press **Finish week**. Then:
- the whole week as it stands (plan, what happened, ratings, tags, reviews,
  day notes, focus, regulars and one-offs) is saved to an **archive** in the
  browser, under the week's name and the time you finished;
- the week starts again under the same name, keeping only what you ticked;
- you're back in Plan mode.

⌘Z undoes a finish (the archived copy stays). There's no way to browse the
archive yet: it's kept for later.

**Print** is a shortcut for the browser's print (⌘P does the same). It opens
the print dialog with the week on one landscape page. The week's name is at
the top, the sidebar and buttons are hidden, and the colours are kept. What
prints follows the mode you're in:
- **In Plan:** the plan (no unplanned blocks), then a page of each name's
  **focus** lines and session notes, for the week ahead.
- **In Review:** the week as it went (ratings, moved blocks), then **how the
  week went**: a tally, then what **worked** (✓✓✓, or tagged *flow*,
  *energised*, *should repeat*), what **didn't** (unproductive, *interrupted*,
  *distracted*, *wrong time*, unplanned), what **ran long or short**, what
  **moved**, what **didn't happen**, every **tag** with where it landed (your
  own tags only show here), how each **name** did across the week, and the
  day notes. Block reviews show under their block.

Choose "Save as PDF" as the destination, or print it.

**Sidebar**: the header button next to undo shows or hides it. Settings
can put it on the left or the right.

**Settings** set the first day of the week, which days to show, whether
blocks show what's next, the sidebar side, and the optional zones. **Undo/redo**:
⌘Z / ⇧⌘Z (Ctrl on other platforms), or the header buttons.

## Saving

Everything (all weeks) autosaves to the browser's `localStorage`, per browser and per
origin, so opening the file directly and serving it over `localhost` give
you separate plans. Finished weeks go to a separate archive entry there. The
app also remembers where you were in each week (the selected block and how
far the board is scrolled), separately from the plan.

The **⋯** menu in the header has **Export** (downloads everything, meaning all
weeks, with their regulars and one-offs, as JSON; not the archive),
**Import** (loads one back and replaces the current schedule, or adds a single
exported week alongside the others; undoable) and **Clear this week's blocks**.

## Sharing a schedule

A schedule can be published with the app and shared as a link:

1. Build it, then **⋯ → Export as a shared schedule**. That downloads
   `<id>.js`: the same data as Export, wrapped as `scheduleIsh({...});`.
2. Put it in `weeks/` next to `index.html` (rename it if you like). The id
   is letters, numbers and hyphens: a readable name or a UUID.
3. Share `…/index.html?weeks=<id>`. Try `?weeks=example`. (Older `?cal=`
   links still work.)

A shared schedule is a starting point. The first visit loads the file;
after that it lives in the visitor's browser under its own storage (its own
weeks, archive and saved place), apart from their own schedule, which a
plain link still opens. Their changes stay in their browser; the published
file never changes. A bar above the board says which schedule it is and
offers **Reset to the published version** (undoable). If the published file
has changed since, the bar says so and offers **Reset** or **Ignore**.

If the file is missing or broken, the page says the schedule couldn't be
loaded (it never shows your own schedule instead). Shared files are scripts
rather than plain JSON so that they load both from a server and with the
page opened straight from disk.

## Code

| File | What |
|---|---|
| `index.html` | Page shell, Tailwind, and a small `<style>` block for the grid, blocks and print layout |
| `model.js` | Pure logic: zones and steps, snapping, overlap layout, gap finding, loading/validation. No DOM. |
| `share.js` | Which schedule the page shows (your own, or `?weeks=<id>`), its storage keys, first-visit load; then starts `app.js` |
| `weeks/` | Shared schedules for `?weeks=<id>` (`<id>.js`) |
| `app.js` | Rendering, pointer-event drag/resize (blocks and zone breaks), sidebar, popovers, persistence, undo, print |
| `test/model.test.js` | Unit tests for `model.js` |

Run the tests with Node 18 or later (no dependencies):

```bash
node --test schedule-ish/test/*.test.js
```

The design notes are in
[`docs/2026-09-24-1450_DESIGN_schedule-ish.md`](../docs/2026-09-24-1450_DESIGN_schedule-ish.md).

## Not yet

- Attributes on blocks beyond name, size and colour.
- Phone layout. It's built for landscape screens: desktop first, and fine on
  a tablet.
