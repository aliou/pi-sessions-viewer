# pi-sessions-viewer

A Cloudflare Pages app that renders [pi](https://pi.dev) coding agent session traces from HuggingFace datasets. It uses the same rendering engine as `pi --export` to display sessions with full sidebar navigation, syntax highlighting, and tool call rendering.

Live at: https://pi-sessions-viewer.pages.dev/

## How it works

- The homepage discovers datasets tagged `pi-share-hf` on HuggingFace (no auth needed)
- Clicking a dataset fetches its `manifest.jsonl` and lists all sessions with human-readable titles (extracted from `session_info.name` or the first user message)
- Clicking a session fetches the JSONL file from HuggingFace, parses it into pi's session format, and renders it using pi's export template (CSS, JS, marked.js, highlight.js)
- Accepts both `org/repo` and full HuggingFace URLs as input

## Caching

All HuggingFace API and data requests are cached using the Cloudflare Cache API (`caches.default`). This is free, unlimited, and requires no additional setup (unlike KV which has daily free-tier limits).

| What | Cache key | TTL |
|---|---|---|
| Dataset discovery | `pi-viewer:discover` | 10 min |
| Manifest | `pi-viewer:manifest:{dataset}` | 5 min |
| Session JSONL | `pi-viewer:session:{dataset}:{filename}` | 1 hour |
| Extracted title | `pi-viewer:title:{dataset}:{redacted_hash}` | 1 hour |

Title cache keys use `redacted_hash` instead of filename so that re-redacted sessions (new hash) always get a fresh title.

In local development (`wrangler pages dev`), `caches.default` is not available, so all requests fall back to direct `fetch()` with no caching.

## Project structure

```
functions/              Cloudflare Pages Functions
  cache.js              Cached fetch helper (Cloudflare Cache API)
  session-titles.js     Title extraction from JSONL session files
  index.js              Homepage: dataset discovery + session list
  session/
    [filename].js       Session renderer: fetches JSONL, builds HTML
public/                 Static assets
  assets/
    template.css        pi export CSS (light theme)
    template.js         pi export renderer (~1700 lines, client-side)
    vendor/
      marked.min.js     Markdown parser
      highlight.min.js  Syntax highlighter
```

## Local development

```bash
npm install
npx wrangler pages dev ./public
```

## Deploy

Pushes to `main` auto-deploy via Cloudflare Pages git integration.
