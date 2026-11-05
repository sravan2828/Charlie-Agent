"""Tool registry tests — no network, no credentials."""

from __future__ import annotations

import os

import pytest

# Force stub backend + empty allowlist before imports that cache settings.
os.environ["SEARCH_BACKEND"] = "stub"
os.environ["HTTP_ALLOWLIST"] = "example.com"
os.environ["XAI_API_KEY"] = ""
os.environ["MEMORY_DIR"] = "/tmp/charlie-test-memory"

from charlie.config import get_settings
from charlie.memory import CallerMemory
from charlie.tools.registry import TOOL_SCHEMAS, dispatch_tool
from charlie.tools.web_search import search


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_tool_schemas_include_expected_names():
    names = {t["function"]["name"] for t in TOOL_SCHEMAS}
    assert names == {"web_search", "http_request", "remember"}


def test_web_search_stub_is_labelled():
    result = search("agent harness")
    assert result["ok"] is True
    assert result["backend"] == "stub"
    assert "STUB" in result["note"]
    assert "STUB" in result["results"][0]["title"]


def test_http_request_blocks_non_allowlisted_host():
    result = dispatch_tool(
        "http_request",
        {"url": "https://evil.example.org/secret", "method": "GET"},
    )
    assert result["ok"] is False
    assert "allowlist" in result["error"].lower() or "not on" in result["error"]


def test_remember_persists_fact(tmp_path):
    mem = CallerMemory("test-caller", memory_dir=tmp_path)
    result = dispatch_tool("remember", {"key": "name", "value": "Sravan"}, memory=mem)
    assert result["ok"] is True
    reloaded = CallerMemory("test-caller", memory_dir=tmp_path)
    assert reloaded._data["facts"]["name"] == "Sravan"
