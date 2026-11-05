/**
 * Scripted text CLI. No network and no API keys.
 * A piped follow-up line must not be dropped while a turn is in flight.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runChat(stdin) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "charlie-cli-"));
  const dotenvPath = path.join(tmp, "empty.env");
  fs.writeFileSync(dotenvPath, "XAI_API_KEY=\n");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/cli.js", "chat"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DOTENV_PATH: dotenvPath,
        XAI_API_KEY: "",
        SEARCH_BACKEND: "stub",
        MEMORY_DIR: tmp,
        HTTP_ALLOWLIST: "example.com",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      fs.rmSync(tmp, { recursive: true, force: true });
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}

describe("cli chat", () => {
  it("answers offline and honors a piped quit", async () => {
    const result = await runChat("hello\nquit\n");
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /XAI_API_KEY is not set/);
    assert.match(result.stdout, /\[Charlie offline\]/);
    assert.match(result.stdout, /bye\./);
  });
});
