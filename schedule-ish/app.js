// schedule-ish UI: rendering, pointer interactions, persistence.
(function () {
  'use strict';
  const M = window.Model;
  const STORAGE_KEY = 'schedule-ish:v1';
  const DRAG_THRESHOLD = 4;
  const ADD_ROW_H = 26;     // the "+ early" / "+ evening" rows
  const DAYNOTE_H = 30;     // the "How was Tue?" row in review mode
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

  // Where you left off, per week: the selected block and the board's scroll.
  // Kept apart from the plan, so it never makes an undo step.
  const UI_KEY = 'schedule-ish:ui';
  const uiSaved = (() => {
    try { const v = JSON.parse(localStorage.getItem(UI_KEY)); if (v && typeof v.weeks === 'object') return v; } catch (e) { /* start fresh */ }
    return { weeks: {} };
  })();
  const savedFor = id => (uiSaved.weeks[id] = uiSaved.weeks[id] || {});
  function saveUi() {
    for (const id of Object.keys(uiSaved.weeks)) if (!state.weeks.some(w => w.id === id)) delete uiSaved.weeks[id];
    try { localStorage.setItem(UI_KEY, JSON.stringify(uiSaved)); } catch (e) { /* not worth a warning */ }
  }
  function rememberSelection() {
    const mine = savedFor(state.currentWeek);
    if (mine.selected === (ui.selectedId || null)) return;
    mine.selected = ui.selectedId || null;
    saveUi();
  }
  function restoreScroll() {
    const mine = savedFor(state.currentWeek), el = $('#board-body');
    el.scrollTop = mine.top || 0;
    el.scrollLeft = mine.left || 0;
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

  // The week on the board, with its own regulars and one-offs (`unplaced`).
  // Settings and tags are global.
  function week() { return state.weeks.find(w => w.id === state.currentWeek); }

  const cloneLines = lines => (lines || []).map(n => ({ ...n }));

  // Planned blocks, then (review only) blocks that happened unplanned.
  const findBlock = id => week().blocks.find(b => b.id === id) || week().unplanned.find(b => b.id === id);
  const isUnplanned = b => !!b && week().unplanned.includes(b);
  function removeBlock(b) {
    week().blocks = week().blocks.filter(x => x !== b);
    week().unplanned = week().unplanned.filter(x => x !== b);
  }
  // A moved or resized block that ended up back where it was planned is
  // just "as planned" again.
  function tidyActual(b) {
    if (b && b.actual && b.actual.day === b.day && b.actual.start === b.start && b.actual.size === b.size) b.actual = null;
  }
  const findRegular = id => week().regulars.find(r => r.id === id);
  const findUnplaced = id => week().unplaced.find(u => u.id === id);

  // Same title → same colour, so "Gym" always looks like Gym.
  function colorFor(title) {
    const t = title.trim().toLowerCase();
    const match = week().regulars.find(r => r.title.toLowerCase() === t) || week().blocks.find(b => b.title.toLowerCase() === t);
    if (match) return match.color;
    let h = 0;
    for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % M.PALETTE.length;
  }

  // ---- rendering -----------------------------------------------------------

  // Review mode: rate and tag what you planned. The plan itself is locked.
  const reviewing = () => state.settings.mode === 'review';
  const RATING_LABEL = { 1: '✓', 2: '✓✓', 3: '✓✓✓', skip: 'didn’t happen', bad: '↘' };

  function setMode(mode) {
    if (state.settings.mode === mode) return;
    commitEditing();
    ui.ghost = null;
    closePopover();
    state.settings.mode = mode; // a view setting, so not an undo step
    save();
    render();
  }

  function setRating(id, rating) {
    const b = findBlock(id);
    if (!b || (b.rating ?? null) === rating) return;
    ui.selectedId = id;
    commit(() => { b.rating = rating; });
  }

  function render() {
    if (ui.selectedId && !findBlock(ui.selectedId)) ui.selectedId = null;
    rememberSelection();
    $('#week-name').textContent = week().name;
    document.body.classList.toggle('reviewing', reviewing());
    $$('[data-cmd="mode"]').forEach(b => b.classList.toggle('on', b.dataset.mode === state.settings.mode));
    $('#finish-btn').style.display = reviewing() ? '' : 'none';
    renderReviewBar();
    placeSidebar();
    renderSidebar();
    renderBoard();
    focusEditor();
  }

  const colorStyle = c => {
    const [fill, ink] = M.PALETTE[c] || M.PALETTE[0];
    return `background:${fill};color:${ink};--ring:${ink};`;
  };
  // One pip per grid line (two steps), like the size words.
  const pips = size => {
    const lines = Math.ceil(size / M.STEPS_PER_LINE);
    const n = Math.max(4, lines);
    return `<span class="pips">${Array.from({ length: n }, (_, i) => `<i class="${i < lines ? '' : 'off'}"></i>`).join('')}</span>`;
  };

  function renderSidebar() {
    const regulars = week().regulars.map(r => `
      <div class="chip" data-regular="${r.id}" style="${colorStyle(r.color)}" title="Drag onto a day · click to edit">
        <span class="truncate">${esc(r.title)}</span>
        ${r.zone ? `<span class="text-[11px] opacity-60">${M.zoneLabel(r.zone)}</span>` : ''}
        ${pips(r.size)}
      </div>`).join('');

    const unplaced = week().unplaced.map(u => {
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
        <h2 class="text-xs font-semibold tracking-wide mb-2" style="color:var(--muted)">ONE-OFFS</h2>
        <div id="unplaced-list" class="relative flex flex-col gap-1.5">${unplaced}</div>
        <input id="unplaced-input" class="field mt-2 !text-[13px]" placeholder="Something just for this week…" autocomplete="off">
      </section>

      <section class="mt-auto text-[11.5px] leading-relaxed" style="color:var(--muted)">
        <p><b class="font-semibold">Drag down</b> in a day to rough out a chunk, or click for a default one.</p>
        <p>Drag edges to resize. <b class="font-semibold">Double-click</b> for its focus notes. <b class="font-semibold">⌥-drag</b> to copy. Drop a regular on a <b class="font-semibold">day name</b> to put it in its usual spot.</p>
        <p>Drag a <b class="font-semibold">zone name</b> (noon-ish, afternoon…) to move where it starts. <b class="font-semibold">+ early / + evening</b> add the ends of the day; click the word to tuck it away.</p>
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
    // The button's panel line sits on the same side as the sidebar.
    $('[data-cmd="toggle-sidebar"] path').setAttribute('d', sidebar === 'right' ? 'M15 4v16' : 'M9 4v16');
  }

  function measureStep() {
    const steps = ui.range.end - ui.range.start;
    if (ui.printing) { ui.stepPx = PRINT_GRID_H / steps; return; }
    const addRows = !week().view.showEarly + !week().view.showEvening;
    const avail = $('#board-body').clientHeight - $('#board-head').offsetHeight - ADD_ROW_H * addRows
      - (reviewing() ? DAYNOTE_H : 0) - 2;
    // Fill the board exactly: the visible zones always use the full height.
    // (Only a very short window falls back to a minimum and scrolls.)
    ui.stepPx = Math.max(9, avail / steps);
  }

  function renderBoard() {
    // A redraw mid-edit (e.g. the board refitting because the tag bar grew)
    // mustn't lose what's being typed into a block's name.
    const live = document.querySelector('#board-grid [data-edit]');
    const keep = live && document.activeElement === live ? { value: live.value, at: live.selectionStart } : null;
    drawBoard();
    if (keep) {
      const input = document.querySelector('#board-grid [data-edit]');
      if (input) { input.value = keep.value; input.focus(); input.setSelectionRange(keep.at, keep.at); }
    }
  }

  function drawBoard() {
    ui.zones = M.zonesFor(week().zones);
    ui.range = M.visibleRange(week().view, ui.zones);
    const days = M.orderedDays(state.settings.weekStart, state.settings.visibleDays);
    const today = M.todayIndex();
    const { start: r0, end: r1 } = ui.range;
    // min-width makes the grid as wide as its columns, so the sticky gutter can pin all the way.
    const cols = `grid-template-columns: var(--gutter) repeat(${days.length || 1}, minmax(72px, 1fr)); min-width: calc(var(--gutter) + ${(days.length || 1) * 72}px)`;

    $('#board-head').innerHTML = `
      <div class="grid border-b" style="${cols}; border-color: var(--grid)">
        <div class="pin-left"></div>
        ${days.map(d => `<div class="day-head text-center py-2.5 text-sm font-semibold rounded-t-lg transition-colors whitespace-nowrap overflow-hidden text-ellipsis" data-day="${d}"
            title="${M.DAY_LONG[d]} · drop a regular here to put it in its usual spot">${M.DAY_NAMES[d]}${d === today ? '<span class="today-dot" title="Today"></span>' : ''}</div>`).join('')}
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
    // Zone breaks always get a line; otherwise a faint line every
    // STEPS_PER_LINE steps, so blocks can snap between the lines.
    for (let s = r0 + 1; s < r1; s++) {
      const isZone = ui.zones.some(z => z.start === s);
      if (isZone) lines.push(`<div class="zone-line" style="top:${(s - r0) * px}px"></div>`);
      else if (s % M.STEPS_PER_LINE === 0) lines.push(`<div class="step-line" style="top:${(s - r0) * px}px"></div>`);
    }
    const midday = M.zone('midday', ui.zones);
    const band = `<div class="band" style="top:${(midday.start - r0) * px}px; height:${midday.steps * px}px"></div>`;

    const rev = reviewing();
    const columns = days.map(d => {
      const ghost = ui.ghost && ui.ghost.day === d ? blockHtml({ ...ui.ghost, id: '_ghost', title: ui.ghost.title || '' }, { col: 0, cols: 1 }, true) : '';
      let body;
      if (rev) {
        // Review: each block where it actually happened (or as planned),
        // unplanned blocks too, and a faint ghost wherever the plan was.
        const shown = [
          ...week().blocks.map(b => ({ b, pos: M.effectivePos(b) })),
          ...week().unplanned.map(b => ({ b, pos: { day: b.day, start: b.start, size: b.size }, unplanned: true })),
        ].filter(x => x.pos.day === d);
        const layout = M.layoutDay(shown.map(x => ({ id: x.b.id, start: x.pos.start, size: x.pos.size })));
        const ghosts = week().blocks.filter(b => b.actual && b.day === d).map(planGhostHtml).join('');
        body = ghosts + shown.map(x => blockHtml({ ...x.b, ...x.pos }, layout[x.b.id], false, { unplanned: x.unplanned })).join('');
      } else {
        // Plan: the plan, plus unplanned blocks from review shown faintly so
        // mismatches are visible while planning.
        const blocks = week().blocks.filter(b => b.day === d);
        const layout = M.layoutDay(blocks);
        body = week().unplanned.filter(b => b.day === d).map(b => blockHtml(b, { col: 0, cols: 1 }, false, { unplanned: true, faint: true })).join('')
          + blocks.map(b => blockHtml(b, layout[b.id])).join('');
      }
      return `<div class="day-col relative" data-day="${d}" style="height:${height}px">
        ${band}${lines.join('')}
        ${body}
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
      ${reviewing() ? `<div class="grid" style="${cols}; height:${DAYNOTE_H}px">
        <div class="pin-left"></div>
        ${days.map(d => `<input class="dayline" data-daynote="${d}" value="${esc(week().dayNotes[d] || '')}" placeholder="How was ${M.DAY_NAMES[d]}?">`).join('')}
      </div>` : ''}
      ${week().view.showEvening ? '' : addRow('evening')}`;
  }

  // Where a moved or resized block was planned (review mode only).
  function planGhostHtml(b) {
    const px = ui.stepPx;
    const [, ink] = M.PALETTE[b.color] || M.PALETTE[0];
    return `<div class="plan-ghost ${b.id === ui.selectedId ? 'lit' : ''}" data-ghost-for="${b.id}"
      style="--ring:${ink}; top:${(b.start - ui.range.start) * px + 1.5}px; height:${b.size * px - 3}px" title="Planned here"></div>`;
  }

  function blockHtml(b, lay, isGhost = false, extra = {}) {
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
    const roomy = h >= px * 2 * M.STEPS_PER_LINE - 4; // two grid lines or more
    const tiny = h < 26;
    const faint = !!extra.faint; // an unplanned block, seen from plan mode
    const rev = reviewing() && !isGhost && !faint;
    if (extra.unplanned) cls.push('unplanned');
    if (faint) cls.push('faint-unplanned');
    // Focus: the shared "what's next" for this name, unless it just holds time.
    const holder = !isGhost && isTimeHolder(b.title);
    const next = isGhost || holder || extra.unplanned ? null : M.nextFocus(week(), b.title);
    const shownNext = !rev && !tiny && state.settings.showNext ? next : null;
    const hasNotes = !isGhost && (!!next || !!(b.session && b.session.trim()) || (rev && !!(b.review && b.review.trim())));
    const rating = b.rating ?? null;
    if (rev) cls.push(rating === null ? 'unrated' : `r-${rating}`);
    return `<div class="${cls.join(' ')}" data-block="${b.id}"
        style="${colorStyle(b.color)} top:${top}px; height:${h}px; left:${left}; width:${width}; ${tiny ? 'padding-top:2px;padding-bottom:2px;' : ''}">
      ${isGhost || faint ? '' : '<div class="edge top" data-edge="top"></div><div class="edge bottom" data-edge="bottom"></div>'}
      ${editing
        ? `<input data-edit value="${esc(b.title)}" placeholder="what’s this?">`
        : `<div class="title">${esc(b.title) || '<span style="opacity:.5">untitled</span>'}</div>
           ${rev && b.tags && b.tags.length && !tiny ? `<div class="tag-line">${b.tags.map(esc).join(' · ')}</div>`
             : shownNext ? `<div class="next-line">→ ${esc(shownNext)}</div>`
             : roomy ? `<div class="size-word">${M.sizeWord(b.size)}</div>` : ''}`}
      ${rev ? `<button class="rate ${rating === null ? 'empty' : typeof rating === 'number' ? '' : 'word'}" data-rate="${b.id}"
          title="How did it go?">${rating === null ? '✓?' : RATING_LABEL[rating]}</button>` : ''}
      ${hasNotes && !shownNext ? '<span class="has-notes" title="Has notes (double-click)">⋯</span>' : ''}
      ${rev && extra.unplanned ? `<div class="tools ${roomy ? 'at-bottom' : ''}">
        <button class="tool" data-action="delete" title="Delete this unplanned block (⌫)">×</button></div>` : ''}
      ${isGhost || rev || faint ? '' : `<div class="tools ${roomy ? 'at-bottom' : ''}">
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
    ui.addingTag = false;
    rememberSelection();
    $$('.block').forEach(el => el.classList.toggle('selected', el.dataset.block === id));
    $$('.plan-ghost').forEach(g => g.classList.toggle('lit', g.dataset.ghostFor === id));
    renderReviewBar();
  }

  // The tag chips along the bottom of the board, for the selected block.
  function renderReviewBar() {
    const bar = $('#review-bar');
    if (!reviewing()) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
    bar.style.display = '';
    const b = ui.selectedId && findBlock(ui.selectedId);
    if (!b) {
      bar.innerHTML = `<span class="review-hint">Select a block to rate or tag it. Tap its corner to cycle ✓ → ✓✓ → ✓✓✓;
        right-click for didn’t happen or unproductive; or use keys <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>−</kbd> <kbd>s</kbd> <kbd>0</kbd>.
        Arrow keys move between blocks; <kbd>Enter</kbd> opens one.</span>`;
      return;
    }
    const mine = b.tags || [];
    bar.innerHTML = `<span class="review-hint">Tags for <b>${esc(b.title || 'untitled')}</b>:</span>
      ${state.tags.map(t => `<button class="tag-chip ${mine.includes(t) ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
      ${ui.addingTag ? `<span class="tag-chip add"><input id="new-tag" placeholder="new tag" autocomplete="off"></span>`
        : '<button class="tag-chip add" data-cmd="add-tag">+ tag</button>'}`;
    if (ui.addingTag) $('#new-tag').focus();
  }

  // Hovering a moved block lights up the ghost of where it was planned, and
  // hovering the ghost lights up where the block ended up.
  document.addEventListener('pointerover', e => {
    const el = e.target.closest && e.target.closest('.block');
    const ghost = e.target.closest && e.target.closest('.plan-ghost');
    const gid = ghost && ghost.dataset.ghostFor;
    const id = (el && el.dataset.block) || gid;
    $$('.plan-ghost').forEach(g => g.classList.toggle('hot', !!id && g.dataset.ghostFor === id));
    $$('.block').forEach(b => b.classList.toggle('ghost-hot', !!gid && b.dataset.block === gid));
  });

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

    if (reviewing()) {
      // Review: moving or resizing records what actually happened (the plan
      // is untouched); drawing on empty space adds an unplanned block. A
      // plain click just selects.
      if (blockEl) {
        const b = findBlock(blockEl.dataset.block);
        if (!b) return;
        select(b.id);
        const edge = e.target.closest('[data-edge]');
        const pos = M.effectivePos(b);
        const rect = blockEl.closest('.day-col').getBoundingClientRect();
        beginDrag(e, { kind: edge ? 'resize-' + edge.dataset.edge : 'move', blockId: b.id, review: true,
          grab: stepAt(rect, e.clientY) - pos.start, orig: pos });
      } else if (colEl) {
        select(null);
        const rect = colEl.getBoundingClientRect();
        beginDrag(e, { kind: 'create', day: +colEl.dataset.day, anchor: Math.floor(stepAt(rect, e.clientY)), review: true, deselectOnly: true });
      }
      return;
    }

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
    document.body.classList.remove('dragging', 'resizing', 'creating', 'copying', 'carrying');
    if (d.active) DRAGS[d.kind].end(d, e);
    else if (DRAGS[d.kind].click) DRAGS[d.kind].click(d, e);
  });

  function cancelDrag() {
    const d = ui.drag;
    if (!d) return;
    ui.drag = null;
    document.body.classList.remove('dragging', 'resizing', 'creating', 'copying', 'carrying');
    if (d.floating) d.floating.remove();
    state = JSON.parse(d.snap);
    ui.ghost = null;
    render();
  }

  function startActive(d, e) {
    const body = document.body.classList;
    if (d.copy) {
      const b = findBlock(d.blockId);
      week().blocks.push({ ...b, id: M.newId(), session: '', rating: null, tags: [], review: '', actual: null });
      body.add('copying');
    } else if (d.kind === 'move' || d.kind === 'regular' || d.kind === 'unplaced') body.add('dragging');
    else if (d.kind === 'create') body.add('creating');
    else if (d.kind !== 'boundary' || d.movable) body.add('resizing');
    if (d.kind === 'regular' || d.kind === 'unplaced') {
      body.add('carrying'); // day names light up as drop targets
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

  // What a drag changes: the block itself in plan mode (and for unplanned
  // blocks); in review mode, the record of where it actually happened.
  function dragTarget(d, b) {
    if (!d.review || isUnplanned(b)) return b;
    if (!b.actual) b.actual = { day: b.day, start: b.start, size: b.size };
    return b.actual;
  }

  const DRAGS = {
    move: {
      move(d, e) {
        const b = findBlock(d.blockId), p = dragTarget(d, b);
        d.toUnplaced = !d.review && overUnplaced(e.clientX, e.clientY);
        $('#unplaced-drop').classList.toggle('drop-hot', d.toUnplaced);
        const col = columnAt(e.clientX, e.clientY, true);
        if (col) {
          p.day = col.day;
          Object.assign(p, M.clampBlock(stepAt(col.rect, e.clientY) - d.grab, p.size, ui.range));
        }
        renderBoard();
      },
      end(d) {
        if (d.review) { tidyActual(findBlock(d.blockId)); return settle(d); }
        if (d.toUnplaced) {
          const b = findBlock(d.blockId);
          week().blocks = week().blocks.filter(x => x !== b);
          week().unplaced.push({ id: b.id, title: b.title || 'untitled', size: b.size, color: b.color, session: b.session || '' });
          ui.selectedId = null;
          toast('Moved to one-offs');
        }
        settle(d);
      },
    },

    'resize-top': {
      move(d, e) {
        const p = dragTarget(d, findBlock(d.blockId));
        const col = $(`.day-col[data-day="${p.day}"]`).getBoundingClientRect();
        const end = d.orig.start + d.orig.size;
        const start = Math.max(ui.range.start, Math.min(end - 1, Math.round(stepAt(col, e.clientY))));
        p.start = start; p.size = end - start;
        renderBoard();
      },
      end(d) { if (d.review) tidyActual(findBlock(d.blockId)); settle(d); },
    },

    'resize-bottom': {
      move(d, e) {
        const p = dragTarget(d, findBlock(d.blockId));
        const col = $(`.day-col[data-day="${p.day}"]`).getBoundingClientRect();
        const end = Math.min(ui.range.end, Math.max(p.start + 1, Math.round(stepAt(col, e.clientY))));
        p.size = end - p.start;
        renderBoard();
      },
      end(d) { if (d.review) tidyActual(findBlock(d.blockId)); settle(d); },
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
        createBlock(d.day, g.start, g.size, !!d.review);
      },
      click(d) {
        if (d.deselectOnly) return;
        createBlock(d.day, ...Object.values(M.clampBlock(d.anchor, 2 * M.STEPS_PER_LINE, ui.range)));
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
        const col = headDay == null ? columnAt(e.clientX, e.clientY) : null;
        let ghost = null;
        if (headDay != null) {
          ghost = { day: headDay, start: M.firstFreeGap(week().blocks, headDay, item.size, item.zone || null, ui.range, ui.zones), size: item.size };
        } else if (col) {
          const c = M.clampBlock(stepAt(col.rect, e.clientY) - item.size / 2, item.size, ui.range);
          ghost = { day: col.day, ...c };
        }
        const was = JSON.stringify(ui.ghost);
        ui.ghost = ghost && { ...ghost, color: item.color, title: item.title };
        d.floating.style.visibility = ghost ? 'hidden' : 'visible';
        if (JSON.stringify(ui.ghost) !== was) renderBoard();
        // After any re-render (which rebuilds the header): the hovered day
        // name says where the item will land.
        $$('.day-head').forEach(h => {
          const hot = +h.dataset.day === headDay;
          h.classList.toggle('drop-hot', hot);
          if (hot) h.dataset.hint = item.zone ? M.zoneLabel(item.zone) : 'whenever';
        });
      },
      end(d) {
        d.floating.remove();
        showReorderLine(null);
        $$('.day-head').forEach(h => h.classList.remove('drop-hot'));
        const g = ui.ghost, item = find(d.sourceId);
        ui.ghost = null;
        if (d.reorderTo != null && item) {
          const key = own.list;
          week()[key] = M.moveItem(week()[key], week()[key].indexOf(item), d.reorderTo);
          return settle(d);
        }
        if (!g || !item) return render();
        const id = consume ? item.id : M.newId();
        week().blocks.push({ id, day: g.day, start: g.start, size: g.size, title: item.title, color: item.color,
          session: consume ? item.session || '' : '', rating: null, tags: [] });
        // A regular's starting lines seed this week's focus for its name, once.
        const key = M.threadKey(item.title);
        if (!consume && item.notes && item.notes.length && !(week().focus[key] || []).length && !isTimeHolder(item.title)) {
          week().focus[key] = cloneLines(item.notes);
        }
        if (consume) week().unplaced = week().unplaced.filter(u => u !== item);
        ui.selectedId = id;
        settle(d);
      },
      click(d) {
        if (consume) return;
        // Pressing the pill whose editor was open just closes it (a toggle).
        if (closedFor === 'regular:' + d.sourceId) { closedFor = null; return; }
        editRegular(d.sourceId, d.sourceEl);
      },
    };
  }

  function setZone(zoneId, show) {
    const key = zoneId === 'early' ? 'showEarly' : 'showEvening';
    const occupied = [...week().blocks, ...week().blocks.filter(b => b.actual).map(b => b.actual), ...week().unplanned];
    if (!show && !M.canHide(zoneId, occupied, ui.zones)) {
      toast(`Move the ${zoneId} blocks out first`);
      return false;
    }
    week().view[key] = show;
    render();
    return true;
  }

  function createBlock(day, start, size, unplanned = false) {
    const b = { id: M.newId(), day, start, size, title: '', color: 7, session: '', rating: null, tags: [], review: '' };
    pushUndo();
    if (unplanned) week().unplanned.push(b);
    else { b.actual = null; week().blocks.push(b); }
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
        removeBlock(b);
        undoStack.pop();
      } else if (!cancel && value !== b.title) {
        if (!ed.isNew) pushUndo();
        if (ed.isNew) { b.color = colorFor(value); b.title = value; } // colour first, so it can't match itself
        else renameBlock(b, value);
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
    if (t.id === 'new-tag') {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tag = t.value.trim().toLowerCase();
        const b = ui.selectedId && findBlock(ui.selectedId);
        ui.addingTag = false;
        if (!tag || !b) return renderReviewBar();
        commit(s => {
          if (!s.tags.includes(tag)) s.tags.push(tag);
          if (!(b.tags || []).includes(tag)) b.tags = [...(b.tags || []), tag];
        });
      } else if (e.key === 'Escape') { e.preventDefault(); ui.addingTag = false; renderReviewBar(); }
      return;
    }
    if (t.matches && t.matches('.dayline') && e.key === 'Enter') { t.blur(); return; }
    if (t.matches && t.matches('[data-edit]')) {
      if (e.key === 'Enter') { e.preventDefault(); commitEditing(); }
      else if (e.key === 'Escape') { e.preventDefault(); commitEditing(true); }
      return;
    }
    if (t.id === 'unplaced-input' && e.key === 'Enter') {
      const title = t.value.trim();
      if (title) {
        commit(s => week().unplaced.push({ id: M.newId(), title, size: 2 * M.STEPS_PER_LINE, color: colorFor(title), session: '' }));
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
    if (!mod && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      return navigate(e.key);
    }
    if (e.key === 'Enter' && ui.selectedId && findBlock(ui.selectedId)) {
      e.preventDefault();
      return openBlockDialog(ui.selectedId);
    }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (reviewing()) {
      const keys = { '1': 1, '2': 2, '3': 3, '-': 'bad', '−': 'bad', s: 'skip', S: 'skip', '0': null };
      if (!mod && ui.selectedId && e.key in keys) { e.preventDefault(); setRating(ui.selectedId, keys[e.key]); }
      const sel = ui.selectedId && findBlock(ui.selectedId);
      if ((e.key === 'Delete' || e.key === 'Backspace') && isUnplanned(sel)) {
        e.preventDefault();
        ui.selectedId = null;
        commit(() => removeBlock(sel));
      }
      return; // planned blocks can't be deleted or renamed while reviewing
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selectedId) {
      e.preventDefault();
      const id = ui.selectedId;
      ui.selectedId = null;
      commit(() => { week().blocks = week().blocks.filter(b => b.id !== id); });
    }
  });

  // Arrow keys: move the selection between blocks as they're shown (in
  // review, where they actually happened, unplanned ones included).
  function navigate(key) {
    const days = M.orderedDays(state.settings.weekStart, state.settings.visibleDays);
    const items = reviewing()
      ? [...week().blocks.map(b => ({ id: b.id, ...M.effectivePos(b) })), ...week().unplanned.map(b => ({ id: b.id, day: b.day, start: b.start, size: b.size }))]
      : week().blocks.map(b => ({ id: b.id, day: b.day, start: b.start, size: b.size }));
    const id = M.navTarget(items, days, ui.selectedId, key);
    if (id && id !== ui.selectedId) select(id);
  }

  // "How was Tue?": saved when you leave the field (one undo step).
  document.addEventListener('change', e => {
    if (!e.target.matches || !e.target.matches('[data-daynote]')) return;
    const d = +e.target.dataset.daynote, v = e.target.value.trim();
    if ((week().dayNotes[d] || '') !== v) commit(() => { week().dayNotes[d] = v; });
  });

  // Review mode: right-click a block for the ratings that aren't ticks.
  document.addEventListener('contextmenu', e => {
    if (!reviewing()) return;
    const blockEl = e.target.closest('.block:not(.ghost)');
    if (!blockEl) return;
    e.preventDefault();
    const id = blockEl.dataset.block;
    select(id);
    const b = findBlock(id), unplanned = isUnplanned(b);
    const at = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
    openPopover(at, `
      ${unplanned ? '' : '<button class="menu-item" data-r="skip">Didn’t happen</button>'}
      <button class="menu-item" data-r="bad">Unproductive</button>
      <button class="menu-item" data-r="">Clear rating</button>
      ${b.actual ? '<div class="menu-sep"></div><button class="menu-item" data-act="unmove">Back to plan</button>' : ''}
      ${unplanned ? '<div class="menu-sep"></div><button class="menu-item danger" data-act="delete">Delete (unplanned)</button>' : ''}`, el => {
      el.style.width = '220px';
      el.style.padding = '6px';
      el.addEventListener('click', ev => {
        const item = ev.target.closest('[data-r], [data-act]');
        if (!item) return;
        closePopover();
        if (item.dataset.act === 'unmove') return commit(() => { b.actual = null; });
        if (item.dataset.act === 'delete') { ui.selectedId = null; return commit(() => removeBlock(b)); }
        setRating(id, item.dataset.r || null);
      });
    });
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

  // ---- focus notes -----------------------------------------------------------
  // Every block with the same name this week shares one short focus list;
  // the top open line is what's next. It's a pointer to keep moving, not a
  // to-do list. Each block also has an optional one-line session note.
  // Names on the time-holder list just hold time: one free text box, no
  // focus list.

  const SOFT_LIMIT = 5; // open lines before a gentle "keep it broad?"
  const cleanFocus = items => items.filter(x => x.text.trim()).map(x => ({ text: x.text.trim(), done: !!x.done }));
  const isTimeHolder = title => state.timeHolders.includes(M.threadKey(title));
  const focusOf = title => (week().focus[M.threadKey(title)] || []);

  // A block's name changed: if it was the last block of its old name, its
  // focus follows it (unless the new name already has one).
  function renameBlock(b, title) {
    const from = M.threadKey(b.title), to = M.threadKey(title);
    b.title = title;
    if (isUnplanned(b)) return;
    if (from === to || !from) return;
    const f = week().focus;
    const others = week().blocks.some(x => x !== b && M.threadKey(x.title) === from);
    if (!others && f[from] && f[from].length && !(f[to] && f[to].length)) { f[to] = f[from]; delete f[from]; }
  }

  // The focus list editor: one input per line, drag the grip to reorder,
  // tick to fold a line into "done". With ticks off (a regular's starting
  // lines) it's just an ordered list.
  function mountFocus(host, items, { ticks = true, emptyHint = '' } = {}) {
    let showDone = false, dragFrom = null;
    const draw = focusAt => {
      if (!items.some(x => !x.done)) items.push({ text: '', done: false });
      const open = items.filter(x => !x.done), done = items.filter(x => x.done);
      const next = ticks && open.find(x => x.text.trim());
      const filled = open.filter(x => x.text.trim()).length;
      host.innerHTML = `
        <div class="focus-list">${open.map(x => {
          const i = items.indexOf(x);
          return `<div class="fitem" draggable="true" data-i="${i}">
            <span class="grip" title="Drag to change what comes first">⋮⋮</span>
            ${ticks ? `<button class="ftick" data-tick="${i}" title="Done"></button>` : ''}
            <input class="ftext" data-i="${i}" value="${esc(x.text)}" placeholder="${open.length === 1 ? (ticks ? 'What’s first? (optional)' : 'A line to start each week with (optional)') : ''}">
            ${x === next ? '<span class="next-pill">next</span>' : ''}
          </div>`; }).join('')}</div>
        ${emptyHint && !filled && !done.length ? `<div class="fhint">${emptyHint}</div>` : ''}
        ${filled > SOFT_LIMIT ? '<div class="fsoft">That’s a lot for one intent. Keep it broad?</div>' : ''}
        ${ticks && done.length ? `<button class="done-toggle" data-done-toggle>${showDone ? '▾' : '▸'} Done this week (${done.length})</button>
          ${showDone ? done.map(x => `<div class="done-item"><button class="ftick on" data-untick="${items.indexOf(x)}" title="Not done after all">✓</button><span>${esc(x.text)}</span></div>`).join('') : ''}` : ''}`;
      if (focusAt != null) {
        const input = host.querySelector(`.ftext[data-i="${focusAt}"]`);
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      }
    };
    host.addEventListener('input', e => { if (e.target.matches('.ftext')) items[+e.target.dataset.i].text = e.target.value; });
    host.addEventListener('click', e => {
      const t = e.target.closest('[data-tick], [data-untick], [data-done-toggle]');
      if (!t) return;
      if (t.dataset.tick != null) { const it = items[+t.dataset.tick]; if (it.text.trim()) it.done = true; }
      else if (t.dataset.untick != null) items[+t.dataset.untick].done = false;
      else showDone = !showDone;
      draw();
    });
    host.addEventListener('keydown', e => {
      if (!e.target.matches('.ftext')) return;
      const i = +e.target.dataset.i;
      const openIdx = items.map((x, k) => (x.done ? -1 : k)).filter(k => k >= 0);
      const pos = openIdx.indexOf(i);
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        items.splice(i + 1, 0, { text: '', done: false });
        draw(i + 1);
      } else if (e.key === 'Backspace' && e.target.value === '' && openIdx.length > 1) {
        e.preventDefault();
        items.splice(i, 1);
        const prev = openIdx[pos - 1];
        draw(prev != null ? prev : null);
      } else if (e.key === 'ArrowUp' && pos > 0) { e.preventDefault(); draw(openIdx[pos - 1]); }
      else if (e.key === 'ArrowDown' && pos < openIdx.length - 1) { e.preventDefault(); draw(openIdx[pos + 1]); }
    });
    // Drag lines to reorder: up lands before the target, down after it.
    host.addEventListener('dragstart', e => { const it = e.target.closest('.fitem'); if (!it) return; dragFrom = +it.dataset.i; it.classList.add('dragging'); });
    host.addEventListener('dragover', e => { const it = e.target.closest('.fitem'); if (!it || dragFrom == null) return; e.preventDefault();
      host.querySelectorAll('.fitem').forEach(x => x.classList.toggle('over', x === it)); });
    host.addEventListener('drop', e => {
      const it = e.target.closest('.fitem'); if (!it || dragFrom == null) return; e.preventDefault();
      const [moved] = items.splice(dragFrom, 1);
      items.splice(+it.dataset.i, 0, moved);
      dragFrom = null; draw();
    });
    host.addEventListener('dragend', () => { dragFrom = null; host.querySelectorAll('.fitem').forEach(x => x.classList.remove('dragging', 'over')); });
    draw(null);
    const firstOpen = () => items.findIndex(x => !x.done);
    return { focusFirst: () => draw(firstOpen()) };
  }

  // Double-click a block: its focus (shared with same-named blocks this
  // week) and its session line, with the cursor in the focus list.
  function openBlockDialog(id) {
    const b = findBlock(id);
    if (!b) return;
    closePopover();
    select(id);
    if (reviewing()) return openReviewDialog(b);
    const before = snapshot();
    const key = M.threadKey(b.title);
    const items = focusOf(b.title).map(x => ({ ...x }));
    let holder = isTimeHolder(b.title);
    let session = b.session || '';
    const siblings = week().blocks.filter(x => M.threadKey(x.title) === key)
      .sort((x, y) => M.orderedDays(state.settings.weekStart, state.settings.visibleDays).indexOf(x.day) - M.orderedDays(state.settings.weekStart, state.settings.visibleDays).indexOf(y.day) || x.start - y.start);
    const [fill, ink] = M.PALETTE[b.color] || M.PALETTE[0];
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog" role="dialog" aria-label="Block notes">
        <div class="dialog-head" style="background:${fill}; color:${ink}">
          <div class="flex items-start gap-2">
            <input class="dialog-title" value="${esc(b.title)}" placeholder="untitled">
            <button class="holder-btn" data-do="holder"></button>
          </div>
          <div class="text-xs opacity-80 mt-0.5">${siblings.length > 1
            ? `Shared by <b>${siblings.length} blocks</b> this week: ${siblings.map(x => x === b ? `<b>${M.DAY_NAMES[x.day]}</b>` : M.DAY_NAMES[x.day]).join(' · ')}`
            : `${M.DAY_LONG[b.day]} · ${M.zoneLabel(M.zoneAt(b.start, ui.zones))} · ${M.sizeWord(b.size)}`}</div>
        </div>
        <div class="dialog-body"></div>
        <div class="flex items-center px-4 pb-4 pt-1">
          <span class="text-[11.5px] keys" style="color:var(--muted)"></span>
          <button class="btn primary ml-auto" data-do="done">Done</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const body = overlay.querySelector('.dialog-body');
    let editor = null;

    const drawBody = () => {
      overlay.querySelector('[data-do="holder"]').textContent = holder ? '◉ just holding time' : '○ just holding time';
      overlay.querySelector('[data-do="holder"]').title = holder
        ? `“${b.title || 'untitled'}” just holds time. Click to give it a focus list again.`
        : `Nothing to track for “${b.title || 'untitled'}”? Mark it as just holding time (for every block with this name).`;
      overlay.querySelector('.keys').textContent = holder ? 'Esc or ⌘Enter to close' : 'Enter: new line · drag ⋮⋮ to reorder · Esc to close';
      if (holder) {
        body.innerHTML = `<div class="dialog-sec"><textarea class="session-box" rows="3" placeholder="Anything about this one? (optional)">${esc(session)}</textarea></div>`;
        const box = body.querySelector('.session-box');
        box.addEventListener('input', () => { session = box.value; });
        box.focus();
        editor = null;
        return;
      }
      body.innerHTML = `
        <div class="dialog-sec"><h3>Focus this week</h3><div class="focus-host"></div></div>
        <div class="dialog-sec"><h3>This session · ${M.DAY_LONG[b.day]}</h3>
          <input class="session-line" value="${esc(session)}" placeholder="Anything just for this block? (optional)"></div>`;
      body.querySelector('.session-line').addEventListener('input', e => { session = e.target.value; });
      editor = mountFocus(body.querySelector('.focus-host'), items, { emptyHint: 'Nothing to track? That’s fine. Some blocks just hold the time.' });
      editor.focusFirst();
    };
    drawBody();

    const close = () => {
      overlay.remove();
      const title = overlay.querySelector('.dialog-title').value.trim();
      const focus = cleanFocus(items);
      const was = { focus: JSON.stringify(focusOf(b.title)), holder: isTimeHolder(b.title), session: b.session || '', title: b.title };
      const changed = JSON.stringify(focus) !== was.focus || holder !== was.holder || session.trim() !== was.session || (title && title !== was.title);
      if (changed) {
        pushUndo(before);
        if (focus.length) week().focus[key] = focus; else delete week().focus[key];
        state.timeHolders = state.timeHolders.filter(k => k !== key);
        if (holder) state.timeHolders.push(key);
        b.session = session.trim();
        if (title && title !== b.title) renameBlock(b, title);
        save();
      }
      render();
    };
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });
    overlay.addEventListener('click', e => {
      const d = e.target.closest('[data-do]');
      if (!d) return;
      if (d.dataset.do === 'done') close();
      else if (d.dataset.do === 'holder') { holder = !holder; drawBody(); }
    });
    overlay.addEventListener('keydown', e => {
      e.stopPropagation(); // keep ⌫, ⌘Z etc. away from the board underneath
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); close(); }
      else if (e.key === 'Enter' && e.target.matches('.dialog-title, .session-line')) {
        e.preventDefault();
        if (editor && e.target.matches('.dialog-title')) editor.focusFirst(); else e.target.blur();
      }
    });
  }

  // Review mode: the plan side (focus, session line) is shown read-only;
  // the one thing to write is this block's own review.
  function openReviewDialog(b) {
    const before = snapshot();
    const key = M.threadKey(b.title);
    const holder = isTimeHolder(b.title);
    const items = holder ? [] : focusOf(b.title);
    const open = items.filter(x => !x.done), done = items.filter(x => x.done);
    const next = open.find(x => x.text.trim());
    const [fill, ink] = M.PALETTE[b.color] || M.PALETTE[0];
    const shared = week().blocks.filter(x => M.threadKey(x.title) === key).length;
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog" role="dialog" aria-label="Review this block">
        <div class="dialog-head" style="background:${fill}; color:${ink}">
          ${isUnplanned(b) ? `<input class="dialog-title" value="${esc(b.title)}" placeholder="what was it?">` : `<div class="dialog-title">${esc(b.title || 'untitled')}</div>`}
          <div class="text-xs opacity-80 mt-0.5">${isUnplanned(b) ? 'Unplanned · ' : b.actual ? 'Moved from the plan · ' : ''}${M.DAY_LONG[M.effectivePos(b).day]} · ${M.zoneLabel(M.zoneAt(M.effectivePos(b).start, ui.zones))} · ${M.sizeWord(M.effectivePos(b).size)}${shared > 1 ? ` · focus shared by ${shared} blocks` : ''}</div>
        </div>
        <div class="dialog-body">
          ${items.length ? `<div class="dialog-sec"><h3>Focus this week <span class="ro">(as planned)</span></h3>
            ${open.map(x => `<div class="ro-item">○ ${esc(x.text)}${x === next ? ' <span class="next-pill">next</span>' : ''}</div>`).join('')}
            ${done.map(x => `<div class="ro-item done">✓ ${esc(x.text)}</div>`).join('')}</div>` : ''}
          ${b.session && b.session.trim() ? `<div class="dialog-sec"><h3>${holder ? 'Note' : 'This session'} <span class="ro">(as planned)</span></h3>
            <div class="ro-item">${esc(b.session)}</div></div>` : ''}
          <div class="dialog-sec"><h3>${isUnplanned(b) ? 'What happened' : 'Review'} · ${M.DAY_LONG[M.effectivePos(b).day]}</h3>
            <textarea class="session-box review-box" rows="3" placeholder="${isUnplanned(b) ? 'What was it, and how did it go?' : 'How did this block go?'}">${esc(b.review || '')}</textarea></div>
        </div>
        <div class="flex items-center px-4 pb-4 pt-1">
          ${isUnplanned(b) ? '<button class="btn danger" data-do="delete">Delete</button>'
            : '<span class="text-[11.5px]" style="color:var(--muted)">The plan is read-only while reviewing · Esc or ⌘Enter to close</span>'}
          <button class="btn primary ml-auto" data-do="done">Done</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const box = overlay.querySelector('.review-box');
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);

    const titleInput = overlay.querySelector('input.dialog-title');
    const close = () => {
      overlay.remove();
      const text = box.value.trim();
      const title = titleInput ? titleInput.value.trim() : b.title;
      if (text !== (b.review || '') || (title && title !== b.title)) {
        pushUndo(before);
        b.review = text;
        if (title) b.title = title;
        save();
      }
      render();
    };
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });
    overlay.addEventListener('click', e => {
      if (e.target.closest('[data-do="done"]')) close();
      else if (e.target.closest('[data-do="delete"]')) {
        overlay.remove();
        ui.selectedId = null;
        commit(() => removeBlock(b));
      }
    });
    overlay.addEventListener('keydown', e => {
      e.stopPropagation(); // keep 1/2/3, ⌫ and ⌘Z away from the board underneath
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); close(); }
    });
  }

  // ---- clicks: block tools, sidebar, header commands -----------------------

  document.addEventListener('click', e => {
    const rate = e.target.closest('[data-rate]');
    if (rate) return setRating(rate.dataset.rate, M.nextRating(findBlock(rate.dataset.rate).rating ?? null));
    const chip = e.target.closest('[data-tag]');
    if (chip && ui.selectedId) {
      const b = findBlock(ui.selectedId), t = chip.dataset.tag, mine = b.tags || [];
      return commit(() => { b.tags = mine.includes(t) ? mine.filter(x => x !== t) : [...mine, t]; });
    }
    const act = e.target.closest('[data-action]');
    if (act) {
      const blockEl = act.closest('[data-block]');
      const id = blockEl && blockEl.dataset.block;
      switch (act.dataset.action) {
        case 'delete':
          ui.selectedId = null;
          return commit(() => removeBlock(findBlock(id)));
        case 'duplicate': {
          const b = findBlock(id);
          const days = M.orderedDays(state.settings.weekStart, state.settings.visibleDays);
          const spot = M.duplicateSpot(week().blocks, b, days, ui.range, ui.zones);
          const copy = { ...b, id: M.newId(), ...spot, session: '', rating: null, tags: [], review: '', actual: null };
          ui.selectedId = copy.id;
          commit(() => week().blocks.push(copy));
          if (spot.day !== b.day) toast(`No room after it, so the copy went to ${M.DAY_LONG[spot.day]}`);
          return;
        }
        case 'color':
          return commit(() => { const b = findBlock(id); b.color = (b.color + 1) % M.PALETTE.length; });
        case 'make-regular': {
          const b = findBlock(id);
          if (week().regulars.some(r => r.title.toLowerCase() === b.title.toLowerCase())) return toast(`“${b.title}” is already a regular`);
          commit(s => week().regulars.push({ id: M.newId(), title: b.title || 'untitled', size: b.size, color: b.color, zone: M.zoneAt(b.start, ui.zones),
            notes: focusOf(b.title).filter(x => !x.done).map(x => ({ text: x.text, done: false })) }));
          return toast(`Saved “${b.title || 'untitled'}” as a regular`);
        }
        case 'drop-unplaced': {
          const uid = act.closest('[data-unplaced]').dataset.unplaced;
          return commit(s => { week().unplaced = week().unplaced.filter(u => u.id !== uid); });
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
      case 'more': return openMore(cmd);
      case 'new-regular': return editRegular(null, cmd);
      case 'print': return window.print();
      case 'finish': return openFinish();
      case 'mode': return setMode(cmd.dataset.mode);
      case 'add-tag': ui.addingTag = true; return renderReviewBar();
      case 'toggle-sidebar': return commit(s => { s.settings.sidebarHidden = !s.settings.sidebarHidden; });
      case 'show-zone':
        pushUndo();
        if (setZone(cmd.dataset.zone, true)) save(); else undoStack.pop();
        return;
    }
  });

  // ---- popovers ------------------------------------------------------------

  let popover = null;
  // Which sidebar pill the open popover belongs to (e.g. 'regular:<id>'),
  // so pressing the same pill again closes it instead of reopening it.
  let popoverFor = null, closedFor = null;
  function openPopover(anchor, html, mount, forKey = null) {
    closePopover();
    popoverFor = forKey;
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
    popoverFor = null;
    return true;
  }
  document.addEventListener('pointerdown', e => {
    const pill = e.target.closest('[data-regular]');
    closedFor = pill && popoverFor === 'regular:' + pill.dataset.regular ? popoverFor : null;
    if (popover && !popover.contains(e.target) && !e.target.closest('[data-cmd="settings"], [data-cmd="new-regular"], [data-cmd="weeks"], [data-cmd="more"]')) closePopover();
  }, true);

  const SIZE_OPTS = [[2, 'a smidge'], [4, 'a bit'], [6, 'a good bit'], [8, 'a big chunk'], [12, 'loads']];

  function editRegular(id, anchor) {
    const existing = id && findRegular(id);
    const draft = existing ? { ...existing, notes: cloneLines(existing.notes) } : { title: '', size: 4, color: 1, zone: null, notes: [] };
    openPopover(anchor, `
      <label>name</label>
      <input class="field" data-f="title" value="${esc(draft.title)}" placeholder="e.g. Gym">
      <label>roughly how much</label>
      <div class="seg" data-f="size">${SIZE_OPTS.map(([n, w]) => `<button data-v="${n}">${w}</button>`).join('')}</div>
      <label>usually</label>
      <div class="seg" data-f="zone"><button data-v="" title="No usual spot: dropped on a day name, it takes the first free gap">whenever</button>${M.ZONES.map(z => `<button data-v="${z.id}">${z.label}</button>`).join('')}</div>
      <label>colour</label>
      <div class="flex gap-1.5" data-f="color">${M.PALETTE.map(([fill, ink], i) => `<button class="swatch" data-v="${i}" style="background:${fill}; box-shadow: inset 0 0 0 1px ${ink}33"></button>`).join('')}</div>
      <label>starts each week’s focus with</label>
      <div data-f="notes" class="-mx-1"></div>
      <div class="flex items-center gap-2 mt-4">
        ${existing ? '<button class="btn danger" data-do="delete">Delete</button>' : ''}
        <button class="btn ml-auto" data-do="cancel">Cancel</button>
        <button class="btn primary" data-do="save">${existing ? 'Save' : 'Add'}</button>
      </div>`, el => {
      const sync = () => {
        el.querySelectorAll('[data-f="size"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === draft.size));
        el.querySelectorAll('[data-f="zone"] button').forEach(b => b.classList.toggle('on', (b.dataset.v || null) === draft.zone));
        el.querySelectorAll('[data-f="color"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === draft.color));
      };
      sync();
      mountFocus(el.querySelector('[data-f="notes"]'), draft.notes, { ticks: false });
      const title = el.querySelector('[data-f="title"]');
      title.focus();
      const doSave = () => {
        draft.notes = cleanFocus(draft.notes).map(x => ({ text: x.text, done: false }));
        draft.title = title.value.trim();
        if (!draft.title) { title.focus(); return; }
        commit(s => {
          if (existing) Object.assign(findRegular(id), draft);
          else week().regulars.push({ ...draft, id: M.newId() });
        });
        closePopover();
      };
      title.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
      el.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const f = b.parentElement.dataset.f;
        if (f === 'size') draft.size = +b.dataset.v;
        else if (f === 'zone') draft.zone = b.dataset.v || null;
        else if (f === 'color') draft.color = +b.dataset.v;
        else if (b.dataset.do === 'save') return doSave();
        else if (b.dataset.do === 'cancel') return closePopover();
        else if (b.dataset.do === 'delete') {
          commit(s => { week().regulars = week().regulars.filter(r => r.id !== id); });
          return closePopover();
        }
        sync();
      });
    }, id ? 'regular:' + id : null);
  }

  // ---- weeks: the header dropdown -------------------------------------------
  // Each week is a live, named board: switching to one and changing it
  // changes that week. New weeks start blank or as a copy of this one.

  function switchWeek(id) {
    ui.selectedId = savedFor(id).selected || null;
    ui.editing = null;
    commit(s => { s.currentWeek = id; });
    restoreScroll();
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
      <button class="menu-item" data-do="new">+ New week…</button>
      <div class="menu-sep"></div>
      <button class="menu-item" data-do="rename">Rename this week…</button>
      <button class="menu-item danger" data-do="delete" ${state.weeks.length < 2 ? 'disabled title="It’s the only week"' : ''}>Delete this week…</button>`, el => {
      // Swap the menu for a one-field name form.
      const askName = (label, initial, done, extra = '', okLabel = 'OK') => {
        el.innerHTML = `
          <label>${label}</label>
          <input class="field" data-f="name" value="${esc(initial)}">
          ${extra}
          <div class="flex items-center gap-2 mt-3">
            <button class="btn ml-auto" data-do="cancel">Cancel</button>
            <button class="btn primary" data-do="ok">${okLabel}</button>
          </div>`;
        mountKeep(el, 'newWeek');
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
          case 'new':
            return askName('name the new week', 'New week', name => {
              const w = M.carryWeek(cur, state.settings.newWeek, name);
              ui.selectedId = null;
              commit(s => { s.weeks.push(w); s.currentWeek = w.id; });
            }, `<label>keep from this week</label>${keepHtml(state.settings.newWeek)}`, 'Create');
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

  // ---- carrying a week forward: New week and Finish week ---------------

  const KEEP_OPTS = [
    ['schedule', 'Keep the schedule', 'the planned blocks, without any of the review'],
    ['regulars', 'Keep regulars', ''],
    ['oneOffs', 'Keep one-offs', ''],
  ];
  const keepHtml = keep => KEEP_OPTS.map(([k, label, hint]) => `
    <label class="keep-opt"><input type="checkbox" data-keep="${k}" ${keep[k] ? 'checked' : ''}>
      <span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`).join('');
  // The ticks are remembered (per dialog) as settings, not undo steps.
  function mountKeep(el, which) {
    el.querySelectorAll('[data-keep]').forEach(box => box.addEventListener('change', () => {
      state.settings[which][box.dataset.keep] = box.checked;
      save();
    }));
  }

  const ARCHIVE_KEY = 'schedule-ish:archive';
  // Finished weeks, kept whole, keyed by when they were finished. Written
  // here and nowhere else; nothing reads them back yet. False if it failed.
  function archiveWeek(entry) {
    try {
      const all = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '{}');
      all[entry.finishedAt] = entry;
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(all));
      return true;
    } catch (e) {
      console.warn('schedule-ish: could not archive', e);
      return false;
    }
  }

  function download(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const fileSlug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'week';

  // Review only. Nothing is saved until "Finish week" is pressed; then the
  // week goes to the archive as it stands and is reset in place (same name)
  // with what the ticks keep. One undo step brings it all back.
  function openFinish() {
    if (!reviewing()) return;
    commitEditing();
    closePopover();
    const cur = week();
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog" role="dialog" aria-label="Finish this week">
        <div class="dialog-head" style="background:#f1ece3">
          <div class="dialog-title">Finish “${esc(cur.name)}”</div>
          <div class="text-xs mt-0.5" style="color:var(--muted)">Everything here, plan and review, is saved to the archive first.</div>
        </div>
        <div class="dialog-body">
          <div class="dialog-sec"><h3>Before you go</h3>
            <div class="finish-links">
              <button class="btn" data-do="print">Print this week</button>
              <button class="btn" data-do="export">Export this week</button>
            </div></div>
          <div class="dialog-sec"><h3>Start the next week</h3>${keepHtml(state.settings.finishWeek)}</div>
        </div>
        <div class="flex items-center gap-2 px-4 pb-4 pt-1">
          <span class="text-[11.5px]" style="color:var(--muted)">⌘Z undoes it</span>
          <button class="btn ml-auto" data-do="cancel">Cancel</button>
          <button class="btn primary" data-do="finish">Finish week</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    mountKeep(overlay, 'finishWeek');
    overlay.querySelector('[data-do="finish"]').focus();

    const close = () => overlay.remove();
    const finish = () => {
      const w = week();
      if (!archiveWeek(M.archiveEntry(state, w))) return toast('Couldn’t save to the archive (storage full?). Nothing changed.');
      close();
      const fresh = { ...M.carryWeek(w, state.settings.finishWeek), id: w.id };
      ui.selectedId = null;
      commit(s => {
        s.weeks = s.weeks.map(x => (x.id === w.id ? fresh : x));
        s.settings.mode = 'plan';
      });
      toast('Week finished. Saved to the archive.');
    };
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });
    overlay.addEventListener('click', e => {
      const b = e.target.closest('[data-do]');
      if (!b) return;
      switch (b.dataset.do) {
        case 'cancel': return close();
        case 'finish': return finish();
        case 'print': return window.print();
        case 'export': {
          const entry = M.archiveEntry(state, week());
          return download({ kind: 'schedule-ish week', ...entry, exportedAt: entry.finishedAt, finishedAt: undefined },
            `schedule-ish-${fileSlug(week().name)}-${new Date().toISOString().slice(0, 10)}.json`);
        }
      }
    });
    overlay.addEventListener('keydown', e => {
      e.stopPropagation(); // keep the board's keys away
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
  }

  // The ⋯ menu: things you need now and then, kept out of the header.
  function openMore(anchor) {
    if (closePopover()) return;
    openPopover(anchor, `
      <button class="menu-item" data-do="export">Export this plan…</button>
      <button class="menu-item" data-do="import">Import a plan…</button>
      <div class="menu-sep"></div>
      <button class="menu-item danger" data-do="clear">Clear this week’s blocks…</button>`, el => {
      el.style.width = '230px';
      el.style.padding = '6px';
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-do]');
        if (!b) return;
        closePopover();
        if (b.dataset.do === 'export') return exportPlan();
        if (b.dataset.do === 'import') return $('#import-file').click();
        if (!week().blocks.length && !week().unplanned.length) return toast('Already empty');
        if (confirm('Clear every block from this week? (Regulars and one-offs stay. You can undo.)')) {
          ui.selectedId = null;
          commit(() => { week().blocks = []; week().unplanned = []; });
          toast('Cleared. ⌘Z to undo');
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
      <label>show what’s next on blocks</label>
      <div class="seg" data-f="shownext"><button data-v="on">on</button><button data-v="off">off</button></div>
      <label>sidebar</label>
      <div class="seg" data-f="sidebar">
        <button data-v="left">left</button><button data-v="right">right</button><button data-v="hidden">hidden</button>
      </div>
      <label>stretch the day</label>
      <div class="seg" data-f="zones">
        <button data-v="early">early</button><button data-v="evening">evening</button>
      </div>
      <div class="flex items-center gap-2 mt-4 pt-3 border-t" style="border-color: var(--grid)">
        <button class="btn ml-auto" data-do="close">Done</button>
      </div>`, el => {
      const sync = () => {
        el.querySelectorAll('[data-f="weekStart"] button').forEach(b => b.classList.toggle('on', +b.dataset.v === state.settings.weekStart));
        el.querySelectorAll('[data-f="visible"] button').forEach(b => b.classList.toggle('on', state.settings.visibleDays[+b.dataset.v]));
        el.querySelectorAll('[data-f="shownext"] button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'on') === state.settings.showNext));
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
        } else if (f === 'shownext') {
          state.settings.showNext = b.dataset.v === 'on'; // a view setting, not an undo step
          save(); render();
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
        } else if (b.dataset.do === 'close') return closePopover();
        sync();
      });
    });
  }

  // ---- import / export -----------------------------------------------------

  function exportPlan() {
    download(state, `schedule-ish-${new Date().toISOString().slice(0, 10)}.json`);
  }

  $('#import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      // One week (from Finish week's Export): add it alongside the others.
      if (raw && raw.kind === 'schedule-ish week' && raw.week) {
        const w = M.normalizeState({ version: raw.version, weeks: [raw.week] }).weeks[0];
        w.id = M.newId();
        ui.selectedId = null;
        commit(s => { s.weeks.push(w); s.currentWeek = w.id; });
        return toast(`Added “${w.name}” as a week`);
      }
      const next = M.normalizeState(raw);
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

  // On paper the day is squeezed to fit one landscape page. Page 2 is the
  // week's record: a header with a tally, then day by day (the day's note,
  // then each block where it ended up, with rating, tags, session line and
  // review), then each name's focus list. Time-holders have no focus list.
  function renderPrintNotes() {
    const w = week();
    const days = M.orderedDays(state.settings.weekStart, state.settings.visibleDays);
    const byDay = M.daysForPrint(w, days, ui.zones);
    const threads = M.focusForPrint(w, days)
      .map(t => (isTimeHolder(t.title) ? { ...t, items: [] } : t))
      .filter(t => t.items.length);
    const all = byDay.flatMap(d => d.blocks);
    if (!all.length && !byDay.some(d => d.note) && !threads.length) { $('#print-notes').innerHTML = ''; return; }

    const count = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
    const planned = all.filter(x => !x.unplanned);
    const rated = all.filter(x => typeof x.rating === 'number');
    const tally = [
      count(planned.length, 'block') + ' planned',
      rated.length && `${rated.length} rated (${[1, 2, 3].map(r => all.filter(x => x.rating === r).length ? `${RATING_LABEL[r]} ${all.filter(x => x.rating === r).length}` : '').filter(Boolean).join(', ')})`,
      all.filter(x => x.rating === 'skip').length && `${all.filter(x => x.rating === 'skip').length} didn’t happen`,
      all.filter(x => x.rating === 'bad').length && `${all.filter(x => x.rating === 'bad').length} unproductive`,
      all.filter(x => x.movedFrom != null).length && `${all.filter(x => x.movedFrom != null).length} moved`,
      all.filter(x => x.unplanned).length && `${count(all.filter(x => x.unplanned).length, 'unplanned block')}`,
    ].filter(Boolean).join(' · ');

    const blockLine = x => {
      const [fill, ink] = M.PALETTE[x.color] || M.PALETTE[0];
      const meta = [M.zoneLabel(x.zone), M.sizeWord(x.size), x.unplanned && 'unplanned', x.movedFrom != null && `moved from ${M.DAY_NAMES[x.movedFrom]}`].filter(Boolean).join(' · ');
      return `<div class="pn-block ${x.unplanned ? 'unplanned' : ''} ${x.rating === 'skip' ? 'skipped' : ''}">
        <div class="pn-line"><i class="pn-sw" style="background:${fill};border-color:${ink}"></i><b>${esc(x.title || 'untitled')}</b>
          ${x.rating != null ? `<span class="pn-rate ${typeof x.rating === 'number' ? '' : 'word'}">${RATING_LABEL[x.rating]}</span>` : ''}<span class="pn-meta">${meta}</span></div>
        ${x.tags.length ? `<div class="pn-tags">${x.tags.map(esc).join(' · ')}</div>` : ''}
        ${x.session ? `<div class="pn-sess">${esc(x.session)}</div>` : ''}
        ${x.review ? `<div class="pn-rev">${esc(x.review)}</div>` : ''}
      </div>`;
    };

    $('#print-notes').innerHTML = `
      <header class="pn-head">
        <h2>${esc(w.name)}</h2>
        <span>the week on paper · printed ${M.shortDate(new Date())}</span>
        <div class="pn-tally">${tally}</div>
      </header>
      <h3 class="pn-sec">Day by day</h3>
      <div class="pn-cols">${byDay.map(d => `
        <section class="pn-day">
          <h4>${M.DAY_LONG[d.day]}</h4>
          ${d.note ? `<p class="pn-note">${esc(d.note)}</p>` : ''}
          ${d.blocks.length ? d.blocks.map(blockLine).join('') : '<p class="pn-empty">nothing on</p>'}
        </section>`).join('')}
      </div>
      ${threads.length ? `<h3 class="pn-sec">Focus</h3>
      <div class="pn-cols">${threads.map(t => `
        <section class="pn-day">
          <h4>${esc(t.title || 'untitled')} <span class="pdays">${t.days.map(d => M.DAY_NAMES[d]).join(' · ')}</span></h4>
          <ul>${t.items.map(x => `<li class="${x.done ? 'done' : ''}">${x.done ? '✓' : '○'} ${esc(x.text)}</li>`).join('')}</ul>
        </section>`).join('')}
      </div>` : ''}`;
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

  let scrollTimer;
  $('#board-body').addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const el = $('#board-body'), mine = savedFor(state.currentWeek);
      mine.top = el.scrollTop;
      mine.left = el.scrollLeft;
      saveUi();
    }, 150);
  }, { passive: true });

  save(); // write back anything load() repaired or migrated
  ui.selectedId = savedFor(state.currentWeek).selected || null;
  render();
  // After Tailwind has styled the page and the day has been fitted.
  setTimeout(restoreScroll, 300);
})();
