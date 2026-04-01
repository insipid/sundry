"""Firefox profile detection and places.sqlite access."""

from __future__ import annotations

import configparser
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path
from typing import Optional

# Environment variables the user can set to override auto-detection:
#   MEMORIES_PLACES         – direct path to a places.sqlite file
#   MEMORIES_FIREFOX_PROFILE – path to a Firefox profile directory


def _default_mozilla_dir() -> Path:
    """Return the platform-appropriate Firefox application data directory."""
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Firefox"
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA", "")
        return Path(appdata) / "Mozilla" / "Firefox"
    # Linux / other POSIX
    return Path.home() / ".mozilla" / "firefox"


class FirefoxProfileError(RuntimeError):
    pass


def find_default_profile(mozilla_dir: Path | None = None) -> Path:
    """Return the path to the default Firefox profile directory."""
    if mozilla_dir is None:
        mozilla_dir = _default_mozilla_dir()
    """Return the path to the default Firefox profile directory."""
    ini_path = mozilla_dir / "profiles.ini"
    if not ini_path.exists():
        raise FirefoxProfileError(f"profiles.ini not found at {ini_path}")

    parser = configparser.RawConfigParser()
    parser.read(ini_path)

    # Prefer a profile referenced by an [Install...] section (most recently used)
    for section in parser.sections():
        if section.lower().startswith("install"):
            if parser.has_option(section, "Default"):
                rel = parser.get(section, "Default")
                profile_dir = mozilla_dir / rel
                if profile_dir.is_dir():
                    return profile_dir

    # Fall back to [Profile...] section with Default=1
    for section in parser.sections():
        if section.lower().startswith("profile"):
            if parser.has_option(section, "Default") and parser.get(section, "Default") == "1":
                if parser.has_option(section, "IsRelative") and parser.get(section, "IsRelative") == "1":
                    path = mozilla_dir / parser.get(section, "Path")
                else:
                    path = Path(parser.get(section, "Path"))
                if path.is_dir():
                    return path

    # Last resort: first profile section
    for section in parser.sections():
        if section.lower().startswith("profile"):
            if parser.has_option(section, "Path"):
                if parser.has_option(section, "IsRelative") and parser.get(section, "IsRelative") == "1":
                    path = mozilla_dir / parser.get(section, "Path")
                else:
                    path = Path(parser.get(section, "Path"))
                if path.is_dir():
                    return path

    raise FirefoxProfileError("No valid Firefox profile found in profiles.ini")


def _copy_db(places_path: Path) -> Path:
    """Copy places.sqlite to a temp file to avoid WAL lock conflicts."""
    tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
    tmp.close()
    shutil.copy2(places_path, tmp.name)
    # Also copy WAL and SHM files if present, so the copy is consistent
    for ext in ("-wal", "-shm"):
        src = Path(str(places_path) + ext)
        if src.exists():
            shutil.copy2(src, tmp.name + ext)
    return Path(tmp.name)


_BOOKMARKS_SQL = """
SELECT
    mp.url,
    mp.title,
    mp.frecency,
    mp.visit_count,
    mp.last_visit_date,
    GROUP_CONCAT(t.title, ',') AS tags
FROM moz_bookmarks b
JOIN moz_places mp ON b.fk = mp.id
LEFT JOIN moz_bookmarks bt
    ON bt.fk = mp.id
    AND bt.parent = (
        SELECT id FROM moz_bookmarks WHERE title='Tags' AND type=2 LIMIT 1
    )
LEFT JOIN moz_bookmarks t ON t.id = bt.parent
WHERE b.type = 1
GROUP BY mp.id
"""

_HISTORY_SQL = """
SELECT
    url,
    title,
    frecency,
    visit_count,
    last_visit_date
FROM moz_places
WHERE visit_count > 0
  AND id NOT IN (SELECT fk FROM moz_bookmarks WHERE type=1 AND fk IS NOT NULL)
"""


def _row_to_dict(row: sqlite3.Row, source: str) -> dict:
    last_visit_date = row["last_visit_date"]
    # Firefox stores microseconds since Unix epoch
    last_visited_iso: Optional[str] = None
    if last_visit_date:
        import datetime
        dt = datetime.datetime.fromtimestamp(last_visit_date / 1_000_000, tz=datetime.timezone.utc)
        last_visited_iso = dt.isoformat()

    tags_raw = row["tags"] if "tags" in row.keys() else None
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []

    return {
        "url": row["url"] or "",
        "title": row["title"] or "",
        "frecency": row["frecency"] or 0,
        "visit_count": row["visit_count"] or 0,
        "last_visited": last_visited_iso,
        "tags": tags,
        "source": source,
    }


def _resolve_places_path(profile_path: Optional[Path]) -> Path:
    """Determine the path to places.sqlite, respecting env vars.

    Priority (highest to lowest):
      1. MEMORIES_PLACES env var  – direct path to places.sqlite
      2. MEMORIES_FIREFOX_PROFILE env var – profile directory
      3. profile_path argument    – from config file
      4. Platform-aware auto-detection via profiles.ini
    """
    # 1. Direct path to the SQLite file
    env_places = os.environ.get("MEMORIES_PLACES", "").strip()
    if env_places:
        p = Path(env_places).expanduser()
        if not p.exists():
            raise FirefoxProfileError(f"MEMORIES_PLACES points to missing file: {p}")
        return p

    # 2. Profile directory from env var
    env_profile = os.environ.get("MEMORIES_FIREFOX_PROFILE", "").strip()
    if env_profile:
        profile_path = Path(env_profile).expanduser()

    # 3 & 4. profile_path argument or auto-detection
    if profile_path is None:
        profile_path = find_default_profile()

    places = profile_path / "places.sqlite"
    if not places.exists():
        raise FirefoxProfileError(
            f"places.sqlite not found at {places}\n"
            "Tip: set MEMORIES_PLACES=/path/to/places.sqlite or "
            "MEMORIES_FIREFOX_PROFILE=/path/to/profile"
        )
    return places


def load_entries(
    profile_path: Optional[Path] = None,
    sources: Optional[list[str]] = None,
    min_visit_count: int = 0,
) -> list[dict]:
    """Load bookmarks and/or history from places.sqlite.

    Returns a list of dicts ready for the search index.
    """
    if sources is None:
        sources = ["bookmarks", "history"]

    places_path = _resolve_places_path(profile_path)
    if not places_path.exists():
        raise FirefoxProfileError(f"places.sqlite not found at {places_path}")

    tmp_path = _copy_db(places_path)
    entries: list[dict] = []

    try:
        conn = sqlite3.connect(f"file:{tmp_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            if "bookmarks" in sources:
                for row in conn.execute(_BOOKMARKS_SQL):
                    entry = _row_to_dict(row, "bookmark")
                    entries.append(entry)

            if "history" in sources:
                for row in conn.execute(_HISTORY_SQL):
                    entry = _row_to_dict(row, "history")
                    if entry["visit_count"] >= min_visit_count:
                        entries.append(entry)
        finally:
            conn.close()
    finally:
        tmp_path.unlink(missing_ok=True)
        for ext in ("-wal", "-shm"):
            Path(str(tmp_path) + ext).unlink(missing_ok=True)

    return entries
