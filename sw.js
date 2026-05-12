const CACHE = 'offer-plus-v4';
const SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './db.js',
  './sync.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './vendor/jsQR.js',
  './vendor/pako.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => {
        const isUpdate = keys.some(k => k !== CACHE);
        return Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
          .then(() => isUpdate);
      })
      .then(isUpdate => self.clients.claim().then(() => isUpdate))
      .then(isUpdate => {
        if (!isUpdate) return;
        return self.clients.matchAll({ includeUncontrolled: true })
          .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })));
      })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isVendor = url.pathname.includes('/vendor/') || url.pathname.includes('/icons/');

  if (isVendor) {
    // Cache-first: vendor files and icons never change between releases
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }))
    );
  } else {
    // Network-first: always get latest; fall back to cache when offline
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request)
          .then(hit => hit || (e.request.mode === 'navigate'
            ? caches.match('./index.html')
            : new Response('', { status: 503 })))
      )
    );
  }
});
