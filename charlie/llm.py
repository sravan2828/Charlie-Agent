"""Minimal OpenAI-compatible chat-completions client via httpx.

Point `LLM_BASE_URL` at https://api.x.ai/v1 (or any compatible provider).
Degrades with a clear error when no API key is configured.
"""

from __future__ import annotations

from typing import Any

import httpx

from charlie.config import Settings, get_settings


class LLMConfigError(RuntimeError):
    """Raised when the LLM cannot be called because of missing config."""


class LLMClient:
    """Thin wrapper around POST /chat/completions."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def ensure_ready(self) -> None:
        if not self.settings.has_llm_key:
            raise LLMConfigError(
                "No LLM API key configured. Set XAI_API_KEY in your environment "
                "(see .env.example). Charlie-Agent uses an OpenAI-compatible "
                f"endpoint at {self.settings.llm_base_url}."
            )

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict[str, Any] = "auto",
        timeout: float = 60.0,
    ) -> dict[str, Any]:
        """Call chat completions and return the raw JSON response body."""
        self.ensure_ready()
        payload: dict[str, Any] = {
            "model": self.settings.llm_model,
            "messages": messages,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice

        headers = {
            "Authorization": f"Bearer {self.settings.xai_api_key}",
            "Content-Type": "application/json",
        }
        url = self.settings.llm_base_url.rstrip("/") + "/chat/completions"
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()
