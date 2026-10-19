/* MAJOBELLA · Arranque */
(function (M) {
  function start() {
    if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    M.initNav();
    M.initAuthModal();
    M.Auth.init();
    M.initContact();
    M.initServices();
    M.initFaq();
    M.initSelectionBar();
    M.initBooking();
    M.initCitas();
    M.initHero();
    M.initReveal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.MJB);
