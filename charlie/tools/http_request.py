"""Constrained HTTP request tool.

Safety notes (read before enabling in production):
  - Only hosts on HTTP_ALLOWLIST may be contacted.
  - Redirects are not followed blindly (allow_redirects=False).
  - Response bodies are truncated.
  - No credentials are forwarded from the environment.
  - This is intentionally NOT a general-purpose browser / SSRF vector.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from charlie.config import get_settings

_MAX_BODY = 4_000
_ALLOWED_METHODS = {"GET", "POST", "HEAD"}


def http_request(
    url: str,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
    timeout: float = 10.0,
) -> dict[str, Any]:
    """Perform an allowlisted HTTP request and return a safe summary."""
    settings = get_settings()
    method = (method or "GET").upper()
    if method not in _ALLOWED_METHODS:
        return {"ok": False, "error": f"method not allowed: {method}"}

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return {"ok": False, "error": "only http/https URLs are allowed"}
    host = (parsed.hostname or "").lower()
    if not host:
        return {"ok": False, "error": "missing host"}
    if host not in settings.http_allowlist_hosts:
        return {
            "ok": False,
            "error": f"host '{host}' is not on HTTP_ALLOWLIST",
            "allowlist": sorted(settings.http_allowlist_hosts),
        }

    try:
        with httpx.Client(timeout=timeout, follow_redirects=False) as client:
            resp = client.request(method, url, json=json_body)
    except httpx.HTTPError as exc:
        return {"ok": False, "error": str(exc), "url": url}

    body = resp.text[:_MAX_BODY]
    return {
        "ok": True,
        "status_code": resp.status_code,
        "url": str(resp.url),
        "headers": {"content-type": resp.headers.get("content-type", "")},
        "body_truncated": body,
        "truncated": len(resp.text) > _MAX_BODY,
    }
