// schedule-ish model: pure logic, no DOM. The browser loads it as a classic
// script (window.Model); tests load it with require().
(function (root) {
  'use strict';

  // A day is a run of "steps" (the snap unit), grouped into zones. Block
  // positions are absolute steps from the top of `early`, so showing or
  // hiding the optional zones never moves anything.
  const ZONES = [
    { id: 'early', label: 'early', steps: 3, optional: true },
    { id: 'morning', label: 'morning', steps: 4 },
    { id: 'midday', label: 'midday', steps: 2 },
    { id: 'afternoon', label: 'afternoon', steps: 4 },
    { id: 'evening', label: 'evening', steps: 4, optional: true },
  ];
  let acc = 0;
  for (const z of ZONES) { z.start = acc; acc += z.steps; z.end = acc; }
  const TOTAL_STEPS = acc;
  const FULL_RANGE = { start: 0, end: TOTAL_STEPS };

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

  const zone = id => ZONES.find(z => z.id === id);
  const zoneStart = id => zone(id).start;

  function visibleRange(view) {
    return {
      start: view.showEarly ? 0 : zoneStart('morning'),
      end: view.showEvening ? TOTAL_STEPS : zoneStart('evening'),
    };
  }

  function visibleZones(view) {
    const r = visibleRange(view);
    return ZONES.filter(z => z.start >= r.start && z.end <= r.end);
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
  function firstFreeGap(blocks, day, size, zoneId, range) {
    const mine = blocks.filter(x => x.day === day);
    const home = clampBlock(zoneStart(zoneId), size, range).start;
    const fits = s => !mine.some(x => overlaps({ start: s, size }, x));
    for (let s = home; s + size <= range.end; s++) if (fits(s)) return s;
    for (let s = range.start; s < home; s++) if (fits(s)) return s;
    return home;
  }

  function canHide(zoneId, blocks) {
    const z = zone(zoneId);
    if (zoneId === 'early') return !blocks.some(x => x.start < z.end);
    return !blocks.some(x => x.start + x.size > z.start);
  }

  function sizeWord(size) {
    if (size <= 1) return 'a smidge';
    if (size === 2) return 'a bit';
    if (size === 3) return 'a good bit';
    return 'a big chunk';
  }

  let idCounter = 0;
  const newId = () => Date.now().toString(36) + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 6);

  function defaultState() {
    return {
      version: 1,
      settings: { weekStart: 0, visibleDays: [true, true, true, true, true, true, true] },
      view: { showEarly: false, showEvening: false },
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

    const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
      .filter(x => x && int(x.day, 0, 6) && Number.isFinite(x.start) && Number.isFinite(x.size))
      .map(x => ({ id: id(x.id), day: x.day, ...clampBlock(x.start, x.size, FULL_RANGE), title: str(x.title), color: color(x.color) }));

    const regulars = (Array.isArray(raw.regulars) ? raw.regulars : [])
      .filter(x => x && typeof x.title === 'string')
      .map(x => ({ id: id(x.id), title: x.title, size: clampBlock(0, x.size || 2, FULL_RANGE).size, color: color(x.color), zone: zone(x.zone) ? x.zone : 'morning' }));

    const unplaced = (Array.isArray(raw.unplaced) ? raw.unplaced : [])
      .filter(x => x && typeof x.title === 'string')
      .map(x => ({ id: id(x.id), title: x.title, size: clampBlock(0, x.size || 2, FULL_RANGE).size, color: color(x.color) }));

    const v = raw.view || {};
    const view = {
      showEarly: Boolean(v.showEarly) || !canHide('early', blocks),
      showEvening: Boolean(v.showEvening) || !canHide('evening', blocks),
    };
    return { version: 1, settings, view, blocks, regulars, unplaced };
  }

  const Model = {
    ZONES, TOTAL_STEPS, DAY_NAMES, DAY_LONG, PALETTE,
    zone, zoneStart, visibleRange, visibleZones, clampBlock, orderedDays,
    overlaps, layoutDay, firstFreeGap, canHide, sizeWord, newId,
    defaultState, normalizeState,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
  else root.Model = Model;
})(this);
