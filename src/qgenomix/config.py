"""Configuration loading with dotted overrides and a stable hash for provenance."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]


class Config(dict):
    """A dict with attribute access for nested keys (read-only convenience)."""

    def __getattr__(self, key: str) -> Any:
        try:
            value = self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc
        return Config(value) if isinstance(value, dict) else value

    def path(self, key: str) -> Path:
        """Resolve a `paths.<key>` entry relative to the project root."""
        p = Path(self["paths"][key])
        return p if p.is_absolute() else ROOT / p

    def hash(self) -> str:
        blob = json.dumps(self, sort_keys=True, default=str).encode()
        return hashlib.sha256(blob).hexdigest()[:8]


def _set_dotted(d: dict, dotted: str, value: Any) -> None:
    keys = dotted.split(".")
    for k in keys[:-1]:
        d = d.setdefault(k, {})
    d[keys[-1]] = value


def load_config(path: str | Path = ROOT / "configs" / "main.yaml", **overrides: Any) -> Config:
    """Load a YAML config; keyword overrides use '__' for nesting, e.g. simulator__gamma=0.2."""
    with open(path) as fh:
        cfg = yaml.safe_load(fh)
    cfg = copy.deepcopy(cfg)
    for key, value in overrides.items():
        _set_dotted(cfg, key.replace("__", "."), value)
    return Config(cfg)
