# BRAINSTORM: schedule-ish review (how did the week actually go?)

**Status:** brainstorming, with a first cut built on 2026-09-26 (see Built).
**Started:** 2026-09-25 · **Kept by:** Claude, for Drew. Update this file
every time the brainstorm moves, so nothing gets lost between sessions.

The goal, in Drew's words: plan a week, live through it, then look back.
How well did I stick to the intents, how much got done, and what did and
didn't work. Keep it as simple as possible.

---

## Built (2026-09-26)

The mockup's feature set is now in the app, in review mode:
- the Plan / Review toggle, saved as a setting;
- tap-to-cycle ✓ ratings, right-click for skipped or counterproductive, and
  the keys 1 2 3 − s 0;
- tag chips in a bar under the board, with "+ tag";
- a "How was Tue?" line per day;
- the today dot.

Choices made while building (open to change): review locks the plan
completely; plan mode hides all review marks; new blocks, duplicates and
copied weeks start unrated. Details are in the design doc's round 7.

Still not built: Close week and its history, review-mode drag and draw
(plan vs actual), the summary view, and "review this day" from the day
name.

## Decided

**Rating a block**
- Scale: unrated → ✓ → ✓✓ → ✓✓✓, plus **counterproductive** and
  **skipped** as two separate states.
  - Skipped = "didn't do it". Counterproductive = "did it, and it made
    things worse".
- Setting it: **tap to cycle** (tap the block's corner: ✓ → ✓✓ → ✓✓✓) plus
  **keyboard** (select a block, then 1 / 2 / 3, − counterproductive,
  s skipped, 0 clear).
- **Not every block gets rated.** Rating is optional; unrated blocks just
  don't count.
- **Skipped and counterproductive live on right-click (plus keyboard), for
  now.** Drew doesn't like things hidden behind right-click, but thinks it's
  the better option for the moment. Revisit (see Open questions).

**Written feedback**
- **Tag chips**, liked a lot (the chip row under the board in the mockup
  was a hit). One tap per tag. You can add your own tags
  (a "+ tag" chip), and your tags are shared across everything.
- **Tags exist only in review mode**, not while planning.

**Modes**
- A **Plan / Review toggle** that you control. The app knows the day of the
  week, but it never assumes which part of a day is in the past.
- Also **"review this day"** from the day name, behind one extra step
  (e.g. clicking a day name offers "Review Tuesday") so it doesn't clash
  with day names being drop targets.

**Days you don't review** count as **not reviewed**, not as skipped. Only
an explicit skip is a skip.

## Leaning towards (liked, details open)

**Record vs reusable plan: option A, "Close week".** A week is both a
reusable plan and a record. The board stays the live, reusable week. When
you've finished reviewing, "Close week" saves a read-only snapshot (plan +
ratings + tags + day notes) to a history, then clears the ratings from the
live week, ready to use again.
- Maybe add option C's reminder: the app knows the date, so the first time
  you open it in a new calendar week it could ask "Last week has N
  ratings. Close it and start fresh?"
- Open: what the history looks like, whether closed weeks are named by
  date, and whether a closed week can be reopened.
- **Still undecided (2026-09-26):** reusable template or single week? Drew
  wants it to be both, and to be able to do *whichever you want, easily*.
  Close week and the summary view both depend on this, so it's the main
  question for the run to v1.

**Plan vs actual through gestures in review mode** (liked):
- **Drag a block in review mode** = "it actually happened here". It moves,
  and a faint ghost stays where it was planned. The summary can count
  drift ("3 blocks slid from morning to afternoon").
- **Draw a new block in review mode** = "something unplanned happened".
  It's styled differently (e.g. hatched) and can be counted as "what ate my
  time".
- So review mode isn't purely "locked": dragging and drawing change meaning
  there. Resizing in review mode is still undecided.

## Review mode: move and resize = what actually happened (v1, raised 2026-09-27)

Drew wants to move and resize blocks in review mode ("it took longer"),
but those changes must not touch the plan, while still counting in the
week's review. This builds on the "Plan vs actual through gestures" idea
above.

**Claude's proposal:** each block keeps its plan, plus an optional
`actual` ({ day, start, size }).
- Plan mode always shows the plan and ignores `actual`.
- In review mode, dragging or resizing sets `actual`. The block shows
  there, with a faint dashed ghost at its planned position. Resizing means
  "took longer or shorter".
- Drawing on empty space in review mode makes an **unplanned** block
  (hatched), for "something ate my afternoon". It exists only in review.
- Right-click gains "Back to plan" (clears `actual`).
- Ratings, tags and focus stay on the block. The summary can later compare
  plan and actual per block (drift, overruns).
- Untouched blocks have no `actual` ("as planned"). "New from this week"
  drops actuals and unplanned blocks. Nothing flows back into the plan
  automatically; a "make this the plan" action could come later.

Questions for Drew:
1. Unplanned blocks in plan mode: invisible, or faint?
2. Ghosts of the plan in review: always, or only for the selected block?
3. Deleting in review: allowed for unplanned blocks, while planned ones can
   only be marked skipped?
4. Resize in review = "took longer / shorter" (no separate "overran"
   rating)?

## Mockups

- `schedule-ish/mockups/notes-focus.html`: shared focus notes. Click a
  block. The Job applications blocks share one focus list (tick on Monday
  and it's ticked on Wednesday); the top unticked line is "next" and can
  show on the block; drag lines to reorder; ticked lines fold into "done
  this week"; plus an optional "this session" line; Gym and Lunch are empty
  time-holders.
- `schedule-ish/mockups/review-mode.html`: open it in a browser. It shows
  the Plan / Review toggle, tap-to-cycle ratings, right-click for skipped
  or counterproductive, keyboard shortcuts, tag chips with "+ tag", and a
  "How was…?" line per day. It's a throwaway sketch, not wired to the app.
  (The same thing shown in chat as a widget didn't render for Drew.)

## Open questions

1. Ratings and tags on the board in plan mode: hidden, or faint? (Built as
   hidden for now.)
2. What exactly does the "review this day" extra step look like: a small
   menu on the day name, a hover link, or a double-click?
3. The summary view (mocked 2026-09-25): which groupings matter? So far:
   by activity (done / planned, average rating), by part of the day, and
   top tags. Is it a panel, a page, or part of Close week?
4. A day-level one-liner ("How was Tue?") and/or a weekly keep / drop /
   try retro: were in the mockup, but not discussed yet.
5. Starter tag list: flow, energised, interrupted, distracted, too long,
   too short, wrong time, should repeat? Edit freely.
6. How ratings look on a block: the mockup used a tick badge plus a heavier
   outline as ratings rise, a dashed ghost with the name struck through for
   skipped, and a red dashed edge for counterproductive. Not confirmed.
7. Right-click for skipped and counterproductive is the stopgap (Drew
   dislikes hidden interactions). Candidates for later: a small always-
   visible "…" on the badge, the end of the tap cycle, or a long-press.
8. Keyboard shortcuts: not tried yet (as of 2026-09-26).

## Notes model (v1-critical, raised 2026-09-26): DECIDED and built 2026-09-27

Drew played with the notes-focus mockup and chose it ("functionality that
I want"), plus a way to mark blocks as just holding time. Built as the
design doc's round 8: shared focus per name per week, "next" pill,
reorder, done fold, a session line, a "just holding time" toggle (global
by name, which swaps in a single free-text box), and "show what's next on
blocks" in Settings. Choices made while building: time-holders are global
by name; the free text is per block; "new from this week" keeps open lines
only. Question 4 below (carrying unfinished items at Close week) is still
open.

Drew needs notes to track what each block's focus is, without the app
becoming another to-do list. Question: should repeated blocks (e.g. from a
regular) share notes across the week? This is a core decision for v1.
See also the TASK doc `docs/2026-09-24-2236_TASK_review-notes-editor.md`.

**Drew's framing (2026-09-26):** the app is a focus aid. Broad intents go
on a calendar (a technique from Drew's occupational therapist, previously
done on paper). A block is time given to a broad focus that serves an end
goal ("job applications"), not a task. The details live elsewhere; here
Drew only wants a light "what's first / what's next" pointer to keep
moving. Not every block is the same: focus blocks carry a thread through
the week, and time-holders (gym, lunch) need nothing.

What follows for the design:
- no setting for block kinds: a block with no focus lines just holds time;
- the list is a "what's next" pointer, not a task list: the top unticked
  line is next, reordering changes what's next, and ticked lines fold away;
- the focus is shared across the week by name, so the thread carries over
  from Monday to Wednesday.

Mockup: `schedule-ish/mockups/notes-focus.html` (option 3 below, shaped by
the points above). It has a "show what's next on blocks" switch, as an
alternative to the plain ⋯ marker.

Today: each block has its own notes. A regular's default notes are copied
into each dropped block, and the copies are independent.

Underlying question: is the unit a slot of time, or a thing you're working
on (a "thread" or "intent") that gets several slots?

Options:
1. Per-block notes (as now). Simple, but no continuity.
2. Shared notes for every block with the same name in a week, linked
   automatically. Good for projects; wrong for routines ("legs today" on
   every Gym block).
3. **Claude's recommendation: shared plus per-session.** A shared Focus list
   for every block with that name this week ("Write proposal: 3 blocks this
   week"), plus an optional small "This session" note per block. A regular's
   default notes seed the Focus the first time it appears in a week.
4. A weekly focus list (3–5 intents), with blocks as time given to an
   intent. The cleanest intent model, but a bigger change; held in reserve.

Guard-rails against becoming a to-do list: no dates, priorities or nesting;
a soft limit of about five lines; ticks as progress hints (review could
show "3 of 5 focus items"); at Close week, unticked focus items carry
forward only if you choose.

Questions for Drew:
1. When you plan, do you think in slots of time or in things you're working
   on that get several slots?
2. Link blocks automatically by name, or only when they come from the same
   regular?
3. Do per-session notes matter, or is a shared focus enough?
4. At Close week, should unfinished focus items carry into the next week?

## Side ideas (not review, raised 2026-09-26)

Feasibility only; nothing decided or built.
- **Dark / light mode:** feasible and mostly mechanical. Move about 66
  hard-coded colours in `index.html` into about 20 CSS variables; make the
  eight block pastels (hard-coded in `model.js` `PALETTE`) variables too;
  design dark pairs (a deep muted fill with light text); add a setting for
  Auto / Light / Dark. Print stays light. Claude's view: worthwhile,
  especially for evening reviews.
- **Colour themes:** cheap once the variables exist (a theme is about 25
  values). Two or three curated ones at most (e.g. Napkin, Graphite,
  Blueprint), after v1. Optional.
- **Richer PDF:** print CSS already gives a real vector PDF.
  - Route A (cheap, recommended first): more print layouts: the week, the
    week plus notes, a review report (ratings, tags, day notes, summary),
    and a blank napkin to plan with a pen.
  - Route B (heavier): a generated PDF (e.g. jsPDF) for one-click downloads,
    identical across browsers, with multi-page layouts. It means a second
    renderer to maintain.
  - Links to review: Close week could offer "save this week's report" as a
    keepsake PDF.

## Parked

- A full separate "what actually happened" layer. The review-mode drag and
  draw gestures probably cover most of it.
- Per-block free text for reflection. Block notes stay for planning;
  reflection uses tags (and maybe the day one-liner).

## Log

- **2026-09-25:** First round. Idea: ratings (cycle / strip / keyboard),
  tags, modes, summary; two mockups shown in chat. Drew chose tap to
  cycle + keyboard, separate skipped and counterproductive, tag chips, the
  toggle plus day-click review, and "both" for record vs plan.
- **2026-09-25:** Second round. Option A (Close week) and review-mode drag
  and draw liked; not every block is rated; unreviewed days are "not
  reviewed"; tags only in review mode. Started this file.
- **2026-09-25:** The in-chat rating widget never rendered for Drew, so it's
  rebuilt as a standalone page (see Mockups), updated to match the decisions
  so far.
- **2026-09-26:** Drew tried the standalone mockup and liked it: tap-to-cycle
  ticks are good, and the tag chips are "really nice". Right-click accepted
  for now, reluctantly. Keyboard not tried yet; still exploring the rest.
- **2026-09-26:** Drew: "back-of-a-napkin planning" is the strapline. Drew
  asked to build the mockup into the app, so the first cut of review mode is
  built (see Built). Next: Drew reviews what's close to a version 1.
- **2026-09-26:** Drew is going to play with review mode, think about Close
  week, the summary, and template vs single week, then come back to draft
  the run to v1.
- **2026-09-26:** Drew asked about the feasibility of dark mode, themes and a
  richer PDF; recorded under Side ideas. Nothing built.
- **2026-09-26:** Drew raised the notes model (per-block or shared across a
  week's repeated blocks) as a v1-critical decision; options and questions
  recorded under Notes model.
- **2026-09-26:** Drew described the app's purpose (a focus aid for broad
  intents, from an OT technique; blocks are not tasks; gym and lunch just
  hold time). Built the shared-focus notes mockup (see Mockups).
- **2026-09-27:** Drew chose the shared-focus notes and asked for a
  time-holder toggle and a Settings switch for "what's next": built.
- **2026-09-27:** Drew raised moving and resizing in review mode, with state
  kept separate from the plan; proposal recorded above (block `actual` plus
  unplanned blocks). Also fixed: clicking a regular's pill again now closes
  its editor.
