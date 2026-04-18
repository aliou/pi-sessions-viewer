import { cachedFetch } from "./cache.js";

/**
 * Extract a human-readable title from raw JSONL session text.
 *
 * Priority: session_info.name → first user message text (truncated 80 chars) → null
 */
export function extractTitleFromSessionText(text) {
  let firstUserText = null;

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.type === "session_info" && entry.name) {
      return truncate(entry.name, 80);
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

  return firstUserText ? truncate(firstUserText, 80) : null;
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max) + "…";
}

/**
 * Fetch titles for all sessions in a manifest, using cache where possible.
 *
 * Returns a Map<filename, title|null>. Fetches are parallel via Promise.allSettled
 * so one failure doesn't block the rest.
 */
export async function fetchSessionTitles(dataset, entries, context) {
  const titles = new Map();
  const CONCURRENCY = 8;

  const results = await Promise.allSettled(
    entries.map(async (entry, i) => {
      // Stagger starts to limit concurrent fetches
      if (i >= CONCURRENCY) {
        await new Promise((r) => setTimeout(r, Math.floor(i / CONCURRENCY) * 200));
      }

      const cacheKey = `pi-viewer:title:${dataset}:${entry.redacted_hash}`;
      const url = `https://huggingface.co/datasets/${dataset}/resolve/main/${entry.file}`;

      const resp = await cachedFetch(cacheKey, url, 3600, context);
      if (!resp.ok) return { file: entry.file, title: null };

      const text = await resp.text();
      return { file: entry.file, title: extractTitleFromSessionText(text) };
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      titles.set(r.value.file, r.value.title);
    }
  }

  return titles;
}
