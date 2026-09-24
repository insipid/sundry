const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');

const b = (id, day, start, size) => ({ id, day, start, size, title: id, color: 0 });

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
  assert.equal(s.version, 2);
  assert.equal(s.blocks.length, 0);
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
  assert.deepEqual(s.blocks.map(x => x.id), ['a', 'd']);
  // d is clamped to the full day
  assert.deepEqual([s.blocks[1].start, s.blocks[1].size], [15, 5]);
  assert.deepEqual(s.regulars, []);
  assert.deepEqual(s.unplaced, []);
});

test('normalizeState turns on a hidden zone that has blocks in it', () => {
  const s = M.normalizeState({ blocks: [b('a', 0, 17, 2)], view: { showEvening: false } });
  assert.equal(s.view.showEvening, true);
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
  assert.deepEqual(M.normalizeState({ zones: custom }).zones, custom);
  assert.deepEqual(M.normalizeState({}).zones, M.DEFAULT_ZONE_SIZES);
  assert.deepEqual(M.normalizeState({ zones: { ...custom, morning: 0, midday: 8 } }).zones, M.DEFAULT_ZONE_SIZES);
  assert.deepEqual(M.normalizeState({ zones: { ...custom, morning: 9 } }).zones, M.DEFAULT_ZONE_SIZES); // wrong total
});

// ---- migrating plans saved on the old 17-step day (version 1) ----

test('v1 plans move onto the 20-step day, keeping each block in its zone', () => {
  // old default: early 0-3, morning 3-7, midday 7-9, afternoon 9-13, evening 13-17
  const s = M.normalizeState({
    version: 1,
    zones: { early: 3, morning: 4, midday: 2, afternoon: 4, evening: 4 },
    blocks: [b('am', 0, 3, 4), b('lunch', 0, 7, 2), b('pm', 0, 9, 2), b('eve', 0, 13, 2), b('dawn', 0, 0, 3)],
  });
  assert.equal(s.version, 2);
  assert.deepEqual(s.zones, M.DEFAULT_ZONE_SIZES);
  const at = id => { const x = s.blocks.find(y => y.id === id); return [x.start, x.size]; };
  assert.deepEqual(at('am'), [4, 5]);    // the whole morning
  assert.deepEqual(at('lunch'), [9, 2]); // the whole midday
  assert.deepEqual(at('pm'), [11, 3]);   // first half of the afternoon (2 of 4 → 2.5 of 5, rounded)
  assert.deepEqual(at('eve'), [16, 2]);
  assert.deepEqual(at('dawn'), [0, 4]);  // the whole early zone
  for (const id of ['am', 'lunch', 'pm', 'eve', 'dawn']) {
    const x = s.blocks.find(y => y.id === id);
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
  assert.deepEqual([moved.blocks[0].start, moved.blocks[0].size], [9, 2]);
  const bare = M.normalizeState({ version: 1, blocks: [b('am', 0, 3, 4)] });
  assert.deepEqual([bare.blocks[0].start, bare.blocks[0].size], [4, 5]);
});
