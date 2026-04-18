import { cachedFetch } from "../cache.js";
import { fetchSessionTitles } from "../session-titles.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const dataset = url.searchParams.get("dataset");

  if (!dataset || !/^[^/\s]+\/[^/\s]+$/.test(dataset)) {
    return new Response("Missing or invalid ?dataset= param", { status: 400 });
  }

  // Fetch manifest
  const manifestUrl = `https://huggingface.co/datasets/${dataset}/resolve/main/manifest.jsonl`;
  const manifestResp = await cachedFetch(`pi-viewer:manifest:${dataset}`, manifestUrl, 300, context);
  if (!manifestResp.ok) {
    return new Response(JSON.stringify({}), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const text = await manifestResp.text();
  const entries = text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));

  const titles = await fetchSessionTitles(dataset, entries, context);
  const obj = Object.fromEntries(titles);

  return new Response(JSON.stringify(obj), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
