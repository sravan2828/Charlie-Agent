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
 * @property {string} livekitUrl
 * @property {string} livekitApiKey
 * @property {string} livekitApiSecret
 * @property {string} livekitAgentName
 * @property {string} livekitTokenTtl
 * @property {string} tokenHost
 * @property {number} tokenPort
 * @property {boolean} hasLivekit
 * @property {string} voiceStack
 * @property {string} xaiVoiceModel
 * @property {string} xaiVoice
 * @property {string} cascadeStt
 * @property {string} cascadeLlm
 * @property {string} cascadeTts
 * @property {string} cascadeTtsVoice
 * @property {Set<string>} toolAllowlist
 * @property {"read" | "readwrite"} toolMode
 * @property {Set<string>} confirmTools
 * @property {Set<string>} voiceToolAllowlist
 */

/** @param {string | undefined} raw @param {string[]} fallback */
function parseNameSet(raw, fallback) {
  const source = raw == null || raw.trim() === "" ? fallback.join(",") : raw;
  return new Set(
    source
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );
}

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
  const livekitUrl = process.env.LIVEKIT_URL ?? "";
  const livekitApiKey = process.env.LIVEKIT_API_KEY ?? "";
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET ?? "";
  const toolModeRaw = (process.env.TOOL_MODE ?? "readwrite").trim().toLowerCase();
  const toolMode = toolModeRaw === "read" ? "read" : "readwrite";

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
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    livekitAgentName: process.env.LIVEKIT_AGENT_NAME ?? "charlie",
    livekitTokenTtl: process.env.LIVEKIT_TOKEN_TTL ?? "1h",
    tokenHost: process.env.TOKEN_HOST ?? "127.0.0.1",
    tokenPort: Number(process.env.TOKEN_PORT ?? 8787),
    hasLivekit: Boolean(
      livekitUrl.trim() && livekitApiKey.trim() && livekitApiSecret.trim(),
    ),
    voiceStack: (process.env.VOICE_STACK ?? "grok").trim().toLowerCase(),
    xaiVoiceModel: process.env.XAI_VOICE_MODEL ?? "grok-voice-latest",
    xaiVoice: process.env.XAI_VOICE ?? "eve",
    cascadeStt: process.env.CASCADE_STT_MODEL ?? "assemblyai/universal-3-6-pro",
    cascadeLlm: process.env.CASCADE_LLM_MODEL ?? "google/gemma-4-31b-it",
    cascadeTts: process.env.CASCADE_TTS_MODEL ?? "fishaudio/s2.1-pro",
    cascadeTtsVoice:
      process.env.CASCADE_TTS_VOICE ?? "fa4c9eb3dccc4806b382b40d61c6b10a",
    toolAllowlist: parseNameSet(process.env.TOOL_ALLOWLIST, [
      "web_search",
      "http_request",
      "remember",
    ]),
    toolMode,
    confirmTools: parseNameSet(process.env.CONFIRM_TOOLS, []),
    voiceToolAllowlist: parseNameSet(process.env.VOICE_TOOL_ALLOWLIST, []),
  };
  return cached;
}

/** Clear the cached settings (used by tests). */
export function clearSettingsCache() {
  cached = null;
}
