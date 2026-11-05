"""Simple per-caller JSON file memory.

Mirrors the *idea* of Grok Bot persistent memory across conversations,
but keeps everything local and transparent so the showcase stays
credential-free and easy to inspect.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from charlie.config import get_settings


_SAFE_ID = re.compile(r"[^a-zA-Z0-9_+\-]+")


def _sanitize_caller_id(caller_id: str) -> str:
    cleaned = _SAFE_ID.sub("_", caller_id.strip()) or "anonymous"
    return cleaned[:64]


class CallerMemory:
    """Load / save a small JSON profile for one caller."""

    def __init__(self, caller_id: str, memory_dir: Path | None = None) -> None:
        settings = get_settings()
        self.caller_id = caller_id
        self.memory_dir = Path(memory_dir or settings.memory_dir)
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.memory_dir / f"{_sanitize_caller_id(caller_id)}.json"
        self._data: dict[str, Any] = self._load()

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {
                "caller_id": self.caller_id,
                "notes": [],
                "facts": {},
                "updated_at": None,
            }
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {
                "caller_id": self.caller_id,
                "notes": [],
                "facts": {},
                "updated_at": None,
            }

    def save(self) -> None:
        self._data["updated_at"] = datetime.now(timezone.utc).isoformat()
        self.path.write_text(json.dumps(self._data, indent=2), encoding="utf-8")

    def add_note(self, note: str) -> None:
        notes = self._data.setdefault("notes", [])
        notes.append({"ts": datetime.now(timezone.utc).isoformat(), "text": note})
        # Keep the file small for the showcase.
        self._data["notes"] = notes[-20:]
        self.save()

    def set_fact(self, key: str, value: str) -> None:
        facts = self._data.setdefault("facts", {})
        facts[key] = value
        self.save()

    def as_prompt_block(self) -> str:
        """Compact text the agent can prepend to the system prompt."""
        facts = self._data.get("facts") or {}
        notes = self._data.get("notes") or []
        if not facts and not notes:
            return "No prior memory for this caller."
        lines = ["Known facts:"]
        for k, v in facts.items():
            lines.append(f"- {k}: {v}")
        if notes:
            lines.append("Recent notes:")
            for n in notes[-5:]:
                lines.append(f"- {n.get('text', '')}")
        return "\n".join(lines)
