const SHELL_CACHE = 'buct-hub-shell-v12';
const SHELL_ASSETS = ['./', './index.html', './styles.css', './home.css', './themes.css', './app.js', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Let app.js handle API / data.json offline fallback via localStorage so online/offline state is accurate
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.endsWith('/data.json') ||
    url.pathname === '/data.json'
  ) {
    return;
  }

  // Network-first with timeout, falling back to cached shell when offline or host is powered off
  event.respondWith(
    (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4500);
        const netRes = await fetch(req, { signal: controller.signal });
        clearTimeout(timer);

        if (netRes && netRes.ok) {
          const copy = netRes.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return netRes;
        }
        throw new Error(`HTTP ${netRes ? netRes.status : 0}`);
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        const cached =
          (await cache.match(req)) ||
          (req.mode === 'navigate' ? await cache.match('./index.html') : null);
        if (cached) return cached;
        return new Response('当前主机离线且暂无本地缓存，请稍后再试。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })()
  );
});
