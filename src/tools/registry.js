/**
 * Tool schemas (OpenAI function-calling shape) and a dispatch table.
 */

import { search as webSearch } from "./webSearch.js";
import { httpRequest } from "./httpRequest.js";

/** OpenAI-compatible tool definitions the LLM sees. */
export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for up-to-date information. " +
        "May return STUB results when SEARCH_BACKEND=stub.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          max_results: {
            type: "integer",
            description: "Max results (1-5)",
            default: 3,
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "http_request",
      description:
        "Make an HTTP request to an allowlisted host. " +
        "Use for fetching public JSON/APIs, not arbitrary browsing.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full http(s) URL" },
          method: {
            type: "string",
            enum: ["GET", "POST", "HEAD"],
            default: "GET",
          },
          json_body: {
            type: "object",
            description: "Optional JSON body for POST",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description: "Store a short fact about the current caller for future calls.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Fact key, e.g. preferred_name" },
          value: { type: "string", description: "Fact value" },
        },
        required: ["key", "value"],
      },
    },
  },
];

/**
 * @param {string} key
 * @param {string} value
 * @param {{ memory?: { setFact: Function } | null }} [ctx]
 */
function remember(key, value, ctx = {}) {
  if (!ctx.memory) {
    return { ok: false, error: "no memory context bound for this turn" };
  }
  ctx.memory.setFact(key, value);
  return { ok: true, key, value };
}

/**
 * Execute a named tool. Unknown tools return an error payload.
 * @param {string} name
 * @param {object | string} arguments_
 * @param {{ memory?: object | null }} [ctx]
 */
export async function dispatchTool(name, arguments_, ctx = {}) {
  let args = arguments_;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args || "{}");
    } catch {
      return { ok: false, error: "invalid JSON arguments" };
    }
  }
  args = args || {};

  switch (name) {
    case "web_search":
      return webSearch(args.query || "", Number(args.max_results) || 3);
    case "http_request":
      return httpRequest(args.url || "", args.method || "GET", args.json_body);
    case "remember":
      return remember(args.key, args.value, ctx);
    default:
      return { ok: false, error: `unknown tool: ${name}` };
  }
}
