/**
 * Mint a browser (or later React Native) token that joins one room and
 * asks LiveKit to dispatch the Charlie voice worker into it.
 */

import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";

const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/;

export class LiveKitNotConfigured extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "LiveKitNotConfigured";
  }
}

/** @param {unknown} value @param {string} fallback */
export function sanitizeLiveKitName(value, fallback) {
  const text = String(value ?? "").trim();
  return SAFE_NAME.test(text) ? text : fallback;
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.apiSecret
 * @param {string} opts.identity
 * @param {string} opts.room
 * @param {string} [opts.agentName]
 * @param {string | number} [opts.ttl]
 */
export async function mintParticipantToken({
  apiKey,
  apiSecret,
  identity,
  room,
  agentName = "charlie",
  ttl = "1h",
}) {
  if (!apiKey || !apiSecret) {
    throw new LiveKitNotConfigured(
      "LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in .env.",
    );
  }
  const token = new AccessToken(apiKey, apiSecret, { identity, ttl });
  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName,
      }),
    ],
  });
  return token.toJwt();
}
