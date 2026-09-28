// schedule-ish: which calendar this page shows, and where it keeps it.
// With no ?cal= it's your own calendar, under the usual keys. With
// ?cal=<id> it's a shared calendar published as calendars/<id>.json: the
// first visit fetches it, then it lives under its own keys in this browser,
// apart from your own. Starts app.js once the calendar is ready.
(function (root) {
  'use strict';
  const M = root.Model;
  const param = new URLSearchParams(location.search).get('cal');
  const id = param === null ? null : param;
  const prefix = id === null ? 'schedule-ish:' : `schedule-ish:cal:${id}:`;
  const keys = {
    plan: prefix + 'v1',
    archive: prefix + 'archive',
    ui: prefix + 'ui',
    source: prefix + 'source', // { fingerprint, ignored } of the published file
  };
  const url = id === null ? null : `calendars/${id}.json`;

  // The published file: its text's fingerprint and the checked plan in it.
  async function fetchSource() {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return { fingerprint: M.fingerprint(text), state: M.normalizeState(JSON.parse(text)) };
  }
  function source() {
    try { return JSON.parse(localStorage.getItem(keys.source)) || {}; } catch (e) { return {}; }
  }
  function setSource(v) {
    try { localStorage.setItem(keys.source, JSON.stringify(v)); } catch (e) { /* the copy still works */ }
  }

  const Shared = { id, keys, url, fetchSource, source, setSource, initial: null };
  root.Shared = Shared;

  function startApp() {
    const s = document.createElement('script');
    s.src = 'app.js';
    document.body.appendChild(s);
  }
  // Instead of a board: never show your own calendar under a shared name.
  function showError(title, detail) {
    document.title = 'schedule-ish · couldn’t load';
    const box = document.createElement('div');
    box.className = 'load-error';
    box.innerHTML = `<div><h1>${title}</h1><p>${detail}</p>
      <a href="${location.pathname}">Open your own calendar</a></div>`;
    document.body.replaceChildren(box);
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  if (id === null) return startApp();
  document.title = `schedule-ish · ${id}`;
  const notFound = () => showError('This calendar couldn’t be loaded', `There's no published calendar called “${esc(id)}”, or it couldn't be read.`);
  if (!M.validCalId(id)) return notFound();
  let saved = null;
  try { saved = localStorage.getItem(keys.plan); } catch (e) { /* storage blocked */ }
  if (saved) return startApp();
  if (location.protocol === 'file:') {
    return showError('This calendar couldn’t be loaded', 'Shared calendars need the page to be served over http (for example from a local server), not opened as a file.');
  }
  fetchSource().then(src => {
    Shared.initial = src.state; // in case storage is blocked
    try { localStorage.setItem(keys.plan, JSON.stringify(src.state)); } catch (e) { /* app.js uses Shared.initial */ }
    setSource({ fingerprint: src.fingerprint, ignored: null });
    startApp();
  }).catch(notFound);
})(this);
