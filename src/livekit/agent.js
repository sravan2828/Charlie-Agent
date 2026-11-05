/**
 * LiveKit worker entrypoint.
 *
 * The same handler runs for a browser participant and for a SIP
 * participant. Phone trunks are not implemented here; see
 * docs/sip-trunks.md for how a later Plivo or Twilio trunk lands in
 * this function as just another room participant.
 *
 * Run: node src/livekit/agent.js dev
 */

import { fileURLToPath } from "node:url";

import { cli, defineAgent, llm, ServerOptions, voice } from "@livekit/agents";

import { Brain } from "../brain/brain.js";
import { ToolPolicy } from "../brain/policy.js";
import { getSettings } from "../config.js";
import { bindBrainTools } from "../voice/bindTools.js";
import { allowlistForVoiceSession, createVoiceSessionOptions } from "../voice/stack.js";
import { classifyParticipant } from "./participant.js";

const log = (...args) => console.log("[charlie.voice]", ...args);

export default defineAgent({
  entry: async (ctx) => {
    const settings = getSettings();
    await ctx.connect();
    const participant = await ctx.waitForParticipant();
    const who = classifyParticipant(participant);
    const allowlist = allowlistForVoiceSession(settings);
    const brain = new Brain({
      callerId: who.callerId,
      settings,
      policy: ToolPolicy.fromSettings(settings, { allowlist }),
    });

    log(
      `room=${ctx.room?.name || ""} transport=${who.transport} caller=${who.callerId}`,
    );

    const stack = await createVoiceSessionOptions(settings);
    log(`voice stack=${stack.kind}`);
    const agent = voice.Agent.create({
      instructions: brain.instructions(),
      tools: bindBrainTools(brain, llm.tool),
    });
    const session = new voice.AgentSession(stack.options);
    await session.start({ agent, room: ctx.room });

    if (typeof ctx.addShutdownCallback === "function") {
      ctx.addShutdownCallback(async () => {
        log(`session ended caller=${who.callerId} transport=${who.transport}`);
      });
    }

    const greeting = session.generateReply({
      instructions:
        "Greet the person briefly, introduce yourself as Charlie, and offer to help. One or two short sentences.",
    });
    if (greeting && typeof greeting.then === "function") await greeting;
  },
});

const invokedDirectly =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) {
    console.error(
      "The LiveKit voice worker requires Node.js 20 or newer. " +
        "The text CLI and Twilio webhooks still run on Node.js 18+.",
    );
    process.exit(1);
  }
  const settings = getSettings();
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: settings.livekitAgentName || "charlie",
    }),
  );
}
