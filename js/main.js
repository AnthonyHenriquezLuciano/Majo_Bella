/* MAJOBELLA · Arranque */
(function (M) {
  /* Con backend, precios, tasa y horario se leen de la hoja antes de dibujar servicios y reservas
     (máximo 4 s de espera; si no responde, se usan los valores de js/config.js y services.js). */
  function catalog() {
    if (!M.BookingAPI.enabled()) return Promise.resolve();
    const timeout = new Promise((resolve) => setTimeout(resolve, 4000));
    return Promise.race([M.BookingAPI.loadCatalog().catch(() => null), timeout]);
  }

  /* Enlaces de los correos: ?servicio=cejas,pestanas&fecha=AAAA-MM-DD#reservar */
  function deepLink() {
    const q = new URLSearchParams(location.search);
    const ids = (q.get('servicio') || '').split(',').map((x) => x.trim()).filter((id) => M.serviceById[id]);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('fecha') || '') ? q.get('fecha') : null;
    if (!ids.length && !date) return;
    const patch = {};
    if (ids.length) patch.selected = ids;
    if (date && date >= M.todayKey()) patch.dateKey = date;
    M.set(Object.assign(patch, { time: null }), 'link');
    setTimeout(() => M.scrollTo('#reservar'), 400);
  }

  async function start() {
    if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    M.initNav();
    M.initAuthModal();
    M.Auth.init();
    M.initContact();
    M.initHero();
    await catalog();
    M.initServices();
    M.initFaq();
    M.initSelectionBar();
    M.initBooking();
    M.initCitas();
    M.initSite();
    M.initGiftShop();
    M.initPackages();
    if (M.initGetApp) M.initGetApp();
    M.initReveal();
    deepLink();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.MJB);
