/* MAJOBELLA · Ventana de cuenta
   Iniciar sesión es opcional: la ventana explica qué gana la clienta y siempre ofrece
   seguir sin cuenta. Se abre desde cualquier elemento con [data-open-auth]. */
(function (M) {
  M.initAuthModal = function () {
    const modal = document.getElementById('auth-modal');
    const body = document.getElementById('auth-body');
    const toast = document.getElementById('toast');
    let lastFocus = null;

    function render() {
      const u = M.Auth.user;
      if (u) {
        body.innerHTML = `
          <div class="am-user">
            <span class="acct-avatar">${u.picture ? `<img src="${M.escapeHtml(u.picture)}" alt="" width="44" height="44" referrerpolicy="no-referrer">` : `<span>${M.escapeHtml((u.firstName || u.email)[0].toUpperCase())}</span>`}</span>
            <div><p class="acct-name">${M.escapeHtml(u.name || u.firstName)}</p><p class="acct-mail">${M.escapeHtml(u.email)}</p></div>
          </div>
          <div class="am-actions">
            <a class="btn btn-primary btn-block" href="citas.html" data-close-auth>Ver mis citas</a>
            <a class="btn btn-ghost btn-block" href="reservar.html" data-close-auth>Agendar cita</a>
            <button type="button" class="link-btn" id="am-out">Cerrar sesión</button>
          </div>`;
        body.querySelector('#am-out').addEventListener('click', () => { M.Auth.signOut(); close(); });
        return;
      }
      body.innerHTML = `
        <h2 class="am-title" id="auth-title">Tu cuenta MAJOBELLA</h2>
        <p class="am-sub">Opcional. Puedes reservar sin cuenta.</p>
        <ul class="am-benefits">
          <li>Ve tus citas desde cualquier dispositivo</li>
          <li>Reserva más rápido: tu nombre y correo se completan solos</li>
          <li>Repite tus servicios favoritos en un toque</li>
        </ul>
        ${M.Auth.configured()
          ? '<div class="am-google" data-google-button></div>'
          : '<button type="button" class="google-btn" disabled><span class="g-mark" aria-hidden="true">G</span>Continuar con Google</button><p class="am-note">El inicio con Google se activa al añadir el ID de cliente en <code>js/config.js</code>.</p>'}
        <div class="am-divider"><span>o</span></div>
        <button type="button" class="btn btn-ghost btn-block" data-close-auth>Continuar sin cuenta</button>
        <p class="am-privacy">Solo usamos tu nombre y correo para gestionar tus citas.</p>`;
      if (M.Auth.configured()) M.Auth.renderButtons();
    }

    function open() {
      lastFocus = document.activeElement;
      if (M.closeMenu) M.closeMenu();
      // Google Identity Services necesita un contenedor visible para dibujar el botón.
      modal.hidden = false;
      document.body.classList.add('modal-open');
      render();
      M.Auth.renderButtons();
      if (!M.reduceMotion()) {
        gsap.fromTo(modal.querySelector('.am-backdrop'), { opacity: 0 }, { opacity: 1, duration: 0.4 });
        gsap.fromTo(modal.querySelector('.am-panel'), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
      }
      setTimeout(() => { const f = modal.querySelector('.am-close'); if (f) f.focus(); }, 50);
    }
    function close() {
      if (modal.hidden) return;
      const done = () => { modal.hidden = true; document.body.classList.remove('modal-open'); if (lastFocus && lastFocus.focus) lastFocus.focus(); };
      if (M.reduceMotion()) return done();
      gsap.to(modal.querySelector('.am-panel'), { opacity: 0, y: 16, duration: 0.3, ease: 'power2.in' });
      gsap.to(modal.querySelector('.am-backdrop'), { opacity: 0, duration: 0.3, onComplete: done });
    }
    M.openAuth = open;

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-open-auth]')) { e.preventDefault(); open(); return; }
      const c = e.target.closest('[data-close-auth]');
      if (c && modal.contains(c)) {
        close();
      }
    });
    modal.querySelector('.am-backdrop').addEventListener('click', close);
    modal.querySelector('.am-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (modal.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const f = [...modal.querySelectorAll('button:not([disabled]), a[href], iframe')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });

    /* Cuenta unificada en TODAS las páginas (no solo Mis Citas). */
    function syncHeader(user) {
      const slot=document.getElementById('header-account');
      const safe=M.escapeHtml;
      if(slot) {
        const first=user ? (user.firstName || user.name || 'Cuenta') : '';
        const image=user?.picture ? `<img src="${safe(user.picture)}" alt="" width="30" height="30" referrerpolicy="no-referrer">`
          : `<span>${safe((first[0] || 'M').toUpperCase())}</span>`;
        slot.innerHTML=user
          ? `<button type="button" class="header-user" data-open-auth aria-label="Tu cuenta, ${safe(first)}">${image}<em>${safe(first)}</em></button>`
          : '<button type="button" class="header-login" data-open-auth>Iniciar sesión</button>';
      }
      document.querySelectorAll('.mobile-login').forEach(el => {
        el.textContent=user ? `Tu cuenta · ${user.firstName || user.name || 'MAJOBELLA'}` : 'Iniciar sesión';
      });
    }
    syncHeader(M.Auth.user);

    /* Bienvenida al iniciar sesión */
    let wasUser = !!M.Auth.user;
    M.Auth.onChange((u) => {
      syncHeader(u);
      if (u && !wasUser) {
        close();
        showToast(`Hola, ${u.firstName || u.name}. Tus datos ya están listos para reservar.`);
      }
      wasUser = !!u;
      if (!modal.hidden) render();
    });

    function showToast(text) {
      toast.textContent = text;
      toast.hidden = false;
      if (M.reduceMotion()) { setTimeout(() => { toast.hidden = true; }, 4000); return; }
      gsap.fromTo(toast, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
      gsap.to(toast, { opacity: 0, y: 12, duration: 0.4, delay: 4, onComplete: () => { toast.hidden = true; } });
    }
    M.toast = showToast;
  };
})(window.MJB);
