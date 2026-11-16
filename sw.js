// FIREtrack service worker: caches the app's own files so it works offline.
// It never stores or sends any financial data; that stays in localStorage.
// Bump CACHE whenever calc.js, vendor files or icons change.
const CACHE = 'firetrack-v3';
const ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/calc.js',
  '/vendor/chart.umd.min.js',
  '/vendor/hammer.min.js',
  '/vendor/chartjs-plugin-zoom.min.js',
  '/vendor/fonts/dmsans-rP2Hp2ywxg089UriCZ2IHSeH.woff2',
  '/vendor/fonts/dmsans-rP2Hp2ywxg089UriCZOIHQ.woff2',
  '/vendor/fonts/dmserifdisplay--nFhOHM81r4j6k0gjAW3mujVU2B2G_VB0PD2.woff2',
  '/vendor/fonts/dmserifdisplay--nFhOHM81r4j6k0gjAW3mujVU2B2G_VB3vD212k.woff2',
  '/vendor/fonts/dmserifdisplay--nFnOHM81r4j6k0gjAW3mujVU2B2G_5x0ujy.woff2',
  '/vendor/fonts/dmserifdisplay--nFnOHM81r4j6k0gjAW3mujVU2B2G_Bx0g.woff2',
  '/vendor/fonts/fonts.css',
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
  // Only handle our own GET requests; anything cross-origin passes through.
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
