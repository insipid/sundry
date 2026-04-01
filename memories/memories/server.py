"""Flask HTTP server for memories."""

from __future__ import annotations

import logging
import threading
import time
from pathlib import Path
from typing import Optional

from flask import Flask, jsonify, request, send_from_directory

from .config import Config
from .firefox import FirefoxProfileError, load_entries
from .search import SearchIndex

_STATIC_DIR = Path(__file__).parent / "static"

log = logging.getLogger(__name__)


class DataCache:
    """Holds the loaded entries and search index; refreshes on a background thread."""

    def __init__(self, cfg: Config) -> None:
        self._cfg = cfg
        self._lock = threading.RLock()
        self._index: Optional[SearchIndex] = None
        self._error: Optional[str] = None
        self._load()

        interval = cfg.firefox.refresh_interval
        if interval > 0:
            t = threading.Thread(target=self._refresh_loop, args=(interval,), daemon=True)
            t.start()

    def _load(self) -> None:
        profile = Path(self._cfg.firefox.profile) if self._cfg.firefox.profile else None
        try:
            entries = load_entries(
                profile_path=profile,
                sources=self._cfg.search.sources,
                min_visit_count=self._cfg.filter.min_visit_count,
            )
            index = SearchIndex(entries)
            with self._lock:
                self._index = index
                self._error = None
            log.info("Loaded %d entries", len(entries))
        except FirefoxProfileError as exc:
            with self._lock:
                self._error = str(exc)
            log.error("Firefox profile error: %s", exc)
        except Exception as exc:  # noqa: BLE001
            with self._lock:
                self._error = str(exc)
            log.error("Failed to load entries: %s", exc)

    def _refresh_loop(self, interval: int) -> None:
        while True:
            time.sleep(interval)
            log.debug("Refreshing data cache")
            self._load()

    @property
    def index(self) -> Optional[SearchIndex]:
        with self._lock:
            return self._index

    @property
    def error(self) -> Optional[str]:
        with self._lock:
            return self._error


def create_app(cfg: Config) -> Flask:
    app = Flask(__name__, static_folder=str(_STATIC_DIR))
    cache = DataCache(cfg)

    @app.route("/")
    def index():
        return send_from_directory(_STATIC_DIR, "index.html")

    @app.route("/static/<path:filename>")
    def static_files(filename):
        return send_from_directory(_STATIC_DIR, filename)

    @app.route("/search")
    def search():
        q = request.args.get("q", "").strip()
        if not q:
            return jsonify([])

        idx = cache.index
        if idx is None:
            err = cache.error or "Data not yet loaded"
            return jsonify({"error": err}), 503

        results = idx.search(
            query=q,
            weights=cfg.weights,
            max_results=cfg.search.max_results,
            sources=cfg.search.sources,
            exclude_patterns=cfg.filter.exclude_url_patterns,
            min_visit_count=cfg.filter.min_visit_count,
        )
        return jsonify(results)

    @app.route("/open", methods=["POST"])
    def open_url():
        data = request.get_json(silent=True) or {}
        url = data.get("url", "").strip()
        if not url:
            return jsonify({"error": "missing url"}), 400
        if not (url.startswith("http://") or url.startswith("https://")):
            return jsonify({"error": "invalid url"}), 400
        import subprocess
        import sys
        opener = "open" if sys.platform == "darwin" else "xdg-open"
        try:
            subprocess.Popen([opener, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except FileNotFoundError:
            return jsonify({"error": f"{opener} not found"}), 500
        return jsonify({"ok": True})

    @app.route("/config")
    def config_endpoint():
        return jsonify({
            "open_in_new_tab": cfg.server.open_in_new_tab,
            "max_results": cfg.search.max_results,
            "sources": cfg.search.sources,
        })

    return app


def run(cfg: Config) -> None:
    """Start the Flask development server (blocking)."""
    app = create_app(cfg)
    # Suppress Flask's default startup banner — daemon prints its own
    import os
    os.environ.setdefault("WERKZEUG_RUN_MAIN", "true")
    logging.basicConfig(level=logging.INFO)
    app.run(host="127.0.0.1", port=cfg.server.port, debug=False, use_reloader=False)
