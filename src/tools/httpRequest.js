/**
 * Constrained HTTP request tool.
 *
 * Safety notes:
 *   - Only hosts on HTTP_ALLOWLIST may be contacted.
 *   - Redirects are not followed (redirect: "manual").
 *   - Response bodies are truncated.
 *   - No credentials are forwarded from the environment.
 */

import { getSettings } from "../config.js";

const MAX_BODY = 4_000;
const ALLOWED_METHODS = new Set(["GET", "POST", "HEAD"]);

/**
 * @param {string} url
 * @param {string} [method]
 * @param {object | null} [jsonBody]
 * @param {number} [timeoutMs]
 */
export async function httpRequest(
  url,
  method = "GET",
  jsonBody = null,
  timeoutMs = 10_000,
) {
  const settings = getSettings();
  method = (method || "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return { ok: false, error: `method not allowed: ${method}` };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "only http/https URLs are allowed" };
  }
  const host = (parsed.hostname || "").toLowerCase();
  if (!host) return { ok: false, error: "missing host" };
  if (!settings.httpAllowlistHosts.has(host)) {
    return {
      ok: false,
      error: `host '${host}' is not on HTTP_ALLOWLIST`,
      allowlist: [...settings.httpAllowlistHosts].sort(),
    };
  }

  try {
    /** @type {RequestInit} */
    const init = {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {},
    };
    if (jsonBody != null && method === "POST") {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(jsonBody);
    }
    const resp = await fetch(url, init);
    const text = await resp.text();
    return {
      ok: true,
      status_code: resp.status,
      url: resp.url || url,
      headers: { "content-type": resp.headers.get("content-type") || "" },
      body_truncated: text.slice(0, MAX_BODY),
      truncated: text.length > MAX_BODY,
    };
  } catch (exc) {
    return { ok: false, error: String(exc.message || exc), url };
  }
}
