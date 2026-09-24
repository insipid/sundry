# schedule-ish — design

A napkin planner for a week. You block out rough chunks of time ("a bit of
this in the morning, a big chunk of that after lunch") without clock times.
The app is entirely client-side: `schedule-ish/index.html` plus a little JS, with
no build step.

This is the first of two features. The second, "how did the day actually go
compared to the plan", is out of scope here. The data model stays simple
enough to extend for it later.

## Decisions (from the Q&A on 2026-09-24)

| Topic | Decision |
|---|---|
| Placement | Free placement in a day column, with snapping. Gaps are meaningful. Overlapping blocks sit side by side. |
| Day shape | No clock times. Faint gridlines, soft zone labels in a left gutter. |
| Dates | Generic weekdays (Mon…Sun), not real dates. |
| Days shown | Settings: which weekday the week starts on, and which days are visible. |
| Style | Clean, soft, minimal, with rounded blocks in muted pastels. Not hand-drawn. |
| Stack | `index.html` + classic `<script>` files, Tailwind via the jsDelivr browser build, vanilla JS with pointer events. Opens from `file://`. |
| Saving | Autosave to localStorage. Export/Import JSON. (No iCal: too finicky for a casual tool.) |
| Screen | Desktop first, usable on a tablet, no phone layout. |

## The day: zones and steps

A day is a vertical run of **steps**, the snap unit. Steps belong to named
**zones**:

| Zone | Steps | Shown by default |
|---|---|---|
| early | 3 | no |
| morning | 4 | yes |
| midday | 2 | yes |
| afternoon | 4 | yes |
| evening | 4 | no |

Block positions are stored in absolute steps from the top of `early`, so
showing or hiding a zone never moves a block.

**Optional zones stay optional without adding clutter.** Below the gutter
there's a small grab handle, "⋯ evening". Dragging it down reveals the
evening zone, and dragging it back up hides it again. `early` has the same
handle at the top. A zone can't be hidden while blocks sit in it; trying
shows a short "move the evening blocks out first" note. That keeps the default view simple while the extra
zones are always one drag away.

Gridlines: faint at every step, a little stronger at zone boundaries.

## Blocks

`{ id, day, start, size, title, color }`, where `start` and `size` are in steps.

- **Create:** drag down across empty space in a day. A single click makes a
  default "a bit" block (2 steps). A title input opens right away.
- **Move:** drag the body, including into another day. It snaps to whole steps.
- **Resize:** drag the top or bottom edge. Minimum size is 1 step.
- **Rename:** double-click.
- **Colour / delete / make regular:** small controls appear on hover.
  Delete/Backspace removes the selected block.
- **Size words:** 1 = a smidge, 2 = a bit, 3 = a good bit, 4+ = a big chunk.
  These show as a soft hint on the block instead of a duration.

## Sidebar

**Regulars** (templates): reusable blocks with a title, size, colour and
home zone, e.g. "Gym · a good bit · morning". Dragging one onto a day places
a *copy*, and the regular stays in the list. Dropping it inside the column
places it where you drop it. Dropping it on the **day header** puts it in the
first free gap in its home zone ("defaults to the morning"). Create regulars
with "+ regular", or from an existing block using "make regular".

**Unplaced** (one-offs): a quick list of things you'd like to fit in
somewhere. Dragging one onto a day *moves* it out of the list. Dragging a
block from a day onto this list unschedules it.

## Code layout

```
schedule-ish/
  index.html      shell, Tailwind, small <style> for grid/blocks
  model.js        pure logic: zones, snapping, overlap layout, gap finding,
                  state (de)serialisation. Browser global + CommonJS export.
  app.js          rendering + pointer interactions + persistence
  test/model.test.js   node --test
  README.md
```

`model.js` holds everything worth unit testing and has no DOM
dependencies. `app.js` is the UI. It renders from state and changes state
only through small functions, then re-renders and saves.

## Testing

- `node --test schedule-ish/test/*.test.js` for model logic: snapping, clamping,
  overlap columns, first free gap, zone-hide limits, import validation.
- Manual pass in a browser: create, move across days, resize, overlap,
  regulars to header and column, unplaced round trip, zone handles,
  settings, export/import, reload persistence.

## As built: small additions

These weren't in the Q&A, but they're cheap and they suit how drag-and-drop
tools feel:

- Undo/redo (⌘Z / ⇧⌘Z). Each drag, edit or import is one step.
- Blocks with the same name share a colour. New blocks take the colour of a
  matching regular or block, or else a colour derived from a hash of the name.
- Three starter regulars on first run (Gym, Lunch, Deep work) so the sidebar
  isn't empty. Delete them freely.
- Day headers and the zone gutter stay pinned when the board scrolls, which
  matters on tablet widths.

## Round 2 (2026-09-24): zone breaks, toggles, PDF

- **Movable breaks.** Zone sizes are now part of the plan (`state.zones`,
  steps per zone, always summing to the fixed day length). Dragging a zone
  name moves the break at the top of that zone, trading steps only with the
  zone above it (`moveBoundary`), with a minimum of one step each. So
  dragging *midday* down lengthens morning and shortens midday, and
  afternoon stays put. The first visible zone has no break above it, so it
  isn't draggable.
- **Early/evening are click toggles.** The drag tabs were confusing: one
  control did two jobs, and a second "evening" appeared once the zone was
  open. Now a hidden zone is a quiet "+ evening" row, and an open one has a
  hover "−" beside its name. Tucking away is still refused while blocks
  sit in the zone.
- **PDF via print.** A print stylesheet plus `window.print()`, with no
  library. `beforeprint` re-renders the day at a fixed height so the week
  fits one landscape page on both Letter and A4 (checked with headless
  Chrome's print-to-PDF). jsPDF and html2canvas were the alternatives, but
  both mean more code or blurrier text for little gain.

## Round 3 (2026-09-24): fill the height, fixed share for early/evening

- **Always fill.** The step height is no longer capped (it used to max out
  at 64px). The visible zones fill the board exactly. Only a very short
  window falls back to an 18px minimum and scrolls.
- **20-step day.** The zones are now early 4, morning 5, midday 2,
  afternoon 5, evening 4 (the table above shows the original 17-step
  split). With 12 core steps, an optional zone opened on its own is 4/16 =
  25% of the height, and both open are 4/20 = 20% each. Steps stay a
  uniform height, so the core zones shrink proportionally (5:2:5 always)
  and collapsing restores them exactly.
- **Migration.** Plans are now `version: 2`. A `version: 1` plan (17 steps)
  is mapped zone by zone. Each block keeps its zone and its relative
  position and size inside it, using its own saved zone sizes if they're
  valid. Breaks moved under v1 reset to the new defaults. Plans with no
  version are taken as current. The size words count steps, so a migrated
  block can read one size up (e.g. *a bit* → *a good bit*) at the same
  height on screen.
- PDF stays a print stylesheet. The button is just a visible shortcut for
  ⌘P, which gives the same page.
