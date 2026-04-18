# pi-sessions-viewer

Cloudflare Pages app that renders pi coding agent session traces stored on HuggingFace datasets. Uses pi's own export renderer (template.js, template.css, marked, highlight.js) to display sessions with the same chrome as `pi --export`.

## Architecture

Two Pages Functions + static assets. No build step.

### Static assets (`public/`)

- `assets/template.css` — pi export CSS with light theme variables baked in. Extracted from a `pi --export` HTML file.
- `assets/template.js` — pi's client-side renderer (~1700 lines). Reads session data from a `<script id="session-data">` tag (base64-encoded JSON), builds the sidebar tree, renders messages/tool calls/markdown/syntax highlighting. Copied verbatim from `pi-mono/packages/coding-agent/src/core/export-html/template.js`.
- `assets/vendor/marked.min.js`, `assets/vendor/highlight.min.js` — vendored libraries for markdown and syntax highlighting. Also from pi-mono.

### Functions (`functions/`)

**`functions/index.js`** — Homepage. Two modes:
- No `?dataset=` param: fetches `https://huggingface.co/api/datasets?filter=pi-share-hf` (public, no auth) to discover tagged datasets and renders them as a 2-column grid.
- With `?dataset=org/repo` (or full HF URL): fetches `manifest.jsonl` from the dataset and lists all sessions newest-first.

Accepts both `org/repo` and `https://huggingface.co/datasets/org/repo` as input.

**`functions/session/[filename].js`** — Session renderer. Given `?dataset=org/repo`:
1. Fetches the JSONL file from `https://huggingface.co/datasets/{dataset}/resolve/main/{filename}`
2. Parses it: first line is the session header (`type: "session"`), remaining lines are entries. `leafId` is set to the last entry's `id` (mirrors `SessionManager._buildIndex`).
3. JSON-stringifies `{ header, entries, leafId }`, base64-encodes it, injects into the HTML template.
4. The HTML references static assets via `<link>` and `<script src>` tags. template.js picks up the base64 blob from `<script id="session-data">` and renders everything client-side.

## Session data format

The JSONL files are pi session files (see pi-mono docs `packages/coding-agent/docs/session.md`). Each line is a JSON object with a `type` field. The `sessionData` object passed to template.js has three fields:
- `header` — the first line (`type: "session"`, contains version, id, cwd, timestamp)
- `entries` — all other lines (messages, model changes, compactions, etc.)
- `leafId` — id of the last entry (determines which branch to render in the tree)

## Updating the theme

The CSS in `public/assets/template.css` is extracted from an actual `pi --export` output. To change the theme:
1. Run `pi --export <session.jsonl>` with the desired theme active
2. Extract the `<style>` block from the generated HTML
3. Replace `public/assets/template.css`

## Updating the renderer

If pi's export format changes, copy the updated files from `pi-mono/packages/coding-agent/src/core/export-html/`:
- `template.js` → `public/assets/template.js`
- `template.html` structure → update the HTML in `functions/session/[filename].js` (the `buildHtml` function)
- `vendor/marked.min.js`, `vendor/highlight.min.js` → `public/assets/vendor/`

## Local development

```bash
npm install
npx wrangler pages dev ./public
```

Requires wrangler 4+. The `functions/` directory is auto-discovered by wrangler when run from the project root.

## Deployment

Connected to GitHub via Cloudflare Pages git integration. Pushes to `main` auto-deploy. No build command, build output directory is `public`.
