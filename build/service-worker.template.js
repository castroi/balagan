/*
 * Balagan service worker — generated at build time from build/service-worker.template.js.
 * Do not edit dist/sw.js; edit the template.
 *
 * - On install, every file of this build is cached (and, best effort, the Hebrew
 *   fonts), so the app opens offline after a single online visit.
 * - Each build has its own cache; older caches are deleted on activate.
 * - The page: network first (so a new version loads when online), falling back
 *   to the cached copy after 3 seconds, on an error response, or when offline.
 * - Built files: cache first.
 * - Google Fonts: cache first; only successful responses are stored.
 */
const VERSION = '__CACHE_VERSION__';
const PRECACHE = __PRECACHE_LIST__;
const FONT_CSS = __FONT_CSS_URL__;
const CACHE = `balagan-${VERSION}`;
const FONT_CACHE = `balagan-fonts-${'__FONT_VERSION__'}`;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const NETWORK_TIMEOUT_MS = 3000;
const FONT_TIMEOUT_MS = 5000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
      // Fonts are a bonus: failing or slow downloads must not block offline support.
      Promise.race([cacheFonts(), wait(FONT_TIMEOUT_MS)]).catch(() => undefined),
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // "hebrew-practice-" is the cache of the first version (1.0.0).
            .filter((k) => (k.startsWith('balagan-') || k.startsWith('hebrew-practice-')) && k !== CACHE && k !== FONT_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(event, FONT_CACHE, () => true));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(event));
    return;
  }
  // Only files that belong to this build are stored (not leftovers from an old open page).
  event.respondWith(cacheFirst(event, CACHE, (u) => PRECACHE.includes(u.pathname)));
});

/** Downloads the font stylesheet and the font files it points to. */
async function cacheFonts() {
  if (!FONT_CSS) return;
  const cache = await caches.open(FONT_CACHE);
  const cssResponse = await fetch(FONT_CSS, { mode: 'cors' });
  if (!cssResponse.ok) return;
  const css = await cssResponse.clone().text();
  await cache.put(FONT_CSS, cssResponse);
  const fontUrls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
  await Promise.all(
    fontUrls.map(async (fontUrl) => {
      const response = await fetch(fontUrl, { mode: 'cors' });
      if (response.ok) await cache.put(fontUrl, response);
    }),
  );
}

/** Cached copy if there is one; otherwise the network, storing successful responses. */
async function cacheFirst(event, cacheName, shouldStore) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok && shouldStore(new URL(event.request.url))) {
    event.waitUntil(cache.put(event.request, response.clone()));
  }
  return response;
}

const isPage = (response) => response.ok && (response.headers.get('content-type') || '').includes('text/html');

/** The newest page when online; the cached page after a timeout, on an error, or when offline. */
async function networkFirstPage(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match('/');
  const update = fetch(event.request).then(async (response) => {
    // Store only real pages, so opening e.g. the manifest in a tab can't replace the app.
    if (isPage(response)) await cache.put('/', response.clone());
    return response;
  });
  // Keep the worker alive until the update is stored, even if the timeout answered first.
  event.waitUntil(update.catch(() => undefined));
  if (!cached) return update;

  const timeout = wait(NETWORK_TIMEOUT_MS).then(() => null);
  try {
    const response = await Promise.race([update, timeout]);
    return response && response.ok ? response : cached;
  } catch {
    return cached;
  }
}
