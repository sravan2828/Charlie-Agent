/**
 * Voice layer. The brain stays the same; only this module changes when
 * swapping Grok Voice speech-to-speech for a cascade (STT + LLM + TTS).
 *
 * Grok Voice uses the LiveKit xAI realtime plugin, which speaks the
 * Grok Voice Agent WebSocket API (`wss://api.x.ai/v1/realtime`).
 */

/**
 * Allowlist passed into a new Brain for a voice session.
 * The brain still does not see which transport connected.
 *
 * @param {import("../config.js").Settings} settings
 */
export function allowlistForVoiceSession(settings) {
  if (settings.voiceToolAllowlist && settings.voiceToolAllowlist.size > 0) {
    return settings.voiceToolAllowlist;
  }
  return settings.toolAllowlist;
}

/** @param {string | undefined} name */
export function resolveVoiceStack(name) {
  const stack = String(name || "grok").trim().toLowerCase();
  if (stack !== "grok" && stack !== "cascade") {
    throw new Error(`Unknown VOICE_STACK '${stack}'. Use "grok" or "cascade".`);
  }
  return stack;
}

/**
 * Options object for `new AgentSession(...)`.
 * Imported only from the LiveKit worker, never from tests.
 *
 * @param {import("../config.js").Settings} settings
 */
export async function createVoiceSessionOptions(settings) {
  const stack = resolveVoiceStack(settings.voiceStack);
  if (stack === "cascade") {
    const { inference } = await import("@livekit/agents");
    return {
      kind: "cascade",
      options: {
        stt: new inference.STT({ model: settings.cascadeStt }),
        llm: new inference.LLM({ model: settings.cascadeLlm }),
        tts: new inference.TTS({
          model: settings.cascadeTts,
          voice: settings.cascadeTtsVoice,
        }),
      },
    };
  }

  if (!settings.hasLlmKey) {
    throw new Error(
      "XAI_API_KEY is not set. Grok Voice speech-to-speech needs it " +
        "(the LiveKit worker sends it on the xAI realtime WebSocket). " +
        "Set VOICE_STACK=cascade to use a LiveKit Inference STT+LLM+TTS pipeline instead.",
    );
  }

  const { realtime } = await import("@livekit/agents-plugin-xai");
  /** @type {Record<string, unknown>} */
  const modelOptions = {
    model: settings.xaiVoiceModel,
    voice: settings.xaiVoice,
  };
  if (settings.xaiApiKey) modelOptions.apiKey = settings.xaiApiKey;
  return {
    kind: "realtime",
    options: {
      llm: new realtime.RealtimeModel(modelOptions),
    },
  };
}
