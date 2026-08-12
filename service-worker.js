const CACHE_NAME = 'ridehero-shell-v25';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/multi-resort.css?v=1',
  './css/onboarding.css?v=9',
  './css/growth-engine.css?v=2',
  './css/auth.css?v=2',
  './css/friends.css?v=2',
  './css/park-map.css?v=2',
  './css/smart-entry.css?v=1',
  './css/ride-intelligence.css?v=4',
  './data/park-catalog.js?v=2',
  './data/ride-aliases.js?v=1',
  './data/walking-graphs.js?v=1',
  './js/data-quality.js?v=1',
  './js/park-catalog.js?v=1',
  './js/wait-provider.js?v=2',
  './js/smart-entry.js?v=1',
  './js/ride-intelligence.js?v=1',
  './js/location-service.js?v=2',
  './js/park-map.js?v=2',
  './js/storage-migration.js?v=2',
  './js/route-engine.js?v=1',
  './js/route-session.js?v=2',
  './js/walking-network.js?v=1',
  './js/data-health.js?v=1',
  './js/supabase-config.js?v=2',
  './js/auth-client.js?v=1',
  './js/auth-ui.js?v=2',
  './js/account-friends.js?v=1',
  './js/friends-store.js?v=1',
  './js/friends-ui.js?v=2',
  './js/growth-analytics.js?v=2',
  './js/navigation.js?v=10',
  './js/pwa-install.js?v=1',
  './js/growth-loader.js?v=2',
  './icons/ridehero-180.png',
  './icons/ridehero-192.png',
  './icons/ridehero-512.png',
  './icons/ridehero-wordmark.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache) {
    return cache.addAll(APP_SHELL);
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(caches.keys().then(function(names) {
    return Promise.all(names.filter(function(name) {
      return name.indexOf('ridehero-') === 0 && name !== CACHE_NAME;
    }).map(function(name) { return caches.delete(name); }));
  }).then(function() { return self.clients.claim(); }));
});

function networkFirst(request) {
  return fetch(request).then(function(response) {
    if (response && response.ok) {
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function(cache) { cache.put(request, copy); });
    }
    return response;
  }).catch(function() {
    return caches.match(request).then(function(cached) {
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.match(request).then(function(cached) {
    var update = fetch(request).then(function(response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(request, copy); });
      }
      return response;
    }).catch(function() { return cached; });
    return cached || update;
  });
}

self.addEventListener('fetch', function(event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  var sensitiveAuthQuery = ['code', 'access_token', 'refresh_token', 'error', 'error_code', 'error_description'].some(function(key) {
    return url.searchParams.has(key);
  });
  if (url.pathname.indexOf('/auth/') === 0 || sensitiveAuthQuery || request.headers.has('authorization')) return;
  if (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/waittimes') === 0) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (/\.(?:css|js|webmanifest)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
