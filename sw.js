const CACHE_NAME = 'bp-v5';
const CORE = [
    '/images/logo-black.png',
    '/manifest.webmanifest',
];
const NETWORK_FIRST = /\.(html|css|js|webmanifest)$|\/$/i;

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(CORE).catch(() => null))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/sw.js')) return;

    if (req.mode === 'navigate' || NETWORK_FIRST.test(url.pathname)) {
        event.respondWith(
            fetch(req).then(networkResp => {
                if (networkResp && networkResp.status === 200 && networkResp.type === 'basic') {
                    const copy = networkResp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, copy));
                }
                return networkResp;
            }).catch(() => caches.match(req).then(r => r || caches.match('/')))
        );
        return;
    }

    event.respondWith(
        caches.match(req).then(cached => {
            const fetchPromise = fetch(req).then(networkResp => {
                if (networkResp && networkResp.status === 200 && networkResp.type === 'basic') {
                    const copy = networkResp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, copy));
                }
                return networkResp;
            }).catch(() => cached);
            return cached || fetchPromise;
        })
    );
});
