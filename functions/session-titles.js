import { cachedFetch } from "./cache.js";

/**
 * Extract a human-readable title and pi-format flag from raw JSONL session text.
 *
 * A session is "pi-format" if any line (checked in the first ~5 lines for efficiency)
 * has type: "session" and version: 3.
 *
 * Title priority: session_info.name → first user message text (truncated 80 chars) → null
 *
 * Returns { title: string|null, isPi: boolean }
 */
export function extractTitleFromSessionText(text) {
  let firstUserText = null;
  let isPi = false;
  let lineCount = 0;

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    lineCount++;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    // Check for pi-format: type "session" and version 3 (first ~5 lines)
    if (lineCount <= 5 && entry.type === "session" && entry.version === 3) {
      isPi = true;
    }

    if (entry.type === "session_info" && entry.name) {
      return { title: truncate(entry.name, 80), isPi };
    }

    if (firstUserText === null &&
        entry.type === "message" &&
        entry.message?.role === "user") {
      const content = entry.message.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === "text" && part.text) {
            firstUserText = part.text;
            break;
          }
        }
      }
    }
  }

  return { title: firstUserText ? truncate(firstUserText, 80) : null, isPi };
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max) + "…";
}

/**
 * Fetch titles for all sessions in a manifest, using cache where possible.
 *
 * Returns a Map<filename, {title: string|null, isPi: boolean}>.
 * Fetches are parallel via Promise.allSettled so one failure doesn't block the rest.
 */
export async function fetchSessionTitles(dataset, entries, context) {
  const titles = new Map();

  const results = await Promise.allSettled(
    entries.map(async (entry) => {
      const cacheKey = `pi-viewer:title:${dataset}:${entry.redacted_hash || entry.file}`;
      const url = `https://huggingface.co/datasets/${dataset}/resolve/main/${entry.file}`;

      const resp = await cachedFetch(cacheKey, url, 86400, context);
      if (!resp.ok) return { file: entry.file, result: { title: null, isPi: false } };

      const text = await resp.text();
      return { file: entry.file, result: extractTitleFromSessionText(text) };
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      titles.set(r.value.file, r.value.result);
    }
  }

  return titles;
}
