// Service worker de Tomapuntes: la app abre sin internet.
// - Páginas: primero la red (para tener la última versión); sin conexión, la copia guardada.
// - Archivos con hash (/assets) y recursos de pdf.js: de la copia, que no cambian.
// - Nada de otros dominios (Supabase): eso siempre va directo a la red.
const VERSION = 'tomapuntes-v1';
const SHELL = ['/', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  const immutable = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/pdfjs/');
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached && immutable) return cached;
      const network = fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy));
        }
        return res;
      });
      if (!cached) return network;
      // Lo guardado sale al instante y se actualiza por detrás para la próxima vez.
      network.catch(() => {});
      return cached;
    }),
  );
});
