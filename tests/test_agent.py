"""Agent loop tests with a mocked LLM — no network, no credentials."""

from __future__ import annotations

import json
import os
from typing import Any

import pytest

os.environ["SEARCH_BACKEND"] = "stub"
os.environ["HTTP_ALLOWLIST"] = "example.com"
os.environ["XAI_API_KEY"] = ""
os.environ["MEMORY_DIR"] = "/tmp/charlie-test-memory-agent"

from charlie.agent import Agent
from charlie.config import get_settings
from charlie.llm import LLMClient, LLMConfigError
from charlie.memory import CallerMemory


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class FakeLLM(LLMClient):
    """Deterministic stand-in that optionally emits one tool call."""

    def __init__(self, script: list[dict[str, Any]]) -> None:
        # Skip real Settings wiring.
        self._script = list(script)
        self.calls = 0

    def ensure_ready(self) -> None:
        return None

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict[str, Any] = "auto",
        timeout: float = 60.0,
    ) -> dict[str, Any]:
        if not self._script:
            raise AssertionError("FakeLLM script exhausted")
        item = self._script.pop(0)
        self.calls += 1
        return item


def _assistant_text(content: str) -> dict[str, Any]:
    return {"choices": [{"message": {"role": "assistant", "content": content}}]}


def _assistant_tool(name: str, args: dict[str, Any], call_id: str = "call_1") -> dict[str, Any]:
    return {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": name,
                                "arguments": json.dumps(args),
                            },
                        }
                    ],
                }
            }
        ]
    }


def test_agent_plain_reply(tmp_path):
    llm = FakeLLM([_assistant_text("Hello from Charlie.")])
    agent = Agent(
        caller_id="t1",
        llm=llm,
        memory=CallerMemory("t1", memory_dir=tmp_path),
    )
    reply = agent.handle_user_message("hi")
    assert reply == "Hello from Charlie."
    assert llm.calls == 1


def test_agent_tool_then_reply(tmp_path):
    llm = FakeLLM(
        [
            _assistant_tool("web_search", {"query": "Grok voice"}),
            _assistant_text("I searched; results were stubs."),
        ]
    )
    agent = Agent(
        caller_id="t2",
        llm=llm,
        memory=CallerMemory("t2", memory_dir=tmp_path),
    )
    reply = agent.handle_user_message("search for Grok voice")
    assert "stubs" in reply.lower() or "searched" in reply.lower()
    assert llm.calls == 2
    # History should include user, assistant(tool_calls), tool, assistant(final)
    roles = [m.get("role") for m in agent.messages]
    assert "tool" in roles


def test_llm_missing_key_raises():
    get_settings.cache_clear()
    client = LLMClient()
    with pytest.raises(LLMConfigError):
        client.ensure_ready()


def test_agent_degrades_without_key(tmp_path):
    """Real LLMClient + empty key -> graceful offline message."""
    agent = Agent(
        caller_id="t3",
        memory=CallerMemory("t3", memory_dir=tmp_path),
    )
    reply = agent.handle_user_message("hello")
    assert "offline" in reply.lower() or "api key" in reply.lower()
