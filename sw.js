// Keep the entire application, including p5, available after the first visit.
const CACHE = 'ornament-studio-v3';
const ASSETS = ['./', './index.html', './style.css', './shared.js', './controlsSketch.js',
  './gridSketch.js', './sphereSketch.js', './mappingData.js', './manifest.webmanifest', './vendor/p5.min.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('ornament-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    // Network first: a new deployment must not remain stuck behind stale assets.
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(() => caches.match(event.request)));
});
