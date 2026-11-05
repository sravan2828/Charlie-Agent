/**
 * Simple per-caller JSON file memory.
 *
 * Mirrors the idea of Grok Bot persistent memory across conversations,
 * but keeps everything local and transparent so the showcase stays
 * credential-free and easy to inspect.
 */

import fs from "node:fs";
import path from "node:path";
import { getSettings } from "./config.js";

const SAFE_ID = /[^a-zA-Z0-9_+\-]+/g;

/** @param {string} callerId */
function sanitizeCallerId(callerId) {
  const cleaned = (callerId || "").trim().replace(SAFE_ID, "_") || "anonymous";
  return cleaned.slice(0, 64);
}

export class CallerMemory {
  /**
   * @param {string} callerId
   * @param {string | null} [memoryDir]
   */
  constructor(callerId, memoryDir = null) {
    const settings = getSettings();
    this.callerId = callerId;
    this.memoryDir = memoryDir || settings.memoryDir;
    fs.mkdirSync(this.memoryDir, { recursive: true });
    this.path = path.join(this.memoryDir, `${sanitizeCallerId(callerId)}.json`);
    this._data = this._load();
  }

  _load() {
    const empty = {
      caller_id: this.callerId,
      notes: [],
      facts: {},
      updated_at: null,
    };
    if (!fs.existsSync(this.path)) return empty;
    try {
      return JSON.parse(fs.readFileSync(this.path, "utf8"));
    } catch {
      return empty;
    }
  }

  save() {
    this._data.updated_at = new Date().toISOString();
    fs.writeFileSync(this.path, JSON.stringify(this._data, null, 2), "utf8");
  }

  /** @param {string} note */
  addNote(note) {
    const notes = this._data.notes || (this._data.notes = []);
    notes.push({ ts: new Date().toISOString(), text: note });
    this._data.notes = notes.slice(-20);
    this.save();
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  setFact(key, value) {
    const facts = this._data.facts || (this._data.facts = {});
    facts[key] = value;
    this.save();
  }

  /** Compact text the agent can prepend to the system prompt. */
  asPromptBlock() {
    const facts = this._data.facts || {};
    const notes = this._data.notes || [];
    if (!Object.keys(facts).length && !notes.length) {
      return "No prior memory for this caller.";
    }
    const lines = ["Known facts:"];
    for (const [k, v] of Object.entries(facts)) {
      lines.push(`- ${k}: ${v}`);
    }
    if (notes.length) {
      lines.push("Recent notes:");
      for (const n of notes.slice(-5)) {
        lines.push(`- ${n.text || ""}`);
      }
    }
    return lines.join("\n");
  }
}
