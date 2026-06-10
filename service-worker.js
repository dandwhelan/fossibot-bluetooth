const CACHE_NAME = 'fossibot-v51';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    const isAppShell = e.request.mode === 'navigate' ||
        new URL(e.request.url).pathname.endsWith('/index.html');

    if (isAppShell) {
        // Network-first for the app shell so deploys go live without a cache
        // version bump; fall back to cache when offline.
        e.respondWith(
            fetch(e.request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
                    return response;
                })
                .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
        );
    } else {
        // Cache-first for static assets
        e.respondWith(
            caches.match(e.request).then((response) => response || fetch(e.request))
        );
    }
});
