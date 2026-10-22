/* MAJOBELLA · Arranque de la web
   Las páginas comparten los mismos archivos: cada parte se activa solo si su sección está en la página
   (inicio, reservar, citas, regalos, aplicación). */
(function (M) {
  const has = (id) => !!document.getElementById(id);
  const page = document.body.dataset.page || 'inicio';

  /* Enlaces antiguos (correos y mensajes): index.html#reservar → reservar.html, etc. */
  const OLD = { '#reservar': 'reservar.html', '#citas': 'citas.html', '#regalar': 'regalos.html', '#paquetes': 'regalos.html#paquetes' };
  if (page === 'inicio' && OLD[location.hash]) { location.replace(OLD[location.hash] + location.search); return; }

  /* Precios, tasa y horario se leen de la base antes de dibujar servicios y reservas
     (máximo 4 s de espera; si no responde, se usan los valores de js/config.js y services.js). */
  function catalog() {
    if (!M.BookingAPI.enabled()) return Promise.resolve();
    const timeout = new Promise((resolve) => setTimeout(resolve, 4000));
    return Promise.race([M.BookingAPI.loadCatalog().catch(() => null), timeout]);
  }

  /* reservar.html?servicio=cejas,pestanas&fecha=AAAA-MM-DD&codigo=PAQ-… */
  function deepLink() {
    if (!has('reservar')) return;
    const q = new URLSearchParams(location.search);
    const ids = (q.get('servicio') || '').split(',').map((x) => x.trim()).filter((id) => M.serviceById[id]);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('fecha') || '') ? q.get('fecha') : null;
    const code = (q.get('codigo') || '').trim();
    if (!ids.length && !date && !code) return;
    const patch = {};
    if (ids.length) patch.selected = ids;
    if (date && date >= M.todayKey()) patch.dateKey = date;
    M.set(Object.assign(patch, { time: null }), 'link');
    if (code && M.applyBookingCode) setTimeout(() => M.applyBookingCode(code), 120);
    if (ids.length || date) setTimeout(() => M.scrollTo(ids.length ? '#step-hora' : '#reservar'), 400);
  }

  const run = (name, fn) => { try { fn(); } catch (e) { console.error('[MAJOBELLA] ' + name, e); } };

  function showTestMode() {
    if (!M.config.testMode || document.getElementById('mjb-test-label')) return;
    const bar = document.createElement('div');
    bar.id = 'mjb-test-label';
    bar.setAttribute('role', 'status');
    bar.textContent = 'MAJOBELLA · VERSIÓN DE PRUEBAS — Citas simuladas y pagos PayPal Sandbox, sin dinero real';
    bar.style.cssText = 'position:relative;z-index:1000;background:#442712;color:#f7efe3;text-align:center;padding:10px 16px;font:600 12px/1.5 system-ui,sans-serif;letter-spacing:.025em';
    document.body.prepend(bar);
  }

  async function start() {
    showTestMode();
    if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    run('nav', M.initNav);
    run('auth', M.initAuthModal);
    run('sesión', () => M.Auth.init());
    run('contacto', M.initContact);
    if (has('inicio')) run('portada', M.initHero);
    await catalog();
    if (has('services-list')) run('servicios', M.initServices);
    if (has('faq-list')) run('preguntas', M.initFaq);
    run('barra', M.initSelectionBar);
    if (has('reservar')) run('reservas', M.initBooking);
    if (has('citas')) run('citas', M.initCitas);
    run('contenido', M.initSite);
    if (has('regalar')) run('tarjetas', M.initGiftShop);
    if (has('paquetes')) run('paquetes', M.initPackages);
    if (has('membresias')) run('membresías', M.initMemberships);
    if (has('regalos-empty')) {
      const none = () => { document.getElementById('regalos-empty').hidden = !(document.getElementById('regalar').hidden && document.getElementById('paquetes').hidden); };
      none(); setTimeout(none, 1500);
    }
    if (has('ap-downloads') && M.initAppPage) run('aplicación', M.initAppPage);
    if (M.initGetApp) run('instalar', M.initGetApp);
    run('animaciones', M.initReveal);
    deepLink();
    // Si el estudio cambió precios, horarios o promociones, la página se actualiza sola
    M.BookingAPI.onCatalogChange(() => {
      if (M.refreshServices && has('services-list')) M.refreshServices();
      if (M.refreshBookingCatalog && has('reservar')) M.refreshBookingCatalog();
      if (M.refreshPackages && has('paquetes')) M.refreshPackages();
      if (M.refreshMemberships && has('membresias')) M.refreshMemberships();
      if (M.refreshSiteNav) M.refreshSiteNav();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.MJB);
