"""Tests for memories.search."""
import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from memories.search import TfidfIndex, SearchIndex, _tokenise
from memories.config import WeightsConfig


# ---------------------------------------------------------------------------
# _tokenise
# ---------------------------------------------------------------------------

def test_tokenise_basic():
    assert _tokenise("Hello World") == ["hello", "world"]

def test_tokenise_strips_short():
    assert "a" not in _tokenise("a quick test")

def test_tokenise_special_chars():
    result = _tokenise("github.com/user/repo")
    assert "github" in result
    assert "com" in result
    assert "user" in result
    assert "repo" in result


# ---------------------------------------------------------------------------
# TfidfIndex
# ---------------------------------------------------------------------------

def test_tfidf_empty_query():
    idx = TfidfIndex(["python flask web", "firefox bookmarks search"])
    assert idx.score(0, "") == 0.0

def test_tfidf_exact_match_higher():
    idx = TfidfIndex(["python flask", "ruby rails"])
    score_python = idx.score(0, "python")
    score_python_in_ruby = idx.score(1, "python")
    assert score_python > score_python_in_ruby

def test_tfidf_unrelated_zero():
    idx = TfidfIndex(["cats and dogs", "sun and moon"])
    score = idx.score(0, "xyzzy")
    assert score == 0.0


# ---------------------------------------------------------------------------
# SearchIndex – token gate
# ---------------------------------------------------------------------------

def make_entry(
    title="Test Page",
    url="https://example.com",
    source="bookmark",
    frecency=100,
    visit_count=5,
    last_visited="2026-03-01T12:00:00+00:00",
    tags=None,
):
    return {
        "title": title,
        "url": url,
        "source": source,
        "frecency": frecency,
        "visit_count": visit_count,
        "last_visited": last_visited,
        "tags": tags or [],
    }


WEIGHTS = WeightsConfig(frecency=0.4, tfidf=0.3, fuzzy=0.2, recency=0.1)


def test_token_gate_excludes_non_matching():
    entries = [
        make_entry(title="GitHub", url="https://github.com"),
        make_entry(title="Google", url="https://google.com"),
    ]
    idx = SearchIndex(entries)
    results = idx.search("github", WEIGHTS)
    assert len(results) == 1
    assert results[0]["title"] == "GitHub"


def test_token_gate_multi_token():
    entries = [
        make_entry(title="Python Flask Tutorial", url="https://flask.palletsprojects.com"),
        make_entry(title="Python Requests", url="https://requests.readthedocs.io"),
    ]
    idx = SearchIndex(entries)
    results = idx.search("python flask", WEIGHTS)
    assert len(results) == 1
    assert "Flask" in results[0]["title"]


def test_empty_query_returns_empty():
    entries = [make_entry()]
    idx = SearchIndex(entries)
    assert idx.search("", WEIGHTS) == []


def test_whitespace_query_returns_empty():
    entries = [make_entry()]
    idx = SearchIndex(entries)
    assert idx.search("   ", WEIGHTS) == []


def test_results_sorted_by_score():
    entries = [
        make_entry(title="Python Docs", url="https://docs.python.org", frecency=50),
        make_entry(title="Python.org", url="https://python.org", frecency=9000, visit_count=200),
    ]
    idx = SearchIndex(entries)
    results = idx.search("python", WEIGHTS)
    assert len(results) == 2
    # Higher frecency + visits should rank higher
    assert results[0]["frecency"] >= results[1]["frecency"] or results[0]["score"] >= results[1]["score"]


def test_source_filter():
    entries = [
        make_entry(title="GitHub", url="https://github.com", source="bookmark"),
        make_entry(title="GitLab", url="https://gitlab.com", source="history"),
    ]
    idx = SearchIndex(entries)
    results = idx.search("git", WEIGHTS, sources=["bookmark"])
    assert all(r["source"] == "bookmark" for r in results)


def test_max_results_limit():
    entries = [
        make_entry(title=f"Python Page {i}", url=f"https://python{i}.com")
        for i in range(20)
    ]
    idx = SearchIndex(entries)
    results = idx.search("python", WEIGHTS, max_results=5)
    assert len(results) <= 5


def test_exclude_url_patterns():
    entries = [
        make_entry(title="Extension Page", url="moz-extension://abc/def"),
        make_entry(title="Normal Page", url="https://normal.com"),
    ]
    idx = SearchIndex(entries)
    results = idx.search("page", WEIGHTS, exclude_patterns=[r"^moz-extension://"])
    urls = [r["url"] for r in results]
    assert "moz-extension://abc/def" not in urls
    assert any("normal.com" in u for u in urls)


def test_tags_appear_in_token_gate():
    entries = [
        make_entry(title="Some Page", url="https://example.com", tags=["python", "tutorial"]),
        make_entry(title="Other Page", url="https://other.com", tags=[]),
    ]
    idx = SearchIndex(entries)
    results = idx.search("tutorial", WEIGHTS)
    assert len(results) == 1
    assert results[0]["tags"] == ["python", "tutorial"]


def test_score_field_present():
    entries = [make_entry()]
    idx = SearchIndex(entries)
    results = idx.search("test", WEIGHTS)
    if results:
        assert "score" in results[0]
        assert isinstance(results[0]["score"], float)
