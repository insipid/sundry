const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');

const b = (id, day, start, size) => ({ id, day, start, size, title: id, color: 0 });
const wk = s => s.weeks.find(w => w.id === s.currentWeek);

// Default day: early 0-4, morning 4-9, midday 9-11, afternoon 11-16, evening 16-20.

test('zones are contiguous and positions are absolute from the top of early', () => {
  assert.equal(M.zoneStart('early'), 0);
  assert.equal(M.zoneStart('morning'), 4);
  assert.equal(M.zoneStart('midday'), 9);
  assert.equal(M.zoneStart('afternoon'), 11);
  assert.equal(M.zoneStart('evening'), 16);
  assert.equal(M.TOTAL_STEPS, 20);
});

test('an optional zone takes a quarter alone, a fifth when both are open', () => {
  const share = (view, id) => {
    const r = M.visibleRange(view);
    return M.zone(id).steps / (r.end - r.start);
  };
  assert.equal(share({ showEarly: false, showEvening: true }, 'evening'), 0.25);
  assert.equal(share({ showEarly: true, showEvening: false }, 'early'), 0.25);
  assert.equal(share({ showEarly: true, showEvening: true }, 'evening'), 0.2);
  assert.equal(share({ showEarly: true, showEvening: true }, 'early'), 0.2);
});

test('visibleRange follows the optional zones', () => {
  assert.deepEqual(M.visibleRange({ showEarly: false, showEvening: false }), { start: 4, end: 16 });
  assert.deepEqual(M.visibleRange({ showEarly: true, showEvening: true }), { start: 0, end: 20 });
  assert.deepEqual(M.visibleRange({ showEarly: false, showEvening: true }), { start: 4, end: 20 });
});

test('visibleZones lists only the zones in range', () => {
  const ids = M.visibleZones({ showEarly: false, showEvening: true }).map(z => z.id);
  assert.deepEqual(ids, ['morning', 'midday', 'afternoon', 'evening']);
});

test('clampBlock keeps a block inside the range with size >= 1', () => {
  const r = { start: 3, end: 13 };
  assert.deepEqual(M.clampBlock(1, 2, r), { start: 3, size: 2 });
  assert.deepEqual(M.clampBlock(12, 3, r), { start: 10, size: 3 });
  assert.deepEqual(M.clampBlock(5, 0, r), { start: 5, size: 1 });
  assert.deepEqual(M.clampBlock(3, 20, r), { start: 3, size: 10 });
});

test('orderedDays rotates from the week start and drops hidden days', () => {
  assert.deepEqual(M.orderedDays(0, [true, true, true, true, true, true, true]), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(M.orderedDays(6, [true, true, true, true, true, true, true]), [6, 0, 1, 2, 3, 4, 5]);
  assert.deepEqual(M.orderedDays(0, [true, true, true, true, true, false, false]), [0, 1, 2, 3, 4]);
});

test('layoutDay puts non-overlapping blocks in a single column', () => {
  const L = M.layoutDay([b('a', 0, 3, 2), b('b', 0, 5, 2)]);
  assert.deepEqual(L.a, { col: 0, cols: 1 });
  assert.deepEqual(L.b, { col: 0, cols: 1 });
});

test('layoutDay splits overlapping blocks side by side, per cluster', () => {
  const L = M.layoutDay([b('a', 0, 3, 4), b('b', 0, 4, 2), b('c', 0, 6, 2), b('d', 0, 10, 1)]);
  assert.deepEqual(L.a, { col: 0, cols: 2 });
  assert.deepEqual(L.b, { col: 1, cols: 2 });
  assert.deepEqual(L.c, { col: 1, cols: 2 });
  assert.deepEqual(L.d, { col: 0, cols: 1 });
});

test('firstFreeGap finds the first gap in the home zone', () => {
  const range = { start: 4, end: 16 };
  assert.equal(M.firstFreeGap([], 0, 3, 'morning', range), 4);
  assert.equal(M.firstFreeGap([b('a', 0, 4, 2)], 0, 2, 'morning', range), 6);
  // other days don't count
  assert.equal(M.firstFreeGap([b('a', 1, 4, 2)], 0, 2, 'morning', range), 4);
});

test('firstFreeGap spills forward, then falls back to the zone start', () => {
  const range = { start: 4, end: 16 };
  assert.equal(M.firstFreeGap([b('a', 0, 4, 6)], 0, 2, 'morning', range), 10);
  assert.equal(M.firstFreeGap([b('a', 0, 4, 12)], 0, 2, 'morning', range), 4);
});

test('firstFreeGap uses the range edge for a hidden home zone', () => {
  assert.equal(M.firstFreeGap([], 0, 2, 'evening', { start: 4, end: 16 }), 14);
  assert.equal(M.firstFreeGap([], 0, 2, 'early', { start: 4, end: 16 }), 4);
});

test('canHide blocks hiding a zone that still has blocks in it', () => {
  assert.equal(M.canHide('evening', [b('a', 0, 14, 2)]), true);
  assert.equal(M.canHide('evening', [b('a', 0, 15, 2)]), false);
  assert.equal(M.canHide('early', [b('a', 0, 4, 2)]), true);
  assert.equal(M.canHide('early', [b('a', 0, 3, 2)]), false);
});

test('sizeWord gives rough words, not durations', () => {
  assert.equal(M.sizeWord(1), 'a smidge');
  assert.equal(M.sizeWord(2), 'a bit');
  assert.equal(M.sizeWord(3), 'a good bit');
  assert.equal(M.sizeWord(4), 'a big chunk');
  assert.equal(M.sizeWord(7), 'a big chunk');
});

test('defaultState is valid and seeds a couple of regulars', () => {
  const s = M.defaultState();
  assert.equal(s.version, 3);
  assert.equal(wk(s).blocks.length, 0);
  assert.ok(s.regulars.length >= 1);
  assert.deepEqual(M.normalizeState(JSON.parse(JSON.stringify(s))), s);
});

test('normalizeState repairs partial input and drops junk', () => {
  const s = M.normalizeState({
    blocks: [b('a', 2, 4, 2), { id: 'bad' }, b('c', 9, 4, 2), b('d', 0, 18, 5)],
    settings: { weekStart: 3 },
  });
  assert.equal(s.settings.weekStart, 3);
  assert.equal(s.settings.visibleDays.length, 7);
  assert.deepEqual(wk(s).blocks.map(x => x.id), ['a', 'd']);
  // d is clamped to the full day
  assert.deepEqual([wk(s).blocks[1].start, wk(s).blocks[1].size], [15, 5]);
  assert.deepEqual(s.regulars, []);
  assert.deepEqual(s.unplaced, []);
});

test('normalizeState turns on a hidden zone that has blocks in it', () => {
  const s = M.normalizeState({ blocks: [b('a', 0, 17, 2)], view: { showEvening: false } });
  assert.equal(wk(s).view.showEvening, true);
});

test('normalizeState rejects things that are not a plan', () => {
  assert.throws(() => M.normalizeState(null));
  assert.throws(() => M.normalizeState([1, 2]));
  assert.throws(() => M.normalizeState('hello'));
});

// ---- adjustable zone breaks ----

test('zonesFor lays zones out from per-zone step counts', () => {
  const z = M.zonesFor({ early: 2, morning: 7, midday: 2, afternoon: 5, evening: 4 });
  assert.deepEqual(z.map(x => [x.id, x.start, x.end]), [
    ['early', 0, 2], ['morning', 2, 9], ['midday', 9, 11], ['afternoon', 11, 16], ['evening', 16, 20],
  ]);
  assert.deepEqual(M.zonesFor(M.DEFAULT_ZONE_SIZES).map(x => x.start), M.ZONES.map(x => x.start));
});

test('moveBoundary moves the break between a zone and the one above it', () => {
  const s = M.DEFAULT_ZONE_SIZES;
  assert.deepEqual(M.moveBoundary(s, 'midday', 10), { ...s, morning: 6, midday: 1 });
  assert.deepEqual(M.moveBoundary(s, 'midday', 6), { ...s, morning: 2, midday: 5 });
  // afternoon's break moves between midday and afternoon only
  assert.deepEqual(M.moveBoundary(s, 'afternoon', 13), { ...s, midday: 4, afternoon: 3 });
});

test('moveBoundary keeps both neighbours at least one step', () => {
  const s = M.DEFAULT_ZONE_SIZES;
  assert.deepEqual(M.moveBoundary(s, 'midday', 50), { ...s, morning: 6, midday: 1 });
  assert.deepEqual(M.moveBoundary(s, 'midday', -5), { ...s, morning: 1, midday: 6 });
});

test('moveBoundary leaves the first zone alone (nothing above it)', () => {
  assert.deepEqual(M.moveBoundary(M.DEFAULT_ZONE_SIZES, 'early', 2), M.DEFAULT_ZONE_SIZES);
});

test('zone-aware helpers follow custom zones', () => {
  const zones = M.zonesFor({ early: 2, morning: 6, midday: 2, afternoon: 4, evening: 6 });
  assert.deepEqual(M.visibleRange({ showEarly: false, showEvening: false }, zones), { start: 2, end: 14 });
  assert.equal(M.firstFreeGap([], 0, 2, 'afternoon', { start: 2, end: 14 }, zones), 10);
  assert.equal(M.canHide('evening', [b('a', 0, 13, 1)], zones), true);
  assert.equal(M.canHide('evening', [b('a', 0, 14, 1)], zones), false);
  assert.equal(M.zoneAt(9, zones), 'midday');
});

test('normalizeState keeps valid zone sizes and resets broken ones', () => {
  const custom = { early: 3, morning: 6, midday: 2, afternoon: 5, evening: 4 };
  assert.deepEqual(wk(M.normalizeState({ zones: custom })).zones, custom);
  assert.deepEqual(wk(M.normalizeState({})).zones, M.DEFAULT_ZONE_SIZES);
  assert.deepEqual(wk(M.normalizeState({ zones: { ...custom, morning: 0, midday: 8 } })).zones, M.DEFAULT_ZONE_SIZES);
  assert.deepEqual(wk(M.normalizeState({ zones: { ...custom, morning: 9 } })).zones, M.DEFAULT_ZONE_SIZES); // wrong total
});

// ---- migrating plans saved on the old 17-step day (version 1) ----

test('v1 plans move onto the 20-step day, keeping each block in its zone', () => {
  // old default: early 0-3, morning 3-7, midday 7-9, afternoon 9-13, evening 13-17
  const s = M.normalizeState({
    version: 1,
    zones: { early: 3, morning: 4, midday: 2, afternoon: 4, evening: 4 },
    blocks: [b('am', 0, 3, 4), b('lunch', 0, 7, 2), b('pm', 0, 9, 2), b('eve', 0, 13, 2), b('dawn', 0, 0, 3)],
  });
  assert.equal(s.version, 3);
  assert.deepEqual(wk(s).zones, M.DEFAULT_ZONE_SIZES);
  const at = id => { const x = wk(s).blocks.find(y => y.id === id); return [x.start, x.size]; };
  assert.deepEqual(at('am'), [4, 5]);    // the whole morning
  assert.deepEqual(at('lunch'), [9, 2]); // the whole midday
  assert.deepEqual(at('pm'), [11, 3]);   // first half of the afternoon (2 of 4 → 2.5 of 5, rounded)
  assert.deepEqual(at('eve'), [16, 2]);
  assert.deepEqual(at('dawn'), [0, 4]);  // the whole early zone
  for (const id of ['am', 'lunch', 'pm', 'eve', 'dawn']) {
    const x = wk(s).blocks.find(y => y.id === id);
    const old = { am: 'morning', lunch: 'midday', pm: 'afternoon', eve: 'evening', dawn: 'early' }[id];
    assert.equal(M.zoneAt(x.start), old);
  }
});

test('v1 plans with moved breaks or no zones use their own old layout', () => {
  const moved = M.normalizeState({
    version: 1,
    zones: { early: 3, morning: 5, midday: 1, afternoon: 4, evening: 4 }, // midday 8-9
    blocks: [b('lunch', 0, 8, 1)],
  });
  assert.deepEqual([wk(moved).blocks[0].start, wk(moved).blocks[0].size], [9, 2]);
  const bare = M.normalizeState({ version: 1, blocks: [b('am', 0, 3, 4)] });
  assert.deepEqual([wk(bare).blocks[0].start, wk(bare).blocks[0].size], [4, 5]);
});

// ---- moving a break pushes, then compresses, the blocks in the shrinking zone ----

const pos = (blocks, id) => { const x = blocks.find(y => y.id === id); return [x.start, x.size]; };

test('moving a break down pushes the zone below, cascading', () => {
  // afternoon 11-16; move its top break to 12
  const r = M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, [b('a', 0, 11, 1), b('c', 0, 12, 1), b('far', 0, 14, 1)], 'afternoon', 12);
  assert.deepEqual(r.zones, { ...M.DEFAULT_ZONE_SIZES, midday: 3, afternoon: 4 });
  assert.deepEqual(pos(r.blocks, 'a'), [12, 1]);
  assert.deepEqual(pos(r.blocks, 'c'), [13, 1]);   // pushed by a
  assert.deepEqual(pos(r.blocks, 'far'), [14, 1]); // gap absorbed the push
});

test('when there is no more room, pushed blocks compress (biggest first)', () => {
  const r = M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, [b('a', 0, 11, 2), b('b', 0, 13, 2)], 'afternoon', 13);
  // afternoon is now 13-16: 3 steps for 4 steps of blocks
  assert.deepEqual(pos(r.blocks, 'a'), [13, 1]);
  assert.deepEqual(pos(r.blocks, 'b'), [14, 2]);
});

test('moving a break up pushes the zone above upward, then compresses', () => {
  // morning 4-9; move midday's top break up to 7
  const r = M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, [b('m1', 0, 4, 2), b('m2', 0, 6, 3)], 'midday', 7);
  assert.deepEqual(r.zones, { ...M.DEFAULT_ZONE_SIZES, morning: 3, midday: 4 });
  assert.deepEqual(pos(r.blocks, 'm1'), [4, 1]);
  assert.deepEqual(pos(r.blocks, 'm2'), [5, 2]);
});

test('moving a break up only pushes what it reaches', () => {
  const r = M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, [b('m1', 0, 4, 1), b('m2', 0, 7, 2)], 'midday', 8);
  assert.deepEqual(pos(r.blocks, 'm2'), [6, 2]);
  assert.deepEqual(pos(r.blocks, 'm1'), [4, 1]);
});

test('pushing leaves other zones, other days, and blocks straddling the break alone', () => {
  const blocks = [b('straddle', 0, 7, 3), b('pm', 0, 12, 2), b('other', 1, 4, 5), b('am', 0, 4, 2)];
  const r = M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, blocks, 'midday', 8);
  assert.deepEqual(pos(r.blocks, 'straddle'), [7, 3]);
  assert.deepEqual(pos(r.blocks, 'pm'), [12, 2]);
  assert.deepEqual(pos(r.blocks, 'am'), [4, 2]);
  assert.deepEqual(pos(r.blocks, 'other'), [4, 4]); // day 1's own morning block is compressed to fit
});

test('moveBoundaryPushing never mutates its input', () => {
  const blocks = [b('a', 0, 11, 2)];
  M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, blocks, 'afternoon', 13);
  assert.deepEqual(pos(blocks, 'a'), [11, 2]);
});

// ---- where a duplicate lands ----

test('a duplicate goes straight after the original when there is room', () => {
  const orig = b('x', 0, 4, 2);
  assert.deepEqual(M.duplicateSpot([orig], orig, [0, 1, 2], { start: 4, end: 16 }), { day: 0, start: 6 });
});

test('otherwise the same spot on the next visible day', () => {
  const orig = b('x', 0, 4, 2);
  assert.deepEqual(M.duplicateSpot([orig, b('y', 0, 6, 1)], orig, [0, 1, 2], { start: 4, end: 16 }), { day: 1, start: 4 });
  const late = b('z', 0, 14, 2); // nothing after it before the end of the day
  assert.deepEqual(M.duplicateSpot([late], late, [0, 3], { start: 4, end: 16 }), { day: 3, start: 14 });
});

test('otherwise the first free gap on the same day', () => {
  const orig = b('x', 0, 4, 2);
  const blocks = [orig, b('y', 0, 6, 2), b('z', 1, 4, 2)];
  assert.deepEqual(M.duplicateSpot(blocks, orig, [0, 1], { start: 4, end: 16 }), { day: 0, start: 8 });
  const last = b('w', 2, 4, 2);
  assert.deepEqual(M.duplicateSpot([last, b('v', 2, 6, 1)], last, [0, 1, 2], { start: 4, end: 16 }), { day: 2, start: 7 });
});

// ---- sidebar settings ----

test('sidebar side and visibility are settings with safe defaults', () => {
  assert.deepEqual(M.defaultState().settings.sidebar, 'left');
  assert.equal(M.defaultState().settings.sidebarHidden, false);
  const s = M.normalizeState({ settings: { sidebar: 'right', sidebarHidden: true } }).settings;
  assert.equal(s.sidebar, 'right');
  assert.equal(s.sidebarHidden, true);
  assert.equal(M.normalizeState({ settings: { sidebar: 'up' } }).settings.sidebar, 'left');
});

// ---- weeks (v3): several named, live weeks ----

test('a v2 plan becomes a single week called "My week"', () => {
  const s = M.normalizeState({
    version: 2, view: { showEarly: true, showEvening: false },
    zones: { early: 3, morning: 6, midday: 2, afternoon: 5, evening: 4 },
    blocks: [b('a', 1, 5, 2)], regulars: [], unplaced: [],
  });
  assert.equal(s.version, 3);
  assert.equal(s.weeks.length, 1);
  assert.equal(wk(s).name, 'My week');
  assert.deepEqual(wk(s).view, { showEarly: true, showEvening: false });
  assert.equal(wk(s).zones.morning, 6);
  assert.deepEqual(wk(s).blocks.map(x => x.id), ['a']);
  assert.equal(s.blocks, undefined);
});

test('v3 weeks are each normalised, and currentWeek falls back to the first', () => {
  const s = M.normalizeState({
    version: 3,
    weeks: [
      { id: 'w1', name: 'Normal', blocks: [b('a', 0, 5, 2)] },
      { id: 'w2', name: '', blocks: [b('b', 9, 5, 2)], view: { showEvening: false }, zones: { nope: 1 } },
      'junk',
    ],
    currentWeek: 'missing',
  });
  assert.deepEqual(s.weeks.map(w => w.id), ['w1', 'w2']);
  assert.equal(s.currentWeek, 'w1');
  assert.equal(s.weeks[1].name, 'Untitled week');
  assert.deepEqual(s.weeks[1].blocks, []);
  assert.deepEqual(s.weeks[1].zones, M.DEFAULT_ZONE_SIZES);
  assert.equal(M.normalizeState({ version: 3, weeks: [], currentWeek: 'x' }).weeks.length, 1);
});

test('blankWeek and copyWeek make fresh weeks; copies are deep, with new ids', () => {
  const blank = M.blankWeek('Holiday');
  assert.equal(blank.name, 'Holiday');
  assert.deepEqual(blank.blocks, []);
  assert.deepEqual(blank.zones, M.DEFAULT_ZONE_SIZES);
  const src = { ...M.blankWeek('Normal'), blocks: [{ ...b('a', 0, 5, 2), notes: [{ text: 'legs', check: false }] }] };
  const copy = M.copyWeek(src, 'Normal copy');
  assert.equal(copy.name, 'Normal copy');
  assert.notEqual(copy.id, src.id);
  assert.notEqual(copy.blocks[0].id, 'a');
  assert.deepEqual(copy.blocks[0].notes, [{ text: 'legs', check: false }]);
  copy.blocks[0].notes[0].check = true;
  assert.equal(src.blocks[0].notes[0].check, false);
});

// ---- notes ----

test('notes are normalised on blocks, regulars and unplaced items', () => {
  const s = M.normalizeState({
    blocks: [{ ...b('a', 0, 5, 2), notes: [{ text: 'one' }, { text: 'two', check: true }, { text: 3 }, 'x'] }, b('bare', 0, 8, 1)],
    regulars: [{ title: 'Gym', notes: [{ text: 'stretch', check: false }] }],
    unplaced: [{ title: 'Tidy', notes: 'nope' }],
  });
  assert.deepEqual(wk(s).blocks[0].notes, [{ text: 'one', check: null }, { text: 'two', check: true }]);
  assert.deepEqual(wk(s).blocks[1].notes, []);
  assert.deepEqual(s.regulars[0].notes, [{ text: 'stretch', check: false }]);
  assert.deepEqual(s.unplaced[0].notes, []);
});

test('nextCheck cycles a note: bullet → to-do → done → bullet', () => {
  assert.equal(M.nextCheck(null), false);
  assert.equal(M.nextCheck(false), true);
  assert.equal(M.nextCheck(true), null);
});

test('notesForPrint lists noted blocks by visible day order, then top to bottom', () => {
  const n = t => [{ text: t, check: null }];
  const week = { blocks: [
    { ...b('late', 0, 12, 1), title: 'Late', notes: n('x') },
    { ...b('early', 0, 5, 1), title: 'Early', notes: n('y') },
    { ...b('sun', 6, 5, 1), title: 'Sun thing', notes: n('z') },
    { ...b('none', 0, 7, 1), title: 'No notes', notes: [] },
    { ...b('hidden', 3, 5, 1), title: 'Hidden day', notes: n('w') },
  ] };
  const out = M.notesForPrint(week, [6, 0, 1]);
  assert.deepEqual(out.map(x => [x.day, x.title]), [[6, 'Sun thing'], [0, 'Early'], [0, 'Late']]);
  assert.deepEqual(out[0].notes, n('z'));
});
