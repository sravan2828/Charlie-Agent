/**
 * Map a LiveKit participant to a caller id.
 *
 * This is transport metadata for logging and memory keys. It is not
 * passed into tool authorization. SIP kind value 3 matches
 * ParticipantInfo.Kind.SIP in the LiveKit protocol.
 */

const SIP_KIND = 3;

/**
 * @param {object | null | undefined} participant
 * @returns {{ transport: "sip" | "webrtc", callerId: string }}
 */
export function classifyParticipant(participant) {
  const attributes =
    participant && participant.attributes && typeof participant.attributes === "object"
      ? participant.attributes
      : {};
  const kind = participant?.kind;
  const hasSipAttributes = Boolean(
    attributes["sip.phoneNumber"] || attributes["sip.callID"] || attributes["sip.trunkID"],
  );
  const isSip = kind === SIP_KIND || kind === "SIP" || kind === "sip" || hasSipAttributes;
  const raw = isSip
    ? attributes["sip.phoneNumber"] || participant?.identity || "sip-caller"
    : participant?.identity || "web-user";
  const callerId = String(raw).replace(/[^\w+\-]/g, "_").slice(0, 64) || "anonymous";
  return { transport: isSip ? "sip" : "webrtc", callerId };
}
