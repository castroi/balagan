/*
 * Balagan service worker — generated at build time from build/service-worker.template.js.
 * Do not edit dist/sw.js; edit the template.
 *
 * - On install, every file of this build is cached, so the app opens offline
 *   after a single online visit.
 * - Each build has its own cache; older caches are deleted on activate.
 * - Pages: network first (so a new version loads when online), falling back to
 *   the cache after 3 seconds or when offline.
 * - Built files (hashed names, never change): cache first.
 * - Google Fonts: cache first, only successful responses are stored.
 */
const VERSION = '__CACHE_VERSION__';
const PRECACHE = __PRECACHE_LIST__;
const CACHE = `balagan-${VERSION}`;
const FONT_CACHE = 'balagan-fonts-v1';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(event, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(event));
    return;
  }
  event.respondWith(cacheFirst(event, CACHE));
});

/** Cached copy if there is one; otherwise the network, storing only successful responses. */
async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
  return response;
}

/** The newest page when online; the cached page after a timeout or when offline. */
async function networkFirstPage(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match('/');
  const network = fetch(event.request).then((response) => {
    if (response.ok) event.waitUntil(cache.put('/', response.clone()));
    return response;
  });
  if (!cached) return network;

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  try {
    return (await Promise.race([network, timeout])) ?? cached;
  } catch {
    return cached;
  }
}
