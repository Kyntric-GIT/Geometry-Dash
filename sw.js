/* Geometry Dash Webport PWA service worker.
   Runtime caches first-party and cross-origin assets as they are requested. */
const VERSION = "gd-pwa-v1";
const APP_CACHE = `${VERSION}-app`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-512-maskable.png"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("gd-pwa-") && ![APP_CACHE, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || req.url.startsWith("chrome-extension:")) return;

  const url = new URL(req.url);
  // Never cache analytics or non-game tracking.
  if (/google-analytics|googletagmanager|doubleclick/i.test(url.hostname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(req, {ignoreVary: true});

    // Navigation: prefer current page online, fall back to cached app shell.
    if (req.mode === "navigate") {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const appCache = await caches.open(APP_CACHE);
          appCache.put("./index.html", fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        return cached || await (await caches.open(APP_CACHE)).match("./index.html") || Response.error();
      }
    }

    // Assets: network first so updates are picked up; cache successful and opaque responses.
    try {
      const fresh = await fetch(req);
      if (fresh && (fresh.ok || fresh.type === "opaque")) {
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch {
      if (cached) return cached;
      // App shell fallback for a failed same-origin request.
      if (url.origin === self.location.origin) {
        return (await caches.open(APP_CACHE)).match(req) || Response.error();
      }
      return Response.error();
    }
  })());
});
