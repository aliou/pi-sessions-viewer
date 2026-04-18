import { cachedFetch } from "../cache.js";

/** Encode a UTF-8 string to base64, matching the decode logic in template.js */

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Parse a JSONL session file into the sessionData object expected by template.js.
 *
 * SessionManager._buildIndex sets leafId to each non-session entry's id in
 * order, so leafId ends up being the last entry's id. That's all we replicate
 * here — we don't need the full tree-walk for rendering.
 */
function parseSessionData(text) {
  const lines = text.trim().split("\n");

  let header = null;
  const entries = [];
  let leafId = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type === "session") {
      header = entry;
    } else {
      entries.push(entry);
      // Mirrors SessionManager._buildIndex: leafId = last non-session entry id
      if (entry.id) leafId = entry.id;
    }
  }

  return { header, entries, leafId };
}

function buildHtml(sessionDataBase64, title) {
  // Mirrors the structure of template.html but uses external assets instead of
  // inlining everything, and injects the session data as a base64 blob.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="/assets/template.css">
</head>
<body>
  <button id="hamburger" title="Open sidebar"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><rect x="5" y="6" width="2" height="12"/><path d="M6 12h10c1 0 2 0 2-2V8"/></svg></button>
  <div id="sidebar-overlay"></div>
  <div id="app">
    <aside id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-controls">
          <input type="text" class="sidebar-search" id="tree-search" placeholder="Search...">
        </div>
        <div class="sidebar-filters">
          <button class="filter-btn active" data-filter="default" title="Hide settings entries">Default</button>
          <button class="filter-btn" data-filter="no-tools" title="Default minus tool results">No-tools</button>
          <button class="filter-btn" data-filter="user-only" title="Only user messages">User</button>
          <button class="filter-btn" data-filter="labeled-only" title="Only labeled entries">Labeled</button>
          <button class="filter-btn" data-filter="all" title="Show everything">All</button>
          <button class="sidebar-close" id="sidebar-close" title="Close">&#x2715;</button>
        </div>
      </div>
      <div class="tree-container" id="tree-container"></div>
      <div class="tree-status" id="tree-status"></div>
    </aside>
    <div id="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Resize session tree sidebar"></div>
    <main id="content">
      <div id="header-container"></div>
      <div id="messages"></div>
    </main>
    <div id="image-modal" class="image-modal">
      <img id="modal-image" src="" alt="">
    </div>
  </div>

  <script id="session-data" type="application/json">${sessionDataBase64}</script>
  <script src="/assets/vendor/marked.min.js"></script>
  <script src="/assets/vendor/highlight.min.js"></script>
  <script src="/assets/template.js"></script>
</body>
</html>`;
}

function parseDataset(input) {
  if (!input) return null;
  input = input.trim();
  const urlMatch = input.match(/huggingface\.co\/datasets\/([^/?#\s]+\/[^/?#\s]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[^/\s]+\/[^/\s]+$/.test(input)) return input;
  return null;
}

export async function onRequest(context) {
  const filename = context.params.filename;
  const url = new URL(context.request.url);
  const dataset = parseDataset(url.searchParams.get("dataset"));

  if (!dataset) {
    return new Response("Missing or invalid ?dataset= query param", { status: 400 });
  }

  const hfUrl = `https://huggingface.co/datasets/${dataset}/resolve/main/${filename}`;

  let text;
  try {
    const cacheKey = `pi-viewer:session:${dataset}:${filename}`;
    const resp = await cachedFetch(cacheKey, hfUrl, 3600, context);
    if (!resp.ok) {
      return new Response(`Session not found: ${filename} (HTTP ${resp.status})`, {
        status: resp.status,
      });
    }
    text = await resp.text();
  } catch (err) {
    return new Response(`Failed to fetch session: ${err.message}`, { status: 502 });
  }

  const sessionData = parseSessionData(text);
  const base64 = utf8ToBase64(JSON.stringify(sessionData));
  const html = buildHtml(base64, filename);

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
