"""Core agent loop: multi-turn history + LLM + tool dispatch.

This is the heart of Charlie-Agent. It is intentionally small and readable
so the architecture is obvious:

  user utterance
      -> append to per-call message history
      -> call LLM (with tool schemas)
      -> if tool_calls: dispatch, append tool results, loop
      -> else: return final assistant text

Max iterations prevent runaway tool loops.
"""

from __future__ import annotations

import json
from typing import Any

from charlie.config import Settings, get_settings
from charlie.llm import LLMClient, LLMConfigError
from charlie.memory import CallerMemory
from charlie.tools.registry import TOOL_SCHEMAS, dispatch_tool

SYSTEM_PROMPT = """You are Charlie, a helpful phone-first AI agent.
You answer inbound phone calls and can place outbound calls / make tool calls.
Keep spoken replies concise (1-3 sentences) unless the caller asks for detail.
You may call tools when helpful. If a tool returns STUB data, say so honestly.
You are an independent open-source agent inspired by Grok bots; you are not Grok
and not affiliated with xAI.
"""


class Agent:
    """Stateful agent bound to one caller / conversation."""

    def __init__(
        self,
        caller_id: str = "cli",
        settings: Settings | None = None,
        llm: LLMClient | None = None,
        memory: CallerMemory | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.llm = llm or LLMClient(self.settings)
        self.memory = memory or CallerMemory(caller_id)
        self.caller_id = caller_id
        self.messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT
                + "\n\nCaller memory:\n"
                + self.memory.as_prompt_block(),
            }
        ]

    def reset(self) -> None:
        """Start a fresh conversation while keeping caller memory."""
        self.messages = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT
                + "\n\nCaller memory:\n"
                + self.memory.as_prompt_block(),
            }
        ]

    def handle_user_message(self, text: str) -> str:
        """Process one user turn; returns the assistant's final reply text."""
        text = (text or "").strip()
        if not text:
            return "I didn't catch that. Could you say it again?"

        self.messages.append({"role": "user", "content": text})
        self.memory.add_note(f"user: {text[:200]}")

        try:
            reply = self._run_tool_loop()
        except LLMConfigError as exc:
            # Graceful degradation — no key configured.
            reply = (
                f"[Charlie offline] {exc} "
                "You can still explore the telephony stubs and tool registry."
            )
            self.messages.append({"role": "assistant", "content": reply})
            return reply
        except Exception as exc:  # noqa: BLE001 — showcase surface
            reply = f"Sorry, I hit an error talking to the model: {exc}"
            self.messages.append({"role": "assistant", "content": reply})
            return reply

        self.memory.add_note(f"assistant: {reply[:200]}")
        return reply

    def _run_tool_loop(self) -> str:
        max_iters = self.settings.llm_max_tool_iterations
        for _ in range(max_iters):
            data = self.llm.chat(self.messages, tools=TOOL_SCHEMAS)
            choice = (data.get("choices") or [{}])[0]
            message = choice.get("message") or {}
            tool_calls = message.get("tool_calls") or []

            # Persist the assistant message (may include tool_calls).
            self.messages.append(message)

            if not tool_calls:
                return (message.get("content") or "").strip() or "(no reply)"

            for call in tool_calls:
                fn = call.get("function") or {}
                name = fn.get("name") or ""
                raw_args = fn.get("arguments") or "{}"
                result = dispatch_tool(name, raw_args, memory=self.memory)
                self.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id") or name,
                        "content": json.dumps(result),
                    }
                )

        return "I ran out of tool-call steps. Could you rephrase the request?"
