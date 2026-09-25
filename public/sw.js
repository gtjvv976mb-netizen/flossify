// Flossify's service worker. Hand-written and deliberately small: it makes the
// workspace installable, keeps an open chart working through a brownout, and
// says so honestly when the connection is gone.
//
// What it caches: the offline page (with the stylesheet it links), the two
// fonts, the favicon and the icons at install; hashed bundles under /assets/
// and /_astro/ and the immutable files under /fonts/ and /icons/ as they are
// used. What it never caches: the API, /uploads/, and every workspace page
// but one.
//
// The one: the patient record whose chart is open, so a reload or a tablet
// that drops the tab mid-brownout comes back to the chart instead of the
// offline page (the chart's own changes wait in IndexedDB — src/lib/offline-
// queue.ts — and are painted over the copy). Rules, because patient data must
// not sit around on a shared front-desk tablet:
//  - Only a patient record page (/c/<clinic>/patients/<uuid>/) that the server
//    rendered with a chart the signed-in person can save to (it carries
//    data-shell-until, the end of that person's sign-in).
//  - One page at a time: opening another patient's record replaces it.
//  - Served only when the network fails, or has not answered in 5 seconds (a
//    line that hangs), or answers with a server error — only for that same
//    address, only until the sign-in it was rendered under would have ended
//    and never more than 4 hours after it was kept (a visit, with a brownout
//    in it; a copy older than that is no longer worth keeping), and marked
//    as a copy (<html data-offline-copy>) so the chart says so. A slow
//    answer that comes after the copy was shown still replaces or drops it.
//  - Gone at every sign-in, sign-out and sign-up (a POST to /auth/ or
//    /start/), and at every visit to /auth/ (where a sign-in that has run
//    out, or been ended elsewhere, lands), so nobody signing in after someone
//    else is ever shown the other person's copy. A new version of this file
//    drops it too. The workspace's sign-out is usually sent by the page
//    itself (fetch, so it can keep unsent chart changes when the line is
//    down; guardSignOut in src/lib/offline-queue.ts): that is not a page
//    load, so the page drops this cache ('flossify-record-…') itself once
//    the server has signed it out. Change the name here, change it there.
//  - Gone as soon as anything shows the sign-in no longer opens it: the
//    network answering that address with anything but a record this person
//    can chart on (the redirect to sign-in after a password reset elsewhere
//    or an account switched off, a refusal, a page without a saving chart),
//    and a page hearing from the server that nobody is signed in here
//    (follow() in src/lib/offline-queue.ts).
//  - What none of that reaches: a device that never gets an answer from the
//    server again keeps the copy until its time is up (at most 4 hours), even
//    if the sign-in was ended elsewhere meanwhile. It is shown only at that
//    one address, marked as a copy.
// Every other navigation goes to the network every time and only the offline
// page answers when it fails.
const VERSION = 'v2';
const CACHE = `flossify-${VERSION}`;
const RECORD = `flossify-record-${VERSION}`;
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
const RECORD_PAGE = /^\/c\/[^/]+\/patients\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;
const RECORD_HOURS = 4;
// How long a record page may take before the kept copy is shown instead (the network's answer still updates it).
const RECORD_WAIT_MS = 5000;
const SESSION_POST = /^\/(auth|start)(\/|$)/;
const AUTH_PAGE = /^\/auth(\/|$)/;

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
      await Promise.all(names.filter((n) => n !== CACHE && n !== RECORD).map((n) => caches.delete(n)));
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

// --- the open patient record ------------------------------------------------

// One address per record, however it was typed.
const recordKey = (url) => url.origin + url.pathname.replace(/\/?$/, '/');

async function dropRecord(url) {
  if (!(await caches.has(RECORD))) return;
  await (await caches.open(RECORD)).delete(recordKey(url));
}

// What the network said about a record's address decides its copy. A record page this person can chart on replaces
// it. Anything else — the redirect to sign-in (a navigation's redirect is opaque here), a refusal, a missing page, a
// page without a saving chart — shows the copy's sign-in no longer opens it: the copy goes. A server error (5xx)
// says nothing about the sign-in, and changes nothing.
async function noteRecord(url, res) {
  if (res.status >= 500) return;
  if (keep(res)) return keepRecord(url, res);
  await dropRecord(url);
}

async function keepRecord(url, res) {
  const html = await res.text();
  const until = Number((html.match(/\bdata-shell-until="(\d+)"/) || [])[1]);
  // No chart this person can save to on the page: keep nothing, and drop what was kept.
  if (!until) {
    await dropRecord(url);
    return;
  }
  const now = Date.now();
  const cache = await caches.open(RECORD);
  const key = recordKey(url);
  await cache.put(key, new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Flossify-Kept-At': String(now),
      'X-Flossify-Until': String(Math.min(until, now + RECORD_HOURS * 3600 * 1000)),
    },
  }));
  // One record at a time. (Two openings racing can leave none; never two.)
  for (const req of await cache.keys()) if (req.url !== key) await cache.delete(req);
}

async function recordCopy(url) {
  const cache = await caches.open(RECORD);
  const key = recordKey(url);
  const hit = await cache.match(key);
  if (!hit) return null;
  if (!(Number(hit.headers.get('X-Flossify-Until')) > Date.now())) {
    await cache.delete(key);
    return null;
  }
  const keptAt = Number(hit.headers.get('X-Flossify-Kept-At')) || 0;
  const html = (await hit.text()).replace(/<html\b/i, `<html data-offline-copy="${keptAt}"`);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// A copy past its time is deleted at the next navigation, not only when it
// would have been served: it does not wait on the device for a brownout.
async function dropExpired() {
  if (!(await caches.has(RECORD))) return;
  const cache = await caches.open(RECORD);
  for (const req of await cache.keys()) {
    const hit = await cache.match(req);
    if (!hit || !(Number(hit.headers.get('X-Flossify-Until')) > Date.now())) await cache.delete(req);
  }
}

// The network first. When it fails, has not answered in RECORD_WAIT_MS, or answers with a server error, the kept
// copy if there is one; otherwise whatever the network gives, however long it takes, or the offline page. Whenever
// the network does answer — before or after the copy was shown — the copy follows what it said (noteRecord).
async function recordNavigation(event, url) {
  const net = fetch(event.request);
  // Registered first, so the response is cloned before the page reads it.
  event.waitUntil(net.then((res) => noteRecord(url, res.clone())).catch(() => {}));
  let timer;
  const slow = new Promise((resolve) => { timer = setTimeout(resolve, RECORD_WAIT_MS, null); });
  try {
    const first = await Promise.race([net, slow]);
    if (first && first.status < 500) return first;
    const copy = await recordCopy(url).catch(() => null);
    if (copy) return copy;
    return first || (await net);
  } catch (e) {
    return (await recordCopy(url).catch(() => null)) || offlinePage();
  } finally {
    clearTimeout(timer);
  }
}

// --- whose sign-in ----------------------------------------------------------
// The chart's queue (src/lib/offline-queue.ts) lives in IndexedDB
// 'flossify-offline' v1: stores 'changes' (keyPath 'key') and 'meta'
// (keyPath 'k'). meta 'who' = { staff, sid, at } names the person and the
// sign-in on this device, as the last freshly drawn chart or the server
// said; a chart takes changes only while it names that chart's own person
// and sign-in. At any sign-in, sign-out or sign-up it becomes "nobody since
// at" ({ staff: null, sid: null, at }: kept, not deleted, so an answer from
// before this moment cannot bring the old sign-in back) until a page or the
// server says who again, and that is posted on the 'flossify-offline'
// BroadcastChannel as { who: null, sid: null, at }, so a chart still open for
// the person who was signed in stops taking changes at once. Change one,
// change both.
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('flossify-offline');

function openQueue() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('flossify-offline', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('changes')) db.createObjectStore('changes', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

// `at`: this device's clock when the sign-in or sign-out was sent. A page
// drawn after it (its `at` is later) has already said who is signed in now,
// and a slow worker must not undo that.
async function forgetSession(at) {
  await caches.delete(RECORD);
  const db = await openQueue();
  if (db) {
    await new Promise((resolve) => {
      const t = db.transaction('meta', 'readwrite');
      const meta = t.objectStore('meta');
      const req = meta.get('who');
      req.onsuccess = () => {
        const who = req.result;
        if (!who || !(Number(who.at) > at)) meta.put({ k: 'who', staff: null, sid: null, at });
      };
      t.oncomplete = t.onerror = t.onabort = resolve;
    });
    db.close();
  }
  if (channel) channel.postMessage({ who: null, sid: null, at });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method !== 'GET') {
    // A sign-in, sign-out or sign-up: the next person must not be shown the
    // last one's record. The request itself goes to the network untouched.
    if (request.mode === 'navigate' && SESSION_POST.test(url.pathname)) event.waitUntil(forgetSession(Date.now()).catch(() => {}));
    return;
  }

  if (request.mode === 'navigate') {
    event.waitUntil(dropExpired().catch(() => {}));
    // The sign-in page, the reset and code pages: whoever lands here — a sign-in that ran out or was ended
    // elsewhere is sent here — the copy of a record goes.
    if (AUTH_PAGE.test(url.pathname)) event.waitUntil(caches.delete(RECORD).catch(() => {}));
    if (RECORD_PAGE.test(url.pathname)) {
      event.respondWith(recordNavigation(event, url));
      return;
    }
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
