/* memories – frontend search logic */

(function () {
  "use strict";

  const DEBOUNCE_MS = 150;

  const searchInput  = document.getElementById("search");
  const resultsList  = document.getElementById("results");
  const resultCount  = document.getElementById("result-count");
  const emptyMsg     = document.getElementById("empty-msg");
  const errorMsg     = document.getElementById("error-msg");

  let appConfig = { open_in_new_tab: true };
  let activeIndex = -1;
  let currentItems = [];
  let debounceTimer = null;

  // ------------------------------------------------------------------
  // Boot: fetch config then focus input
  // ------------------------------------------------------------------
  fetch("/config")
    .then((r) => r.json())
    .then((cfg) => { appConfig = cfg; })
    .catch(() => {});

  searchInput.focus();

  // ------------------------------------------------------------------
  // Input handling
  // ------------------------------------------------------------------
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, DEBOUNCE_MS);
  });

  searchInput.addEventListener("keydown", handleKey);

  // ------------------------------------------------------------------
  // Keyboard navigation
  // ------------------------------------------------------------------
  function handleKey(e) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveCursor(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveCursor(-1);
        break;
      case "Enter":
        e.preventDefault();
        openActive();
        break;
      case "Escape":
        e.preventDefault();
        clearSearch();
        break;
    }
  }

  function moveCursor(delta) {
    if (currentItems.length === 0) return;
    activeIndex = Math.max(0, Math.min(currentItems.length - 1, activeIndex + delta));
    renderActive();
    // Scroll active item into view
    const el = resultsList.children[activeIndex];
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  function renderActive() {
    Array.from(resultsList.children).forEach((li, i) => {
      li.classList.toggle("active", i === activeIndex);
      li.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
    });
  }

  function openActive() {
    if (activeIndex < 0 || activeIndex >= currentItems.length) return;
    openItem(currentItems[activeIndex]);
  }

  function openItem(item) {
    if (appConfig.open_in_new_tab) {
      fetch("/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      }).catch(() => {
        // Fallback: open directly
        window.open(item.url, "_blank", "noopener,noreferrer");
      });
    } else {
      window.location.href = item.url;
    }
  }

  function clearSearch() {
    searchInput.value = "";
    clearResults();
    searchInput.focus();
  }

  // ------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------
  function doSearch() {
    const q = searchInput.value.trim();
    if (!q) {
      clearResults();
      return;
    }

    fetch(`/search?q=${encodeURIComponent(q)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data && data.error) {
          showError(data.error);
        } else {
          renderResults(data);
        }
      })
      .catch((err) => showError(String(err)));
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function clearResults() {
    currentItems = [];
    activeIndex = -1;
    resultsList.innerHTML = "";
    resultCount.textContent = "";
    emptyMsg.hidden = true;
    errorMsg.hidden = true;
  }

  function showError(msg) {
    clearResults();
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
  }

  function renderResults(items) {
    clearResults();
    currentItems = items;

    if (items.length === 0) {
      emptyMsg.hidden = false;
      resultCount.textContent = "0";
      return;
    }

    resultCount.textContent = String(items.length);

    const frag = document.createDocumentFragment();
    items.forEach((item, idx) => {
      const li = document.createElement("li");
      li.className = "result-item";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.dataset.idx = idx;

      // Badge
      const isBookmark = item.source === "bookmark";
      const badge = document.createElement("span");
      badge.className = "badge " + (isBookmark ? "badge-bookmark" : "badge-history");
      badge.textContent = isBookmark ? "B" : "H";
      badge.title = isBookmark ? "Bookmark" : "History";

      // Body
      const body = document.createElement("div");
      body.className = "result-body";

      const titleEl = document.createElement("div");
      titleEl.className = "result-title";
      titleEl.textContent = item.title || item.url;

      const urlEl = document.createElement("div");
      urlEl.className = "result-url";
      urlEl.textContent = item.url;
      urlEl.title = item.url;

      const metaEl = document.createElement("div");
      metaEl.className = "result-meta";

      // Tags
      if (item.tags && item.tags.length > 0) {
        item.tags.forEach((tag) => {
          const span = document.createElement("span");
          span.className = "tag";
          span.textContent = tag;
          metaEl.appendChild(span);
        });
      }

      // Visit info
      if (item.visit_count > 0 || item.last_visited) {
        const visits = document.createElement("span");
        visits.className = "visits";
        const parts = [];
        if (item.visit_count > 0) parts.push(`${item.visit_count} visit${item.visit_count === 1 ? "" : "s"}`);
        if (item.last_visited) {
          const d = new Date(item.last_visited);
          parts.push(`last: ${formatDate(d)}`);
        }
        visits.textContent = parts.join(" · ");
        metaEl.appendChild(visits);
      }

      body.appendChild(titleEl);
      body.appendChild(urlEl);
      if (metaEl.childElementCount > 0) body.appendChild(metaEl);

      li.appendChild(badge);
      li.appendChild(body);

      // Click to open
      li.addEventListener("click", () => {
        activeIndex = idx;
        renderActive();
        openItem(item);
      });

      // Hover sets active
      li.addEventListener("mouseenter", () => {
        activeIndex = idx;
        renderActive();
      });

      frag.appendChild(li);
    });

    resultsList.appendChild(frag);
  }

  // ------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------
  function formatDate(d) {
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 365) return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
})();
