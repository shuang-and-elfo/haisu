/* Service worker: full offline cache for Haisu's World (iPad interview use) */
const VERSION = 'haisu-v4';
const BASE = new URL(self.registration ? self.registration.scope : self.location.href).pathname.replace(/[^/]*$/, '');
const CORE = ['', 'index.html', 'app.js', 'styles.css', 'data/site-content.json', 'manifest.webmanifest', 'icon.png'].map((x) => BASE + x);

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Message from page: precache a list of URLs, reporting progress
self.addEventListener('message', (e) => {
  const { type, urls, port } = e.data || {};
  if (type !== 'precache' || !Array.isArray(urls)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    let done = 0, failed = [];
    const all = [...new Set([...CORE, ...urls])];
    const worker = async () => {
      while (all.length) {
        const url = all.shift();
        try {
          const hit = CORE.includes(url) ? null : await cache.match(url, { ignoreSearch: true });
          if (!hit) {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(res.status);
            await cache.put(url, res);
          }
        } catch (err) {
          failed.push(url);
        }
        done++;
        port && port.postMessage({ done, total: done + all.length, failed });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    port && port.postMessage({ done, total: done, failed, complete: true });
  })());
});

// Serve from cache, falling back to network; build 206 responses for video Range requests
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // never cache mutations/uploads; content JSON is cache-then-network so edits still show up online
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const isData = url.pathname === BASE + 'api/content' || url.pathname === BASE + 'data/site-content.json';
    const key = isData ? url.pathname : url.pathname + url.search;
    const cached = await cache.match(key);
    const range = req.headers.get('range');

    if (cached && range) return rangeResponse(cached, range);

    if (isData) {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(key, fresh.clone());
        return fresh;
      } catch (err) {
        return cached || new Response('{}', { status: 503 });
      }
    }

    // Pages, code and data: network first (so updates show up), cache fallback when offline
    const isShell = CORE.includes(url.pathname) || /\.(html|js|css|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
    if (isShell) {
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(key, res.clone());
        return res;
      } catch (err) {
        return cached || new Response('Offline and not cached', { status: 504 });
      }
    }

    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && res.status === 200 && !range && (url.pathname.startsWith(BASE + 'media/') || CORE.includes(url.pathname))) {
        cache.put(key, res.clone());
      }
      return res;
    } catch (err) {
      return new Response('Offline and not cached', { status: 504 });
    }
  })());
});

async function rangeResponse(res, rangeHeader) {
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  end = Math.min(end, size - 1);
  const headers = new Headers(res.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(buf.slice(start, end + 1), { status: 206, headers });
}
