// Ledger service worker — offline support.
// Bump CACHE_NAME on every deploy so clients pick up the new index.html
// instead of serving a stale cached copy forever.
const CACHE_NAME = 'ledger-cache-v2';

// Everything the app needs to boot. Icons/manifest are inlined as data:
// URIs inside index.html, so there's nothing else to list here.
const APP_SHELL = [
  './',
  './index.html'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Page navigations and the app shell itself: try the network first so you
  // always get the latest deploy when online, but fall back to the cached
  // copy (and cache whatever we fetch) so it still loads offline.
  const isNavigation = req.mode === 'navigate';
  const isShellFile = APP_SHELL.some((path) => req.url.endsWith(path.replace('./', '')));

  if (isNavigation || isShellFile) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Everything else (Google Fonts CSS/files, the XLSX library, etc.):
  // cache-first. Once fetched successfully while online, it's reused
  // offline from then on. Cross-origin CORS-mode responses (status 200)
  // and opaque responses are both cached, since a resource without the
  // crossorigin attribute can come back opaque (unreadable status).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
