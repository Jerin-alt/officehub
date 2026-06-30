// OfficeHub Service Worker for PWA compliance

const CACHE_NAME = 'officehub-cache-v1';
const ASSETS = [
  '/',
  '/static/style.css',
  '/static/app.js',
  '/static/manifest.json'
];

// Install Service Worker and cache core shell assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Service Worker and clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch events: try cache first, fall back to network
self.addEventListener('fetch', (e) => {
  // Ignore API requests and file uploads/downloads
  if (e.request.url.includes('/api/') || e.request.url.includes('/uploads/')) {
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Cache new static resources dynamically
        if (networkResponse.status === 200 && e.request.method === 'GET') {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, cacheCopy);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback if network fails and not in cache
        if (e.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
