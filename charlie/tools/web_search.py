"""Pluggable web search tool.

Backends:
  - stub (default): clearly labelled fake results so demos work offline
  - duckduckgo: lightweight Instant Answer API (no API key; rate-limited)

Production agents would plug in a proper search API (e.g. xAI server-side
web_search, Tavily, SerpAPI). This showcase keeps the interface honest.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import quote_plus

import httpx

from charlie.config import get_settings


def search(query: str, max_results: int = 3) -> dict[str, Any]:
    """Run a web search and return a structured result dict."""
    settings = get_settings()
    backend = (settings.search_backend or "stub").strip().lower()
    query = (query or "").strip()
    if not query:
        return {"ok": False, "error": "empty query", "backend": backend}

    if backend == "duckduckgo":
        return _duckduckgo(query, max_results)
    return _stub(query, max_results)


def _stub(query: str, max_results: int) -> dict[str, Any]:
    """Clearly labelled stub — never pretends to be live search."""
    results = [
        {
            "title": f"[STUB RESULT] Overview related to: {query}",
            "url": "https://example.com/stub-search",
            "snippet": (
                "This is a STUB search result. Set SEARCH_BACKEND=duckduckgo "
                "or wire a real search API for live data. Charlie-Agent ships "
                "offline-safe by default."
            ),
        }
    ]
    return {
        "ok": True,
        "backend": "stub",
        "query": query,
        "results": results[:max_results],
        "note": "STUB: not live web data",
    }


def _duckduckgo(query: str, max_results: int) -> dict[str, Any]:
    """DuckDuckGo Instant Answer API — free, no key, limited coverage."""
    url = f"https://api.duckduckgo.com/?q={quote_plus(query)}&format=json&no_redirect=1"
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, headers={"User-Agent": "Charlie-Agent/0.1"})
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, json.JSONDecodeError) as exc:
        return {"ok": False, "backend": "duckduckgo", "error": str(exc), "query": query}

    results: list[dict[str, str]] = []
    if data.get("AbstractText"):
        results.append(
            {
                "title": data.get("Heading") or query,
                "url": data.get("AbstractURL") or "",
                "snippet": data["AbstractText"],
            }
        )
    for topic in data.get("RelatedTopics") or []:
        if len(results) >= max_results:
            break
        if isinstance(topic, dict) and topic.get("Text"):
            results.append(
                {
                    "title": topic.get("Text", "")[:80],
                    "url": topic.get("FirstURL") or "",
                    "snippet": topic.get("Text") or "",
                }
            )
    if not results:
        results.append(
            {
                "title": "No Instant Answer",
                "url": f"https://duckduckgo.com/?q={quote_plus(query)}",
                "snippet": "DuckDuckGo Instant Answer returned nothing; try a more specific query.",
            }
        )
    return {"ok": True, "backend": "duckduckgo", "query": query, "results": results[:max_results]}
