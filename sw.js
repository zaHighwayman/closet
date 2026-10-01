// Service worker: makes the app installable and loads fast. Network-first so updates show
// immediately; falls back to cache when offline. Never caches API or Supabase calls.
const CACHE = 'closet-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const cacheable = url.origin === location.origin || url.hostname === 'esm.sh';
  if (!cacheable) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
