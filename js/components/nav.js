/* MAJOBELLA · Navegación: menú sticky y menú móvil */
(function (M) {
  M.initNav = function () {
    const header = document.querySelector('.site-header');
    // Las tres secciones comparten regalos.html, pero cada enlace debe
    // conservar su propio indicador activo según el fragmento de la URL.
    const syncExperienceNavigation = () => {
      const current = new URL(location.href);
      const isGiftPage = current.pathname.endsWith('/regalos.html');
      document.querySelectorAll('.main-nav a[href], .mobile-menu a[href]').forEach(link => {
        const dest = new URL(link.getAttribute('href'), location.href);
        if (!dest.pathname.endsWith('/regalos.html') || !dest.hash ||
          !['#regalar', '#membresias', '#paquetes'].includes(dest.hash)) return;
        const selected = isGiftPage && dest.hash === (current.hash || '#regalar');
        if (selected) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    syncExperienceNavigation();
    window.addEventListener('hashchange', syncExperienceNavigation);

    const btn = document.querySelector('.menu-toggle');
    const panel = document.getElementById('mobile-menu');

    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    let open = false;
    const setOpen = (v) => {
      open = v;
      btn.setAttribute('aria-expanded', String(v));
      btn.setAttribute('aria-label', v ? 'Cerrar menú' : 'Abrir menú');
      document.body.classList.toggle('menu-open', v);
      if (v) {
        panel.hidden = false;
        if (!M.reduceMotion()) {
          gsap.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' });
          gsap.fromTo(panel.querySelectorAll('li'), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.06, ease: 'power2.out', delay: 0.1 });
        }
        panel.querySelector('a').focus();
      } else {
        if (M.reduceMotion()) { panel.hidden = true; return; }
        gsap.to(panel, { opacity: 0, duration: 0.35, ease: 'power2.in', onComplete: () => { panel.hidden = true; } });
      }
    };
    btn.addEventListener('click', () => setOpen(!open));
    M.closeMenu = () => { if (open) setOpen(false); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { setOpen(false); btn.focus(); } });

    // Navegación interna con desplazamiento suave y compensación del menú fijo
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (id.length < 2 || !document.querySelector(id)) return;
      e.preventDefault();
      if (open) setOpen(false);
      M.scrollTo(id);
    });
  };
})(window.MJB);
