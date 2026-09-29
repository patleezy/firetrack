// FIREtrack service worker: caches the app's own files so it works offline.
// It never stores or sends any financial data; that stays in localStorage.
// Bump CACHE whenever vendor files or icons change.
const CACHE = 'firetrack-v1';
const ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/vendor/chart.umd.min.js',
  '/vendor/hammer.min.js',
  '/vendor/chartjs-plugin-zoom.min.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  // Only handle our own GET requests; fonts and everything else pass through.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network first so updates show up right away; cached page when offline.
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)); }
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && ASSETS.includes(url.pathname)) {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
