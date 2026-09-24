// schedule-ish UI: rendering, pointer interactions, persistence.
(function () {
  'use strict';
  const M = window.Model;
  const STORAGE_KEY = 'schedule-ish:v1';
  const DRAG_THRESHOLD = 4;
  const ADD_ROW_H = 26;     // the "+ early" / "+ evening" rows
  const PRINT_GRID_H = 600; // px the day is squeezed into on paper

  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- state + persistence -------------------------------------------------

  let state = load();
  const undoStack = [], redoStack = [];
  const ui = {
    selectedId: null,
    editing: null,      // { kind: 'block' | 'unplaced', id, isNew }
    ghost: null,        // { day, start, size, color } preview while dragging in
    drag: null,
    stepPx: 32,
    zones: M.zonesFor(week().zones),
    range: M.visibleRange(week().view, M.zonesFor(week().zones)),
    printing: false,
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return M.normalizeState(JSON.parse(raw));
    } catch (e) { console.warn('schedule-ish: could not load saved plan', e); }
    return M.defaultState();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('schedule-ish: could not save', e); }
  }

  const snapshot = () => JSON.stringify(state);
  function pushUndo(snap = snapshot()) {
    undoStack.push(snap);
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
  }
  // Every committed change goes through here: one undo step, save, render.
  function commit(mutate) {
    pushUndo();
    mutate(state);
    save();
    render();
  }
  function undo() {
    if (!undoStack.length) return toast('Nothing to undo');
    redoStack.push(snapshot());
    state = JSON.parse(undoStack.pop());
    ui.editing = null;
    save(); render();
  }
  function redo() {
    if (!redoStack.length) return toast('Nothing to redo');
    undoStack.push(snapshot());
    state = JSON.parse(redoStack.pop());
    ui.editing = null;
    save(); render();
  }

  // The week on the board. Settings, regulars and unplaced are global.
  function week() { return state.weeks.find(w => w.id === state.currentWeek); }

  const cloneNotes = notes => (notes || []).map(n => ({ ...n }));

  const findBlock = id => week().blocks.find(b => b.id === id);
  const findRegular = id => state.regulars.find(r => r.id === id);
  const findUnplaced = id => state.unplaced.find(u => u.id === id);

  // Same title → same colour, so "Gym" always looks like Gym.
  function colorFor(title) {
    const t = title.trim().toLowerCase();
    const match = state.regulars.find(r => r.title.toLowerCase() === t) || week().blocks.find(b => b.title.toLowerCase() === t);
    if (match) return match.color;
    let h = 0;
    for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % M.PALETTE.length;
  }

  // ---- rendering -----------------------------------------------------------

  function render() {
    $('#week-name').textContent = week().name;
    placeSidebar();
    renderSidebar();
    renderBoard();
    focusEditor();
  }

  const colorStyle = c => {
    const [fill, ink] = M.PALETTE[c] || M.PALETTE[0];
    return `background:${fill};color:${ink};--ring:${ink};`;
  };
  const pips = size => {
    const n = Math.max(4, size);
    return `<span class="pips">${Array.from({ length: n }, (_, i) => `<i class="${i < size ? '' : 'off'}"></i>`).join('')}</span>`;
  };

  function renderSidebar() {
    const regulars = state.regulars.map(r => `
      <div class="chip" data-regular="${r.id}" style="${colorStyle(r.color)}" title="Drag onto a day · click to edit">
        <span class="truncate">${esc(r.title)}</span>
        <span class="text-[11px] opacity-60">${r.zone}</span>
        ${pips(r.size)}
      </div>`).join('');

    const unplaced = state.unplaced.map(u => {
      const editing = ui.editing && ui.editing.kind === 'unplaced' && ui.editing.id === u.id;
      return `
      <div class="chip group" data-unplaced="${u.id}" style="${colorStyle(u.color)}" title="Drag onto a day · double-click to rename">
        ${editing ? `<input class="field !py-0.5 !text-[13px]" data-edit value="${esc(u.title)}">` : `<span class="truncate">${esc(u.title)}</span>`}
        ${editing ? '' : `${pips(u.size)}<button class="tool !bg-transparent opacity-0 group-hover:opacity-100" data-action="drop-unplaced" title="Remove">×</button>`}
      </div>`;
    }).join('');

    $('#sidebar').innerHTML = `
      <section>
        <div class="flex items-center mb-2">
          <h2 class="text-xs font-semibold tracking-wide" style="color:var(--muted)">REGULARS</h2>
          <button class="ml-auto text-xs px-2 py-0.5 rounded-md hover:bg-black/5" style="color:var(--muted)" data-cmd="new-regular">+ regular</button>
        </div>
        <div id="regulars-list" class="relative flex flex-col gap-1.5">${regulars || `<p class="text-xs" style="color:var(--faint)">Things you do often. Drag onto a day for a copy.</p>`}</div>
      </section>

      <section id="unplaced-drop" class="rounded-xl -mx-2 px-2 py-2 transition-colors">
        <h2 class="text-xs font-semibold tracking-wide mb-2" style="color:var(--muted)">UNPLACED</h2>
        <div id="unplaced-list" class="relative flex flex-col gap-1.5">${unplaced}</div>
        <input id="unplaced-input" class="field mt-2 !text-[13px]" placeholder="Something to fit in…" autocomplete="off">
      </section>

      <section class="mt-auto text-[11.5px] leading-relaxed" style="color:var(--muted)">
        <p><b class="font-semibold">Drag down</b> in a day to rough out a chunk, or click for a default one.</p>
        <p>Drag edges to resize. Double-click to rename. <b class="font-semibold">⌥-drag</b> to copy. Drop a regular on a <b class="font-semibold">day name</b> to put it in its usual spot.</p>
        <p>Drag a <b class="font-semibold">zone name</b> (midday, afternoon…) to move where it starts. <b class="font-semibold">+ early / + evening</b> add the ends of the day; click the word to tuck it away.</p>
      </section>`;
  }

  // Sidebar on the left or right (or hidden). The aside has its own 8px
  // padding, so the page edge on its side gets less.
  function placeSidebar() {
    const { sidebar, sidebarHidden } = state.settings;
    const main = $('#main');
    // Inline styles, not Tailwind classes: the browser build generates CSS
    // for new classes a beat later, and `hidden` would lose to `flex` anyway.
    main.style.flexDirection = sidebar === 'right' ? 'row-reverse' : 'row';
    main.style.paddingLeft = !sidebarHidden && sidebar === 'left' ? '12px' : '20px';
    main.style.paddingRight = !sidebarHidden && sidebar === 'right' ? '12px' : '20px';
    $('#sidebar').style.display = sidebarHidden ? 'none' : '';
    $('[data-cmd="toggle-sidebar"]').classList.toggle('on', !sidebarHidden);
  }

  function measureStep() {
    const steps = ui.range.end - ui.range.start;
    if (ui.printing) { ui.stepPx = PRINT_GRID_H / steps; return; }
    const addRows = !week().view.showEarly + !week().view.showEvening;
    const avail = $('#board-body').clientHeight - $('#board-head').offsetHeight - ADD_ROW_H * addRows - 2;
    // Fill the board exactly: the visible zones always use the full height.
    // (Only a very short window falls back to a minimum and scrolls.)
    ui.stepPx = Math.max(18, avail / steps);
  }

  function renderBoard() {
    ui.zones = M.zonesFor(week().zones);
    ui.range = M.visibleRange(week().view, ui.zones);
    const days = M.orderedDays(state.settings.weekStart, state.settings.visibleDays);
    const { start: r0, end: r1 } = ui.range;
    // min-width makes the grid as wide as its columns, so the sticky gutter can pin all the way.
    const cols = `grid-template-columns: var(--gutter) repeat(${days.length || 1}, minmax(72px, 1fr)); min-width: calc(var(--gutter) + ${(days.length || 1) * 72}px)`;

    $('#board-head').innerHTML = `
      <div class="grid border-b" style="${cols}; border-color: var(--grid)">
        <div class="pin-left"></div>
        ${days.map(d => `<div class="day-head text-center py-2.5 text-sm font-semibold rounded-t-lg transition-colors" data-day="${d}"
            title="${M.DAY_LONG[d]} · drop a regular here to put it in its usual spot">${M.DAY_NAMES[d]}</div>`).join('')}
      </div>`;

    measureStep(); // after the header, whose height it subtracts
    const px = ui.stepPx;
    const height = (r1 - r0) * px;
    // Zone names sit on the line at the top of their zone. Dragging one moves
    // that line (the first visible zone has no line above it to move);
    // clicking early or evening tucks it away.
    const gutter = M.visibleZones(week().view, ui.zones).map((z, i) => {
      const movable = i > 0, optional = z.optional;
      const active = ui.drag && ui.drag.kind === 'boundary' && ui.drag.active && ui.drag.zone === z.id;
      const tip = [optional && `Click to tuck ${z.label} away`, movable && `drag to move where ${z.label} starts`].filter(Boolean).join(' · ');
      return `
      <div class="zone-label ${movable ? 'movable' : ''} ${optional ? 'optional' : ''} ${active ? 'active' : ''}"
           ${movable || optional ? `data-zone-label="${z.id}" title="${tip.charAt(0).toUpperCase() + tip.slice(1)}"` : ''}
           style="top:${Math.max(0, (z.start - r0) * px - 6)}px">
        <span>${optional ? '<i class="zone-minus">−</i>' : ''}${z.label}</span>
      </div>`;
    }).join('');

    const lines = [];
    for (let s = r0 + 1; s < r1; s++) {
      const isZone = ui.zones.some(z => z.start === s);
      lines.push(`<div class="${isZone ? 'zone-line' : 'step-line'}" style="top:${(s - r0) * px}px"></div>`);
    }
    const midday = M.zone('midday', ui.zones);
    const band = `<div class="band" style="top:${(midday.start - r0) * px}px; height:${midday.steps * px}px"></div>`;

    const columns = days.map(d => {
      const blocks = week().blocks.filter(b => b.day === d);
      const layout = M.layoutDay(blocks);
      const ghost = ui.ghost && ui.ghost.day === d ? blockHtml({ ...ui.ghost, id: '_ghost', title: ui.ghost.title || '' }, { col: 0, cols: 1 }, true) : '';
      return `<div class="day-col relative" data-day="${d}" style="height:${height}px">
        ${band}${lines.join('')}
        ${blocks.map(b => blockHtml(b, layout[b.id])).join('')}
        ${ghost}
      </div>`;
    }).join('');

    // A hidden optional zone shows as a quiet "+ evening" row; once open, its
    // gutter label carries the "−" to tuck it away again.
    const addRow = zoneId => `<div class="grid zone-add-row" style="${cols}; height:${ADD_ROW_H}px">
        <div class="pin-left flex items-center justify-end pr-2">
          <button class="zone-add" data-cmd="show-zone" data-zone="${zoneId}" title="Add ${zoneId} to the day">+ ${zoneId}</button>
        </div>
        <div style="grid-column: 2 / -1"></div>
      </div>`;

    $('#board-grid').innerHTML = `
      ${week().view.showEarly ? '' : addRow('early')}
      <div class="grid" style="${cols}">
        <div class="relative pin-left" style="height:${height}px">${gutter}</div>
        ${columns}
      </div>
      ${week().view.showEvening ? '' : addRow('evening')}`;
  }

  function blockHtml(b, lay, isGhost = false) {
    const px = ui.stepPx;
    const top = (b.start - ui.range.start) * px + 1.5;
    const h = b.size * px - 3;
    const gap = 3;
    const left = `calc(${(lay.col / lay.cols) * 100}% + ${gap}px)`;
    const width = `calc(${100 / lay.cols}% - ${gap * 2}px)`;
    const editing = ui.editing && ui.editing.kind === 'block' && ui.editing.id === b.id;
    const cls = ['block'];
    if (isGhost) cls.push('ghost');
    if (b.id === ui.selectedId) cls.push('selected');
    if (editing) cls.push('editing');
    if (ui.drag && ui.drag.blockId === b.id && ui.drag.active) {
      cls.push('lifted');
      if (ui.drag.toUnplaced) cls.push('to-unplaced');
    }
    const roomy = h >= px * 2 - 4;
    const tiny = h < 26;
    return `<div class="${cls.join(' ')}" data-block="${b.id}"
        style="${colorStyle(b.color)} top:${top}px; height:${h}px; left:${left}; width:${width}; ${tiny ? 'padding-top:2px;padding-bottom:2px;' : ''}">
      ${isGhost ? '' : '<div class="edge top" data-edge="top"></div><div class="edge bottom" data-edge="bottom"></div>'}
      ${editing
        ? `<input data-edit value="${esc(b.title)}" placeholder="what’s this?">`
        : `<div class="title">${esc(b.title) || '<span style="opacity:.5">untitled</span>'}</div>
           ${roomy ? `<div class="size-word">${M.sizeWord(b.size)}</div>` : ''}`}
      ${!isGhost && b.notes && b.notes.length ? '<span class="has-notes" title="Has notes (double-click)">⋯</span>' : ''}
      ${isGhost ? '' : `<div class="tools ${roomy ? 'at-bottom' : ''}">
        <button class="tool" data-action="color" title="Change colour" style="color:inherit">●</button>
        <button class="tool" data-action="duplicate" title="Duplicate (or ⌥-drag)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2"/></svg></button>
        <button class="tool" data-action="make-regular" title="Save as a regular">☆</button>
        <button class="tool" data-action="delete" title="Delete (⌫)">×</button>
      </div>`}
    </div>`;
  }

  function focusEditor() {
    const input = document.querySelector('[data-edit]');
    if (input && document.activeElement !== input) {
      input.focus();
      input.select();
    }
  }

  // Selection changes don't re-render, so double-click lands on the same node.
  function select(id) {
    ui.selectedId = id;
    $$('.block').forEach(el => el.classList.toggle('selected', el.dataset.block === id));
  }

  // ---- geometry ------------------------------------------------------------

  const within = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  function columnAt(x, y, anyY = false) {
    for (const el of $$('.day-col')) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && (anyY || (y >= r.top && y <= r.bottom))) return { day: +el.dataset.day, rect: r };
    }
    return null;
  }
  function headAt(x, y) {
    const el = $$('.day-head').find(h => within(h.getBoundingClientRect(), x, y));
    return el ? +el.dataset.day : null;
  }
  function overUnplaced(x, y) {
    const el = $('#unplaced-drop');
    return el && within(el.getBoundingClientRect(), x, y);
  }
  // Fractional step under the pointer, in absolute (not visible-relative) steps.
  const stepAt = (rect, y) => ui.range.start + (y - rect.top) / ui.stepPx;

  // ---- pointer interactions -----------------------------------------------

  document.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('[data-edit], [data-action], button, input, .popover, .dialog-overlay')) return;
    // A click away from a title being edited just finishes the edit.
    if (ui.editing) { commitEditing(); e.preventDefault(); return; }

    const blockEl = e.target.closest('.block');
    const regEl = e.target.closest('[data-regular]');
    const unpEl = e.target.closest('[data-unplaced]');
    const colEl = e.target.closest('.day-col');
    const labelEl = e.target.closest('[data-zone-label]');

    if (blockEl) {
      const b = findBlock(blockEl.dataset.block);
      if (!b) return;
      select(b.id);
      const edge = e.target.closest('[data-edge]');
      const rect = blockEl.closest('.day-col').getBoundingClientRect();
      beginDrag(e, {
        kind: edge ? 'resize-' + edge.dataset.edge : 'move',
        blockId: b.id,
        copy: e.altKey && !edge, // ⌥-drag leaves a copy behind
        grab: stepAt(rect, e.clientY) - b.start,
        orig: { day: b.day, start: b.start, size: b.size },
      });
    } else if (regEl || unpEl) {
      beginDrag(e, { kind: regEl ? 'regular' : 'unplaced', sourceId: (regEl || unpEl).dataset.regular || unpEl.dataset.unplaced, sourceEl: regEl || unpEl });
    } else if (colEl) {
      const hadSelection = ui.selectedId != null;
      select(null);
      const rect = colEl.getBoundingClientRect();
      beginDrag(e, { kind: 'create', day: +colEl.dataset.day, anchor: Math.floor(stepAt(rect, e.clientY)), deselectOnly: hadSelection });
    } else if (labelEl) {
      beginDrag(e, {
        kind: 'boundary',
        zone: labelEl.dataset.zoneLabel,
        movable: labelEl.classList.contains('movable'),
        optional: labelEl.classList.contains('optional'),
        // Pushes are always worked out from where things were at the start,
        // so dragging the break back puts the blocks back too.
        origZones: { ...week().zones },
        origBlocks: week().blocks.map(x => ({ ...x })),
      });
    } else if (!e.target.closest('#sidebar')) {
      select(null);
    }
  });

  function beginDrag(e, d) {
    ui.drag = { ...d, x0: e.clientX, y0: e.clientY, active: false, snap: snapshot() };
    e.preventDefault();
  }

  window.addEventListener('pointermove', e => {
    const d = ui.drag;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD) return;
      d.active = true;
      startActive(d, e);
    }
    DRAGS[d.kind].move(d, e);
  });

  window.addEventListener('pointerup', e => {
    const d = ui.drag;
    if (!d) return;
    ui.drag = null;
    document.body.classList.remove('dragging', 'resizing', 'creating', 'copying');
    if (d.active) DRAGS[d.kind].end(d, e);
    else if (DRAGS[d.kind].click) DRAGS[d.kind].click(d, e);
  });

  function cancelDrag() {
    const d = ui.drag;
    if (!d) return;
    ui.drag = null;
    document.body.classList.remove('dragging', 'resizing', 'creating', 'copying');
    if (d.floating) d.floating.remove();
    state = JSON.parse(d.snap);
    ui.ghost = null;
    render();
  }

  function startActive(d, e) {
    const body = document.body.classList;
    if (d.copy) {
      const b = findBlock(d.blockId);
      week().blocks.push({ ...b, id: M.newId(), notes: cloneNotes(b.notes) });
      body.add('copying');
    } else if (d.kind === 'move' || d.kind === 'regular' || d.kind === 'unplaced') body.add('dragging');
    else if (d.kind === 'create') body.add('creating');
    else if (d.kind !== 'boundary' || d.movable) body.add('resizing');
    if (d.kind === 'regular' || d.kind === 'unplaced') {
      const f = d.sourceEl.cloneNode(true);
      f.classList.add('floating');
      f.style.width = d.sourceEl.offsetWidth + 'px';
      document.body.appendChild(f);
      d.floating = f;
      if (d.kind === 'unplaced') d.sourceEl.style.opacity = '.35';
    }
  }

  // Finish a live drag: keep one undo step if anything changed.
  function settle(d) {
    if (snapshot() !== d.snap) { pushUndo(d.snap); save(); }
    render();
  }

  const DRAGS = {
    move: {
      move(d, e) {
        const b = findBlock(d.blockId);
        d.toUnplaced = overUnplaced(e.clientX, e.clientY);
        $('#unplaced-drop').classList.toggle('drop-hot', d.toUnplaced);
        const col = columnAt(e.clientX, e.clientY, true);
        if (col) {
          b.day = col.day;
          Object.assign(b, M.clampBlock(stepAt(col.rect, e.clientY) - d.grab, b.size, ui.range));
        }
        renderBoard();
      },
      end(d) {
        if (d.toUnplaced) {
          const b = findBlock(d.blockId);
          week().blocks = week().blocks.filter(x => x !== b);
          state.unplaced.push({ id: b.id, title: b.title || 'untitled', size: b.size, color: b.color, notes: b.notes });
          ui.selectedId = null;
          toast('Moved to unplaced');
        }
        settle(d);
      },
    },

    'resize-top': {
      move(d, e) {
        const b = findBlock(d.blockId);
        const col = $(`.day-col[data-day="${b.day}"]`).getBoundingClientRect();
        const end = d.orig.start + d.orig.size;
        const start = Math.max(ui.range.start, Math.min(end - 1, Math.round(stepAt(col, e.clientY))));
        b.start = start; b.size = end - start;
        renderBoard();
      },
      end: settle,
    },

    'resize-bottom': {
      move(d, e) {
        const b = findBlock(d.blockId);
        const col = $(`.day-col[data-day="${b.day}"]`).getBoundingClientRect();
        const end = Math.min(ui.range.end, Math.max(b.start + 1, Math.round(stepAt(col, e.clientY))));
        b.size = end - b.start;
        renderBoard();
      },
      end: settle,
    },

    create: {
      move(d, e) {
        const col = $(`.day-col[data-day="${d.day}"]`).getBoundingClientRect();
        const cur = Math.floor(stepAt(col, e.clientY));
        const lo = Math.max(ui.range.start, Math.min(d.anchor, cur));
        const hi = Math.min(ui.range.end, Math.max(d.anchor, cur) + 1);
        ui.ghost = { day: d.day, start: lo, size: Math.max(1, hi - lo), color: 7 };
        renderBoard();
      },
      end(d) {
        const g = ui.ghost;
        ui.ghost = null;
        if (!g) return render();
        createBlock(d.day, g.start, g.size);
      },
      click(d) {
        if (d.deselectOnly) return;
        createBlock(d.day, ...Object.values(M.clampBlock(d.anchor, 2, ui.range)));
      },
    },

    regular: dropIn(r => findRegular(r), false, { list: 'regulars', key: 'regular' }),
    unplaced: dropIn(u => findUnplaced(u), true, { list: 'unplaced', key: 'unplaced' }),

    boundary: {
      move(d, e) {
        if (!d.movable) return;
        const col = $('.day-col').getBoundingClientRect();
        const next = M.moveBoundaryPushing(d.origZones, d.origBlocks, d.zone, stepAt(col, e.clientY));
        if (JSON.stringify(next.zones) === JSON.stringify(week().zones)) return;
        week().zones = next.zones;
        week().blocks = next.blocks;
        renderBoard();
      },
      end: settle,
      click(d) {
        if (!d.optional) return;
        pushUndo(d.snap);
        if (setZone(d.zone, false)) save(); else undoStack.pop();
      },
    },
  };

  // Where in its own sidebar list a dragged item would land: an insertion
  // index (0..length) and a line to show it, or null when not over the list.
  function reorderTarget(own, x, y) {
    const listEl = $(`#${own.list}-list`);
    const r = listEl && listEl.getBoundingClientRect();
    if (!r || x < r.left || x > r.right || y < r.top - 12 || y > r.bottom + 12) return null;
    const chips = [...listEl.querySelectorAll(`[data-${own.key}]`)];
    let to = chips.findIndex(c => { const b = c.getBoundingClientRect(); return y < b.top + b.height / 2; });
    if (to === -1) to = chips.length;
    const edge = to < chips.length ? chips[to].offsetTop - 4 : chips[chips.length - 1].offsetTop + chips[chips.length - 1].offsetHeight + 2;
    return { to, lineTop: edge, listEl };
  }
  function showReorderLine(t) {
    $$('.reorder-line').forEach(l => l.remove());
    if (!t) return;
    const line = document.createElement('div');
    line.className = 'reorder-line';
    line.style.top = t.lineTop + 'px';
    t.listEl.appendChild(line);
  }

  // Regulars (copy) and unplaced items (move) share one drag-in behaviour.
  // Drop in a column → exactly where you let go; drop on a day name → the
  // first free gap in the item's home zone; drop back in its own list →
  // reorder that list.
  function dropIn(find, consume, own) {
    return {
      move(d, e) {
        const item = find(d.sourceId);
        d.floating.style.left = e.clientX + 'px';
        d.floating.style.top = e.clientY + 'px';
        const t = reorderTarget(own, e.clientX, e.clientY);
        d.reorderTo = t ? t.to : null;
        showReorderLine(t);
        d.sourceEl.style.opacity = consume || t ? '.35' : '';
        if (t) {
          $$('.day-head').forEach(h => h.classList.remove('drop-hot'));
          d.floating.style.visibility = 'visible';
          if (ui.ghost) { ui.ghost = null; renderBoard(); }
          return;
        }
        const headDay = headAt(e.clientX, e.clientY);
        $$('.day-head').forEach(h => h.classList.toggle('drop-hot', +h.dataset.day === headDay));
        const col = headDay == null ? columnAt(e.clientX, e.clientY) : null;
        let ghost = null;
        if (headDay != null) {
          ghost = { day: headDay, start: M.firstFreeGap(week().blocks, headDay, item.size, item.zone || 'morning', ui.range, ui.zones), size: item.size };
        } else if (col) {
          const c = M.clampBlock(stepAt(col.rect, e.clientY) - item.size / 2, item.size, ui.range);
          ghost = { day: col.day, ...c };
        }
        const was = JSON.stringify(ui.ghost);
        ui.ghost = ghost && { ...ghost, color: item.color, title: item.title };
        d.floating.style.visibility = ghost ? 'hidden' : 'visible';
        if (JSON.stringify(ui.ghost) !== was) renderBoard();
      },
      end(d) {
        d.floating.remove();
        showReorderLine(null);
        $$('.day-head').forEach(h => h.classList.remove('drop-hot'));
        const g = ui.ghost, item = find(d.sourceId);
        ui.ghost = null;
        if (d.reorderTo != null && item) {
          const key = own.list;
          state[key] = M.moveItem(state[key], state[key].indexOf(item), d.reorderTo);
          return settle(d);
        }
        if (!g || !item) return render();
        const id = consume ? item.id : M.newId();
        week().blocks.push({ id, day: g.day, start: g.start, size: g.size, title: item.title, color: item.color, notes: cloneNotes(item.notes) });
        if (consume) state.unplaced = state.unplaced.filter(u => u !== item);
        ui.selectedId = id;
        settle(d);
      },
      click(d) {
        if (!consume) editRegular(d.sourceId, d.sourceEl);
      },
    };
  }

  function setZone(zoneId, show) {
    const key = zoneId === 'early' ? 'showEarly' : 'showEvening';
    if (!show && !M.canHide(zoneId, week().blocks, ui.zones)) {
      toast(`Move the ${zoneId} blocks out first`);
      return false;
    }
    week().view[key] = show;
    render();
    return true;
  }

  function createBlock(day, start, size) {
    const b = { id: M.newId(), day, start, size, title: '', color: 7, notes: [] };
    pushUndo();
    week().blocks.push(b);
    ui.selectedId = b.id;
    ui.editing = { kind: 'block', id: b.id, isNew: true };
    save();
    render();
  }

  // ---- editing titles ------------------------------------------------------

  function commitEditing(cancel = false) {
    const ed = ui.editing;
    if (!ed) return;
    const input = document.querySelector('[data-edit]');
    const value = input ? input.value.trim() : '';
    ui.editing = null;
    if (ed.kind === 'block') {
      const b = findBlock(ed.id);
      if (!b) return render();
      if (ed.isNew && (cancel || !value)) {
        // An abandoned new block just disappears, along with its undo step.
        week().blocks = week().blocks.filter(x => x !== b);
        undoStack.pop();
      } else if (!cancel && value !== b.title) {
        if (!ed.isNew) pushUndo();
        if (ed.isNew) b.color = colorFor(value); // before the title, so it can't match itself
        b.title = value;
      }
    } else if (ed.kind === 'unplaced') {
      const u = findUnplaced(ed.id);
      if (u && !cancel && value && value !== u.title) { pushUndo(); u.title = value; }
    }
    save();
    render();
  }

  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t.matches && t.matches('[data-edit]')) {
      if (e.key === 'Enter') { e.preventDefault(); commitEditing(); }
      else if (e.key === 'Escape') { e.preventDefault(); commitEditing(true); }
      return;
    }
    if (t.id === 'unplaced-input' && e.key === 'Enter') {
      const title = t.value.trim();
      if (title) {
        commit(s => s.unplaced.push({ id: M.newId(), title, size: 2, color: colorFor(title), notes: [] }));
        $('#unplaced-input').focus();
      }
      return;
    }
    if (e.key === 'Escape') {
      if (ui.drag) return cancelDrag();
      if (closePopover()) return;
      select(null);
      return;
    }
    if (t.closest && t.closest('input, textarea, select, .popover')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selectedId) {
      e.preventDefault();
      const id = ui.selectedId;
      ui.selectedId = null;
      commit(() => { week().blocks = week().blocks.filter(b => b.id !== id); });
    }
    if (e.key === 'Enter' && ui.selectedId) {
      e.preventDefault();
      ui.editing = { kind: 'block', id: ui.selectedId };
      render();
    }
  });

  document.addEventListener('focusout', e => {
    if (e.target.matches && e.target.matches('[data-edit]')) {
      // Defer so a click that caused the blur is handled first.
      setTimeout(() => { if (ui.editing && !document.querySelector('[data-edit]:focus')) commitEditing(); }, 0);
    }
  });

  document.addEventListener('dblclick', e => {
    const blockEl = e.target.closest('.block:not(.ghost)');
    const unpEl = e.target.closest('[data-unplaced]');
    if (blockEl) return openBlockDialog(blockEl.dataset.block);
    if (unpEl) ui.editing = { kind: 'unplaced', id: unpEl.dataset.unplaced };
    else return;
    render();
  });

  // ---- notes ---------------------------------------------------------------
  // A tiny outliner: each line is an input. Enter starts a new line (a tick
  // box if you were on one), Backspace on an empty line removes it, and the
  // mark at the front cycles • → ☐ → ☑. Empty lines are dropped on close.

  const MARKS = { null: '•', false: '☐', true: '☑' };
  const cleanNotes = notes => notes.filter(n => n.text.trim()).map(n => ({ text: n.text.trim(), check: n.check }));

  function mountNotes(host, notes) {
    if (!notes.length) notes.push({ text: '', check: null });
    const draw = (focusAt, caretEnd = true) => {
      host.innerHTML = `<ul class="notes">${notes.map((n, i) => `
        <li class="note ${n.check === true ? 'done' : ''}">
          <button class="note-mark" data-i="${i}" title="Bullet → to-do → done">${MARKS[n.check]}</button>
          <input class="note-text" data-i="${i}" value="${esc(n.text)}" placeholder="${i === 0 && notes.length === 1 ? 'Notes… (Enter for a new line)' : ''}">
        </li>`).join('')}</ul>`;
      if (focusAt != null) {
        const input = host.querySelectorAll('.note-text')[focusAt];
        if (input) { input.focus(); const at = caretEnd ? input.value.length : 0; input.setSelectionRange(at, at); }
      }
    };
    host.addEventListener('input', e => {
      if (e.target.matches('.note-text')) notes[+e.target.dataset.i].text = e.target.value;
    });
    host.addEventListener('click', e => {
      const mark = e.target.closest('.note-mark');
      if (!mark) return;
      const i = +mark.dataset.i;
      notes[i].check = M.nextCheck(notes[i].check);
      draw(i);
    });
    host.addEventListener('keydown', e => {
      if (!e.target.matches('.note-text')) return;
      const i = +e.target.dataset.i;
      if (e.key === 'Enter') {
        e.preventDefault();
        notes.splice(i + 1, 0, { text: '', check: notes[i].check === null ? null : false });
        draw(i + 1);
      } else if (e.key === 'Backspace' && e.target.value === '' && notes.length > 1) {
        e.preventDefault();
        notes.splice(i, 1);
        draw(Math.max(0, i - 1));
      } else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); draw(i - 1); }
      else if (e.key === 'ArrowDown' && i < notes.length - 1) { e.preventDefault(); draw(i + 1); }
    });
    draw(null);
    return { focusEnd: () => draw(notes.length - 1) };
  }

  // Double-click a block: its title and notes, with the cursor in the notes.
  function openBlockDialog(id) {
    const b = findBlock(id);
    if (!b) return;
    closePopover();
    select(id);
    const before = snapshot();
    const notes = cloneNotes(b.notes);
    const [fill, ink] = M.PALETTE[b.color] || M.PALETTE[0];
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog" role="dialog" aria-label="Block notes">
        <div class="dialog-head" style="background:${fill}; color:${ink}">
          <input class="dialog-title" value="${esc(b.title)}" placeholder="untitled">
          <div class="text-xs opacity-70">${M.DAY_LONG[b.day]} · ${M.zoneAt(b.start, ui.zones)} · ${M.sizeWord(b.size)}</div>
        </div>
        <div class="dialog-body"></div>
        <div class="flex items-center px-4 pb-4">
          <span class="text-[11.5px]" style="color:var(--muted)">Enter: new line · click • for a tick box</span>
          <button class="btn primary ml-auto" data-do="done">Done</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const editor = mountNotes(overlay.querySelector('.dialog-body'), notes);
    editor.focusEnd();

    const close = () => {
      overlay.remove();
      const title = overlay.querySelector('.dialog-title').value.trim();
      const next = cleanNotes(notes);
      const changed = JSON.stringify(next) !== JSON.stringify(b.notes || []) || (title && title !== b.title);
      if (changed) {
        pushUndo(before);
        b.notes = next;
        if (title) b.title = title;
        save();
      }
      render();
    };
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-do="done"]').addEventListener('click', close);
    overlay.addEventListener('keydown', e => {
      e.stopPropagation(); // keep ⌫, ⌘Z etc. away from the board underneath
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); close(); }
      else if (e.key === 'Enter' && e.target.matches('.dialog-title')) { e.preventDefault(); editor.focusEnd(); }
    });
  }

  // ---- clicks: block tools, sidebar, header commands -----------------------

  document.addEventListener('click', e => {
    const act = e.target.closest('[data-action]');
    if (act) {
      const blockEl = act.closest('[data-block]');
      const id = blockEl && blockEl.dataset.block;
      switch (act.dataset.action) {
        case 'delete':
          ui.selectedId = null;
          return commit(() => { week().blocks = week().blocks.filter(b => b.id !== id); });
        case 'duplicate': {
          const b = findBlock(id);
          const days = M.orderedDays(state.settings.weekStart, state.settings.visibleDays);
          const spot = M.duplicateSpot(week().blocks, b, days, ui.range, ui.zones);
          const copy = { ...b, id: M.newId(), ...spot, notes: cloneNotes(b.notes) };
          ui.selectedId = copy.id;
          commit(() => week().blocks.push(copy));
          if (spot.day !== b.day) toast(`No room after it, so the copy went to ${M.DAY_LONG[spot.day]}`);
          return;
        }
        case 'color':
          return commit(() => { const b = findBlock(id); b.color = (b.color + 1) % M.PALETTE.length; });
        case 'make-regular': {
          const b = findBlock(id);
          if (state.regulars.some(r => r.title.toLowerCase() === b.title.toLowerCase())) return toast(`“${b.title}” is already a regular`);
          commit(s => s.regulars.push({ id: M.newId(), title: b.title || 'untitled', size: b.size, color: b.color, zone: M.zoneAt(b.start, ui.zones), notes: cloneNotes(b.notes) }));
          return toast(`Saved “${b.title || 'untitled'}” as a regular`);
        }
        case 'drop-unplaced': {
          const uid = act.closest('[data-unplaced]').dataset.unplaced;
          return commit(s => { s.unplaced = s.unplaced.filter(u => u.id !== uid); });
        }
      }
      return;
    }
    const cmd = e.target.closest('[data-cmd]');
    if (!cmd) return;
    switch (cmd.dataset.cmd) {
      case 'undo': return undo();
      case 'redo': return redo();
      case 'export': return exportPlan();
      case 'import': return $('#import-file').click();
      case 'settings': return openSettings(cmd);
      case 'weeks': return openWeeks(cmd);
      case 'new-regular': return editRegular(null, cmd);
      case 'print': return window.print();
      case 'toggle-sidebar': return commit(s => { s.settings.sidebarHidden = !s.settings.sidebarHidden; });
      case 'show-zone':
        pushUndo();
        if (setZone(cmd.dataset.zone, true)) save(); else undoStack.pop();
        return;
    }
  });

  // ---- popovers ------------------------------------------------------------

  let popover = null;
  function openPopover(anchor, html, mount) {
    closePopover();
    const el = document.createElement('div');
    el.className = 'popover';
    el.innerHTML = html;
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const left = Math.min(window.innerWidth - el.offsetWidth - 12, Math.max(12, r.left));
    const top = r.bottom + 8 + el.offsetHeight > window.innerHeight ? Math.max(12, r.top - el.offsetHeight - 8) : r.bottom + 8;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    popover = el;
    mount(el);
  }
  function closePopover() {
    if (!popover) return false;
    popover.remove();
    popover = null;
    return true;
  }
  document.addEventListener('pointerdown', e => {
    if (popover && !popover.contains(e.target) && !e.target.closest('[data-cmd="settings"], [data-cmd="new-regular"], [data-cmd="weeks"]')) closePopover();
  }, true);

  const SIZE_OPTS = [[1, 'a smidge'], [2, 'a bit'], [3, 'a good bit'], [4, 'a big chunk'], [6, 'loads']];

  function editRegular(id, anchor) {
    const existing = id && findRegular(id);
    const draft = existing ? { ...existing, notes: cloneNotes(existing.notes) } : { title: '', size: 2, color: 1, zone: 'morning', notes: [] };
    openPopover(anchor, `
      <label>name</label>
      <input class="field" data-f="title" value="${esc(draft.title)}" placeholder="e.g. Gym">
      <label>roughly how much</label>
      <div class="seg" data-f="size">${SIZE_OPTS.map(([n, w]) => `<button data-v="${n}">${w}</button>`).join('')}</div>
      <label>usually in the</label>
      <div class="seg" data-f="zone">${M.ZONES.map(z => `<button data-v="${z.id}">${z.label}</button>`).join('')}</div>
      <label>colour</label>
      <div class="flex gap-1.5" data-f="color">${M.PALETTE.map(([fill, ink], i) => `<button class="swatch" data-v="${i}" style="background:${fill}; box-shadow: inset 0 0 0 1px ${ink}33"></button>`).join('')}</div>
      <label>default notes</label>
      <div data-f="notes" class="-mx-1"></div>
      <div class="flex items-center gap-2 mt-4">
        ${existing ? '<button class="btn danger" data-do="delete">Delete</button>' : ''}
        <button class="btn ml-auto" data-do="cancel">Cancel</button>
        <button class="btn primary" data-do="save">${existing ? 'Save' : 'Add'}</button>
      </div>`, el => {
      const sync = () => {
        el.querySelectorAll('[data-f="size"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === draft.size));
        el.querySelectorAll('[data-f="zone"] button').forEach(b => b.classList.toggle('on', b.dataset.v === draft.zone));
        el.querySelectorAll('[data-f="color"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === draft.color));
      };
      sync();
      mountNotes(el.querySelector('[data-f="notes"]'), draft.notes);
      const title = el.querySelector('[data-f="title"]');
      title.focus();
      const doSave = () => {
        draft.notes = cleanNotes(draft.notes);
        draft.title = title.value.trim();
        if (!draft.title) { title.focus(); return; }
        commit(s => {
          if (existing) Object.assign(findRegular(id), draft);
          else s.regulars.push({ ...draft, id: M.newId() });
        });
        closePopover();
      };
      title.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
      el.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const f = b.parentElement.dataset.f;
        if (f === 'size') draft.size = +b.dataset.v;
        else if (f === 'zone') draft.zone = b.dataset.v;
        else if (f === 'color') draft.color = +b.dataset.v;
        else if (b.dataset.do === 'save') return doSave();
        else if (b.dataset.do === 'cancel') return closePopover();
        else if (b.dataset.do === 'delete') {
          commit(s => { s.regulars = s.regulars.filter(r => r.id !== id); });
          return closePopover();
        }
        sync();
      });
    });
  }

  // ---- weeks: the header dropdown -------------------------------------------
  // Each week is a live, named board: switching to one and changing it
  // changes that week. New weeks start blank or as a copy of this one.

  function switchWeek(id) {
    ui.selectedId = null;
    ui.editing = null;
    commit(s => { s.currentWeek = id; });
  }

  function openWeeks(anchor) {
    if (closePopover()) return;
    const cur = week();
    openPopover(anchor, `
      <label>weeks</label>
      <div class="flex flex-col gap-0.5">${state.weeks.map(w => `
        <button class="menu-item ${w.id === cur.id ? 'on' : ''}" data-week="${w.id}">
          <span class="w-4 inline-block">${w.id === cur.id ? '✓' : ''}</span>${esc(w.name)}
        </button>`).join('')}
      </div>
      <div class="menu-sep"></div>
      <button class="menu-item" data-do="new-blank">+ New blank week</button>
      <button class="menu-item" data-do="new-copy">+ New from this week</button>
      <div class="menu-sep"></div>
      <button class="menu-item" data-do="rename">Rename this week…</button>
      <button class="menu-item danger" data-do="delete" ${state.weeks.length < 2 ? 'disabled title="It’s the only week"' : ''}>Delete this week…</button>`, el => {
      // Swap the menu for a one-field name form.
      const askName = (label, initial, done) => {
        el.innerHTML = `
          <label>${label}</label>
          <input class="field" data-f="name" value="${esc(initial)}">
          <div class="flex items-center gap-2 mt-3">
            <button class="btn ml-auto" data-do="cancel">Cancel</button>
            <button class="btn primary" data-do="ok">OK</button>
          </div>`;
        const input = el.querySelector('[data-f="name"]');
        input.focus(); input.select();
        const ok = () => { const v = input.value.trim(); if (!v) return input.focus(); closePopover(); done(v); };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
        el.querySelector('[data-do="ok"]').addEventListener('click', ok);
        el.querySelector('[data-do="cancel"]').addEventListener('click', closePopover);
      };
      el.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        if (b.dataset.week) { closePopover(); if (b.dataset.week !== cur.id) switchWeek(b.dataset.week); return; }
        switch (b.dataset.do) {
          case 'new-blank':
            return askName('name the new week', 'New week', name => {
              const w = M.blankWeek(name);
              ui.selectedId = null;
              commit(s => { s.weeks.push(w); s.currentWeek = w.id; });
            });
          case 'new-copy':
            return askName('name the copy', `${cur.name} copy`, name => {
              const w = M.copyWeek(cur, name);
              ui.selectedId = null;
              commit(s => { s.weeks.push(w); s.currentWeek = w.id; });
            });
          case 'rename':
            return askName('rename this week', cur.name, name => commit(() => { week().name = name; }));
          case 'delete':
            closePopover();
            if (!confirm(`Delete the week “${cur.name}”? (You can undo.)`)) return;
            ui.selectedId = null;
            return commit(s => {
              s.weeks = s.weeks.filter(w => w.id !== cur.id);
              s.currentWeek = s.weeks[0].id;
            });
        }
      });
    });
  }

  function openSettings(anchor) {
    if (closePopover()) return;
    openPopover(anchor, `
      <label>week starts on</label>
      <div class="seg" data-f="weekStart">${M.DAY_NAMES.map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}</div>
      <label>days to show</label>
      <div class="seg" data-f="visible">${M.DAY_NAMES.map((n, i) => `<button data-v="${i}">${n}</button>`).join('')}</div>
      <label>sidebar</label>
      <div class="seg" data-f="sidebar">
        <button data-v="left">left</button><button data-v="right">right</button><button data-v="hidden">hidden</button>
      </div>
      <label>stretch the day</label>
      <div class="seg" data-f="zones">
        <button data-v="early">early</button><button data-v="evening">evening</button>
      </div>
      <div class="flex items-center gap-2 mt-4 pt-3 border-t" style="border-color: var(--grid)">
        <button class="btn danger" data-do="clear">Clear all blocks</button>
        <button class="btn ml-auto" data-do="close">Done</button>
      </div>`, el => {
      const sync = () => {
        el.querySelectorAll('[data-f="weekStart"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.settings.weekStart));
        el.querySelectorAll('[data-f="visible"] button').forEach(b => b.classList.toggle('on', state.settings.visibleDays[+b.dataset.v]));
        const sb = state.settings.sidebarHidden ? 'hidden' : state.settings.sidebar;
        el.querySelectorAll('[data-f="sidebar"] button').forEach(b => b.classList.toggle('on', b.dataset.v === sb));
        el.querySelectorAll('[data-f="zones"] button').forEach(b => b.classList.toggle('on', b.dataset.v === 'early' ? week().view.showEarly : week().view.showEvening));
      };
      sync();
      el.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const f = b.parentElement.dataset.f;
        if (f === 'weekStart') commit(s => { s.settings.weekStart = +b.dataset.v; });
        else if (f === 'visible') {
          const i = +b.dataset.v;
          if (state.settings.visibleDays.filter(Boolean).length === 1 && state.settings.visibleDays[i]) return toast('Keep at least one day');
          commit(s => { s.settings.visibleDays[i] = !s.settings.visibleDays[i]; });
        } else if (f === 'sidebar') {
          const v = b.dataset.v;
          commit(s => {
            s.settings.sidebarHidden = v === 'hidden';
            if (v !== 'hidden') s.settings.sidebar = v;
          });
        } else if (f === 'zones') {
          const shown = b.dataset.v === 'early' ? week().view.showEarly : week().view.showEvening;
          pushUndo();
          if (setZone(b.dataset.v, !shown)) save(); else undoStack.pop();
        } else if (b.dataset.do === 'clear') {
          if (!week().blocks.length) return toast('Already empty');
          if (confirm('Clear every block from the week? (Regulars and unplaced stay. You can undo.)')) {
            commit(() => { week().blocks = []; });
            toast('Cleared. ⌘Z to undo');
          }
        } else if (b.dataset.do === 'close') return closePopover();
        sync();
      });
    });
  }

  // ---- import / export -----------------------------------------------------

  function exportPlan() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `schedule-ish-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('#import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const next = M.normalizeState(JSON.parse(await file.text()));
      if (!confirm(`Replace the current plan with “${file.name}”? (You can undo.)`)) return;
      commit(() => { state = next; });
      toast('Plan imported');
    } catch (err) {
      toast('That file doesn’t look like a schedule-ish plan');
    }
  });

  // ---- misc ----------------------------------------------------------------

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // On paper the day is squeezed to fit one landscape page.
  // Page 2: every block's notes, listed by day and name (not a calendar).
  function renderPrintNotes() {
    const days = M.orderedDays(state.settings.weekStart, state.settings.visibleDays);
    const items = M.notesForPrint(week(), days);
    $('#print-notes').innerHTML = items.length ? `
      <h2>Notes · ${esc(week().name)}</h2>
      ${items.map(it => `
        <h3>${M.DAY_LONG[it.day]} · ${esc(it.title || 'untitled')}</h3>
        <ul>${it.notes.map(n => `<li class="${n.check === true ? 'done' : ''}">${MARKS[n.check]} ${esc(n.text)}</li>`).join('')}</ul>`).join('')}` : '';
  }
  window.addEventListener('beforeprint', () => { ui.printing = true; renderBoard(); renderPrintNotes(); });
  window.addEventListener('afterprint', () => { ui.printing = false; renderBoard(); });

  // Re-fit the day to the board whenever the board changes size. This also
  // catches Tailwind's browser build styling the page after our first render.
  let lastBodyH = 0;
  new ResizeObserver(() => {
    const h = $('#board-body').clientHeight;
    if (h !== lastBodyH && !ui.drag) { lastBodyH = h; renderBoard(); }
  }).observe($('#board-body'));
  window.addEventListener('storage', e => {
    // Another tab changed the plan: follow it.
    if (e.key === STORAGE_KEY && e.newValue) { state = M.normalizeState(JSON.parse(e.newValue)); render(); }
  });

  save(); // write back anything load() repaired or migrated
  render();
})();
