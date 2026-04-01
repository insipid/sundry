"""Firefox profile detection and places.sqlite access."""

from __future__ import annotations

import configparser
import shutil
import sqlite3
import tempfile
from pathlib import Path
from typing import Optional

_MOZILLA_DIR = Path.home() / ".mozilla" / "firefox"


class FirefoxProfileError(RuntimeError):
    pass


def find_default_profile(mozilla_dir: Path = _MOZILLA_DIR) -> Path:
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

    if profile_path is None:
        profile_path = find_default_profile()

    places_path = profile_path / "places.sqlite"
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
