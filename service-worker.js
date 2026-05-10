// ── מילון Service Worker ──────────────────────────────────────────
// Cache strategy: Cache First for app shell, Network First for updates

const CACHE_NAME = 'milone-v1';
const UPDATE_CACHE = 'milone-updates-v1';

// App shell files to cache on install
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png',
];

// ── INSTALL: cache the app shell ──────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    }).then(function() {
      // Activate immediately, don't wait for old SW to die
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: clean old caches ────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME && key !== UPDATE_CACHE;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH: serve from cache, fall back to network ─────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // For dict_updates.json: Network First (always fresh)
  if (url.pathname.endsWith('dict_updates.json')) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        var clone = response.clone();
        caches.open(UPDATE_CACHE).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  // For Google Fonts: Cache First
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        }).catch(function() {
          return new Response('', { status: 408 });
        });
      })
    );
    return;
  }

  // For app shell: Cache First, fallback to network
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        // Cache successful GET responses
        if (response && response.status === 200 && event.request.method === 'GET') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback
        return caches.match('./index.html');
      });
    })
  );
});

// ── BACKGROUND SYNC: check for dict updates ───────────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
