/**
 * Cached fetch using Cloudflare Cache API.
 *
 * Falls back to direct fetch when `caches.default` is unavailable
 * (e.g. local dev with `wrangler pages dev`).
 */
export async function cachedFetch(cacheKey, url, ttlSeconds, context) {
  try {
    const cache = caches.default;
    // Cache API requires a valid absolute URL as the key.
    const keyReq = new Request(`https://cache.local/${cacheKey}`);

    const cached = await cache.match(keyReq);
    if (cached) return cached;

    const resp = await fetch(url);
    if (!resp.ok) return resp;

    const clone = resp.clone();
    const headers = new Headers(clone.headers);
    headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);

    const cachedResp = new Response(clone.body, {
      status: clone.status,
      statusText: clone.statusText,
      headers,
    });

    context.waitUntil(cache.put(keyReq, cachedResp));
    return resp;
  } catch {
    return fetch(url);
  }
}
