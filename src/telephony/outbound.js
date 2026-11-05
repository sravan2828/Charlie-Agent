/**
 * Place an outbound phone call via the Twilio REST API.
 *
 * The call connects to our /voice/inbound webhook so Charlie can speak
 * and gather speech turns. Requires TWILIO_* env vars and a reachable
 * PUBLIC_BASE_URL.
 */

import twilio from "twilio";
import { getSettings } from "../config.js";

export class TwilioNotConfigured extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "TwilioNotConfigured";
  }
}

/**
 * @param {string} toNumber
 * @param {import("../config.js").Settings | null} [settings]
 * @returns {Promise<{sid: string, status: string, to: string}>}
 */
export async function placeOutboundCall(toNumber, settings = null) {
  settings = settings || getSettings();
  if (!settings.hasTwilio) {
    throw new TwilioNotConfigured(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID, " +
        "TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env " +
        "(see .env.example). Do not commit real credentials.",
    );
  }

  const client = twilio(settings.twilioAccountSid, settings.twilioAuthToken);
  const webhook = `${settings.publicBaseUrl.replace(/\/$/, "")}/voice/inbound`;
  const statusCb = `${settings.publicBaseUrl.replace(/\/$/, "")}/voice/status`;

  const call = await client.calls.create({
    to: toNumber,
    from: settings.twilioPhoneNumber,
    url: webhook,
    method: "POST",
    statusCallback: statusCb,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    statusCallbackMethod: "POST",
  });

  return { sid: call.sid, status: call.status, to: toNumber };
}
