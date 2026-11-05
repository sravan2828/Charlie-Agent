/**
 * Minimal OpenAI-compatible chat-completions client using built-in fetch.
 *
 * Point LLM_BASE_URL at https://api.x.ai/v1 (or any compatible provider).
 * Degrades with a clear error when no API key is configured.
 */

import { getSettings } from "./config.js";

export class LLMConfigError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "LLMConfigError";
  }
}

export class LLMClient {
  /** @param {import("./config.js").Settings | null} [settings] */
  constructor(settings = null) {
    this.settings = settings || getSettings();
  }

  ensureReady() {
    if (!this.settings.hasLlmKey) {
      throw new LLMConfigError(
        "No LLM API key configured. Set XAI_API_KEY in your environment " +
          "(see .env.example). Charlie-Agent uses an OpenAI-compatible " +
          `endpoint at ${this.settings.llmBaseUrl}.`,
      );
    }
  }

  /**
   * Call chat completions and return the raw JSON response body.
   * @param {object[]} messages
   * @param {object[] | null} [tools]
   * @param {string | object} [toolChoice]
   * @param {number} [timeoutMs]
   */
  async chat(messages, tools = null, toolChoice = "auto", timeoutMs = 60_000) {
    this.ensureReady();
    /** @type {Record<string, unknown>} */
    const payload = {
      model: this.settings.llmModel,
      messages,
    };
    if (tools) {
      payload.tools = tools;
      payload.tool_choice = toolChoice;
    }

    const url = `${this.settings.llmBaseUrl.replace(/\/$/, "")}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.xaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`LLM HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
