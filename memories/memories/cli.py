"""CLI entry point: argument parsing, daemon management, browser open."""

from __future__ import annotations

import argparse
import os
import signal
import socket
import sys
import time
from pathlib import Path

_DATA_DIR = Path.home() / ".local" / "share" / "memories"
_PID_FILE = _DATA_DIR / "memories.pid"
_LOG_FILE = _DATA_DIR / "memories.log"


# ---------------------------------------------------------------------------
# PID file helpers
# ---------------------------------------------------------------------------

def _read_pid() -> int | None:
    try:
        return int(_PID_FILE.read_text().strip())
    except (FileNotFoundError, ValueError):
        return None


def _write_pid(pid: int) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _PID_FILE.write_text(str(pid))


def _remove_pid() -> None:
    _PID_FILE.unlink(missing_ok=True)


def _is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


# ---------------------------------------------------------------------------
# Daemon fork
# ---------------------------------------------------------------------------

def _daemonise(port: int, log_path: Path) -> None:
    """Double-fork to detach from the terminal and start the server."""
    # First fork
    pid = os.fork()
    if pid > 0:
        # Parent: wait briefly then poll for server readiness
        _wait_for_server(port, timeout=15)
        return

    # Child 1: become session leader
    os.setsid()

    # Second fork (prevents re-acquiring a controlling terminal)
    pid2 = os.fork()
    if pid2 > 0:
        # First child exits so second child is re-parented to init
        os._exit(0)

    # Grandchild: this is the daemon process
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _write_pid(os.getpid())

    # Redirect stdio to log file
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_fd = open(log_path, "a")
    sys.stdout.flush()
    sys.stderr.flush()
    os.dup2(log_fd.fileno(), sys.stdout.fileno())
    os.dup2(log_fd.fileno(), sys.stderr.fileno())
    null_fd = open(os.devnull, "r")
    os.dup2(null_fd.fileno(), sys.stdin.fileno())


def _wait_for_server(port: int, timeout: float = 15.0) -> None:
    """Poll localhost:port until it accepts connections or timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.2)
    # Don't raise — server might just be slow; browser open attempt still reasonable


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_start(args: argparse.Namespace) -> None:
    from . import config as config_mod
    from .server import run

    cfg = config_mod.load_config(
        port=args.port,
        profile=args.profile,
        open_browser=None if args.no_open else None,
    )
    if args.no_open:
        cfg.server.open_browser = False

    port = cfg.server.port

    # Check if already running
    existing_pid = _read_pid()
    if existing_pid and _is_running(existing_pid):
        print(f"memories is already running (PID {existing_pid}) on port {port}")
        print(f"  http://127.0.0.1:{port}")
        return

    print(f"Starting memories on http://127.0.0.1:{port} ...")

    _daemonise(port, _LOG_FILE)

    # --- everything below here runs only in the parent (after daemonise returns) ---
    if os.getpid() != _read_pid():
        # We are the parent process
        if cfg.server.open_browser:
            _open_browser(f"http://127.0.0.1:{port}")
        pid = _read_pid()
        if pid:
            print(f"memories started (PID {pid}). Log: {_LOG_FILE}")
        return

    # We are the daemon — start the server (blocking)
    run(cfg)
    _remove_pid()


def _open_browser(url: str) -> None:
    import subprocess
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    try:
        subprocess.Popen([opener, url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        print(f"Could not open browser automatically. Visit: {url}")


def cmd_stop(_args: argparse.Namespace) -> None:
    pid = _read_pid()
    if pid is None:
        print("memories does not appear to be running (no PID file).")
        return
    if not _is_running(pid):
        print(f"No process found for PID {pid}. Cleaning up stale PID file.")
        _remove_pid()
        return
    os.kill(pid, signal.SIGTERM)
    # Wait for process to exit
    for _ in range(50):
        if not _is_running(pid):
            break
        time.sleep(0.1)
    _remove_pid()
    print(f"memories stopped (PID {pid}).")


def cmd_status(_args: argparse.Namespace) -> None:
    pid = _read_pid()
    if pid is None:
        print("memories: not running")
        return
    if _is_running(pid):
        print(f"memories: running (PID {pid})")
    else:
        print(f"memories: not running (stale PID {pid})")


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="memories",
        description="Search Firefox bookmarks & history in your browser.",
    )
    sub = parser.add_subparsers(dest="command")

    # Default (no subcommand) = start
    parser.add_argument("--port", type=int, default=None, help="Override server port")
    parser.add_argument("--profile", default=None, help="Path to Firefox profile directory")
    parser.add_argument("--no-open", action="store_true", help="Don't open browser after start")
    parser.add_argument("--stop", action="store_true", help="Stop the running daemon")
    parser.add_argument("--status", action="store_true", help="Show daemon status")

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.stop:
        cmd_stop(args)
    elif args.status:
        cmd_status(args)
    else:
        cmd_start(args)
