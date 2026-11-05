/**
 * Tool registry tests — no network, no credentials.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SEARCH_BACKEND = "stub";
process.env.HTTP_ALLOWLIST = "example.com";
process.env.XAI_API_KEY = "";
process.env.MEMORY_DIR = path.join(os.tmpdir(), "charlie-test-memory");

const { clearSettingsCache, getSettings } = await import("../src/config.js");
const { CallerMemory } = await import("../src/memory.js");
const { TOOL_SCHEMAS, dispatchTool } = await import("../src/tools/registry.js");
const { search } = await import("../src/tools/webSearch.js");

beforeEach(() => clearSettingsCache());
afterEach(() => clearSettingsCache());

describe("tools", () => {
  it("tool schemas include expected names", () => {
    const names = new Set(TOOL_SCHEMAS.map((t) => t.function.name));
    assert.deepEqual([...names].sort(), ["http_request", "remember", "web_search"]);
  });

  it("web search stub is labelled", async () => {
    clearSettingsCache();
    const result = await search("agent harness");
    assert.equal(result.ok, true);
    assert.equal(result.backend, "stub");
    assert.match(result.note, /STUB/);
    assert.match(result.results[0].title, /STUB/);
  });

  it("http_request blocks non-allowlisted host", async () => {
    clearSettingsCache();
    getSettings(); // ensure allowlist = example.com
    const result = await dispatchTool("http_request", {
      url: "https://evil.example.org/secret",
      method: "GET",
    });
    assert.equal(result.ok, false);
    assert.match(result.error.toLowerCase(), /allowlist|not on/);
  });

  it("remember persists fact", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "charlie-mem-"));
    try {
      const mem = new CallerMemory("test-caller", tmp);
      const result = await dispatchTool(
        "remember",
        { key: "name", value: "Sravan" },
        { memory: mem },
      );
      assert.equal(result.ok, true);
      const reloaded = new CallerMemory("test-caller", tmp);
      assert.equal(reloaded._data.facts.name, "Sravan");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
