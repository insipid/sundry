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

## Mockups

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
