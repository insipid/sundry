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
  // 12 core steps, 4 each for early and evening: an optional zone opened on
  // its own takes a quarter of the day's height, both open take a fifth each.
  const DEFAULT_ZONE_SIZES = { early: 4, morning: 5, midday: 2, afternoon: 5, evening: 4 };
  const TOTAL_STEPS = ZONE_IDS.reduce((n, id) => n + DEFAULT_ZONE_SIZES[id], 0);
  const FULL_RANGE = { start: 0, end: TOTAL_STEPS };

  // Zone sizes (steps per zone) → [{ id, label, steps, start, end, optional }]
  function zonesFor(sizes) {
    let acc = 0;
    return ZONE_IDS.map(id => {
      const z = { id, label: id, steps: sizes[id], start: acc, end: acc + sizes[id], optional: !!OPTIONAL[id] };
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
  // zone: the first gap at or after the zone start, else anywhere in range,
  // else the zone start anyway (overlapping is allowed, just untidy).
  function firstFreeGap(blocks, day, size, zoneId, range, zones = ZONES) {
    const mine = blocks.filter(x => x.day === day);
    const home = clampBlock(zoneStart(zoneId, zones), size, range).start;
    const fits = s => !mine.some(x => overlaps({ start: s, size }, x));
    for (let s = home; s + size <= range.end; s++) if (fits(s)) return s;
    for (let s = range.start; s < home; s++) if (fits(s)) return s;
    return home;
  }

  function canHide(zoneId, blocks, zones = ZONES) {
    const z = zone(zoneId, zones);
    if (zoneId === 'early') return !blocks.some(x => x.start < z.end);
    return !blocks.some(x => x.start + x.size > z.start);
  }

  function sizeWord(size) {
    if (size <= 1) return 'a smidge';
    if (size === 2) return 'a bit';
    if (size === 3) return 'a good bit';
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

  function defaultState() {
    return {
      version: 2,
      settings: { weekStart: 0, visibleDays: [true, true, true, true, true, true, true] },
      view: { showEarly: false, showEvening: false },
      zones: { ...DEFAULT_ZONE_SIZES },
      blocks: [],
      regulars: [
        { id: 'r-gym', title: 'Gym', size: 3, color: 1, zone: 'morning' },
        { id: 'r-lunch', title: 'Lunch', size: 2, color: 4, zone: 'midday' },
        { id: 'r-deep', title: 'Deep work', size: 4, color: 0, zone: 'morning' },
      ],
      unplaced: [],
    };
  }

  // Validate/repair anything loaded from storage or an import file.
  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a schedule-ish plan');
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    const str = v => (typeof v === 'string' ? v : '');
    const color = v => (int(v, 0, PALETTE.length - 1) ? v : 0);
    const id = v => (typeof v === 'string' && v ? v : newId());

    const s = raw.settings || {};
    const vd = Array.isArray(s.visibleDays) && s.visibleDays.length === 7 ? s.visibleDays.map(Boolean) : Array(7).fill(true);
    const settings = { weekStart: int(s.weekStart, 0, 6) ? s.weekStart : 0, visibleDays: vd };

    let rawBlocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
      .filter(x => x && int(x.day, 0, 6) && Number.isFinite(x.start) && Number.isFinite(x.size));
    let rz = raw.zones || {};
    if (raw.version === 1) {
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
    const blocks = rawBlocks
      .map(x => ({ id: id(x.id), day: x.day, ...clampBlock(x.start, x.size, FULL_RANGE), title: str(x.title), color: color(x.color) }));

    const regulars = (Array.isArray(raw.regulars) ? raw.regulars : [])
      .filter(x => x && typeof x.title === 'string')
      .map(x => ({ id: id(x.id), title: x.title, size: clampBlock(0, x.size || 2, FULL_RANGE).size, color: color(x.color), zone: zone(x.zone) ? x.zone : 'morning' }));

    const unplaced = (Array.isArray(raw.unplaced) ? raw.unplaced : [])
      .filter(x => x && typeof x.title === 'string')
      .map(x => ({ id: id(x.id), title: x.title, size: clampBlock(0, x.size || 2, FULL_RANGE).size, color: color(x.color) }));

    const zonesOk = ZONE_IDS.every(k => int(rz[k], 1, TOTAL_STEPS)) && ZONE_IDS.reduce((n, k) => n + rz[k], 0) === TOTAL_STEPS;
    const zoneSizes = zonesOk ? Object.fromEntries(ZONE_IDS.map(k => [k, rz[k]])) : { ...DEFAULT_ZONE_SIZES };
    const layout = zonesFor(zoneSizes);

    const v = raw.view || {};
    const view = {
      showEarly: Boolean(v.showEarly) || !canHide('early', blocks, layout),
      showEvening: Boolean(v.showEvening) || !canHide('evening', blocks, layout),
    };
    return { version: 2, settings, view, zones: zoneSizes, blocks, regulars, unplaced };
  }

  const Model = {
    ZONES, ZONE_IDS, DEFAULT_ZONE_SIZES, TOTAL_STEPS, DAY_NAMES, DAY_LONG, PALETTE,
    zonesFor, moveBoundary, zone, zoneStart, zoneAt, visibleRange, visibleZones, clampBlock, orderedDays,
    overlaps, layoutDay, firstFreeGap, canHide, sizeWord, newId,
    defaultState, normalizeState,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
  else root.Model = Model;
})(this);
