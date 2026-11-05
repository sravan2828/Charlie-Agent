/**
 * Express app exposing Twilio voice webhooks.
 *
 * POST /voice/inbound  — answer a call; greet + <Gather input="speech">
 * POST /voice/gather   — speech result -> Agent -> <Say> + gather again
 * POST /voice/status   — call status callback (logging only)
 * GET  /health         — liveness
 *
 * Showcase uses Twilio Gather+Say turn-taking. This transport stays.
 * The handler uses the shared brain (via Agent), so tool policy matches
 * the LiveKit voice worker. A later SIP trunk into LiveKit does not
 * replace these routes; see docs/sip-trunks.md.
 */

import express from "express";
import { Agent } from "../agent.js";

const logger = {
  info: (...args) => console.log("[charlie.telephony]", ...args),
};

/** @type {Map<string, Agent>} */
const sessions = new Map();

/** @param {string} body */
function twiml(body) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

/** @param {string} text */
function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * @param {string} callSid
 * @param {string} fromNumber
 */
function getAgent(callSid, fromNumber) {
  if (!sessions.has(callSid)) {
    const caller = fromNumber || callSid || "unknown";
    sessions.set(callSid, new Agent({ callerId: caller }));
  }
  return sessions.get(callSid);
}

export function createApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "charlie-agent" });
  });

  app.post("/voice/inbound", (req, res) => {
    const CallSid = String(req.body.CallSid || "");
    const From = String(req.body.From || "");
    const agent = getAgent(CallSid, From);
    logger.info(`inbound call sid=${CallSid} from=${From}`);

    const greet =
      "Hi, this is Charlie, your AI phone agent. How can I help you today?";
    agent.messages.push({ role: "assistant", content: greet });

    const body =
      `<Say>${escapeXml(greet)}</Say>` +
      `<Gather input="speech" action="/voice/gather" method="POST" ` +
      `speechTimeout="auto" timeout="5"></Gather>` +
      `<Say>I did not hear anything. Goodbye.</Say>` +
      `<Hangup/>`;
    res.type("application/xml").send(twiml(body));
  });

  app.post("/voice/gather", async (req, res) => {
    const CallSid = String(req.body.CallSid || "");
    const From = String(req.body.From || "");
    const SpeechResult = String(req.body.SpeechResult || "");
    const agent = getAgent(CallSid, From);
    const userText = SpeechResult.trim();
    logger.info(`gather sid=${CallSid} speech=${JSON.stringify(userText)}`);

    let reply;
    if (!userText) {
      reply = "Sorry, I did not catch that.";
    } else if (["goodbye", "bye", "hang up", "end call"].includes(userText.toLowerCase())) {
      res.type("application/xml").send(twiml(`<Say>${escapeXml("Goodbye!")}</Say><Hangup/>`));
      return;
    } else {
      reply = await agent.handleUserMessage(userText);
    }

    const spoken = reply.length < 500 ? reply : `${reply.slice(0, 480)}...`;
    const body =
      `<Say>${escapeXml(spoken)}</Say>` +
      `<Gather input="speech" action="/voice/gather" method="POST" ` +
      `speechTimeout="auto" timeout="5"></Gather>` +
      `<Say>Thanks for calling Charlie. Goodbye.</Say>` +
      `<Hangup/>`;
    res.type("application/xml").send(twiml(body));
  });

  app.post("/voice/status", (req, res) => {
    const sid = req.body.CallSid;
    const status = req.body.CallStatus;
    logger.info(`status sid=${sid} status=${status}`);
    if (
      sid &&
      ["completed", "busy", "failed", "no-answer", "canceled"].includes(String(status))
    ) {
      sessions.delete(String(sid));
    }
    res.json({ ok: true });
  });

  return app;
}

/** Default app instance for `npm run serve`. */
export const app = createApp();
