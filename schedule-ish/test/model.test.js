const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');

const b = (id, day, start, size) => ({ id, day, start, size, title: id, color: 0 });
const wk = s => s.weeks.find(w => w.id === s.currentWeek);

// Default day (40 steps): early 0-8, morning 8-18, midday 18-22, afternoon 22-32, evening 32-40.

test('zones are contiguous and positions are absolute from the top of early', () => {
  assert.equal(M.zoneStart('early'), 0);
  assert.equal(M.zoneStart('morning'), 8);
  assert.equal(M.zoneStart('midday'), 18);
  assert.equal(M.zoneStart('afternoon'), 22);
  assert.equal(M.zoneStart('evening'), 32);
  assert.equal(M.TOTAL_STEPS, 40);
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
  assert.deepEqual(M.visibleRange({ showEarly: false, showEvening: false }), { start: 8, end: 32 });
  assert.deepEqual(M.visibleRange({ showEarly: true, showEvening: true }), { start: 0, end: 40 });
  assert.deepEqual(M.visibleRange({ showEarly: false, showEvening: true }), { start: 8, end: 40 });
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
  const range = { start: 8, end: 32 };
  assert.equal(M.firstFreeGap([], 0, 3, 'morning', range), 8);
  assert.equal(M.firstFreeGap([b('a', 0, 8, 2)], 0, 2, 'morning', range), 10);
  // other days don't count
  assert.equal(M.firstFreeGap([b('a', 1, 8, 2)], 0, 2, 'morning', range), 8);
});

test('firstFreeGap spills forward, then falls back to the zone start', () => {
  const range = { start: 8, end: 32 };
  assert.equal(M.firstFreeGap([b('a', 0, 8, 12)], 0, 2, 'morning', range), 20);
  assert.equal(M.firstFreeGap([b('a', 0, 8, 24)], 0, 2, 'morning', range), 8);
});

test('firstFreeGap uses the range edge for a hidden home zone', () => {
  assert.equal(M.firstFreeGap([], 0, 2, 'evening', { start: 8, end: 32 }), 30);
  assert.equal(M.firstFreeGap([], 0, 2, 'early', { start: 8, end: 32 }), 8);
});

test('canHide blocks hiding a zone that still has blocks in it', () => {
  assert.equal(M.canHide('evening', [b('a', 0, 30, 2)]), true);
  assert.equal(M.canHide('evening', [b('a', 0, 31, 2)]), false);
  assert.equal(M.canHide('early', [b('a', 0, 8, 2)]), true);
  assert.equal(M.canHide('early', [b('a', 0, 7, 2)]), false);
});

test('sizeWord gives rough words, not durations (two steps to a word-step)', () => {
  assert.equal(M.sizeWord(1), 'a smidge');
  assert.equal(M.sizeWord(2), 'a smidge');
  assert.equal(M.sizeWord(3), 'a bit');
  assert.equal(M.sizeWord(4), 'a bit');
  assert.equal(M.sizeWord(6), 'a good bit');
  assert.equal(M.sizeWord(7), 'a big chunk');
  assert.equal(M.sizeWord(14), 'a big chunk');
});

test('defaultState is valid and seeds a couple of regulars', () => {
  const s = M.defaultState();
  assert.equal(s.version, 4);
  assert.equal(wk(s).blocks.length, 0);
  assert.ok(s.regulars.length >= 1);
  assert.deepEqual(M.normalizeState(JSON.parse(JSON.stringify(s))), s);
});

test('normalizeState repairs partial input and drops junk', () => {
  const s = M.normalizeState({
    blocks: [b('a', 2, 4, 2), { id: 'bad' }, b('c', 9, 4, 2), b('d', 0, 38, 5)],
    settings: { weekStart: 3 },
  });
  assert.equal(s.settings.weekStart, 3);
  assert.equal(s.settings.visibleDays.length, 7);
  assert.deepEqual(wk(s).blocks.map(x => x.id), ['a', 'd']);
  // d is clamped to the full day
  assert.deepEqual([wk(s).blocks[1].start, wk(s).blocks[1].size], [35, 5]);
  assert.deepEqual(s.regulars, []);
  assert.deepEqual(s.unplaced, []);
});

test('normalizeState turns on a hidden zone that has blocks in it', () => {
  const s = M.normalizeState({ blocks: [b('a', 0, 34, 2)], view: { showEvening: false } });
  assert.equal(wk(s).view.showEvening, true);
});

test('normalizeState rejects things that are not a plan', () => {
  assert.throws(() => M.normalizeState(null));
  assert.throws(() => M.normalizeState([1, 2]));
  assert.throws(() => M.normalizeState('hello'));
});

// ---- adjustable zone breaks ----

test('zonesFor lays zones out from per-zone step counts', () => {
  const z = M.zonesFor({ early: 4, morning: 14, midday: 4, afternoon: 10, evening: 8 });
  assert.deepEqual(z.map(x => [x.id, x.start, x.end]), [
    ['early', 0, 4], ['morning', 4, 18], ['midday', 18, 22], ['afternoon', 22, 32], ['evening', 32, 40],
  ]);
  assert.deepEqual(M.zonesFor(M.DEFAULT_ZONE_SIZES).map(x => x.start), M.ZONES.map(x => x.start));
});

test('moveBoundary moves the break between a zone and the one above it', () => {
  const s = M.DEFAULT_ZONE_SIZES;
  assert.deepEqual(M.moveBoundary(s, 'midday', 20), { ...s, morning: 12, midday: 2 });
  assert.deepEqual(M.moveBoundary(s, 'midday', 12), { ...s, morning: 4, midday: 10 });
  // afternoon's break moves between midday and afternoon only
  assert.deepEqual(M.moveBoundary(s, 'afternoon', 26), { ...s, midday: 8, afternoon: 6 });
});

test('moveBoundary keeps both neighbours at least one step', () => {
  const s = M.DEFAULT_ZONE_SIZES;
  assert.deepEqual(M.moveBoundary(s, 'midday', 100), { ...s, morning: 13, midday: 1 });
  assert.deepEqual(M.moveBoundary(s, 'midday', -5), { ...s, morning: 1, midday: 13 });
});

test('moveBoundary leaves the first zone alone (nothing above it)', () => {
  assert.deepEqual(M.moveBoundary(M.DEFAULT_ZONE_SIZES, 'early', 2), M.DEFAULT_ZONE_SIZES);
});

test('zone-aware helpers follow custom zones', () => {
  const zones = M.zonesFor({ early: 4, morning: 12, midday: 4, afternoon: 8, evening: 12 });
  assert.deepEqual(M.visibleRange({ showEarly: false, showEvening: false }, zones), { start: 4, end: 28 });
  assert.equal(M.firstFreeGap([], 0, 2, 'afternoon', { start: 4, end: 28 }, zones), 20);
  assert.equal(M.canHide('evening', [b('a', 0, 27, 1)], zones), true);
  assert.equal(M.canHide('evening', [b('a', 0, 28, 1)], zones), false);
  assert.equal(M.zoneAt(17, zones), 'midday');
});

test('normalizeState keeps valid zone sizes and resets broken ones', () => {
  const custom = { early: 6, morning: 12, midday: 4, afternoon: 10, evening: 8 };
  assert.deepEqual(wk(M.normalizeState({ zones: custom })).zones, custom);
  assert.deepEqual(wk(M.normalizeState({})).zones, M.DEFAULT_ZONE_SIZES);
  assert.deepEqual(wk(M.normalizeState({ zones: { ...custom, morning: 0, midday: 16 } })).zones, M.DEFAULT_ZONE_SIZES);
  assert.deepEqual(wk(M.normalizeState({ zones: { ...custom, morning: 18 } })).zones, M.DEFAULT_ZONE_SIZES); // wrong total
});

// ---- migrating plans saved on the old 17-step day (version 1) ----

test('v1 plans move onto the 40-step day, keeping each block in its zone', () => {
  // old default: early 0-3, morning 3-7, midday 7-9, afternoon 9-13, evening 13-17
  const s = M.normalizeState({
    version: 1,
    zones: { early: 3, morning: 4, midday: 2, afternoon: 4, evening: 4 },
    blocks: [b('am', 0, 3, 4), b('lunch', 0, 7, 2), b('pm', 0, 9, 2), b('eve', 0, 13, 2), b('dawn', 0, 0, 3)],
  });
  assert.equal(s.version, 4);
  assert.deepEqual(wk(s).zones, M.DEFAULT_ZONE_SIZES);
  const at = id => { const x = wk(s).blocks.find(y => y.id === id); return [x.start, x.size]; };
  assert.deepEqual(at('am'), [8, 10]);   // the whole morning
  assert.deepEqual(at('lunch'), [18, 4]); // the whole midday
  assert.deepEqual(at('pm'), [22, 5]);   // first half of the afternoon
  assert.deepEqual(at('eve'), [32, 4]);
  assert.deepEqual(at('dawn'), [0, 8]);  // the whole early zone
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
  assert.deepEqual([wk(moved).blocks[0].start, wk(moved).blocks[0].size], [18, 4]);
  const bare = M.normalizeState({ version: 1, blocks: [b('am', 0, 3, 4)] });
  assert.deepEqual([wk(bare).blocks[0].start, wk(bare).blocks[0].size], [8, 10]);
});

// ---- moving a break pushes, then compresses, the blocks in the shrinking zone ----

const pos = (blocks, id) => { const x = blocks.find(y => y.id === id); return [x.start, x.size]; };

test('moving a break down pushes the zone below, cascading', () => {
  // afternoon 22-32; move its top break to 24
  const r = M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, [b('a', 0, 22, 2), b('c', 0, 24, 2), b('far', 0, 28, 2)], 'afternoon', 24);
  assert.deepEqual(r.zones, { ...M.DEFAULT_ZONE_SIZES, midday: 6, afternoon: 8 });
  assert.deepEqual(pos(r.blocks, 'a'), [24, 2]);
  assert.deepEqual(pos(r.blocks, 'c'), [26, 2]);   // pushed by a
  assert.deepEqual(pos(r.blocks, 'far'), [28, 2]); // gap absorbed the push
});

test('when there is no more room, pushed blocks compress (biggest first)', () => {
  const r = M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, [b('a', 0, 22, 4), b('b', 0, 26, 4)], 'afternoon', 26);
  // afternoon is now 26-32: 6 steps for 8 steps of blocks
  assert.deepEqual(pos(r.blocks, 'a'), [26, 3]);
  assert.deepEqual(pos(r.blocks, 'b'), [29, 3]);
});

test('moving a break up pushes the zone above upward, then compresses', () => {
  // morning 8-18; move midday's top break up to 14
  const r = M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, [b('m1', 0, 8, 4), b('m2', 0, 12, 6)], 'midday', 14);
  assert.deepEqual(r.zones, { ...M.DEFAULT_ZONE_SIZES, morning: 6, midday: 8 });
  assert.deepEqual(pos(r.blocks, 'm1'), [8, 3]);
  assert.deepEqual(pos(r.blocks, 'm2'), [11, 3]);
});

test('moving a break up only pushes what it reaches', () => {
  const r = M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, [b('m1', 0, 8, 2), b('m2', 0, 14, 4)], 'midday', 16);
  assert.deepEqual(pos(r.blocks, 'm2'), [12, 4]);
  assert.deepEqual(pos(r.blocks, 'm1'), [8, 2]);
});

test('pushing leaves other zones, other days, and blocks straddling the break alone', () => {
  const blocks = [b('straddle', 0, 14, 6), b('pm', 0, 24, 4), b('other', 1, 8, 10), b('am', 0, 8, 4)];
  const r = M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, blocks, 'midday', 16);
  assert.deepEqual(pos(r.blocks, 'straddle'), [14, 6]);
  assert.deepEqual(pos(r.blocks, 'pm'), [24, 4]);
  assert.deepEqual(pos(r.blocks, 'am'), [8, 4]);
  assert.deepEqual(pos(r.blocks, 'other'), [8, 8]); // day 1's own morning block is compressed to fit
});

test('moveBoundaryPushing never mutates its input', () => {
  const blocks = [b('a', 0, 22, 4)];
  M.moveBoundaryPushing(M.DEFAULT_ZONE_SIZES, blocks, 'afternoon', 26);
  assert.deepEqual(pos(blocks, 'a'), [22, 4]);
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

test('a v2 plan becomes a single week called "My week", at double resolution', () => {
  const s = M.normalizeState({
    version: 2, view: { showEarly: true, showEvening: false },
    zones: { early: 3, morning: 6, midday: 2, afternoon: 5, evening: 4 },
    blocks: [b('a', 1, 5, 2)], regulars: [{ title: 'Gym', size: 3 }], unplaced: [],
  });
  assert.equal(s.version, 4);
  assert.equal(s.weeks.length, 1);
  assert.equal(wk(s).name, 'My week');
  assert.deepEqual(wk(s).view, { showEarly: true, showEvening: false });
  assert.deepEqual(wk(s).zones, { early: 6, morning: 12, midday: 4, afternoon: 10, evening: 8 });
  assert.deepEqual(wk(s).blocks.map(x => [x.id, x.start, x.size]), [['a', 10, 4]]);
  assert.equal(s.regulars[0].size, 6);
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

test('v3 plans (20-step day) double every position and size', () => {
  const s = M.normalizeState({
    version: 3,
    weeks: [{ id: 'w1', name: 'Normal', zones: { early: 4, morning: 6, midday: 1, afternoon: 5, evening: 4 },
      view: { showEvening: true }, blocks: [b('a', 0, 4, 5), b('eve', 2, 18, 2)] }],
    currentWeek: 'w1',
    regulars: [{ title: 'Gym', size: 3, zone: 'morning' }],
    unplaced: [{ title: 'Tidy', size: 1 }],
  });
  assert.equal(s.version, 4);
  assert.deepEqual(wk(s).zones, { early: 8, morning: 12, midday: 2, afternoon: 10, evening: 8 });
  assert.deepEqual(wk(s).blocks.map(x => [x.id, x.start, x.size]), [['a', 8, 10], ['eve', 36, 4]]);
  assert.equal(s.regulars[0].size, 6);
  assert.equal(s.unplaced[0].size, 2);
  // and a v4 plan is left exactly as it is
  assert.deepEqual(M.normalizeState(JSON.parse(JSON.stringify(s))), s);
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

// ---- reordering the sidebar ----

test('moveItem moves an item to an insertion point (0..length) in the original list', () => {
  const l = ['a', 'b', 'c'];
  assert.deepEqual(M.moveItem(l, 0, 3), ['b', 'c', 'a']);
  assert.deepEqual(M.moveItem(l, 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(M.moveItem(l, 0, 2), ['b', 'a', 'c']);
  assert.deepEqual(M.moveItem(l, 0, 0), l); // before itself
  assert.deepEqual(M.moveItem(l, 0, 1), l); // just after itself
  assert.deepEqual(l, ['a', 'b', 'c']);     // input untouched
});
