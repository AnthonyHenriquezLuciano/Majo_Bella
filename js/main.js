/* MAJOBELLA · Arranque */
(function (M) {
  /* Con backend, precios, tasa y horario se leen de la hoja antes de dibujar servicios y reservas
     (máximo 4 s de espera; si no responde, se usan los valores de js/config.js y services.js). */
  function catalog() {
    if (!M.BookingAPI.enabled()) return Promise.resolve();
    const timeout = new Promise((resolve) => setTimeout(resolve, 4000));
    return Promise.race([M.BookingAPI.loadCatalog().catch(() => null), timeout]);
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
    M.initReveal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.MJB);
