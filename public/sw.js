/* Service worker do ReplayX: abre sem internet, atualiza-se sozinho e mostra as notificações dos alertas. */
const VERSION = 'rx-v2';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const PRECACHE = ['/', '/terminal', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/badge-96.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      // primeira instalação: ativa já; versões novas esperam que o utilizador escolha "Atualizar"
      .then(() => (self.registration.active ? undefined : self.skipWaiting())),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // só o próprio site; dados de mercado, Firebase e APIs vão sempre à rede
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // ficheiros com hash do Next e ícones: primeiro a cache
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/icon.svg') {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // páginas: primeiro a rede; sem internet, a última versão guardada dessa página (só / e /terminal se guardam)
  if (req.mode === 'navigate') {
    const key = url.pathname === '/' ? '/' : url.pathname === '/terminal' ? '/terminal' : null;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && key) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(key || '/terminal').then((hit) => hit || caches.match('/'))),
    );
  }
});

// tocar numa notificação abre (ou traz para a frente) a app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/terminal';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

// notificações enviadas por um servidor (Web Push), para quando houver alertas no servidor
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'ReplayX', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'ReplayX', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/terminal' },
    }),
  );
});
