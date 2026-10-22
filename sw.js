/* MAJOBELLA · Service worker de la app
   - Páginas: primero la red (siempre lo más nuevo) y, sin conexión, la copia guardada.
   - Archivos con ?v= (CSS, JS): se guardan y se sirven al instante; cambian de nombre al actualizar.
   - No toca nada de otros dominios (Google, PayPal, reservas). */
const VERSION = 'mjb-20261022v3';
const SHELL = [
  './app/', './app/app.css?v=20261022v3', './app/app.js?v=20261022v3',
  './js/config.js?v=20261022v3', './js/data/services.js?v=20261022v3', './js/core/utils.js?v=20261022v3', './js/core/validate.js?v=20261022v3',
  './js/integrations/whatsapp.js?v=20261022v3', './js/integrations/calendar.js?v=20261022v3', './js/integrations/booking-api.js?v=20261022v3',
  './js/integrations/paypal.js?v=20261022v3', './js/integrations/google-auth.js?v=20261022v3', './js/integrations/appointments.js?v=20261022v3',
  './js/integrations/giftcard.js?v=20261022v3', './js/integrations/install.js?v=20261022v3', './js/integrations/captcha.js?v=20261022v3', './js/integrations/manage.js?v=20261022v3',
  './assets/logo-majobella.png', './assets/monograma.png', './assets/icon-192.png', './assets/favicon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const versioned = url.searchParams.has('v') || /\.(png|jpg|jpeg|webp|svg|woff2?|otf)$/.test(url.pathname);
  if (versioned) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && (req.mode === 'navigate' || /\.(html|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/'))) {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit || (url.pathname.includes('/app/') ? caches.match('./app/') : undefined))));
});
