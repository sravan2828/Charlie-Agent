/**
 * Pluggable web search tool.
 *
 * Backends:
 *   - stub (default): clearly labelled fake results so demos work offline
 *   - duckduckgo: lightweight Instant Answer API (no API key; rate-limited)
 */

import { getSettings } from "../config.js";

/**
 * @param {string} query
 * @param {number} [maxResults]
 */
export async function search(query, maxResults = 3) {
  const settings = getSettings();
  const backend = (settings.searchBackend || "stub").trim().toLowerCase();
  query = (query || "").trim();
  if (!query) return { ok: false, error: "empty query", backend };

  if (backend === "duckduckgo") return duckduckgo(query, maxResults);
  return stub(query, maxResults);
}

function stub(query, maxResults) {
  const results = [
    {
      title: `[STUB RESULT] Overview related to: ${query}`,
      url: "https://example.com/stub-search",
      snippet:
        "This is a STUB search result. Set SEARCH_BACKEND=duckduckgo " +
        "or wire a real search API for live data. Charlie-Agent ships " +
        "offline-safe by default.",
    },
  ];
  return {
    ok: true,
    backend: "stub",
    query,
    results: results.slice(0, maxResults),
    note: "STUB: not live web data",
  };
}

async function duckduckgo(query, maxResults) {
  const url =
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}` +
    "&format=json&no_redirect=1";
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Charlie-Agent/0.1" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    /** @type {{title: string, url: string, snippet: string}[]} */
    const results = [];
    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL || "",
        snippet: data.AbstractText,
      });
    }
    for (const topic of data.RelatedTopics || []) {
      if (results.length >= maxResults) break;
      if (topic && typeof topic === "object" && topic.Text) {
        results.push({
          title: String(topic.Text).slice(0, 80),
          url: topic.FirstURL || "",
          snippet: topic.Text || "",
        });
      }
    }
    if (!results.length) {
      results.push({
        title: "No Instant Answer",
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet:
          "DuckDuckGo Instant Answer returned nothing; try a more specific query.",
      });
    }
    return {
      ok: true,
      backend: "duckduckgo",
      query,
      results: results.slice(0, maxResults),
    };
  } catch (exc) {
    return {
      ok: false,
      backend: "duckduckgo",
      error: String(exc.message || exc),
      query,
    };
  }
}
