/**
 * Azayon service worker.
 *
 * This is an AUTHENTICATED back-office app, so the SW is deliberately conservative:
 * it never caches API responses or authenticated HTML (that would leak stale or
 * another user's private data). It only:
 *   1. cache-firsts Next.js immutable, content-hashed build assets (/_next/static),
 *   2. network-firsts navigations, falling back to a static offline page when the
 *      network is unavailable.
 * Bump CACHE_VERSION to invalidate old caches on deploy.
 */
const CACHE_VERSION = "v1";
const STATIC_CACHE = `azayon-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.add(OFFLINE_URL)),
  );
  // Activate this SW as soon as it's finished installing.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("azayon-static-") && k !== STATIC_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GETs; never touch mutations.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Same-origin only. Leave API calls, WebSockets, Meta SDK, etc. untouched.
  if (url.origin !== self.location.origin) return;

  // Never cache API traffic (dev proxies /api/* through the web origin).
  if (url.pathname.startsWith("/api/")) return;

  // Cache-first for immutable, content-hashed build output — safe to serve forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Network-first for page navigations, with an offline fallback. We do NOT cache
  // the responses (they may be personalised / auth-gated).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL, { cacheName: STATIC_CACHE }),
      ),
    );
    return;
  }

  // Everything else: straight to network.
});
