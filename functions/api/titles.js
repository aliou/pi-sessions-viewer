import { cachedFetch } from "../cache.js";
import { fetchSessionTitles } from "../session-titles.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const dataset = url.searchParams.get("dataset");

  if (!dataset || !/^[^/\s]+\/[^/\s]+$/.test(dataset)) {
    return new Response("Missing or invalid ?dataset= param", { status: 400 });
  }

  // Fetch manifest, fall back to tree API if not found
  const manifestUrl = `https://huggingface.co/datasets/${dataset}/resolve/main/manifest.jsonl`;
  const manifestResp = await cachedFetch(`pi-viewer:manifest:${dataset}`, manifestUrl, 300, context);

  let entries;
  if (manifestResp.ok) {
    const text = await manifestResp.text();
    entries = text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } else {
    // Tree API fallback — discover .jsonl files
    const treeUrl = `https://huggingface.co/api/datasets/${dataset}/tree/main?recursive=true&limit=500`;
    const treeResp = await cachedFetch(`pi-viewer:tree:${dataset}`, treeUrl, 300, context);
    if (!treeResp.ok) {
      return new Response(JSON.stringify({}), {
        headers: { "Content-Type": "application/json" },
      });
    }
    const treeData = await treeResp.json();
    entries = treeData
      .filter((item) => item.type === "file" && item.path.endsWith(".jsonl"))
      .map((item) => ({ file: item.path }));
  }

  const titles = await fetchSessionTitles(dataset, entries, context);
  // titles is Map<filename, {title, isPi}> — Object.fromEntries produces {filename: {title, isPi}}
  const obj = Object.fromEntries(titles);

  return new Response(JSON.stringify(obj), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
