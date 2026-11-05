"""Tool schemas (OpenAI function-calling shape) and a dispatch table."""

from __future__ import annotations

import json
from typing import Any, Callable

from charlie.tools import http_request as http_request_mod
from charlie.tools import web_search as web_search_mod

# OpenAI-compatible tool definitions the LLM sees.
TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for up-to-date information. "
                "May return STUB results when SEARCH_BACKEND=stub."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "max_results": {
                        "type": "integer",
                        "description": "Max results (1-5)",
                        "default": 3,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "http_request",
            "description": (
                "Make an HTTP request to an allowlisted host. "
                "Use for fetching public JSON/APIs, not arbitrary browsing."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Full http(s) URL"},
                    "method": {
                        "type": "string",
                        "enum": ["GET", "POST", "HEAD"],
                        "default": "GET",
                    },
                    "json_body": {
                        "type": "object",
                        "description": "Optional JSON body for POST",
                    },
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remember",
            "description": "Store a short fact about the current caller for future calls.",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "Fact key, e.g. preferred_name"},
                    "value": {"type": "string", "description": "Fact value"},
                },
                "required": ["key", "value"],
            },
        },
    },
]


def _remember(key: str, value: str, *, memory: Any = None) -> dict[str, Any]:
    if memory is None:
        return {"ok": False, "error": "no memory context bound for this turn"}
    memory.set_fact(key, value)
    return {"ok": True, "key": key, "value": value}


_HANDLERS: dict[str, Callable[..., dict[str, Any]]] = {
    "web_search": lambda **kw: web_search_mod.search(
        query=kw.get("query", ""),
        max_results=int(kw.get("max_results") or 3),
    ),
    "http_request": lambda **kw: http_request_mod.http_request(
        url=kw.get("url", ""),
        method=kw.get("method") or "GET",
        json_body=kw.get("json_body"),
    ),
    "remember": _remember,
}


def dispatch_tool(
    name: str,
    arguments: dict[str, Any] | str,
    *,
    memory: Any = None,
) -> dict[str, Any]:
    """Execute a named tool. Unknown tools return an error payload."""
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments or "{}")
        except json.JSONDecodeError:
            return {"ok": False, "error": "invalid JSON arguments"}
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"ok": False, "error": f"unknown tool: {name}"}
    if name == "remember":
        return handler(memory=memory, **arguments)  # type: ignore[misc]
    return handler(**arguments)
