const CACHE_NAME = 'pga-score-v16_4_6';
const ASSETS = ['./','./index.html','./scorer.html','./hq.html','./monitor.html','./public.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(()=>{}))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', event => { event.respondWith(fetch(event.request).then(response => { const clone=response.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(event.request, clone)).catch(()=>{}); return response; }).catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))); });
