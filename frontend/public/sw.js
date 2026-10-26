// ==============================================================================
// RelayEV Progressive Web App (PWA) Offline Service Worker
// Enables 100% offline operation in rural cellular dead zones
// ==============================================================================

const CACHE_NAME = 'relayev-offline-mesh-v1';
const API_CACHE_NAME = 'relayev-api-cache-v1';

// Critical core assets cached on install for full offline mesh accessibility
const PRECACHE_ASSETS = [
  '/',
  '/charge',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/favicon.ico'
];

// 1. Install Event: Pre-cache application shell
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing RelayEV PWA Offline Shell...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Purge obsolete caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating RelayEV Service Worker...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== API_CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Multi-strategy caching for dead-zone resilience
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-HTTP/HTTPS or chrome-extension schemes
  if (!url.protocol.startsWith('http')) return;

  // Strategy A: Next.js Static Chunks & Icons (Cache-First)
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Strategy B: API Calls (/api/) - Network-First with Stale Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    if (request.method === 'GET') {
      event.respondWith(
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(API_CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(async () => {
            console.log(`[Service Worker] Offline! Serving cached API response for: ${url.pathname}`);
            const cached = await caches.match(request);
            if (cached) return cached;
            return new Response(
              JSON.stringify({ offline: true, error: "Network unavailable. Serving offline mesh data." }),
              { headers: { "Content-Type": "application/json" }, status: 503 }
            );
          })
      );
    }
    return;
  }

  // Strategy C: HTML Page Navigations - Network-First with Offline Page Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch(async () => {
          console.log('[Service Worker] Navigation offline fallback triggered.');
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('/');
        })
    );
    return;
  }

  // Strategy D: Default Fallback
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

// 4. Background Sync / Offline Replay Notification
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
