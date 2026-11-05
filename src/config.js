/**
 * Environment-backed configuration for Charlie-Agent.
 *
 * Loads `.env` if present. Secret values stay in the environment —
 * never hard-code credentials in source.
 */

import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: process.env.DOTENV_PATH || ".env" });

let cached = null;

/**
 * @typedef {object} Settings
 * @property {string} xaiApiKey
 * @property {string} llmBaseUrl
 * @property {string} llmModel
 * @property {number} llmMaxToolIterations
 * @property {string} twilioAccountSid
 * @property {string} twilioAuthToken
 * @property {string} twilioPhoneNumber
 * @property {string} publicBaseUrl
 * @property {string} searchBackend
 * @property {string} httpAllowlist
 * @property {string} memoryDir
 * @property {Set<string>} httpAllowlistHosts
 * @property {boolean} hasLlmKey
 * @property {boolean} hasTwilio
 */

/** @returns {Settings} */
export function getSettings() {
  if (cached) return cached;

  const httpAllowlist =
    process.env.HTTP_ALLOWLIST ?? "example.com,api.github.com";
  const hosts = new Set(
    httpAllowlist
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );

  const xaiApiKey = process.env.XAI_API_KEY ?? "";
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER ?? "";

  cached = {
    xaiApiKey,
    llmBaseUrl: process.env.LLM_BASE_URL ?? "https://api.x.ai/v1",
    llmModel: process.env.LLM_MODEL ?? "grok-4.7",
    llmMaxToolIterations: Number(process.env.LLM_MAX_TOOL_ITERATIONS ?? 6),
    twilioAccountSid,
    twilioAuthToken,
    twilioPhoneNumber,
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:8000",
    searchBackend: process.env.SEARCH_BACKEND ?? "stub",
    httpAllowlist,
    memoryDir: process.env.MEMORY_DIR ?? path.resolve("./data/memory"),
    httpAllowlistHosts: hosts,
    hasLlmKey: Boolean(xaiApiKey && xaiApiKey.trim()),
    hasTwilio: Boolean(
      twilioAccountSid &&
        twilioAuthToken &&
        twilioPhoneNumber &&
        !twilioAccountSid.startsWith("ACxxxx"),
    ),
  };
  return cached;
}

/** Clear the cached settings (used by tests). */
export function clearSettingsCache() {
  cached = null;
}
