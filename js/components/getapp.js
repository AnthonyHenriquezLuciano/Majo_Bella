/* MAJOBELLA · "Descarga la app" en la web
   - Celular: la primera vez se muestra la página de la app (pantalla completa). Al cerrarla queda la cinta abajo.
     Android descarga la app nativa (js/config.js → app.androidUrl); iPhone, la de App Store (app.iosUrl)
     o, mientras no esté, la versión web de la app con los pasos de Safari.
   - PC: solo la cinta, que lleva a la página «Aplicación».
   - Si ya se abre como app instalada, no aparece nada.
   - Quien llega desde Google no ve la página completa (Google penaliza las pantallas que tapan el
     contenido al entrar desde el buscador): ve solo la cinta. */
(function (M) {
  const K = { page: 'mjb.getapp.page.v1', ribbon: 'mjb.getapp.ribbon.v1' };
  const DAY = 864e5;
  const PAGE_EVERY = 14 * DAY;   // la página completa vuelve a ofrecerse cada 14 días
  const RIBBON_EVERY = 5 * DAY;  // la cinta cerrada vuelve a los 5 días
  const get = (k) => { try { return Number(localStorage.getItem(k)) || 0; } catch (e) { return 0; } };
  const set = (k) => { try { localStorage.setItem(k, String(Date.now())); } catch (e) { /* nada */ } };
  const $ = (id) => document.getElementById(id);
  const mobile = () => window.matchMedia('(max-width: 760px)').matches || /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const fromSearch = () => /(^|\.)(google|bing|yahoo|duckduckgo)\./i.test((() => { try { return new URL(document.referrer).hostname; } catch (e) { return ''; } })());

  const IC = {
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14V3.5M8.5 7L12 3.5 15.5 7M7 10.5H6A1.5 1.5 0 0 0 4.5 12v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/></svg>',
  };
  function steps() {
    if (M.Install.isIOS) {
      return `<ol class="ga-steps"><li><b>1</b><span>Toca <strong>Compartir</strong> ${IC.share} en la barra de Safari.</span></li><li><b>2</b><span>Elige <strong>Agregar a inicio</strong>.</span></li><li><b>3</b><span>Toca <strong>Agregar</strong>. La app aparece en tu pantalla.</span></li></ol>`;
    }
    return `<ol class="ga-steps"><li><b>1</b><span>Abre el menú <strong>⋮</strong> de tu navegador.</span></li><li><b>2</b><span>Toca <strong>Instalar app</strong> o <strong>Agregar a pantalla de inicio</strong>.</span></li><li><b>3</b><span>Confirma. La app aparece en tu pantalla.</span></li></ol>`;
  }

  /* ---------- Página de instalación (solo celular) ---------- */
  let lastFocus = null;
  const APP = () => M.config.app || {};
  const isAndroid = () => /android/i.test(navigator.userAgent || '');
  function nativeLink() {
    const a = APP();
    if (isAndroid() && a.androidUrl) return { url: a.androidUrl, label: 'Descargar la app' };
    if (M.Install.isIOS && a.iosUrl) return { url: a.iosUrl, label: 'Descargar en App Store' };
    return null;
  }
  function openPage() {
    const page = $('get-app');
    if (!page) return;
    const nat = nativeLink();
    const web = !nat && (!M.Install.isIOS || APP().iosWebApp);
    const direct = !nat && web && M.Install.canPrompt();
    page.innerHTML = `
      <div class="ga-in">
        <img class="ga-logo" src="assets/logo-majobella.png" alt="MAJOBELLA Beauty Studio" width="900" height="351">
        <div class="ga-art"><img src="assets/monograma.png" alt=""></div>
        <h2 id="ga-title">Tu belleza, en tu bolsillo</h2>
        <p>Reserva en segundos, mira tus citas, firma tu consentimiento y guarda tus tarjetas de regalo y paquetes.</p>
        ${nat || direct || !web ? '' : steps()}
        <div class="ga-actions">
          ${nat ? `<a class="btn btn-primary ga-btn" href="${M.escapeHtml(nat.url)}" ${/\.apk(\?|$)/i.test(nat.url) ? 'download' : 'target="_blank" rel="noopener"'} data-ga-native>${IC.phone} ${nat.label}</a>` : ''}
          ${direct ? `<button type="button" class="btn btn-primary ga-btn" data-ga-install>${IC.phone} Instalar la app</button>` : ''}
          <a class="btn ${nat || direct ? 'btn-line' : 'btn-primary'} ga-btn" href="aplicacion.html">Conocer la app</a>
          <button type="button" class="ga-skip" data-ga-close>Seguir en la web</button>
        </div>
      </div>`;
    lastFocus = document.activeElement;
    page.hidden = false;
    document.documentElement.classList.add('ga-lock');
    requestAnimationFrame(() => { page.classList.add('is-in'); page.focus({ preventScroll: true }); });
    set(K.page);
    hideRibbon(false);
  }
  function closePage() {
    const page = $('get-app');
    if (!page || page.hidden) return;
    page.classList.remove('is-in');
    document.documentElement.classList.remove('ga-lock');
    setTimeout(() => { page.hidden = true; page.innerHTML = ''; }, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    showRibbon();
  }

  /* ---------- Cinta ---------- */
  function ribbonAllowed() {
    // Solo en el inicio, Mis Citas y Regalos: en Reservar estorbaría y en Aplicación sobra
    if (M.Install.standalone() || ['inicio', 'citas', 'regalos'].indexOf(document.body.dataset.page) < 0) return false;
    return Date.now() - get(K.ribbon) >= RIBBON_EVERY;
  }
  function showRibbon() {
    const r = $('app-ribbon');
    if (!r || !ribbonAllowed() || document.body.classList.contains('has-selbar')) return;
    if (!r.hidden) return;
    r.hidden = false;
    document.body.classList.add('has-ribbon');
    requestAnimationFrame(() => r.classList.add('is-in'));
  }
  function hideRibbon(remember) {
    const r = $('app-ribbon');
    if (!r) return;
    if (remember) set(K.ribbon);
    r.classList.remove('is-in');
    if (document.body.classList.contains('has-ribbon')) document.body.classList.remove('has-ribbon');
    setTimeout(() => { if (!r.classList.contains('is-in')) r.hidden = true; }, 300);
  }

  async function install() {
    if (!mobile()) { location.href = 'aplicacion.html'; return; }
    if (M.Install.canPrompt() && !nativeLink()) {
      const r = await M.Install.prompt();
      if (r === 'accepted') { closePage(); hideRibbon(true); }
      return;
    }
    openPage();
  }

  M.initGetApp = function () {
    if (!M.Install) return;
    M.Install.register('sw.js');
    if (M.Install.standalone()) {
      document.querySelectorAll('[data-get-app], #app-ribbon').forEach((a) => { a.hidden = true; });
      return;
    }

    document.addEventListener('click', (e) => {
      const t = (s) => e.target.closest(s);
      if (t('[data-ga-native]')) { set(K.page); setTimeout(closePage, 300); return; }
      if (t('[data-get-app]') || t('[data-ga-install]') || t('[data-ribbon-install]')) { e.preventDefault(); install(); return; }
      if (t('[data-ga-close]')) { closePage(); return; }
      if (t('[data-ribbon-x]')) { hideRibbon(true); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePage(); });

    // La cinta se aparta cuando la barra de servicios elegidos está abierta
    // (solo cuando cambia la barra: tocar las clases del body dentro del observador lo volvería a disparar)
    let selbar = document.body.classList.contains('has-selbar');
    new MutationObserver(() => {
      const now = document.body.classList.contains('has-selbar');
      if (now === selbar) return;
      selbar = now;
      if (now) hideRibbon(false); else setTimeout(showRibbon, 400);
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    M.Install.onChange(() => { if (M.Install.standalone()) { closePage(); hideRibbon(false); } else showRibbon(); });

    const start = () => {
      const wantsPage = mobile() && document.body.dataset.page === 'inicio' && !fromSearch() && !location.hash && Date.now() - get(K.page) > PAGE_EVERY;
      if (wantsPage) setTimeout(() => { if (!document.querySelector('.auth-modal:not([hidden])')) openPage(); else showRibbon(); }, 900);
      else setTimeout(showRibbon, mobile() ? 2500 : 1500);
    };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
  };
})(window.MJB);
