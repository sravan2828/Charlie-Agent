/**
 * Transport-independent brain: instructions, memory, and tool policy.
 *
 * Voice sessions, the text CLI, and Twilio webhooks all call this module.
 * Nothing here inspects WebRTC, SIP, or Media Streams.
 */

import { randomBytes } from "node:crypto";

import { getSettings } from "../config.js";
import { CallerMemory } from "../memory.js";
import { TOOL_SCHEMAS, dispatchTool } from "../tools/registry.js";
import { buildInstructions, SYSTEM_PROMPT } from "./prompt.js";
import {
  CONFIRM_ACTION_TOOL,
  ToolPolicy,
  plainArgs,
  sanitizeUntrustedText,
} from "./policy.js";

const DEFAULT_PENDING_TTL_MS = 120_000;

/**
 * Default confirmation hook.
 * Approval comes only from the boolean on confirm_action, never from
 * transcript text. Replace this to require an out-of-band owner tap.
 *
 * @param {object} pending
 * @param {{ approved: boolean, transcript: string }} ctx
 */
export function argumentConfirmationHook(_pending, ctx) {
  return ctx.approved === true;
}

export class Brain {
  /**
   * @param {object} [opts]
   * @param {string} [opts.callerId]
   * @param {import("../config.js").Settings | null} [opts.settings]
   * @param {CallerMemory | null} [opts.memory]
   * @param {ToolPolicy | null} [opts.policy]
   * @param {(name: string, args: object, ctx: object) => Promise<object>} [opts.dispatch]
   * @param {(pending: object, ctx: object) => boolean | Promise<boolean>} [opts.confirmHook]
   * @param {number} [opts.pendingTtlMs]
   */
  constructor({
    callerId = "anonymous",
    settings = null,
    memory = null,
    policy = null,
    dispatch = null,
    confirmHook = null,
    pendingTtlMs = DEFAULT_PENDING_TTL_MS,
  } = {}) {
    this.settings = settings || getSettings();
    this.callerId = callerId;
    this.memory = memory || new CallerMemory(callerId, this.settings.memoryDir);
    this.policy =
      policy ||
      ToolPolicy.fromSettings(this.settings, {
        allowlist: this.settings.toolAllowlist,
      });
    this.dispatch = dispatch || dispatchTool;
    this.confirmHook = confirmHook || argumentConfirmationHook;
    this.pendingTtlMs = pendingTtlMs;
    /** @type {Map<string, { name: string, args: Record<string, unknown>, summary: string, createdAt: number }>} */
    this.pending = new Map();
  }

  instructions() {
    return buildInstructions(this.memory.asPromptBlock());
  }

  toolSchemas() {
    return this.policy.visibleSchemas(TOOL_SCHEMAS);
  }

  /**
   * Record speech or typed text as data. The returned string is what
   * the conversation history should store. It is not executed.
   *
   * @param {"user" | "assistant"} role
   * @param {unknown} text
   */
  noteUtterance(role, text) {
    const clean = sanitizeUntrustedText(text, 4_000);
    if (!clean) return "";
    this.memory.addNote(`${role}: ${clean.slice(0, 200)}`);
    return clean;
  }

  /**
   * Run one tool call under policy.
   * `ctx.transcript` is accepted so callers can pass speech along for
   * audit, and is ignored when deciding allow / confirm.
   *
   * @param {string} name
   * @param {unknown} rawArgs
   * @param {{ transcript?: unknown }} [ctx]
   */
  async executeTool(name, rawArgs, ctx = {}) {
    const transcript = sanitizeUntrustedText(ctx.transcript || "");
    const args = plainArgs(rawArgs, name);
    const decision = this.policy.authorize(name, args);

    if (decision.action === "deny") {
      return { ok: false, error: decision.error || "denied" };
    }

    if (decision.action === "confirm") {
      const confirmationId = randomBytes(8).toString("hex");
      this.pending.set(confirmationId, {
        name,
        args,
        summary: decision.summary || name,
        createdAt: Date.now(),
      });
      return {
        ok: false,
        needs_confirmation: true,
        confirmation_id: confirmationId,
        summary: decision.summary,
        message:
          "Ask the user to confirm this specific action, then call " +
          "confirm_action. Do not claim it already happened.",
      };
    }

    if (decision.action === "resolve_confirmation") {
      return this._resolveConfirmation(args, transcript);
    }

    return this._dispatch(name, args, transcript);
  }

  /**
   * @param {Record<string, unknown>} args
   * @param {string} transcript
   */
  async _resolveConfirmation(args, transcript) {
    const confirmationId = String(args.confirmation_id || "");
    const pending = this.pending.get(confirmationId);
    if (!pending) {
      return { ok: false, error: "unknown or expired confirmation_id" };
    }
    if (Date.now() - pending.createdAt > this.pendingTtlMs) {
      this.pending.delete(confirmationId);
      return { ok: false, error: "confirmation expired" };
    }

    const approvedArg = args.approved === true;
    let allowed = false;
    try {
      allowed = await this.confirmHook(pending, {
        approved: approvedArg,
        transcript,
      });
    } catch (exc) {
      this.pending.delete(confirmationId);
      return { ok: false, error: `confirmation hook failed: ${exc.message || exc}` };
    }
    if (allowed !== true) {
      this.pending.delete(confirmationId);
      return { ok: false, error: "confirmation denied", confirmation_id: confirmationId };
    }

    this.pending.delete(confirmationId);
    const result = await this._dispatch(pending.name, pending.args, transcript);
    return { ...result, confirmation_id: confirmationId, confirmed: true };
  }

  /**
   * @param {string} name
   * @param {Record<string, unknown>} args
   * @param {string} transcript
   */
  async _dispatch(name, args, transcript) {
    const result = await this.dispatch(name, args, {
      memory: this.memory,
      transcript,
    });
    return result && typeof result === "object" ? result : { ok: true, result };
  }
}

export { SYSTEM_PROMPT, ToolPolicy };
