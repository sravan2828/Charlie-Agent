/**
 * Charlie-Agent: a phone-first AI agent showcase inspired by Grok bots.
 *
 * Independent open-source project — not affiliated with, endorsed by,
 * or connected to xAI.
 */

export { Agent, SYSTEM_PROMPT } from "./agent.js";
export { getSettings, clearSettingsCache } from "./config.js";
export { LLMClient, LLMConfigError } from "./llm.js";
export { CallerMemory } from "./memory.js";
export { TOOL_SCHEMAS, dispatchTool } from "./tools/registry.js";

export const VERSION = "0.1.0";
