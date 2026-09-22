// WebToolkit service worker — offline app shell + runtime cache for the zip.js CDN.
const CACHE = 'webtoolkit-v1';
const SHELL = [
  './',
  './index.html',
  './index.css',
  './manifest.webmanifest',
  './image-stitcher/image-stitcher.html',
  './image-stitcher/image-stitcher.css',
  './image-stitcher/image-stitcher.js',
  './locked-archive/locked-archive.html',
  './locked-archive/locked-archive.css',
  './locked-archive/locked-archive.js',
  './file-encryptor/file-encryptor.html',
  './file-encryptor/file-encryptor.css',
  './file-encryptor/file-encryptor.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/icon.svg',
];
const CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/@zip.js/zip.js';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Runtime-cache the zip.js CDN so Locked Archive keeps working offline
  // after its first online load.
  if (request.url.startsWith(CDN_PREFIX)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        // Cache same-origin GETs on the fly.
        if (res.ok && new URL(request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      });
    }).catch(() => {
      // Offline fallback for navigations.
      if (request.mode === 'navigate') return caches.match('./index.html');
      throw new Error('offline');
    })
  );
});
