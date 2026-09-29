// schedule-ish: which calendar this page shows, and where it keeps it.
// With no ?cal= it's your own calendar, under the usual keys. With
// ?cal=<id> it's a shared calendar published as calendars/<id>.js: the
// first visit loads it, then it lives under its own keys in this browser,
// apart from your own. Starts app.js once the calendar is ready.
//
// A calendar file is an export wrapped in one call, scheduleIsh({...});
// loaded as a script, so it works from a server and opened from disk alike
// (browsers won't fetch a .json from disk).
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
  const url = id === null ? null : `calendars/${id}.js`;

  // The published file: a fingerprint of its data and the checked plan in
  // it. A fresh query string each time gets past the browser's cache.
  function fetchSource() {
    return new Promise((resolve, reject) => {
      let data;
      root.scheduleIsh = d => { data = d; };
      const s = document.createElement('script');
      s.src = `${url}?t=${Date.now()}`;
      const done = () => { s.remove(); delete root.scheduleIsh; };
      s.onerror = () => { done(); reject(new Error('could not load ' + url)); };
      s.onload = () => {
        done();
        try {
          if (!data) throw new Error(url + ' did not call scheduleIsh(...)');
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
  fetchSource().then(src => {
    Shared.initial = src.state; // in case storage is blocked
    try { localStorage.setItem(keys.plan, JSON.stringify(src.state)); } catch (e) { /* app.js uses Shared.initial */ }
    setSource({ fingerprint: src.fingerprint, ignored: null });
    startApp();
  }).catch(notFound);
})(this);
