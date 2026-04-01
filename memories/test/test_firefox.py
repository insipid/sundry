"""Tests for memories.firefox – profile detection and DB loading."""
import configparser
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from memories.firefox import find_default_profile, load_entries, FirefoxProfileError


# ---------------------------------------------------------------------------
# Helpers to build a fake Mozilla directory
# ---------------------------------------------------------------------------

def make_fake_mozilla(tmpdir: Path, profiles: list[dict], install_default: str = "") -> Path:
    """Create a minimal ~/.mozilla/firefox structure in tmpdir."""
    mozilla = tmpdir / "mozilla" / "firefox"
    mozilla.mkdir(parents=True)

    parser = configparser.RawConfigParser()
    parser.optionxform = str  # preserve case

    if install_default:
        parser.add_section("Install1234")
        parser.set("Install1234", "Default", install_default)

    for i, prof in enumerate(profiles):
        section = f"Profile{i}"
        parser.add_section(section)
        parser.set(section, "Name", prof.get("name", f"profile{i}"))
        parser.set(section, "IsRelative", "1")
        parser.set(section, "Path", prof["path"])
        if prof.get("default"):
            parser.set(section, "Default", "1")
        # Create the profile directory
        (mozilla / prof["path"]).mkdir(parents=True, exist_ok=True)

    with open(mozilla / "profiles.ini", "w") as f:
        parser.write(f)

    return mozilla


def make_places_db(profile_dir: Path, bookmarks=None, history=None) -> Path:
    """Create a minimal places.sqlite in profile_dir."""
    db_path = profile_dir / "places.sqlite"
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        CREATE TABLE moz_places (
            id INTEGER PRIMARY KEY,
            url TEXT,
            title TEXT,
            frecency INTEGER DEFAULT 0,
            visit_count INTEGER DEFAULT 0,
            last_visit_date INTEGER
        );
        CREATE TABLE moz_bookmarks (
            id INTEGER PRIMARY KEY,
            type INTEGER,
            fk INTEGER,
            parent INTEGER,
            title TEXT
        );
    """)

    # Insert places
    all_places = (bookmarks or []) + (history or [])
    for i, p in enumerate(all_places, start=1):
        conn.execute(
            "INSERT INTO moz_places (id, url, title, frecency, visit_count, last_visit_date) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (i, p["url"], p.get("title", ""), p.get("frecency", 0),
             p.get("visit_count", 0), p.get("last_visit_date")),
        )

    # Insert bookmarks for the bookmark entries
    conn.execute(
        "INSERT INTO moz_bookmarks (id, type, fk, parent, title) VALUES (1, 2, NULL, 0, 'Tags')"
    )
    bm_offset = len(history or [])
    for j, bm in enumerate(bookmarks or [], start=1):
        conn.execute(
            "INSERT INTO moz_bookmarks (id, type, fk, parent, title) VALUES (?, 1, ?, 0, NULL)",
            (j + 1, bm_offset + j),
        )

    conn.commit()
    conn.close()
    return db_path


# ---------------------------------------------------------------------------
# Profile detection tests
# ---------------------------------------------------------------------------

def test_find_profile_via_install_section(tmp_path):
    mozilla = make_fake_mozilla(tmp_path, [{"path": "profiles/abc.default"}], install_default="profiles/abc.default")
    result = find_default_profile(mozilla)
    assert result == mozilla / "profiles/abc.default"


def test_find_profile_via_default_flag(tmp_path):
    mozilla = make_fake_mozilla(tmp_path, [
        {"path": "profiles/old.default", "default": False},
        {"path": "profiles/new.default", "default": True},
    ])
    result = find_default_profile(mozilla)
    assert result == mozilla / "profiles/new.default"


def test_find_profile_fallback_to_first(tmp_path):
    mozilla = make_fake_mozilla(tmp_path, [{"path": "profiles/only.default"}])
    result = find_default_profile(mozilla)
    assert result == mozilla / "profiles/only.default"


def test_no_profiles_ini_raises(tmp_path):
    mozilla = tmp_path / "mozilla" / "firefox"
    mozilla.mkdir(parents=True)
    with pytest.raises(FirefoxProfileError, match="profiles.ini not found"):
        find_default_profile(mozilla)


# ---------------------------------------------------------------------------
# load_entries tests
# ---------------------------------------------------------------------------

def test_load_bookmarks(tmp_path):
    mozilla = make_fake_mozilla(tmp_path, [{"path": "profiles/test.default"}])
    profile = mozilla / "profiles/test.default"
    make_places_db(profile, bookmarks=[
        {"url": "https://github.com", "title": "GitHub", "frecency": 500, "visit_count": 10},
        {"url": "https://python.org", "title": "Python", "frecency": 200, "visit_count": 5},
    ])
    entries = load_entries(profile_path=profile, sources=["bookmarks"])
    assert len(entries) == 2
    sources = {e["source"] for e in entries}
    assert sources == {"bookmark"}
    urls = {e["url"] for e in entries}
    assert "https://github.com" in urls


def test_load_history(tmp_path):
    mozilla = make_fake_mozilla(tmp_path, [{"path": "profiles/test.default"}])
    profile = mozilla / "profiles/test.default"
    make_places_db(profile, history=[
        {"url": "https://news.ycombinator.com", "title": "Hacker News", "visit_count": 30},
    ])
    entries = load_entries(profile_path=profile, sources=["history"])
    assert len(entries) == 1
    assert entries[0]["source"] == "history"
    assert entries[0]["url"] == "https://news.ycombinator.com"


def test_load_no_history_with_zero_visits(tmp_path):
    mozilla = make_fake_mozilla(tmp_path, [{"path": "profiles/test.default"}])
    profile = mozilla / "profiles/test.default"
    make_places_db(profile, history=[
        {"url": "https://unvisited.com", "title": "Not Visited", "visit_count": 0},
    ])
    entries = load_entries(profile_path=profile, sources=["history"])
    assert len(entries) == 0


def test_load_min_visit_count_filter(tmp_path):
    mozilla = make_fake_mozilla(tmp_path, [{"path": "profiles/test.default"}])
    profile = mozilla / "profiles/test.default"
    make_places_db(profile, history=[
        {"url": "https://rare.com", "title": "Rare", "visit_count": 1},
        {"url": "https://frequent.com", "title": "Frequent", "visit_count": 50},
    ])
    entries = load_entries(profile_path=profile, sources=["history"], min_visit_count=10)
    assert all(e["visit_count"] >= 10 for e in entries)


def test_missing_places_sqlite_raises(tmp_path):
    mozilla = make_fake_mozilla(tmp_path, [{"path": "profiles/test.default"}])
    profile = mozilla / "profiles/test.default"
    with pytest.raises(FirefoxProfileError, match="places.sqlite not found"):
        load_entries(profile_path=profile)
