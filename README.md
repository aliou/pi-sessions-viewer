# pi-sessions-viewer

A Cloudflare Pages app that renders [pi](https://pi.dev) coding agent session traces from HuggingFace datasets. It uses the same rendering engine as `pi --export` to display sessions with full sidebar navigation, syntax highlighting, and tool call rendering.

Live at: https://pi-sessions-viewer.pages.dev/

## How it works

- The homepage discovers datasets tagged `pi-share-hf` on HuggingFace (no auth needed)
- Clicking a dataset fetches its `manifest.jsonl` and lists all sessions
- Clicking a session fetches the JSONL file from HuggingFace, parses it into pi's session format, and renders it using pi's export template (CSS, JS, marked.js, highlight.js)
- Accepts both `org/repo` and full HuggingFace URLs as input

## Project structure

```
functions/              Cloudflare Pages Functions
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
