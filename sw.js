/* Sin Humo — service worker: la app abre aunque no haya conexión.
 * Primero intenta la red (para recibir actualizaciones); si tarda o no hay
 * conexión, usa la copia guardada. Sube CACHE al cambiar archivos. */
const CACHE = 'sin-humo-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './calc.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
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
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    network.catch(() => {});
    const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch (_) { /* sin conexión */ }
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return network;
  })());
});
