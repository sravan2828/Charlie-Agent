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

import { Brain, SYSTEM_PROMPT } from "./brain/brain.js";
import { getSettings } from "./config.js";
import { LLMClient, LLMConfigError } from "./llm.js";

export { SYSTEM_PROMPT };

export class Agent {
  /**
   * @param {object} [opts]
   * @param {string} [opts.callerId]
   * @param {import("./config.js").Settings | null} [opts.settings]
   * @param {LLMClient | null} [opts.llm]
   * @param {import("./memory.js").CallerMemory | null} [opts.memory]
   * @param {Brain | null} [opts.brain]
   */
  constructor({
    callerId = "cli",
    settings = null,
    llm = null,
    memory = null,
    brain = null,
  } = {}) {
    this.settings = settings || getSettings();
    this.llm = llm || new LLMClient(this.settings);
    this.brain =
      brain ||
      new Brain({
        callerId,
        settings: this.settings,
        memory,
      });
    this.memory = this.brain.memory;
    this.callerId = callerId;
    this.messages = [{ role: "system", content: this.brain.instructions() }];
  }

  /** Start a fresh conversation while keeping caller memory. */
  reset() {
    this.messages = [{ role: "system", content: this.brain.instructions() }];
  }

  /**
   * Process one user turn; returns the assistant's final reply text.
   * @param {string} text
   * @returns {Promise<string>}
   */
  async handleUserMessage(text) {
    text = (text || "").trim();
    if (!text) return "I didn't catch that. Could you say it again?";

    const clean = this.brain.noteUtterance("user", text);
    this.messages.push({ role: "user", content: clean });

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

    this.brain.noteUtterance("assistant", reply);
    return reply;
  }

  async _runToolLoop() {
    const maxIters = this.settings.llmMaxToolIterations;
    for (let i = 0; i < maxIters; i++) {
      const data = await this.llm.chat(this.messages, this.brain.toolSchemas());
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
        const result = await this.brain.executeTool(name, rawArgs, {
          transcript: this._latestUserText(),
        });
        this.messages.push({
          role: "tool",
          tool_call_id: call.id || name,
          content: JSON.stringify(result),
        });
      }
    }
    return "I ran out of tool-call steps. Could you rephrase the request?";
  }

  /** Latest user utterance, treated as data when a tool call is authorized. */
  _latestUserText() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === "user") return String(this.messages[i].content || "");
    }
    return "";
  }
}
