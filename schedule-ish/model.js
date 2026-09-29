// schedule-ish model: pure logic, no DOM. The browser loads it as a classic
// script (window.Model); tests load it with require().
(function (root) {
  'use strict';

  // A day is a run of "steps" (the snap unit), grouped into zones. Block
  // positions are absolute steps from the top of `early`, so showing or
  // hiding the optional zones never moves anything. The day's length is
  // fixed; the breaks between zones can move (see moveBoundary).
  const ZONE_IDS = ['early', 'morning', 'midday', 'afternoon', 'evening'];
  const OPTIONAL = { early: true, evening: true };
  // 24 core steps, 8 each for early and evening: an optional zone opened on
  // its own takes a quarter of the day's height, both open take a fifth each.
  // Steps are fine-grained; the board draws a line every STEPS_PER_LINE.
  const DEFAULT_ZONE_SIZES = { early: 8, morning: 10, midday: 4, afternoon: 10, evening: 8 };
  const STEPS_PER_LINE = 2;
  const TOTAL_STEPS = ZONE_IDS.reduce((n, id) => n + DEFAULT_ZONE_SIZES[id], 0);
  const FULL_RANGE = { start: 0, end: TOTAL_STEPS };

  // What each zone is called on screen. Ids are what's stored; "midday" is
  // shown as "noon-ish" so it reads as a rough band, not 12:00.
  const ZONE_LABELS = { midday: 'noon-ish' };
  const zoneLabel = id => ZONE_LABELS[id] || id;

  // Zone sizes (steps per zone) → [{ id, label, steps, start, end, optional }]
  function zonesFor(sizes) {
    let acc = 0;
    return ZONE_IDS.map(id => {
      const z = { id, label: zoneLabel(id), steps: sizes[id], start: acc, end: acc + sizes[id], optional: !!OPTIONAL[id] };
      acc = z.end;
      return z;
    });
  }
  const ZONES = zonesFor(DEFAULT_ZONE_SIZES);

  // Move the break at the top of `zoneId` to `newStart`, trading steps with
  // the zone above only. Both keep at least one step.
  function moveBoundary(sizes, zoneId, newStart) {
    const zones = zonesFor(sizes);
    const i = zones.findIndex(z => z.id === zoneId);
    if (i <= 0) return { ...sizes };
    const above = zones[i - 1], z = zones[i];
    const at = Math.max(above.start + 1, Math.min(z.end - 1, Math.round(newStart)));
    return { ...sizes, [above.id]: at - above.start, [z.id]: z.end - at };
  }

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Muted pastels: [fill, border/ink]
  const PALETTE = [
    ['#dbe7f5', '#5b7ba6'], // blue
    ['#dcefe2', '#4f8a64'], // sage
    ['#f7e3d4', '#b0703f'], // peach
    ['#ece2f5', '#7e5ea6'], // lavender
    ['#f6e9c8', '#9a7a2c'], // butter
    ['#f5dde3', '#a65a70'], // rose
    ['#d9eeee', '#3f8585'], // teal
    ['#e6e4df', '#6e6a61'], // stone
  ];

  // Squeeze blocks (sorted, in order) into [lo, hi): shave a step off the
  // biggest until they fit, then lay them end to end. If there are more
  // blocks than steps, the extras pile up on the last step.
  function compressInto(list, lo, hi) {
    while (list.reduce((n, x) => n + x.size, 0) > hi - lo) {
      const big = list.reduce((m, x) => (x.size > m.size ? x : m), list[0]);
      if (big.size <= 1) break;
      big.size--;
    }
    let at = lo;
    for (const x of list) { x.start = Math.min(at, hi - 1); at += x.size; }
  }

  // Move the break at the top of `zoneId` like moveBoundary, and let it push
  // the blocks of whichever zone shrinks: a moving line shoves the blocks it
  // reaches, they shove the next ones, and if they run out of room they
  // compress. Blocks straddling the break, and every other zone, stay put.
  function moveBoundaryPushing(sizes, blocks, zoneId, newStart) {
    const zones = moveBoundary(sizes, zoneId, newStart);
    const out = blocks.map(x => ({ ...x }));
    const before = zonesFor(sizes), i = before.findIndex(z => z.id === zoneId);
    if (i <= 0) return { zones, blocks: out };
    const above = before[i - 1], below = before[i];
    const oldAt = below.start, newAt = zonesFor(zones)[i].start;
    const days = [...new Set(out.map(x => x.day))];
    for (const day of days) {
      const mine = out.filter(x => x.day === day);
      if (newAt > oldAt) {
        // Zone below shrinks from the top: push down.
        const list = mine.filter(x => x.start >= oldAt && x.start < below.end).sort((a, c) => a.start - c.start);
        let wall = newAt;
        for (const x of list) if (x.start < wall) { x.start = wall; wall = x.start + x.size; }
        if (list.some(x => x.start + x.size > below.end)) compressInto(list, newAt, below.end);
      } else if (newAt < oldAt) {
        // Zone above shrinks from the bottom: push up.
        const list = mine.filter(x => x.start >= above.start && x.start + x.size <= oldAt).sort((a, c) => c.start + c.size - (a.start + a.size));
        let wall = newAt;
        for (const x of list) if (x.start + x.size > wall) { x.start = wall - x.size; wall = x.start; }
        if (list.some(x => x.start < above.start)) compressInto(list.sort((a, c) => a.start - c.start), above.start, newAt);
      }
    }
    return { zones, blocks: out };
  }

  // The zone-aware helpers take an optional `zones` layout (from zonesFor),
  // defaulting to the standard one.
  const zone = (id, zones = ZONES) => zones.find(z => z.id === id);
  const zoneStart = (id, zones = ZONES) => zone(id, zones).start;
  const zoneAt = (step, zones = ZONES) => (zones.find(z => step >= z.start && step < z.end) || zones[zones.length - 1]).id;

  function visibleRange(view, zones = ZONES) {
    return {
      start: view.showEarly ? 0 : zoneStart('morning', zones),
      end: view.showEvening ? TOTAL_STEPS : zoneStart('evening', zones),
    };
  }

  function visibleZones(view, zones = ZONES) {
    const r = visibleRange(view, zones);
    return zones.filter(z => z.start >= r.start && z.end <= r.end);
  }

  function clampBlock(start, size, range) {
    const span = range.end - range.start;
    size = Math.max(1, Math.min(Math.round(size), span));
    start = Math.max(range.start, Math.min(Math.round(start), range.end - size));
    return { start, size };
  }

  function orderedDays(weekStart, visibleDays) {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = (weekStart + i) % 7;
      if (visibleDays[d]) out.push(d);
    }
    return out;
  }

  const overlaps = (a, b) => a.start < b.start + b.size && b.start < a.start + a.size;

  // Google-Calendar-style side-by-side layout. Blocks that transitively
  // overlap form a cluster; each gets the first free column, and the whole
  // cluster shares a column count. Returns { [id]: { col, cols } }.
  function layoutDay(blocks) {
    const sorted = [...blocks].sort((a, b) => a.start - b.start || b.size - a.size);
    const out = {};
    let cluster = [], colEnds = [], clusterEnd = -Infinity;
    const flush = () => {
      for (const blk of cluster) out[blk.id].cols = colEnds.length;
      cluster = []; colEnds = [];
    };
    for (const blk of sorted) {
      if (blk.start >= clusterEnd) flush();
      let col = colEnds.findIndex(end => end <= blk.start);
      if (col === -1) { col = colEnds.length; colEnds.push(0); }
      colEnds[col] = blk.start + blk.size;
      out[blk.id] = { col, cols: 1 };
      cluster.push(blk);
      clusterEnd = Math.max(clusterEnd, blk.start + blk.size);
    }
    flush();
    return out;
  }

  // Where to drop a `size`-step block on `day` when we only know its home
  // zone (or none, null: the top of the visible day): the first gap at or
  // after that, else anywhere in range, else there anyway (overlapping is
  // allowed, just untidy).
  function firstFreeGap(blocks, day, size, zoneId, range, zones = ZONES) {
    const mine = blocks.filter(x => x.day === day);
    const home = clampBlock(zoneId ? zoneStart(zoneId, zones) : range.start, size, range).start;
    const fits = s => !mine.some(x => overlaps({ start: s, size }, x));
    for (let s = home; s + size <= range.end; s++) if (fits(s)) return s;
    for (let s = range.start; s < home; s++) if (fits(s)) return s;
    return home;
  }

  // Where a copy of `block` goes: straight after it if that's free, else the
  // same spot on the next visible day, else the first free gap on its day.
  function duplicateSpot(blocks, block, days, range, zones = ZONES) {
    const free = (day, start) => start >= range.start && start + block.size <= range.end &&
      !blocks.some(x => x.day === day && overlaps({ start, size: block.size }, x));
    const after = block.start + block.size;
    if (free(block.day, after)) return { day: block.day, start: after };
    const next = days[days.indexOf(block.day) + 1];
    if (next !== undefined && free(next, block.start)) return { day: next, start: block.start };
    return { day: block.day, start: firstFreeGap(blocks, block.day, block.size, zoneAt(block.start, zones), range, zones) };
  }

  function canHide(zoneId, blocks, zones = ZONES) {
    const z = zone(zoneId, zones);
    if (zoneId === 'early') return !blocks.some(x => x.start < z.end);
    return !blocks.some(x => x.start + x.size > z.start);
  }

  // Words count grid lines (two steps each), rounding a half up.
  function sizeWord(size) {
    const lines = Math.ceil(size / STEPS_PER_LINE);
    if (lines <= 1) return 'a smidge';
    if (lines === 2) return 'a bit';
    if (lines === 3) return 'a good bit';
    return 'a big chunk';
  }

  // Version 1 plans used a 17-step day. Map an old step onto the new day zone
  // by zone, keeping its relative position inside its zone.
  const V1_ZONE_SIZES = { early: 3, morning: 4, midday: 2, afternoon: 4, evening: 4 };
  const V1_TOTAL = 17;
  function migrateStep(step, from, to) {
    if (step >= V1_TOTAL) return TOTAL_STEPS;
    const i = Math.max(0, from.findIndex(z => step >= z.start && step < z.end));
    return to[i].start + (step - from[i].start) * to[i].steps / from[i].steps;
  }

  let idCounter = 0;
  const newId = () => Date.now().toString(36) + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 6);

  // Focus notes: every block with the same name in a week shares one short
  // list of lines ({ text, done }). The top open line is what's next. It is
  // a pointer to keep moving, not a to-do list. Each block can also carry
  // its own one-line `session` note. Names on the `timeHolders` list just
  // hold time: no focus list, only the session line.
  const threadKey = title => String(title || '').trim().toLowerCase();
  const nextFocus = (week, title) => {
    const hit = ((week.focus || {})[threadKey(title)] || []).find(x => !x.done && x.text.trim());
    return hit ? hit.text : null;
  };

  const defaultView = () => ({ showEarly: false, showEvening: false });

  // Review: a block's rating is 1-3 ticks, 'skip' (didn't do it) or 'bad'
  // (unproductive); null = unrated. Tapping only walks the ticks.
  const RATINGS = [1, 2, 3, 'skip', 'bad'];
  const nextRating = r => (r === 1 ? 2 : r === 2 ? 3 : r === 3 ? null : 1);
  const STARTER_TAGS = ['flow', 'energised', 'interrupted', 'distracted', 'too long', 'too short', 'wrong time', 'should repeat'];
  const normTags = v => [...new Set((Array.isArray(v) ? v : [])
    .filter(t => typeof t === 'string').map(t => t.trim().toLowerCase()).filter(Boolean))];
  const blankDayNotes = () => Array(7).fill('');
  // Where a block shows in review mode: where it actually happened, if that
  // was recorded, otherwise where it was planned.
  const effectivePos = b => (b.actual ? { ...b.actual } : { day: b.day, start: b.start, size: b.size });
  // Monday = 0, like the board's days.
  const todayIndex = (date = new Date()) => (date.getDay() + 6) % 7;

  // A week carries its own regulars and one-offs (`unplaced`).
  function blankWeek(name = 'New week') {
    return { id: newId(), name, view: defaultView(), zones: { ...DEFAULT_ZONE_SIZES }, blocks: [], unplanned: [], dayNotes: blankDayNotes(), focus: {},
      regulars: [], unplaced: [] };
  }

  // A fresh week from an old one, keeping what `keep` asks for:
  //   schedule: the planned blocks (with zone sizes and view),
  //   regulars, oneOffs: the sidebar lists.
  // Everything from review starts fresh: ratings, tags, reviews, session
  // lines, actual positions, unplanned blocks, day notes and done focus
  // lines. Open focus lines stay for the names that are still around.
  // Fresh ids throughout; same name unless one is given.
  const KEEP_ALL = { schedule: true, regulars: true, oneOffs: true };
  function carryWeek(week, keep = KEEP_ALL, name = week.name) {
    const old = JSON.parse(JSON.stringify(week));
    const w = blankWeek(name);
    if (keep.schedule) {
      w.view = old.view;
      w.zones = old.zones;
      w.blocks = old.blocks.map(x => ({ ...x, id: newId(), rating: null, tags: [], session: '', review: '', actual: null }));
    }
    if (keep.regulars) w.regulars = (old.regulars || []).map(r => ({ ...r, id: newId() }));
    if (keep.oneOffs) w.unplaced = (old.unplaced || []).map(u => ({ ...u, id: newId() }));
    const names = new Set([...w.blocks, ...w.regulars, ...w.unplaced].map(x => threadKey(x.title)));
    for (const [k, items] of Object.entries(old.focus || {})) {
      const open = items.filter(x => !x.done);
      if (names.has(k) && open.length) w.focus[k] = open;
    }
    return w;
  }
  const copyWeek = (week, name) => carryWeek(week, KEEP_ALL, name);
  // What New week and Finish week keep until you say otherwise: the
  // sidebar lists, but an empty week.
  const DEFAULT_KEEP = { schedule: false, regulars: true, oneOffs: true };
  const normKeep = v => Object.fromEntries(Object.entries(DEFAULT_KEEP)
    .map(([k, d]) => [k, v && typeof v[k] === 'boolean' ? v[k] : d]));

  // An archive entry for a finished week: the whole week as it stood, plus
  // the shared vocabularies. The label is just the week's name: when it was
  // finished is `finishedAt`, and showing it is up to whatever displays it.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDate = date => `${DAY_NAMES[todayIndex(date)]} ${date.getDate()} ${MONTHS[date.getMonth()]}`; // Mon 28 Sep
  function archiveEntry(state, week, date = new Date()) {
    return {
      label: week.name,
      finishedAt: date.toISOString(),
      version: state.version,
      week: JSON.parse(JSON.stringify(week)),
      tags: [...state.tags],
      timeHolders: [...state.timeHolders],
    };
  }

  function defaultState() {
    const week = { ...blankWeek('My week'), id: 'w-first' };
    week.regulars = [
      { id: 'r-gym', title: 'Gym', size: 6, color: 1, zone: 'morning', notes: [] },
      { id: 'r-lunch', title: 'Lunch', size: 4, color: 4, zone: 'midday', notes: [] },
      { id: 'r-deep', title: 'Deep work', size: 8, color: 0, zone: 'morning', notes: [] },
    ];
    return {
      version: 6,
      settings: { weekStart: 0, visibleDays: [true, true, true, true, true, true, true], sidebar: 'left', sidebarHidden: false, mode: 'plan', showNext: true,
        newWeek: { ...DEFAULT_KEEP }, finishWeek: { ...DEFAULT_KEEP } },
      weeks: [week],
      currentWeek: week.id,
      tags: [...STARTER_TAGS],
      timeHolders: [],
    };
  }

  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const str = v => (typeof v === 'string' ? v : '');
  const color = v => (int(v, 0, PALETTE.length - 1) ? v : 0);
  const idOr = v => (typeof v === 'string' && v ? v : newId());
  // Focus lines. Also reads the older notes shape ({ text, check }), where a
  // ticked line (check: true) counts as done.
  const normFocus = v => (Array.isArray(v) ? v : [])
    .filter(n => n && typeof n.text === 'string' && n.text.trim())
    .map(n => ({ text: n.text, done: n.done === true || n.check === true }));
  const sidebarSize = (x, scale) => clampBlock(0, (x.size ? x.size * scale : 2 * STEPS_PER_LINE), FULL_RANGE).size;
  const normRegulars = (v, scale = 1) => (Array.isArray(v) ? v : [])
    .filter(x => x && typeof x.title === 'string')
    .map(x => ({ id: idOr(x.id), title: x.title, size: sidebarSize(x, scale), color: color(x.color),
      zone: ZONE_IDS.includes(x.zone) ? x.zone : null,
      notes: normFocus(x.notes).map(n => ({ text: n.text, done: false })) })); // lines to seed a week's focus
  const normOneOffs = (v, scale = 1) => (Array.isArray(v) ? v : [])
    .filter(x => x && typeof x.title === 'string')
    .map(x => ({ id: idOr(x.id), title: x.title, size: sidebarSize(x, scale), color: color(x.color),
      // older one-offs carried note lines: keep them as one session line
      session: str(x.session) || normFocus(x.notes).map(n => n.text.trim()).join('; ') }));

  // One week's board: view, zone sizes and blocks. `v1` maps a version-1
  // (17-step) plan onto the current day; `scale` multiplies everything for
  // v2/v3 plans, which used a 20-step day (half today's resolution).
  // `shared` holds the old, pre-v6 global regulars and one-offs: a week
  // without lists of its own gets a copy of them (fresh ids).
  function normalizeWeek(raw, v1 = false, scale = 1, shared = { regulars: [], unplaced: [] }) {
    let rawBlocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
      .filter(x => x && int(x.day, 0, 6) && Number.isFinite(x.start) && Number.isFinite(x.size));
    let rz = raw.zones || {};
    if (scale !== 1 && !v1) {
      rawBlocks = rawBlocks.map(x => ({ ...x, start: x.start * scale, size: x.size * scale }));
      rz = Object.fromEntries(Object.entries(rz).map(([k, n]) => [k, Number.isFinite(n) ? n * scale : n]));
    }
    if (v1) {
      const oz = raw.zones || {};
      const oldOk = ZONE_IDS.every(k => int(oz[k], 1, V1_TOTAL)) && ZONE_IDS.reduce((n, k) => n + oz[k], 0) === V1_TOTAL;
      const from = zonesFor(oldOk ? oz : V1_ZONE_SIZES), to = zonesFor(DEFAULT_ZONE_SIZES);
      rawBlocks = rawBlocks.map(x => {
        const start = Math.round(migrateStep(x.start, from, to));
        const end = Math.round(migrateStep(x.start + x.size, from, to));
        return { ...x, start, size: Math.max(1, end - start) };
      });
      rz = DEFAULT_ZONE_SIZES;
    }
    const normBlock = x => ({
      id: idOr(x.id), day: x.day, ...clampBlock(x.start, x.size, FULL_RANGE),
      title: str(x.title), color: color(x.color), session: str(x.session),
      rating: RATINGS.includes(x.rating) ? x.rating : null, tags: normTags(x.tags), review: str(x.review),
    });
    const validPos = p => p && int(p.day, 0, 6) && Number.isFinite(p.start) && Number.isFinite(p.size);
    // Review: where a planned block actually happened (null = as planned).
    const blocks = rawBlocks.map(x => ({ ...normBlock(x),
      actual: validPos(x.actual) ? { day: x.actual.day, ...clampBlock(x.actual.start, x.actual.size, FULL_RANGE) } : null }));
    // Review: blocks that happened without being planned. Kept apart from the
    // plan so nothing that plans (pushing, gaps, duplicates) ever sees them.
    const unplanned = (Array.isArray(raw.unplanned) ? raw.unplanned : []).filter(validPos).map(normBlock);

    // Shared focus per name. Older plans kept notes on each block: merge them
    // by name, dropping repeated lines.
    const focus = {};
    const add = (key, items) => {
      if (!key || !items.length) return;
      const list = (focus[key] = focus[key] || []);
      for (const it of items) if (!list.some(x => x.text.trim() === it.text.trim())) list.push(it);
    };
    if (raw.focus && typeof raw.focus === 'object' && !Array.isArray(raw.focus)) {
      for (const [k, items] of Object.entries(raw.focus)) add(threadKey(k), normFocus(items));
    } else {
      for (const x of rawBlocks) add(threadKey(x.title), normFocus(x.notes));
    }

    const zonesOk = ZONE_IDS.every(k => int(rz[k], 1, TOTAL_STEPS)) && ZONE_IDS.reduce((n, k) => n + rz[k], 0) === TOTAL_STEPS;
    const zones = zonesOk ? Object.fromEntries(ZONE_IDS.map(k => [k, rz[k]])) : { ...DEFAULT_ZONE_SIZES };
    const layout = zonesFor(zones);

    // Everything that takes up time: plans, actual positions, unplanned blocks.
    const occupied = [...blocks, ...blocks.filter(x => x.actual).map(x => x.actual), ...unplanned];
    const v = raw.view || {};
    const view = {
      showEarly: Boolean(v.showEarly) || !canHide('early', occupied, layout),
      showEvening: Boolean(v.showEvening) || !canHide('evening', occupied, layout),
    };
    const dayNotes = blankDayNotes().map((_, i) => str(Array.isArray(raw.dayNotes) ? raw.dayNotes[i] : ''));
    const own = Array.isArray(raw.regulars) || Array.isArray(raw.unplaced);
    const regulars = own ? normRegulars(raw.regulars, scale) : shared.regulars.map(r => ({ ...r, id: newId(), notes: r.notes.map(n => ({ ...n })) }));
    const unplaced = own ? normOneOffs(raw.unplaced, scale) : shared.unplaced.map(u => ({ ...u, id: newId() }));
    return { id: idOr(raw.id), name: str(raw.name).trim() || 'Untitled week', view, zones, blocks, unplanned, dayNotes, focus, regulars, unplaced };
  }

  // Validate/repair anything loaded from storage or an import file.
  // v3 keeps several named weeks; v1/v2 plans had one board at the top
  // level, which becomes a single week called "My week".
  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a schedule-ish plan');

    const s = raw.settings || {};
    const vd = Array.isArray(s.visibleDays) && s.visibleDays.length === 7 ? s.visibleDays.map(Boolean) : Array(7).fill(true);
    const settings = {
      weekStart: int(s.weekStart, 0, 6) ? s.weekStart : 0,
      visibleDays: vd,
      sidebar: s.sidebar === 'right' ? 'right' : 'left',
      sidebarHidden: s.sidebarHidden === true,
      mode: s.mode === 'review' ? 'review' : 'plan',
      showNext: s.showNext !== false,
      // The tick-boxes of New week and Finish week, remembered separately.
      newWeek: normKeep(s.newWeek),
      finishWeek: normKeep(s.finishWeek),
    };

    // Plans before v4 counted half as many steps; their sizes all double.
    const scale = raw.version >= 1 && raw.version <= 3 ? 2 : 1;
    // Before v6, regulars and one-offs were shared by every week.
    const shared = { regulars: normRegulars(raw.regulars, scale), unplaced: normOneOffs(raw.unplaced, scale) };
    let weeks;
    if (Array.isArray(raw.weeks)) {
      weeks = raw.weeks.filter(w => w && typeof w === 'object' && !Array.isArray(w)).map(w => normalizeWeek(w, false, scale, shared));
    } else {
      weeks = [normalizeWeek({ name: 'My week', view: raw.view, zones: raw.zones, blocks: raw.blocks, focus: raw.focus }, raw.version === 1, scale, shared)];
    }
    if (!weeks.length) weeks = [{ ...blankWeek('My week'), regulars: shared.regulars, unplaced: shared.unplaced }];
    const currentWeek = weeks.some(w => w.id === raw.currentWeek) ? raw.currentWeek : weeks[0].id;

    const tags = Array.isArray(raw.tags) ? normTags(raw.tags) : [...STARTER_TAGS];
    const timeHolders = normTags(raw.timeHolders);
    return { version: 6, settings, weeks, currentWeek, tags, timeHolders };
  }

  // The print-out's notes page: each name once, in board order (first
  // appearance, by visible day then top to bottom), with the days it's on,
  // its focus lines, and any per-block session lines. Names with nothing
  // written, and hidden days, are left out.
  function focusForPrint(week, days) {
    const blocks = week.blocks.filter(x => days.includes(x.day))
      .sort((a, c) => days.indexOf(a.day) - days.indexOf(c.day) || a.start - c.start);
    const threads = new Map();
    for (const x of blocks) {
      const key = threadKey(x.title);
      if (!threads.has(key)) threads.set(key, { title: x.title, days: [], items: (week.focus || {})[key] || [], sessions: [] });
      const t = threads.get(key);
      if (!t.days.includes(x.day)) t.days.push(x.day);
      if (x.session && x.session.trim()) t.sessions.push({ day: x.day, text: x.session.trim() });
    }
    return [...threads.values()]
      .map(t => ({ ...t, days: t.days.sort((a, c) => days.indexOf(a) - days.indexOf(c)) }))
      .filter(t => t.items.length || t.sessions.length);
  }

  // Print page 2 in review: how the week went. Which blocks worked, which
  // didn't, which ran long or short, moved, or didn't happen; how each name
  // did; what the tags say; the day notes. Starter tags count as good or
  // bad; tags you add yourself only show in the tag list.
  const GOOD_TAGS = ['flow', 'energised', 'should repeat'];
  const BAD_TAGS = ['interrupted', 'distracted', 'wrong time'];
  const TIMING_TAGS = ['too long', 'too short'];
  function weekSummary(week, days, zones = zonesFor(week.zones)) {
    const shown = x => days.includes(effectivePos(x).day);
    const all = [
      ...week.blocks.filter(shown).map(x => ({ x, unplanned: false })),
      ...(week.unplanned || []).filter(shown).map(x => ({ x, unplanned: true })),
    ].map(({ x, unplanned }) => {
      const pos = effectivePos(x);
      const moved = !unplanned && !!x.actual && (x.actual.day !== x.day || x.actual.start !== x.start);
      return {
        id: x.id, title: x.title || 'untitled', color: x.color, rating: x.rating ?? null, tags: x.tags || [],
        review: (x.review || '').trim(), unplanned, day: pos.day, zone: zoneAt(pos.start, zones), size: pos.size,
        plannedSize: x.size, change: unplanned || !x.actual ? 0 : x.actual.size - x.size,
        moved, from: moved ? { day: x.day, zone: zoneAt(x.start, zones) } : null,
      };
    }).sort((a, c) => days.indexOf(a.day) - days.indexOf(c.day));
    const has = (e, list) => e.tags.some(t => list.includes(t));

    const worked = all.filter(e => e.rating === 3 || has(e, GOOD_TAGS));
    const didnt = all.filter(e => !worked.includes(e) && (e.rating === 'bad' || has(e, BAD_TAGS) || e.unplanned));
    const timing = all.filter(e => e.change !== 0 || has(e, TIMING_TAGS));
    const moved = all.filter(e => e.moved);
    const skipped = all.filter(e => e.rating === 'skip');

    // Group a list by name, keeping first-appearance order.
    const byName = list => {
      const groups = new Map();
      for (const e of list) {
        const k = threadKey(e.title);
        if (!groups.has(k)) groups.set(k, { title: e.title, color: e.color, items: [] });
        groups.get(k).items.push(e);
      }
      return [...groups.values()];
    };

    const tagMap = new Map();
    for (const e of all) for (const t of e.tags) {
      if (!tagMap.has(t)) tagMap.set(t, []);
      tagMap.get(t).push(e);
    }
    const tags = [...tagMap.entries()]
      .map(([tag, list]) => ({ tag, count: list.length, kind: GOOD_TAGS.includes(tag) ? 'good' : BAD_TAGS.includes(tag) ? 'bad' : TIMING_TAGS.includes(tag) ? 'timing' : 'other',
        names: byName(list).map(g => ({ title: g.title, days: g.items.map(e => e.day) })) }))
      .sort((a, c) => c.count - a.count || a.tag.localeCompare(c.tag));

    const count = (list, f) => list.filter(f).length;
    const ratingCounts = list => ({
      1: count(list, e => e.rating === 1), 2: count(list, e => e.rating === 2), 3: count(list, e => e.rating === 3),
      skip: count(list, e => e.rating === 'skip'), bad: count(list, e => e.rating === 'bad'), none: count(list, e => e.rating === null),
    });
    const names = byName(all).map(g => ({ title: g.title, color: g.color, count: g.items.length, ratings: ratingCounts(g.items) }));

    return {
      tally: { planned: count(all, e => !e.unplanned), unplanned: count(all, e => e.unplanned), ...ratingCounts(all),
        moved: moved.length, longer: count(all, e => e.change > 0), shorter: count(all, e => e.change < 0) },
      worked: byName(worked), didnt: byName(didnt), timing: byName(timing), moved: byName(moved), skipped: byName(skipped),
      names, tags,
      dayNotes: days.map(day => ({ day, note: (week.dayNotes[day] || '').trim() })).filter(d => d.note),
    };
  }

  // Shared schedules (?weeks=<id>): the id names a file next to the page, so
  // it's letters, numbers and hyphens only (a UUID or a readable name).
  const validCalId = id => typeof id === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(id);
  // A short, stable fingerprint of a published file's text (32-bit FNV-1a),
  // to notice when the published version changes.
  function fingerprint(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  // Arrow-key navigation between blocks ({ id, day, start, size }), with the
  // board's visible `days` in order. Up/down: previous/next block in the
  // same day. Left/right: the nearest day in that direction that has blocks,
  // choosing the block whose middle is closest to the current one's. With
  // nothing selected, the first block of the week. Returns an id or null.
  function navTarget(items, days, currentId, key) {
    const shown = items.filter(x => days.includes(x.day));
    const order = (a, c) => days.indexOf(a.day) - days.indexOf(c.day) || a.start - c.start || a.size - c.size;
    const cur = shown.find(x => x.id === currentId);
    if (!cur) return shown.length ? [...shown].sort(order)[0].id : null;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const same = shown.filter(x => x.day === cur.day).sort(order);
      const i = same.indexOf(cur) + (key === 'ArrowDown' ? 1 : -1);
      return (same[i] || cur).id;
    }
    const mid = x => x.start + x.size / 2;
    const step = key === 'ArrowRight' ? 1 : -1;
    for (let d = days.indexOf(cur.day) + step; d >= 0 && d < days.length; d += step) {
      const there = shown.filter(x => x.day === days[d]);
      if (there.length) return there.sort((a, c) => Math.abs(mid(a) - mid(cur)) - Math.abs(mid(c) - mid(cur)) || a.start - c.start)[0].id;
    }
    return cur.id;
  }

  // Move list[from] to insertion point `to` (0..length, counted in the
  // original list). Returns a new array.
  function moveItem(list, from, to) {
    const out = [...list];
    const [item] = out.splice(from, 1);
    out.splice(to > from ? to - 1 : to, 0, item);
    return out;
  }

  const Model = {
    ZONES, ZONE_IDS, DEFAULT_ZONE_SIZES, TOTAL_STEPS, STEPS_PER_LINE, DAY_NAMES, DAY_LONG, PALETTE,
    zonesFor, zoneLabel, moveBoundary, moveBoundaryPushing, duplicateSpot, zone, zoneStart, zoneAt, visibleRange, visibleZones, clampBlock, orderedDays,
    overlaps, layoutDay, firstFreeGap, canHide, sizeWord, newId,
    defaultState, normalizeState, blankWeek, copyWeek, weekSummary, carryWeek, archiveEntry, shortDate, DEFAULT_KEEP, focusForPrint, moveItem, nextRating, todayIndex, STARTER_TAGS,
    threadKey, nextFocus, effectivePos, navTarget, validCalId, fingerprint,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
  else root.Model = Model;
})(this);
