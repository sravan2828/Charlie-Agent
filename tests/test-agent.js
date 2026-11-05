/**
 * Agent loop tests with a mocked LLM — no network, no credentials.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SEARCH_BACKEND = "stub";
process.env.HTTP_ALLOWLIST = "example.com";
process.env.XAI_API_KEY = "";
process.env.MEMORY_DIR = path.join(os.tmpdir(), "charlie-test-memory-agent");

const { clearSettingsCache } = await import("../src/config.js");
const { Agent } = await import("../src/agent.js");
const { LLMClient, LLMConfigError } = await import("../src/llm.js");
const { CallerMemory } = await import("../src/memory.js");

beforeEach(() => clearSettingsCache());
afterEach(() => clearSettingsCache());

class FakeLLM extends LLMClient {
  /** @param {object[]} script */
  constructor(script) {
    super({ hasLlmKey: true, llmModel: "fake", llmBaseUrl: "http://local", xaiApiKey: "x" });
    this._script = [...script];
    this.calls = 0;
  }

  ensureReady() {
    return null;
  }

  async chat() {
    if (!this._script.length) throw new AssertionError("FakeLLM script exhausted");
    this.calls += 1;
    return this._script.shift();
  }
}

class AssertionError extends Error {}

function assistantText(content) {
  return { choices: [{ message: { role: "assistant", content } }] };
}

function assistantTool(name, args, callId = "call_1") {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: callId,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

describe("agent", () => {
  it("plain reply", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "charlie-agent-"));
    try {
      const llm = new FakeLLM([assistantText("Hello from Charlie.")]);
      const agent = new Agent({
        callerId: "t1",
        llm,
        memory: new CallerMemory("t1", tmp),
      });
      const reply = await agent.handleUserMessage("hi");
      assert.equal(reply, "Hello from Charlie.");
      assert.equal(llm.calls, 1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("tool then reply", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "charlie-agent-"));
    try {
      const llm = new FakeLLM([
        assistantTool("web_search", { query: "Grok voice" }),
        assistantText("I searched; results were stubs."),
      ]);
      const agent = new Agent({
        callerId: "t2",
        llm,
        memory: new CallerMemory("t2", tmp),
      });
      const reply = await agent.handleUserMessage("search for Grok voice");
      assert.match(reply.toLowerCase(), /stubs|searched/);
      assert.equal(llm.calls, 2);
      const roles = agent.messages.map((m) => m.role);
      assert.ok(roles.includes("tool"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("llm missing key raises", () => {
    clearSettingsCache();
    const client = new LLMClient();
    assert.throws(() => client.ensureReady(), LLMConfigError);
  });

  it("agent degrades without key", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "charlie-agent-"));
    try {
      clearSettingsCache();
      const agent = new Agent({
        callerId: "t3",
        memory: new CallerMemory("t3", tmp),
      });
      const reply = await agent.handleUserMessage("hello");
      assert.match(reply.toLowerCase(), /offline|api key/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
