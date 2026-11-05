#!/usr/bin/env node
/**
 * Charlie-Agent CLI.
 *
 *   node src/cli.js serve          # Express / Twilio webhooks
 *   node src/cli.js call +1...     # place outbound call
 *   node src/cli.js chat           # text REPL (no telephony)
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function printHelp() {
  console.log(`Charlie-Agent CLI

Usage:
  charlie serve [--host 0.0.0.0] [--port 8000]
  charlie call <E.164-number>
  charlie chat [--caller id] [--require-llm]

Or via npm:
  npm run serve
  npm run chat
  npm run call -- +15555550123
`);
}

async function cmdServe(args) {
  let host = "0.0.0.0";
  let port = 8000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--host") host = args[++i];
    else if (args[i] === "--port") port = Number(args[++i]);
  }
  const { app } = await import("./telephony/twilioServer.js");
  app.listen(port, host, () => {
    console.log(`Charlie-Agent listening on http://${host}:${port}`);
  });
}

async function cmdCall(args) {
  const number = args[0];
  if (!number) {
    console.error("error: destination number required (E.164, e.g. +15555550123)");
    process.exitCode = 1;
    return;
  }
  const { placeOutboundCall, TwilioNotConfigured } = await import(
    "./telephony/outbound.js"
  );
  try {
    const result = await placeOutboundCall(number);
    console.log(`Call started: sid=${result.sid} status=${result.status}`);
  } catch (exc) {
    if (exc instanceof TwilioNotConfigured) {
      console.error(`error: ${exc.message}`);
    } else {
      console.error(`error placing call: ${exc.message || exc}`);
    }
    process.exitCode = 1;
  }
}

async function cmdChat(args) {
  let caller = "cli-user";
  let requireLlm = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--caller") caller = args[++i];
    else if (args[i] === "--require-llm") requireLlm = true;
  }

  const { Agent } = await import("./agent.js");
  const { getSettings } = await import("./config.js");
  const { LLMClient, LLMConfigError } = await import("./llm.js");

  const settings = getSettings();
  console.log("Charlie-Agent text chat. Type 'quit' or Ctrl-D to exit.");
  if (!settings.hasLlmKey) {
    console.log(
      "NOTE: XAI_API_KEY is not set — replies will be a graceful " +
        "offline message until you configure .env.",
    );
  }

  try {
    new LLMClient(settings).ensureReady();
  } catch (exc) {
    if (exc instanceof LLMConfigError) {
      console.log(`\n${exc.message}\n`);
      if (requireLlm) {
        process.exitCode = 1;
        return;
      }
      console.log("Continuing in degraded mode (each turn will remind you).\n");
    } else {
      throw exc;
    }
  }

  const agent = new Agent({ callerId: caller });
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      let user;
      try {
        user = (await rl.question("you> ")).trim();
      } catch {
        console.log("\nbye.");
        break;
      }
      if (!user) continue;
      if (["quit", "exit", "bye"].includes(user.toLowerCase())) {
        console.log("bye.");
        break;
      }
      const reply = await agent.handleUserMessage(user);
      console.log(`charlie> ${reply}`);
    }
  } finally {
    rl.close();
  }
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command || command === "-h" || command === "--help") {
    printHelp();
    return;
  }
  switch (command) {
    case "serve":
      await cmdServe(rest);
      break;
    case "call":
      await cmdCall(rest);
      break;
    case "chat":
      await cmdChat(rest);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
