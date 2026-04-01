"""Configuration loading for memories.

Load order: built-in defaults → ~/.config/memories/config.toml → CLI flag overrides.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


_CONFIG_PATH = Path.home() / ".config" / "memories" / "config.toml"


@dataclass
class ServerConfig:
    port: int = 8765
    open_browser: bool = True
    open_in_new_tab: bool = True


@dataclass
class FirefoxConfig:
    profile: str = ""
    refresh_interval: int = 300


@dataclass
class SearchConfig:
    max_results: int = 50
    sources: list[str] = field(default_factory=lambda: ["bookmarks", "history"])


@dataclass
class WeightsConfig:
    frecency: float = 0.4
    tfidf: float = 0.3
    fuzzy: float = 0.2
    recency: float = 0.1


@dataclass
class FilterConfig:
    exclude_url_patterns: list[str] = field(default_factory=list)
    min_visit_count: int = 0


@dataclass
class Config:
    server: ServerConfig = field(default_factory=ServerConfig)
    firefox: FirefoxConfig = field(default_factory=FirefoxConfig)
    search: SearchConfig = field(default_factory=SearchConfig)
    weights: WeightsConfig = field(default_factory=WeightsConfig)
    filter: FilterConfig = field(default_factory=FilterConfig)


def _apply_toml(cfg: Config, data: dict) -> None:
    """Merge TOML data into cfg in-place."""
    if "server" in data:
        s = data["server"]
        srv = cfg.server
        if "port" in s:
            srv.port = int(s["port"])
        if "open_browser" in s:
            srv.open_browser = bool(s["open_browser"])
        if "open_in_new_tab" in s:
            srv.open_in_new_tab = bool(s["open_in_new_tab"])

    if "firefox" in data:
        f = data["firefox"]
        fox = cfg.firefox
        if "profile" in f:
            fox.profile = str(f["profile"])
        if "refresh_interval" in f:
            fox.refresh_interval = int(f["refresh_interval"])

    if "search" in data:
        sc = data["search"]
        srch = cfg.search
        if "max_results" in sc:
            srch.max_results = int(sc["max_results"])
        if "sources" in sc:
            srch.sources = list(sc["sources"])

    if "weights" in data:
        w = data["weights"]
        wt = cfg.weights
        if "frecency" in w:
            wt.frecency = float(w["frecency"])
        if "tfidf" in w:
            wt.tfidf = float(w["tfidf"])
        if "fuzzy" in w:
            wt.fuzzy = float(w["fuzzy"])
        if "recency" in w:
            wt.recency = float(w["recency"])

    if "filter" in data:
        fl = data["filter"]
        flt = cfg.filter
        if "exclude_url_patterns" in fl:
            flt.exclude_url_patterns = list(fl["exclude_url_patterns"])
        if "min_visit_count" in fl:
            flt.min_visit_count = int(fl["min_visit_count"])


def load_config(
    port: Optional[int] = None,
    profile: Optional[str] = None,
    open_browser: Optional[bool] = None,
    config_path: Optional[Path] = None,
) -> Config:
    """Load config from file then apply any CLI overrides."""
    cfg = Config()

    path = config_path or _CONFIG_PATH
    if path.exists():
        with open(path, "rb") as fh:
            data = tomllib.load(fh)
        _apply_toml(cfg, data)

    # CLI overrides (highest priority)
    if port is not None:
        cfg.server.port = port
    if profile is not None:
        cfg.firefox.profile = profile
    if open_browser is not None:
        cfg.server.open_browser = open_browser

    return cfg
