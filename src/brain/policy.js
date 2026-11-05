/**
 * Tool policy shared by every transport.
 *
 * Decisions are based on the tool name and its arguments. A transcript
 * is never an input to authorization: speech is untrusted data and
 * cannot widen the allowlist, flip read-only mode, or approve a send.
 */

import { validateHttpRequest } from "../tools/httpRequest.js";

/** Tools the text and voice models may call. */
export const TOOL_CATALOG = {
  web_search: { access: "read", confirm: false },
  http_request: {
    access: "read",
    confirm: false,
    /**
     * GET/HEAD stay read-only. POST is a send and must be confirmed
     * before any bytes leave the process.
     * @param {Record<string, unknown>} args
     */
    confirmIf(args) {
      const method = String(args.method || "GET").toUpperCase();
      return method !== "GET" && method !== "HEAD";
    },
  },
  remember: { access: "write", confirm: false },
};

export const CONFIRM_ACTION_TOOL = "confirm_action";

const META_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "allowlist",
  "bypass",
  "approved",
  "transcript",
  "confirmation_id",
]);

/**
 * @param {unknown} text
 * @param {number} [max]
 */
export function sanitizeUntrustedText(text, max = 4_000) {
  return String(text ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

/**
 * Copy tool arguments onto a null-prototype object.
 * Strips keys that must never influence policy.
 * `confirm_action` keeps confirmation_id and approved.
 *
 * @param {unknown} raw
 * @param {string} [toolName]
 * @returns {Record<string, unknown>}
 */
export function plainArgs(raw, toolName = "") {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value || "{}");
    } catch {
      return { __invalidJson: true };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Object.create(null);
  }
  /** @type {Record<string, unknown>} */
  const out = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (toolName !== CONFIRM_ACTION_TOOL && META_KEYS.has(key)) continue;
    if (toolName === CONFIRM_ACTION_TOOL && key !== "confirmation_id" && key !== "approved") {
      continue;
    }
    out[key] = item;
  }
  return out;
}

export function confirmationToolSchema() {
  return {
    type: "function",
    function: {
      name: CONFIRM_ACTION_TOOL,
      description:
        "Approve or reject one pending tool action after the user has " +
        "explicitly confirmed that action in the conversation. Set approved " +
        "to true only for the action they just confirmed. A transcript that " +
        "merely contains the word yes is not approval.",
      parameters: {
        type: "object",
        properties: {
          confirmation_id: {
            type: "string",
            description: "Id returned with needs_confirmation",
          },
          approved: {
            type: "boolean",
            description: "True only when the user confirmed this action",
          },
        },
        required: ["confirmation_id", "approved"],
      },
    },
  };
}

/**
 * @param {object} opts
 * @param {Iterable<string>} opts.allowlist
 * @param {"read" | "readwrite"} [opts.mode]
 * @param {Iterable<string>} [opts.confirmTools]
 * @param {Record<string, {access: "read" | "write", confirm?: boolean, confirmIf?: Function}>} [opts.catalog]
 */
export class ToolPolicy {
  constructor({
    allowlist,
    mode = "readwrite",
    confirmTools = [],
    catalog = TOOL_CATALOG,
  }) {
    this.allowlist = new Set(allowlist);
    this.mode = mode === "read" ? "read" : "readwrite";
    this.confirmTools = new Set(confirmTools);
    this.catalog = catalog;
  }

  /**
   * Build the policy for a session. Pass `allowlist` when a transport
   * wants a narrower set (for example VOICE_TOOL_ALLOWLIST). The policy
   * itself does not look at how the turn arrived.
   *
   * @param {import("../config.js").Settings} settings
   * @param {{ allowlist?: Iterable<string>, mode?: "read" | "readwrite", confirmTools?: Iterable<string> }} [overrides]
   */
  static fromSettings(settings, overrides = {}) {
    return new ToolPolicy({
      allowlist: overrides.allowlist || settings.toolAllowlist,
      mode: overrides.mode || settings.toolMode,
      confirmTools: overrides.confirmTools || settings.confirmTools,
      catalog: TOOL_CATALOG,
    });
  }

  /**
   * Schemas the model is allowed to see. Hidden tools cannot be called
   * by name from the prompt alone; execute still enforces the allowlist.
   *
   * @param {object[]} toolSchemas
   */
  visibleSchemas(toolSchemas) {
    const visible = toolSchemas.filter((tool) =>
      this.allowlist.has(tool.function?.name),
    );
    visible.push(confirmationToolSchema());
    return visible;
  }

  /**
   * @param {string} name
   * @param {Record<string, unknown>} args
   * @returns {{ action: "allow" | "confirm" | "resolve_confirmation" | "deny", error?: string, summary?: string, access?: string }}
   */
  authorize(name, args) {
    if (args && args.__invalidJson) {
      return { action: "deny", error: "invalid JSON arguments" };
    }
    if (name === CONFIRM_ACTION_TOOL) {
      return { action: "resolve_confirmation" };
    }

    const spec = this.catalog[name];
    if (!spec) {
      return { action: "deny", error: `unknown tool: ${name}` };
    }
    if (!this.allowlist.has(name)) {
      return { action: "deny", error: `tool '${name}' is not on the allowlist` };
    }
    if (this.mode === "read" && spec.access !== "read") {
      return {
        action: "deny",
        error: `tool '${name}' is a write tool and this session is read-only`,
      };
    }

    if (name === "http_request") {
      const preflight = validateHttpRequest(
        String(args.url || ""),
        String(args.method || "GET"),
      );
      if (!preflight.ok) {
        return { action: "deny", error: preflight.error, summary: preflight.error };
      }
    }

    const needsConfirm =
      spec.confirm === true ||
      this.confirmTools.has(name) ||
      (typeof spec.confirmIf === "function" && spec.confirmIf(args) === true);
    if (needsConfirm) {
      const preview = `${name} ${JSON.stringify(args)}`.slice(0, 240);
      return {
        action: "confirm",
        access: spec.access,
        summary: preview,
      };
    }
    return { action: "allow", access: spec.access };
  }
}
