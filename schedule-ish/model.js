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
  // (counterproductive); null = unrated. Tapping only walks the ticks.
  const RATINGS = [1, 2, 3, 'skip', 'bad'];
  const nextRating = r => (r === 1 ? 2 : r === 2 ? 3 : r === 3 ? null : 1);
  const STARTER_TAGS = ['flow', 'energised', 'interrupted', 'distracted', 'too long', 'too short', 'wrong time', 'should repeat'];
  const normTags = v => [...new Set((Array.isArray(v) ? v : [])
    .filter(t => typeof t === 'string').map(t => t.trim().toLowerCase()).filter(Boolean))];
  const blankDayNotes = () => Array(7).fill('');
  // Monday = 0, like the board's days.
  const todayIndex = (date = new Date()) => (date.getDay() + 6) % 7;

  function blankWeek(name = 'New week') {
    return { id: newId(), name, view: defaultView(), zones: { ...DEFAULT_ZONE_SIZES }, blocks: [], dayNotes: blankDayNotes(), focus: {} };
  }

  // A deep copy with fresh ids. Open focus lines carry over; done lines,
  // session notes, ratings, tags, block reviews and day notes start fresh.
  function copyWeek(week, name) {
    const copy = JSON.parse(JSON.stringify(week));
    copy.id = newId();
    copy.name = name;
    copy.dayNotes = blankDayNotes();
    copy.focus = Object.fromEntries(Object.entries(copy.focus || {}).map(([k, items]) => [k, items.filter(x => !x.done)]));
    for (const x of copy.blocks) { x.id = newId(); x.rating = null; x.tags = []; x.session = ''; x.review = ''; }
    return copy;
  }

  function defaultState() {
    const week = { ...blankWeek('My week'), id: 'w-first' };
    return {
      version: 5,
      settings: { weekStart: 0, visibleDays: [true, true, true, true, true, true, true], sidebar: 'left', sidebarHidden: false, mode: 'plan', showNext: true },
      weeks: [week],
      currentWeek: week.id,
      regulars: [
        { id: 'r-gym', title: 'Gym', size: 6, color: 1, zone: 'morning', notes: [] },
        { id: 'r-lunch', title: 'Lunch', size: 4, color: 4, zone: 'midday', notes: [] },
        { id: 'r-deep', title: 'Deep work', size: 8, color: 0, zone: 'morning', notes: [] },
      ],
      unplaced: [],
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

  // One week's board: view, zone sizes and blocks. `v1` maps a version-1
  // (17-step) plan onto the current day; `scale` multiplies everything for
  // v2/v3 plans, which used a 20-step day (half today's resolution).
  function normalizeWeek(raw, v1 = false, scale = 1) {
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
    const blocks = rawBlocks.map(x => ({
      id: idOr(x.id), day: x.day, ...clampBlock(x.start, x.size, FULL_RANGE),
      title: str(x.title), color: color(x.color), session: str(x.session),
      rating: RATINGS.includes(x.rating) ? x.rating : null, tags: normTags(x.tags), review: str(x.review),
    }));

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

    const v = raw.view || {};
    const view = {
      showEarly: Boolean(v.showEarly) || !canHide('early', blocks, layout),
      showEvening: Boolean(v.showEvening) || !canHide('evening', blocks, layout),
    };
    const dayNotes = blankDayNotes().map((_, i) => str(Array.isArray(raw.dayNotes) ? raw.dayNotes[i] : ''));
    return { id: idOr(raw.id), name: str(raw.name).trim() || 'Untitled week', view, zones, blocks, dayNotes, focus };
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
    };

    // Plans before v4 counted half as many steps; their sizes all double.
    const scale = raw.version >= 1 && raw.version <= 3 ? 2 : 1;
    let weeks;
    if (Array.isArray(raw.weeks)) {
      weeks = raw.weeks.filter(w => w && typeof w === 'object' && !Array.isArray(w)).map(w => normalizeWeek(w, false, scale));
    } else {
      weeks = [normalizeWeek({ name: 'My week', view: raw.view, zones: raw.zones, blocks: raw.blocks, focus: raw.focus }, raw.version === 1, scale)];
    }
    if (!weeks.length) weeks = [blankWeek('My week')];
    const currentWeek = weeks.some(w => w.id === raw.currentWeek) ? raw.currentWeek : weeks[0].id;

    const regulars = (Array.isArray(raw.regulars) ? raw.regulars : [])
      .filter(x => x && typeof x.title === 'string')
      .map(x => ({ id: idOr(x.id), title: x.title, size: clampBlock(0, (x.size ? x.size * scale : 2 * STEPS_PER_LINE), FULL_RANGE).size, color: color(x.color),
        zone: ZONE_IDS.includes(x.zone) ? x.zone : null,
        notes: normFocus(x.notes).map(n => ({ text: n.text, done: false })) })); // lines to seed a week's focus

    const unplaced = (Array.isArray(raw.unplaced) ? raw.unplaced : [])
      .filter(x => x && typeof x.title === 'string')
      .map(x => ({ id: idOr(x.id), title: x.title, size: clampBlock(0, (x.size ? x.size * scale : 2 * STEPS_PER_LINE), FULL_RANGE).size, color: color(x.color),
        // older unplaced items carried note lines: keep them as one session line
        session: str(x.session) || normFocus(x.notes).map(n => n.text.trim()).join('; ') }));

    const tags = Array.isArray(raw.tags) ? normTags(raw.tags) : [...STARTER_TAGS];
    const timeHolders = normTags(raw.timeHolders);
    return { version: 5, settings, weeks, currentWeek, regulars, unplaced, tags, timeHolders };
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
    defaultState, normalizeState, blankWeek, copyWeek, focusForPrint, moveItem, nextRating, todayIndex, STARTER_TAGS,
    threadKey, nextFocus,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
  else root.Model = Model;
})(this);
