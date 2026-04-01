"""Search engine for memories.

Scoring pipeline:
  1. Token gate   — hard filter: all query tokens must appear in (title + url + tags)
  2. Fuzzy score  — rapidfuzz partial_ratio against title and url
  3. TF-IDF score — hand-rolled cosine similarity (title + tags corpus)
  4. Frecency     — normalised Firefox frecency score
  5. Recency      — 1 / (1 + days_since_last_visit)

Final score = weighted sum of signals 2-5.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from rapidfuzz import fuzz

from .config import WeightsConfig


# ---------------------------------------------------------------------------
# TF-IDF index (built once on data load, rebuilt on refresh)
# ---------------------------------------------------------------------------

def _tokenise(text: str) -> list[str]:
    """Lowercase, split on non-word chars, filter short tokens."""
    return [t for t in re.split(r"\W+", text.lower()) if len(t) > 1]


class TfidfIndex:
    """Lightweight TF-IDF index over a list of documents."""

    def __init__(self, documents: list[str]) -> None:
        self._n = len(documents)
        # IDF: log((N+1) / (df+1)) + 1  (smooth)
        df: Counter[str] = Counter()
        self._doc_tfs: list[Counter[str]] = []
        for doc in documents:
            tokens = _tokenise(doc)
            tf: Counter[str] = Counter(tokens)
            self._doc_tfs.append(tf)
            df.update(set(tokens))

        self._idf: dict[str, float] = {
            term: math.log((self._n + 1) / (count + 1)) + 1.0
            for term, count in df.items()
        }

    def _tfidf_vec(self, tf: Counter[str]) -> dict[str, float]:
        total = sum(tf.values()) or 1
        return {
            term: (count / total) * self._idf.get(term, 0.0)
            for term, count in tf.items()
        }

    def _cosine(self, vec_a: dict[str, float], vec_b: dict[str, float]) -> float:
        dot = sum(vec_a.get(t, 0.0) * v for t, v in vec_b.items())
        mag_a = math.sqrt(sum(v * v for v in vec_a.values()))
        mag_b = math.sqrt(sum(v * v for v in vec_b.values()))
        if mag_a == 0 or mag_b == 0:
            return 0.0
        return dot / (mag_a * mag_b)

    def score(self, doc_idx: int, query: str) -> float:
        q_tf: Counter[str] = Counter(_tokenise(query))
        q_vec = self._tfidf_vec(q_tf)
        d_vec = self._tfidf_vec(self._doc_tfs[doc_idx])
        return self._cosine(q_vec, d_vec)


# ---------------------------------------------------------------------------
# Index wrapper that lives in the data cache
# ---------------------------------------------------------------------------

class SearchIndex:
    """Wraps the loaded entry list and the TF-IDF index."""

    def __init__(self, entries: list[dict]) -> None:
        self._entries = entries
        docs = [f"{e['title']} {' '.join(e['tags'])}" for e in entries]
        self._tfidf = TfidfIndex(docs)

        # Pre-compute max frecency for normalisation
        frecencies = [e["frecency"] for e in entries if e["frecency"] > 0]
        self._max_frecency = max(frecencies) if frecencies else 1.0

    # ------------------------------------------------------------------
    # Individual scoring helpers
    # ------------------------------------------------------------------

    def _token_gate(self, query: str, entry: dict) -> bool:
        """Return True if every query token appears somewhere in the entry."""
        haystack = (
            (entry["title"] or "")
            + " "
            + (entry["url"] or "")
            + " "
            + " ".join(entry["tags"])
        ).lower()
        return all(tok in haystack for tok in query.lower().split())

    def _fuzzy_score(self, query: str, entry: dict) -> float:
        title_score = fuzz.partial_ratio(query.lower(), (entry["title"] or "").lower())
        url_score = fuzz.partial_ratio(query.lower(), (entry["url"] or "").lower())
        return max(title_score, url_score) / 100.0

    def _frecency_score(self, entry: dict) -> float:
        f = entry["frecency"]
        if f <= 0:
            return 0.0
        return math.log(1 + f) / math.log(1 + self._max_frecency)

    def _recency_score(self, entry: dict) -> float:
        lv = entry.get("last_visited")
        if not lv:
            return 0.0
        try:
            dt = datetime.fromisoformat(lv)
            now = datetime.now(tz=timezone.utc)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            days = (now - dt).total_seconds() / 86400.0
            return 1.0 / (1.0 + days)
        except (ValueError, OSError):
            return 0.0

    # ------------------------------------------------------------------
    # Public search
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        weights: WeightsConfig,
        max_results: int = 50,
        sources: Optional[list[str]] = None,
        exclude_patterns: Optional[list[str]] = None,
        min_visit_count: int = 0,
    ) -> list[dict]:
        """Return top-N results scored and sorted."""
        q = query.strip()
        if not q:
            return []

        exclude_res = [re.compile(p, re.IGNORECASE) for p in (exclude_patterns or [])]

        results: list[dict] = []
        for idx, entry in enumerate(self._entries):
            # Source filter
            if sources and entry["source"] not in sources:
                continue

            # Visit count filter
            if entry["visit_count"] < min_visit_count:
                continue

            # URL exclusion
            url = entry["url"]
            if any(rx.search(url) for rx in exclude_res):
                continue

            # Token gate (hard filter)
            if not self._token_gate(q, entry):
                continue

            # Score
            fuzzy = self._fuzzy_score(q, entry)
            tfidf = self._tfidf.score(idx, q)
            frecency = self._frecency_score(entry)
            recency = self._recency_score(entry)

            score = (
                weights.fuzzy    * fuzzy
                + weights.tfidf  * tfidf
                + weights.frecency * frecency
                + weights.recency  * recency
            )

            result = dict(entry)
            result["score"] = round(score, 4)
            results.append(result)

        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:max_results]
