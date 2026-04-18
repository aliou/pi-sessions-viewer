import { cachedFetch } from "./cache.js";

/** Normalize dataset input: accept repo slug or full HF URL, return "org/repo" */
function parseDataset(input) {
  if (!input) return null;
  input = input.trim();
  const urlMatch = input.match(/huggingface\.co\/datasets\/([^/?#\s]+\/[^/?#\s]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[^/\s]+\/[^/\s]+$/.test(input)) return input;
  return null;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const raw = url.searchParams.get("dataset") || "";
  const dataset = parseDataset(raw);

  const [discoverResult, sessionsResult] = await Promise.allSettled([
    fetchDiscover(context),
    dataset ? fetchSessions(dataset, context) : Promise.resolve(null),
  ]);

  const discover = discoverResult.status === "fulfilled" ? discoverResult.value : [];
  const sessionsData = sessionsResult.status === "fulfilled" ? sessionsResult.value : null;
  const error = dataset && sessionsData?.error ? sessionsData.error : null;
  const entries = sessionsData?.entries ?? null;

  return new Response(renderPage({ inputValue: raw, dataset, entries, error, discover }), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function fetchDiscover(context) {
  const url = "https://huggingface.co/api/datasets?filter=pi-share-hf&limit=100&sort=trendingScore&direction=-1";
  const resp = await cachedFetch("pi-viewer:discover", url, 600, context);
  if (!resp.ok) return [];
  const json = await resp.json();
  return json.map((d) => ({
    id: d.id,
    downloads: d.downloads ?? 0,
    likes: d.likes ?? 0,
    lastModified: d.lastModified ? d.lastModified.slice(0, 10) : "",
    trendingScore: d.trendingScore ?? 0,
  }));
}

async function fetchSessions(dataset, context) {
  try {
    const manifestUrl = `https://huggingface.co/datasets/${dataset}/resolve/main/manifest.jsonl`;
    const resp = await cachedFetch(`pi-viewer:manifest:${dataset}`, manifestUrl, 300, context);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from Hugging Face`);
    const text = await resp.text();
    const entries = text.trim().split("\n").filter(Boolean)
      .map((line) => JSON.parse(line))
      .reverse();
    return { entries };
  } catch (err) {
    return { error: err.message };
  }
}

function fmt(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderPage({ inputValue, dataset, entries, error, discover }) {
  // Main content: sessions list or discover grid
  let mainContent;

  if (error) {
    mainContent = `<p class="error">Could not load <strong>${dataset}</strong>: ${error}</p>`;
  } else if (entries !== null) {
    const back = `<a class="back" href="/">← all datasets</a>`;
    const hfUrl = `https://huggingface.co/datasets/${dataset}`;
    const meta = `<div class="sessions-meta"><a href="${hfUrl}" target="_blank" rel="noopener">${dataset}</a> <span class="muted">${entries.length} sessions</span></div>`;
    const items = entries.map((entry) => {
      const file = entry.file;
      const m = file.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-\d{3}Z_(.+)\.jsonl$/);
      const date = m ? m[1] : "unknown";
      const time = m ? `${m[2]}:${m[3]}:${m[4]}` : "";
      const uuid = m ? m[5].slice(0, 8) : file;
      const href = `/session/${encodeURIComponent(file)}?dataset=${encodeURIComponent(dataset)}`;
      return `<li data-file="${esc(file)}"><a href="${href}"><span class="s-date">${date}</span><span class="s-time">${time}</span><span class="s-uuid">${uuid}</span></a></li>`;
    }).join("");
    mainContent = `${back}${meta}<ul class="sessions">${items}</ul>`;
  } else {
    // Discover grid
    const cards = discover.map((d) => {
      const href = `/?dataset=${encodeURIComponent(d.id)}`;
      const meta = [
        `Updated ${timeAgo(d.lastModified)}`,
        d.downloads ? `↓ ${fmt(d.downloads)}` : "",
        d.likes      ? `♡ ${d.likes}` : "",
      ].filter(Boolean).join(" · ");
      return `<li><a class="card" href="${href}">
        <span class="card-id">⊟ ${d.id}</span>
        <span class="card-meta">${meta}</span>
      </a></li>`;
    }).join("");
    mainContent = `
      <p class="discover-label">Datasets tagged <code>pi-share-hf</code></p>
      <ul class="grid">${cards}</ul>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>pi sessions</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8f8f8;
      color: #222;
      min-height: 100vh;
    }
    .wrap {
      max-width: 780px;
      margin: 0 auto;
      padding: 3rem 1.5rem 4rem;
    }

    /* Header */
    .header {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      margin-bottom: 1.75rem;
    }
    h1 {
      font-size: 1rem;
      font-weight: 700;
      color: #111;
      letter-spacing: -0.01em;
    }
    .info-btn {
      display: inline-flex;
      align-items: center;
      color: #999;
      cursor: pointer;
      user-select: none;
      transition: color 0.15s;
      line-height: 1;
      margin-top: 2px;
    }
    .info-btn:hover { color: #555; }

    /* Lightbox */
    .lightbox-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.35);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    .lightbox-overlay.open { display: flex; }
    .lightbox {
      background: #fff;
      border-radius: 12px;
      padding: 1.8rem 2rem;
      max-width: 520px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      position: relative;
      font-size: 0.875rem;
      line-height: 1.6;
      color: #333;
    }
    .lightbox h2 {
      font-size: 1rem;
      font-weight: 700;
      color: #111;
      margin-bottom: 0.8rem;
    }
    .lightbox p { margin-bottom: 0.6rem; }
    .lightbox a { color: #547da7; text-decoration: none; }
    .lightbox a:hover { text-decoration: underline; }
    .lightbox-close {
      position: absolute;
      top: 0.8rem;
      right: 1rem;
      font-size: 1.2rem;
      color: #999;
      cursor: pointer;
      border: none;
      background: none;
      line-height: 1;
    }
    .lightbox-close:hover { color: #555; }

    /* Search */
    form {
      display: flex;
      gap: 0.4rem;
      margin-bottom: 2rem;
    }
    input[type="text"] {
      flex: 1;
      padding: 0.6rem 0.8rem;
      background: #fff;
      border: 1px solid #d0d0d8;
      border-radius: 8px;
      color: #222;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.15s;
      min-width: 0;
    }
    input[type="text"]:focus { border-color: #888; }
    input[type="text"]::placeholder { color: #aaa; }
    button[type="submit"] {
      padding: 0.6rem 1.1rem;
      background: #fff;
      border: 1px solid #d0d0d8;
      border-radius: 8px;
      color: #555;
      font-size: 0.875rem;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
    }
    button[type="submit"]:hover { background: #f0f0f4; color: #222; }

    /* Error */
    .error { color: #cc3333; font-size: 0.875rem; }
    .error strong { color: #aa2222; }

    /* Back link */
    .back {
      display: inline-block;
      font-size: 0.8rem;
      color: #888;
      text-decoration: none;
      margin-bottom: 1rem;
      transition: color 0.1s;
    }
    .back:hover { color: #444; }

    /* Sessions */
    .sessions-meta {
      font-size: 0.8rem;
      font-weight: 600;
      color: #555;
      margin-bottom: 0.6rem;
    }
    .sessions-meta a { color: #555; text-decoration: none; }
    .sessions-meta a:hover { text-decoration: underline; }
    .sessions-meta .muted { font-weight: 400; color: #999; margin-left: 0.4rem; }
    ul.sessions { list-style: none; display: flex; flex-direction: column; gap: 2px; }
    ul.sessions li a {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.5rem 0.7rem;
      background: #fff;
      border-radius: 7px;
      border: 1px solid #e8e8ec;
      color: #444;
      text-decoration: none;
      font-size: 0.825rem;
      font-variant-numeric: tabular-nums;
      transition: background 0.1s;
    }
    ul.sessions li a:hover { background: #f4f4f8; color: #111; }
    .s-title { color: #222; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
    .s-date { color: #222; font-weight: 500; }
    .s-time { color: #999; }
    .s-uuid { color: #ccc; font-size: 0.75rem; margin-left: auto; }

    /* Discover */
    .discover-label {
      font-size: 0.75rem;
      color: #999;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      margin-bottom: 0.8rem;
    }
    .discover-label code {
      text-transform: none;
      font-family: monospace;
      letter-spacing: 0;
      color: #666;
    }
    ul.grid {
      list-style: none;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    @media (max-width: 560px) { ul.grid { grid-template-columns: 1fr; } }
    .card {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.3rem;
      padding: 0.85rem 1rem;
      background: #fff;
      border-radius: 10px;
      border: 1px solid #e0e0e8;
      text-decoration: none;
      transition: background 0.12s, border-color 0.12s;
      min-width: 0;
    }
    .card:hover { background: #f8f8fc; border-color: #c8c8d4; }
    .card-id {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 0.875rem;
      color: #222;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-meta {
      font-size: 0.75rem;
      color: #999;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-variant-numeric: tabular-nums;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>pi sessions</h1><span class="info-btn" id="info-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><line x1="8" y1="7" x2="8" y2="11.5"/><circle cx="8" cy="4.8" r="0.1" fill="currentColor" stroke="none"/></svg></span>
    </div>
    <div class="lightbox-overlay" id="lightbox-overlay">
      <div class="lightbox">
        <button class="lightbox-close" id="lightbox-close">&times;</button>
        <h2>pi sessions viewer</h2>
        <p>This site lets you browse and view <a href="https://github.com/pi-tensor/pkgs/coding-agent" target="_blank" rel="noopener">pi</a> coding agent session traces stored on <a href="https://huggingface.co/" target="_blank" rel="noopener">HuggingFace</a> datasets. Enter a dataset ID or URL to load sessions, each rendered with the same UI as <code>pi --export</code>.</p>
        <p>The homepage also discovers public datasets tagged <code>pi-share-hf</code> so you can explore shared sessions without knowing a specific repo.</p>
        <p style="margin-top:1rem;padding-top:0.8rem;border-top:1px solid #eee;color:#777;font-size:0.8rem;"><a href="https://x.com/altryne/status/2043748676099866771" target="_blank" rel="noopener">yolopopolo</a> — this entire site is vibe coded. No human has read the code. Full L on the ZL continuum. <a href="https://github.com/aliou/pi-sessions-viewer" target="_blank" rel="noopener">Source on GitHub</a>.</p>
      </div>
    </div>
    <form method="get" action="/">
      <input type="text" name="dataset" value="${inputValue}"
             placeholder="org/repo or huggingface.co/datasets/…"
             autocomplete="off" spellcheck="false">
      <button type="submit">Load</button>
    </form>
    ${mainContent}
  </div>
  <script>
    const btn = document.getElementById('info-btn');
    const overlay = document.getElementById('lightbox-overlay');
    const close = document.getElementById('lightbox-close');
    btn.addEventListener('click', () => overlay.classList.add('open'));
    close.addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.classList.remove('open'); });

    // Lazy-load session titles in the background
    (async function() {
      const list = document.querySelector('ul.sessions');
      if (!list) return;
      const ds = ${dataset ? `"${dataset}"` : 'null'};
      if (!ds) return;
      try {
        const resp = await fetch('/api/titles?dataset=' + encodeURIComponent(ds));
        if (!resp.ok) return;
        const titles = await resp.json();
        for (const [file, title] of Object.entries(titles)) {
          if (!title) continue;
          const li = list.querySelector('li[data-file="' + CSS.escape(file) + '"]');
          if (!li) continue;
          const a = li.querySelector('a');
          const span = document.createElement('span');
          span.className = 's-title';
          span.textContent = title;
          a.insertBefore(span, a.firstChild);
          const uuid = a.querySelector('.s-uuid');
          if (uuid) uuid.remove();
          const time = a.querySelector('.s-time');
          if (time) time.remove();
        }
      } catch {}
    })();
  </script>
</body>
</html>`;
}
