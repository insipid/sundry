#!/usr/bin/env python3
"""
captainslog-viewer.py — a live, styled, local web view of a captainslog.sh output file.

Usage:
    captainslog-viewer.py [file] [--port PORT] [-q]

Every setting can come from, in priority order: a command-line argument,
then an environment variable, then a built-in default — same convention
captainslog.sh uses, and CAPTAINSLOG_FILE is shared between the two, so
setting it once points both tools at the same transcript file.

    argument   env var             default
    ---------  ------------------  --------------------------
    file       CAPTAINSLOG_FILE    ~/Desktop/voice-notes.txt
    --port     CAPTAINSLOG_PORT    8420
    -q         (no env var)        off — status messages print

Standard library only — no pip installs. Binds to 127.0.0.1 only (not your
network). Never writes anything to disk; it just reads the target file fresh
on every request and hands back parsed entries as JSON. Entirely separate
from captainslog.sh — this only reads the file captainslog.sh writes, it
never touches it. (captainslog.sh can optionally launch this itself, via
its own --with-viewer flag — see captainslog.sh for that.)

Ctrl-C to stop. No daemon, no background service, no login item.
"""

import argparse
import errno
import json
import os
import re
import signal
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_FILE = os.path.expanduser("~/Desktop/voice-notes.txt")
DEFAULT_PORT = 8420

# Matches the "[YYYY-MM-DD HH:MM:SS]" stamps captainslog.sh writes, and
# grabs everything up to the next stamp (or end of file) as that entry's text.
ENTRY_RE = re.compile(
    r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s*\n(.*?)(?=\n\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]|\Z)",
    re.MULTILINE | re.DOTALL,
)


def parse_entries(text):
    entries = []
    for m in ENTRY_RE.finditer(text):
        stamp = m.group(1)
        body = m.group(2).strip()
        if body:
            entries.append({"timestamp": stamp, "text": body})
    # Sort by timestamp (stable, so same-second entries keep file order) —
    # guards against any manual reordering/edits to the file.
    entries.sort(key=lambda e: e["timestamp"])
    return entries


PAGE_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Captain's Log</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f7f6f3;
    --card: #ffffff;
    --text: #1c1b19;
    --muted: #8a857c;
    --accent: #c1622d;
    --border: #eae7e0;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #171614;
      --card: #221f1c;
      --text: #ece8e1;
      --muted: #8f897e;
      --accent: #e08a52;
      --border: #322e29;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  }
  header {
    position: sticky;
    top: 0;
    background: var(--bg);
    padding: 1.25rem 1.5rem 0.75rem;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid var(--border);
  }
  h1 {
    font-size: 1.05rem;
    font-weight: 600;
    margin: 0 0 0.75rem;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #3fae5a;
    display: inline-block;
    margin-right: 0.35rem;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
  button {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.3rem 0.65rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
    cursor: pointer;
  }
  button:hover { border-color: var(--accent); }
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 1rem 1.5rem 4rem;
  }
  .entry {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.85rem 1rem;
    margin: 0.6rem 0;
  }
  .entry time {
    display: block;
    font-size: 0.72rem;
    color: var(--muted);
    letter-spacing: 0.02em;
    margin-bottom: 0.3rem;
  }
  .entry p {
    margin: 0;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .entry.new {
    animation: flash 1.4s ease-out;
  }
  @keyframes flash {
    from { background: color-mix(in srgb, var(--accent) 18%, var(--card)); }
    to { background: var(--card); }
  }
  .empty {
    color: var(--muted);
    font-size: 0.9rem;
    padding: 2rem 0;
    text-align: center;
  }
</style>
</head>
<body>
<header>
  <div style="width:100%">
    <h1>Captain's Log</h1>
    <div class="controls">
      <span><span class="dot"></span><span id="status">watching</span></span>
      <button id="order-btn" type="button">Newest first</button>
      <span id="count"></span>
    </div>
  </div>
</header>
<main id="entries">
  <div class="empty">Loading…</div>
</main>
<script>
(function () {
  var order = "desc"; // "desc" = newest first, "asc" = oldest first
  var lastSignature = null;
  var container = document.getElementById("entries");
  var statusEl = document.getElementById("status");
  var countEl = document.getElementById("count");
  var orderBtn = document.getElementById("order-btn");

  orderBtn.addEventListener("click", function () {
    order = order === "desc" ? "asc" : "desc";
    orderBtn.textContent = order === "desc" ? "Newest first" : "Oldest first";
    lastSignature = null; // force re-render
    poll();
  });

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render(entries) {
    if (!entries.length) {
      container.innerHTML = '<div class="empty">No entries yet.</div>';
      return;
    }
    var ordered = order === "desc" ? entries.slice().reverse() : entries;
    var previousLatest = lastSignature;
    var html = "";
    ordered.forEach(function (e) {
      var isNew = previousLatest !== null && e.timestamp > previousLatest;
      html +=
        '<div class="entry' + (isNew ? " new" : "") + '">' +
        "<time>" + escapeHtml(e.timestamp) + "</time>" +
        "<p>" + escapeHtml(e.text) + "</p>" +
        "</div>";
    });
    container.innerHTML = html;
    countEl.textContent = entries.length + (entries.length === 1 ? " entry" : " entries");
  }

  function poll() {
    fetch("/content", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        statusEl.textContent = "watching";
        var signature = data.entries.length
          ? data.entries[data.entries.length - 1].timestamp + ":" + data.entries.length
          : "";
        if (signature === lastSignature) return;
        var latestBefore = lastSignature;
        render(data.entries);
        lastSignature = data.entries.length
          ? data.entries[data.entries.length - 1].timestamp
          : null;
      })
      .catch(function () {
        statusEl.textContent = "can't reach server";
      });
  }

  poll();
  setInterval(poll, 2000);
})();
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    target_file = DEFAULT_FILE

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet; nothing sensitive, just less noise

    def do_GET(self):
        if self.path.startswith("/content"):
            self._serve_content()
        elif self.path == "/" or self.path.startswith("/?"):
            self._serve_page()
        else:
            self.send_error(404)

    def _serve_page(self):
        body = PAGE_HTML.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_content(self):
        try:
            with open(self.target_file, "r", encoding="utf-8") as f:
                text = f.read()
            entries = parse_entries(text)
            payload = {"entries": entries, "count": len(entries)}
        except FileNotFoundError:
            payload = {"entries": [], "count": 0}
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


QUIET = False


def _log(msg):
    if not QUIET:
        print(msg)


def _handle_shutdown(signum, frame):
    # Installed explicitly rather than relying on Python's default
    # SIGINT->KeyboardInterrupt translation: that default only kicks in if
    # SIGINT wasn't already being ignored when the process started, which
    # is NOT guaranteed — e.g. a process backgrounded with `&` from a
    # non-interactive shell can inherit SIGINT set to be ignored, in which
    # case `except KeyboardInterrupt` around serve_forever() would just
    # never fire. Registering our own handler works regardless of how the
    # process was launched.
    _log("\nStopped.")
    sys.stdout.flush()
    os._exit(0)


def main():
    global QUIET

    # Priority for each setting: command-line argument, then environment
    # variable, then the built-in default — same convention captainslog.sh
    # uses. CAPTAINSLOG_FILE is intentionally the same env var name
    # captainslog.sh reads, so setting it once points both tools at the
    # same file.
    file_default = os.environ.get("CAPTAINSLOG_FILE") or DEFAULT_FILE

    port_default = DEFAULT_PORT
    port_env = os.environ.get("CAPTAINSLOG_PORT")
    if port_env:
        try:
            port_default = int(port_env)
        except ValueError:
            print("CAPTAINSLOG_PORT=%r isn't a number, ignoring it." % port_env, file=sys.stderr)

    parser = argparse.ArgumentParser(description="Live local web view of a captainslog.sh file.")
    parser.add_argument("file", nargs="?", default=file_default, help="Transcript file to watch")
    parser.add_argument("--port", type=int, default=port_default, help="Port to serve on")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress status output")
    args = parser.parse_args()

    QUIET = args.quiet
    Handler.target_file = os.path.expanduser(args.file)

    signal.signal(signal.SIGINT, _handle_shutdown)
    signal.signal(signal.SIGTERM, _handle_shutdown)

    # Just try to bind and see what happens, rather than checking with
    # something like `lsof` first — a pre-check can't actually guarantee
    # anything (another process could grab the port between the check and
    # the real bind), so it's both unreliable and unnecessary complexity.
    # The bind attempt itself is the only real answer.
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as e:
        if e.errno == errno.EADDRINUSE:
            print(
                "ERROR: port %d is already in use — is captainslog-viewer.py "
                "already running? Pick a different port with --port, or set "
                "CAPTAINSLOG_PORT." % args.port,
                file=sys.stderr,
            )
        else:
            print(
                "ERROR: couldn't start on port %d (%s)." % (args.port, e.strerror or e),
                file=sys.stderr,
            )
        sys.exit(1)

    url = "http://127.0.0.1:%d/" % args.port
    _log("Watching: %s" % Handler.target_file)
    _log("Open in your browser: %s" % url)
    _log("Press Ctrl-C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
