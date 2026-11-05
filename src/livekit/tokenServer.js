/**
 * Tiny token endpoint plus the static web client.
 *
 * Bind to 127.0.0.1 by default. Anyone who can call this endpoint can
 * join a room as the configured identity, so do not expose it publicly
 * without authentication.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { getSettings } from "../config.js";
import { LiveKitNotConfigured, mintParticipantToken, sanitizeLiveKitName } from "./token.js";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");

export function createTokenApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(webRoot));

  app.get("/health", (_req, res) => {
    const settings = getSettings();
    res.json({
      status: "ok",
      service: "charlie-voice-token",
      livekitConfigured: settings.hasLivekit,
      agentName: settings.livekitAgentName,
    });
  });

  const issue = async (req, res) => {
    const settings = getSettings();
    if (!settings.hasLivekit) {
      res.status(503).json({
        ok: false,
        error:
          "LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
      });
      return;
    }
    const source = req.method === "GET" ? req.query : req.body || {};
    const room = sanitizeLiveKitName(source.room, "charlie-web");
    const identity = sanitizeLiveKitName(source.identity, "owner");
    try {
      const token = await mintParticipantToken({
        apiKey: settings.livekitApiKey,
        apiSecret: settings.livekitApiSecret,
        identity,
        room,
        agentName: settings.livekitAgentName,
        ttl: settings.livekitTokenTtl,
      });
      res.json({
        ok: true,
        token,
        url: settings.livekitUrl,
        room,
        identity,
        agentName: settings.livekitAgentName,
      });
    } catch (exc) {
      if (exc instanceof LiveKitNotConfigured) {
        res.status(503).json({ ok: false, error: exc.message });
        return;
      }
      res.status(500).json({ ok: false, error: "token mint failed" });
    }
  };

  app.get("/token", issue);
  app.post("/token", issue);
  return app;
}

export const app = createTokenApp();
