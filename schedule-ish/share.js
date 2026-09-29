// schedule-ish: which schedule this page shows, and where it keeps it.
// With no ?weeks= it's your own schedule, under the usual keys. With
// ?weeks=<id> it's a shared schedule published as weeks/<id>.js: the first
// visit loads it, then it lives under its own keys in this browser, apart
// from your own. Tells app.js when the schedule is ready. (?cal= is the
// older name for ?weeks=; the storage keys still say cal, so copies already
// saved carry on.)
//
// Your own schedule, the first time in a browser (nothing saved yet),
// starts from weeks/index.js if there is one, else empty.
//
// A shared file is an export wrapped in one call, scheduleIsh({...});
// loaded as a script, so it works from a server and opened from disk alike
// (browsers won't fetch a .json from disk).
(function (root) {
  'use strict';
  const M = root.Model;
  const query = new URLSearchParams(location.search);
  // ?weeks= is the name; ?week= (an easy slip) and ?cal= (the old name) work too.
  const param = ['weeks', 'week', 'cal'].map(k => query.get(k)).find(v => v !== null) ?? null;
  const id = param === null ? null : param;
  const prefix = id === null ? 'schedule-ish:' : `schedule-ish:cal:${id}:`;
  const keys = {
    plan: prefix + 'v1',
    archive: prefix + 'archive',
    ui: prefix + 'ui',
    source: prefix + 'source', // { fingerprint, ignored } of the published file
  };
  const url = id === null ? null : `weeks/${id}.js`;

  // The published file: a fingerprint of its data and the checked plan in
  // it. A fresh query string each time gets past the browser's cache.
  function fetchSource(from = url) {
    return new Promise((resolve, reject) => {
      let data;
      root.scheduleIsh = d => { data = d; };
      const s = document.createElement('script');
      s.src = `${from}?t=${Date.now()}`;
      const done = () => { s.remove(); delete root.scheduleIsh; };
      s.onerror = () => { done(); reject(new Error('could not load ' + from)); };
      s.onload = () => {
        done();
        try {
          if (!data) throw new Error(from + ' did not call scheduleIsh(...)');
          resolve({ fingerprint: M.fingerprint(JSON.stringify(data)), state: M.normalizeState(data) });
        } catch (e) { reject(e); }
      };
      document.head.appendChild(s);
    });
  }
  function source() {
    try { return JSON.parse(localStorage.getItem(keys.source)) || {}; } catch (e) { return {}; }
  }
  function setSource(v) {
    try { localStorage.setItem(keys.source, JSON.stringify(v)); } catch (e) { /* the copy still works */ }
  }

  // app.js hands its start-up to whenReady; it runs once the schedule is
  // ready. Usually that's at once, while the page is still loading.
  let ready = false, pending = null;
  const Shared = { id, keys, url, fetchSource, source, setSource, initial: null,
    whenReady(fn) { if (ready) fn(); else pending = fn; } };
  root.Shared = Shared;

  function startApp() {
    ready = true;
    if (pending) { const fn = pending; pending = null; fn(); }
  }
  // Instead of a board: never show your own schedule under a shared name.
  function showError(title, detail) {
    document.title = 'schedule-ish · couldn’t load';
    const box = document.createElement('div');
    box.className = 'load-error';
    box.innerHTML = `<div><h1>${title}</h1><p>${detail}</p>
      <a href="${location.pathname}">Open your own schedule</a></div>`;
    document.body.replaceChildren(box);
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let saved = null;
  try { saved = localStorage.getItem(keys.plan); } catch (e) { /* storage blocked */ }

  // Your own schedule: the saved one, or the default in weeks/index.js the
  // first time, or (if there's none) an empty one.
  if (id === null) {
    if (saved) return startApp();
    return fetchSource('weeks/index.js').then(src => {
      Shared.initial = src.state;
      try { localStorage.setItem(keys.plan, JSON.stringify(src.state)); } catch (e) { /* app.js uses Shared.initial */ }
    }).catch(() => { /* no default: start empty */ }).then(startApp);
  }

  document.title = `schedule-ish · ${id}`;
  const notFound = () => showError('This schedule couldn’t be loaded', `There's no shared schedule called “${esc(id)}”, or it couldn't be read.`);
  if (!M.validCalId(id)) return notFound();
  if (saved) return startApp();
  fetchSource().then(src => {
    Shared.initial = src.state; // in case storage is blocked
    try { localStorage.setItem(keys.plan, JSON.stringify(src.state)); } catch (e) { /* app.js uses Shared.initial */ }
    setSource({ fingerprint: src.fingerprint, ignored: null });
    startApp();
  }).catch(notFound);
})(this);
