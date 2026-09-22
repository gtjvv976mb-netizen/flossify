// Flossify's service worker. Hand-written and deliberately small: it makes the
// workspace installable and says so honestly when the connection is gone.
//
// What it caches: the offline page (with the stylesheet it links), the two
// fonts, the favicon and the icons at install; hashed bundles under /assets/
// and /_astro/ and the immutable files under /fonts/ and /icons/ as they are
// used. What it never caches: pages, the API, /c/ and /uploads/. Patient data
// must not sit in a cache on a shared front-desk tablet, so a navigation goes
// to the network every time and only the offline page answers when it fails.
const VERSION = 'v1';
const CACHE = `flossify-${VERSION}`;
const OFFLINE = '/offline/';
const PRECACHE = [
  OFFLINE,
  '/favicon.svg',
  '/fonts/Archivo.woff2',
  '/fonts/IBMPlexMono-400.woff2',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];
const IMMUTABLE = /^\/(assets|_astro|fonts|icons)\//;

// Only a good, same-origin response is worth keeping. Opaque responses hide
// their status and would fill the cache with errors.
function keep(res) {
  return res && res.ok && res.type === 'basic';
}

// Fetches past the HTTP cache so a new worker never precaches a stale copy.
async function precache(cache, url) {
  const res = await fetch(new Request(url, { cache: 'reload' }));
  if (!keep(res)) throw new Error(`precache ${url}: ${res.status}`);
  await cache.put(url, res.clone());
  return res;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const offline = await precache(cache, OFFLINE);
      // The offline page is useless without its stylesheet, which is hashed
      // and only known at build time; read the hrefs off the page itself.
      const html = await offline.text();
      const sheets = [...html.matchAll(/<link\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((tag) => /\brel="stylesheet"/.test(tag))
        .map((tag) => (tag.match(/\bhref="([^"]+)"/) || [])[1])
        .filter(Boolean);
      const rest = PRECACHE.slice(1).concat(sheets);
      // An icon that is missing must not stop the worker from installing.
      await Promise.allSettled(rest.map((url) => precache(cache, url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

async function offlinePage() {
  const cached = await caches.match(OFFLINE);
  return cached || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (keep(res)) {
    const cache = await caches.open(CACHE);
    await cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(offlinePage));
    return;
  }
  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Everything else (the API, /c/, /uploads/, JSON fetches) goes straight to
  // the network and is never stored.
});
