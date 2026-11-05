/**
 * Core agent loop: multi-turn history + LLM + tool dispatch.
 *
 * Intentionally small and readable:
 *   user utterance
 *     -> append to per-call message history
 *     -> call LLM (with tool schemas)
 *     -> if tool_calls: dispatch, append tool results, loop
 *     -> else: return final assistant text
 */

import { getSettings } from "./config.js";
import { LLMClient, LLMConfigError } from "./llm.js";
import { CallerMemory } from "./memory.js";
import { TOOL_SCHEMAS, dispatchTool } from "./tools/registry.js";

export const SYSTEM_PROMPT = `You are Charlie, a helpful phone-first AI agent.
You answer inbound phone calls and can place outbound calls / make tool calls.
Keep spoken replies concise (1-3 sentences) unless the caller asks for detail.
You may call tools when helpful. If a tool returns STUB data, say so honestly.
You are an independent open-source agent inspired by Grok bots; you are not Grok
and not affiliated with xAI.
`;

export class Agent {
  /**
   * @param {object} [opts]
   * @param {string} [opts.callerId]
   * @param {import("./config.js").Settings | null} [opts.settings]
   * @param {LLMClient | null} [opts.llm]
   * @param {CallerMemory | null} [opts.memory]
   */
  constructor({ callerId = "cli", settings = null, llm = null, memory = null } = {}) {
    this.settings = settings || getSettings();
    this.llm = llm || new LLMClient(this.settings);
    this.memory = memory || new CallerMemory(callerId);
    this.callerId = callerId;
    this.messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT + "\n\nCaller memory:\n" + this.memory.asPromptBlock(),
      },
    ];
  }

  /** Start a fresh conversation while keeping caller memory. */
  reset() {
    this.messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT + "\n\nCaller memory:\n" + this.memory.asPromptBlock(),
      },
    ];
  }

  /**
   * Process one user turn; returns the assistant's final reply text.
   * @param {string} text
   * @returns {Promise<string>}
   */
  async handleUserMessage(text) {
    text = (text || "").trim();
    if (!text) return "I didn't catch that. Could you say it again?";

    this.messages.push({ role: "user", content: text });
    this.memory.addNote(`user: ${text.slice(0, 200)}`);

    let reply;
    try {
      reply = await this._runToolLoop();
    } catch (exc) {
      if (exc instanceof LLMConfigError) {
        reply =
          `[Charlie offline] ${exc.message} ` +
          "You can still explore the telephony stubs and tool registry.";
        this.messages.push({ role: "assistant", content: reply });
        return reply;
      }
      reply = `Sorry, I hit an error talking to the model: ${exc.message || exc}`;
      this.messages.push({ role: "assistant", content: reply });
      return reply;
    }

    this.memory.addNote(`assistant: ${reply.slice(0, 200)}`);
    return reply;
  }

  async _runToolLoop() {
    const maxIters = this.settings.llmMaxToolIterations;
    for (let i = 0; i < maxIters; i++) {
      const data = await this.llm.chat(this.messages, TOOL_SCHEMAS);
      const choice = (data.choices || [{}])[0];
      const message = choice.message || {};
      const toolCalls = message.tool_calls || [];

      this.messages.push(message);

      if (!toolCalls.length) {
        return (message.content || "").trim() || "(no reply)";
      }

      for (const call of toolCalls) {
        const fn = call.function || {};
        const name = fn.name || "";
        const rawArgs = fn.arguments || "{}";
        const result = await dispatchTool(name, rawArgs, { memory: this.memory });
        this.messages.push({
          role: "tool",
          tool_call_id: call.id || name,
          content: JSON.stringify(result),
        });
      }
    }
    return "I ran out of tool-call steps. Could you rephrase the request?";
  }
}
