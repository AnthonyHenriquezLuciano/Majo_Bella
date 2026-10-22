/* ==========================================================================
   MAJOBELLA · App móvil
   Inicio · Reservar · Mis citas · Billetera · Perfil
   Usa el mismo sistema de reservas, pagos y citas que la web (js/integrations/*).
   ========================================================================== */
(function (M) {
  M.assetBase = '../';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => M.escapeHtml(s == null ? '' : s);
  const API = M.BookingAPI;
  const C = M.config;
  if (C.testMode && !document.getElementById('mjb-test-label')) {
    const bar = document.createElement('div');
    bar.id = 'mjb-test-label';
    bar.setAttribute('role', 'status');
    bar.textContent = 'MAJOBELLA · VERSIÓN DE PRUEBAS — Reservas y pagos simulados';
    bar.style.cssText = 'background:#442712;color:#f7efe3;text-align:center;padding:7px 12px;font:600 11px/1.5 system-ui,sans-serif;letter-spacing:.02em';
    document.body.prepend(bar);
  }
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };
  const K = { profile: 'mjb.client.v1', wallet: 'mjb.wallet.v1', hidden: 'mjb.wallet.hidden.v1', onboard: 'mjb.app.onboard.v1', banner: 'mjb.app.banner.v1' };
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MSHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const WSHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  const I = {
    card: '<svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/></svg>',
    bank: '<svg viewBox="0 0 24 24"><path d="M3.5 9.5L12 4.5l8.5 5M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5M3.5 19.5h17"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 15.5V4.5M8 8.5l4-4 4 4M5 14.5v3a2 2 0 002 2h10a2 2 0 002-2v-3"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
    calPlus: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M12 13v4M10 15h4"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M20 11.5a8 8 0 0 1-11.8 7l-4.2 1.2 1.2-4A8 8 0 1 1 20 11.5z"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    gift: '<svg viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3.5-5-3.8-5-1.6C7 9 12 9 12 9zM12 9c1.5-3.5 5-3.8 5-1.6C17 9 12 9 12 9z"/></svg>',
    wallet: '<svg viewBox="0 0 24 24"><rect x="3.5" y="6.5" width="17" height="12.5" rx="2"/><path d="M3.5 10.5h17M16 14.8h1.5"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 4v11M8 11l4 4 4-4M5 20h14"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6"/></svg>',
    pen: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.5 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.5-3.5-8.5s1-5.9 3.5-8.5z"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/></svg>',
    iosShare: '<svg viewBox="0 0 24 24"><path d="M12 14V3.5M8.5 7L12 3.5 15.5 7M7 10.5H6A1.5 1.5 0 0 0 4.5 12v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1"/></svg>',
    out: '<svg viewBox="0 0 24 24"><path d="M14 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h8M10 12h10M16.5 8.5L20 12l-3.5 3.5"/></svg>',
  };

  /* ---------- Utilidades ---------- */
  const app = { tab: 'inicio', appts: [], apptsSource: '', apptsLoading: false, loyal: null, wallet: [], walletLoaded: false, scroll: {} };
  let toastT = null;
  function toast(text) {
    const t = $('toast');
    t.textContent = text; t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const vibrate = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) { /* nada */ } };
  const profile = () => store.get(K.profile, {}) || {};
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const longDate = (key) => { const p = M.parseKey(key); return `${p.d} de ${MONTHS[p.m]}`; };
  const longDateY = (key) => { const p = M.parseKey(key); return `${p.d} de ${MONTHS[p.m]} de ${p.y}`; };
  const whenText = (a) => `${M.weekdayName(a.date)} ${longDate(a.date)} · ${M.fmtTime12(a.time)}`;
  const isUpcoming = (a) => new Date(a.end).getTime() > Date.now() && !['cancelada', 'completada', 'no-asistio', 'expirada'].includes(a.status) && (a.status !== 'retenida' || M.Appointments.waitingProof(a));
  const names = (a) => (a.services || []).map((s) => s.name).join(' + ');
  const mapsUrl = () => C.contact.mapsUrl || (C.contact.lat ? `https://maps.google.com/?q=${C.contact.lat},${C.contact.lng}` : '');
  const waUrl = (text) => M.WhatsApp.link(text || C.whatsapp.greeting);
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg || 'Copiado'); }
    catch (e) { toast(text); }
  }
  function countdown(a) {
    const today = M.todayKey();
    const days = Math.round((Date.UTC(...dateParts(a.date)) - Date.UTC(...dateParts(today))) / 86400000);
    if (days === 0) {
      const mins = Math.round((new Date(a.start).getTime() - Date.now()) / 60000);
      if (mins <= 0) return 'Ahora';
      if (mins < 90) return `En ${mins} minutos`;
      return `Hoy a las ${M.fmtTime12(a.time)}`;
    }
    if (days === 1) return `Mañana a las ${M.fmtTime12(a.time)}`;
    return `En ${days} días`;
  }
  function dateParts(key) { const p = M.parseKey(key); return [p.y, p.m, p.d]; }

  /* ---------- Hoja inferior (se desliza hacia abajo para cerrar) ---------- */
  const sheet = { el: $('sheet'), body: $('sheet-body'), back: $('sheet-backdrop'), open: false, onClose: null };
  function openSheet(html, opts = {}) {
    sheet.body.innerHTML = html;
    sheet.onClose = opts.onClose || null;
    if (!sheet.open) {
      sheet.open = true;
      sheet.el.hidden = false; sheet.back.hidden = false;
      requestAnimationFrame(() => { sheet.el.classList.add('on'); sheet.back.classList.add('on'); });
      try { history.pushState({ sheet: true }, ''); } catch (e) { /* nada */ }
      document.body.style.overflow = 'hidden';
    }
    sheet.body.scrollTop = 0;
    if (opts.onMount) opts.onMount(sheet.body);
  }
  function hideSheet() {
    if (!sheet.open) return;
    sheet.open = false;
    sheet.el.classList.remove('on'); sheet.back.classList.remove('on');
    document.body.style.overflow = '';
    setTimeout(() => { if (!sheet.open) { sheet.el.hidden = true; sheet.back.hidden = true; sheet.body.innerHTML = ''; } }, 320);
    const fn = sheet.onClose; sheet.onClose = null;
    if (fn) fn();
  }
  /* Cierra la hoja; "after" corre cuando el historial ya volvió (para navegar sin pisarse con el botón atrás) */
  function closeSheet(after) {
    if (!sheet.open) { if (after) after(); return; }
    if (history.state && history.state.sheet) { sheet.after = after || null; history.back(); } else { hideSheet(); if (after) after(); }
  }
  window.addEventListener('popstate', () => {
    if (sheet.open) hideSheet();
    const fn = sheet.after; sheet.after = null;
    if (fn) fn();
  });
  sheet.back.addEventListener('click', closeSheet);
  sheet.body.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  (function drag() {
    const grip = $('sheet-grip');
    let y0 = null, dy = 0;
    grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; sheet.el.classList.add('dragging'); grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.el.style.transform = `translate(-50%, ${dy}px)`; });
    const end = () => {
      if (y0 == null) return;
      sheet.el.classList.remove('dragging'); sheet.el.style.transform = '';
      if (dy > 90) closeSheet();
      y0 = null;
    };
    grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
  })();
  const sheetHead = (title, sub) => `<div class="sheet-head"><div><h2 id="sheet-title">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button type="button" class="sheet-x" data-close aria-label="Cerrar">${I.x}</button></div>`;

  /* ---------- Navegación ---------- */
  const TITLES = { inicio: 'Inicio', reservar: 'Reservar', citas: 'Mis citas', billetera: 'Billetera', perfil: 'Perfil' };
  function route() {
    const raw = (location.hash || '#inicio').slice(1);
    const [tab, sub] = raw.split('/');
    const next = TITLES[tab] ? tab : 'inicio';
    if (sheet.open) hideSheet();
    if (next !== app.tab) app.scroll[app.tab] = window.scrollY;
    const changed = next !== app.tab;
    app.tab = next;
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.dataset.screen !== next; });
    document.querySelectorAll('#tabbar [data-tab]').forEach((t) => { const on = t.dataset.tab === next; t.classList.toggle('on', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    $('tb-title').textContent = TITLES[next];
    if (next === 'reservar') bk.setStepFromHash(sub);
    render(next);
    const scr = $(`s-${next}`);
    if (changed) { scr.style.animation = 'none'; void scr.offsetWidth; scr.style.animation = ''; }
    window.scrollTo(0, changed ? (app.scroll[next] || 0) : window.scrollY);
    onScroll();
  }
  function render(tab) {
    app.catalogDirty = false;
    setActionbar('');
    setTopAction(null);
    $('tb-back').hidden = true; $('tb-mark').hidden = false;
    ({ inicio: renderInicio, reservar: () => bk.render(), citas: renderCitas, billetera: renderBilletera, perfil: renderPerfil })[tab]();
  }
  function onScroll() { $('topbar').classList.toggle('is-scrolled', window.scrollY > 40); }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('hashchange', route);
  function setActionbar(html) {
    const bar = $('actionbar');
    bar.innerHTML = html; bar.hidden = !html;
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('has-actionbar', !!html));
  }
  function setTopAction(cfg) {
    const b = $('tb-action');
    if (!cfg) { b.hidden = true; b.onclick = null; return; }
    b.hidden = false; b.innerHTML = cfg.html; b.setAttribute('aria-label', cfg.label); b.onclick = cfg.onClick;
  }
  function avatarHtml(cls) {
    const u = M.Auth.user;
    const n = (u && (u.firstName || u.name)) || profile().name || '';
    if (u && u.picture) return `<span class="${cls}"><img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer"></span>`;
    return `<span class="${cls}">${n ? esc(n[0].toUpperCase()) : I.user}</span>`;
  }

  /* ---------- Datos ---------- */
  async function loadAppts(force) {
    if (app.apptsLoading) return app.apptsLoading;
    if (!force && app.apptsAt && Date.now() - app.apptsAt < 60000) return null;
    app.apptsLoading = M.Appointments.list().then((r) => {
      app.appts = r.items || []; app.apptsSource = r.source; app.apptsError = r.error; app.apptsAt = Date.now();
    }).catch(() => {}).finally(() => { app.apptsLoading = false; });
    await app.apptsLoading;
    if (['inicio', 'citas'].includes(app.tab)) render(app.tab);
    return true;
  }
  const nextAppt = () => app.appts.filter(isUpcoming).sort((a, b) => a.start.localeCompare(b.start))[0] || null;

  async function loadLoyalty() {
    const info = M.loyalty;
    if (!info || !info.enabled) { app.loyal = null; return; }
    if (M.Auth.user && M.myLoyalty) { app.loyal = { ...M.myLoyalty, known: true }; return; }
    const p = profile();
    if (!(p.email || p.phone) || !API.enabled()) { app.loyal = { ...info, known: false }; return; }
    try { const r = await API.loyalty({ email: p.email || '', phone: p.phone || '' }); app.loyal = { ...info, ...r, known: false }; }
    catch (e) { app.loyal = { ...info, known: false }; }
  }

  function walletCodes() { return store.get(K.wallet, []) || []; }
  function addToWallet(code) {
    const list = walletCodes().filter((c) => c.code !== code);
    list.unshift({ code, at: new Date().toISOString() });
    store.set(K.wallet, list.slice(0, 20));
  }
  function removeFromWallet(code) {
    store.set(K.wallet, walletCodes().filter((c) => c.code !== code));
    store.set(K.hidden, [...new Set([...(store.get(K.hidden, []) || []), code])]);
    app.wallet = app.wallet.filter((w) => w.code !== code);
  }
  /* Códigos guardados en este celular + (con Google) los comprados o recibidos con su correo */
  async function loadWallet() {
    if (!API.enabled()) { app.wallet = []; app.walletLoaded = true; return; }
    const hidden = store.get(K.hidden, []) || [];
    let items = [];
    if (M.Auth.user && M.Auth.token) {
      try {
        const r = await API.myWallet(M.Auth.token);
        items = (r.items || []).filter((x) => !hidden.includes(x.code));
        items.forEach((x) => { if (!walletCodes().some((c) => c.code === x.code)) addToWallet(x.code); });
      } catch (e) { app.walletError = e.message; }
    }
    const codes = walletCodes().map((c) => c.code).filter((c) => !items.some((x) => x.code === c));
    if (codes.length) {
      try { const r = await API.post({ action: 'walletLookup', codes }, 'No se pudo leer tu billetera.'); items = items.concat(r.items || []); }
      catch (e) { app.walletError = e.message; }
    }
    const order = walletCodes().map((c) => c.code);
    app.wallet = items.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
    app.walletLoaded = true;
  }

  /* ---------- Componentes ---------- */
  function loyaltyCard() {
    const l = app.loyal;
    if (!l || !l.enabled) return '';
    const prize = l.kind === 'monto' ? M.fmtPrice(l.value) : `${l.value}%`;
    if (l.eligible) {
      return `<div class="loyal is-ready"><div class="loyal-top"><div><p class="kicker" style="color:rgba(255,255,255,.6)">Premio de fidelidad</p><h3>¡Tu próxima cita tiene ${prize} de descuento!</h3></div><span class="prize">${prize}</span></div>
        <p style="margin-top:10px">Se aplica solo al reservar con tu mismo correo o teléfono.</p></div>`;
    }
    const visits = l.known ? l.visits : 0;
    const dots = Array.from({ length: l.every }, (_, i) => `<span class="${i < visits ? 'on' : ''}"></span>`).join('');
    return `<div class="loyal"><div class="loyal-top"><div><p class="kicker">Tarjeta de fidelidad</p><h3>${l.known ? `${visits} de ${l.every} visitas` : `Cada ${l.every} visitas, un regalo`}</h3></div><span class="prize">${prize}</span></div>
      <div class="dots" aria-hidden="true">${dots}</div>
      <p>${l.known ? `Al completar ${l.every} visitas, tu siguiente cita tiene ${prize} de descuento.` : `Tras ${l.every} visitas realizadas, tu siguiente cita tiene ${prize} de descuento. ${(profile().email || profile().phone) ? 'Te avisamos aquí cuando lo ganes.' : 'Completa tus datos en Perfil para saber cuándo lo ganas.'}`}</p></div>`;
  }

  function installBanner() {
    if (!M.Install.available() || store.get(K.banner, false)) return '';
    return `<div class="install-banner"><img src="../assets/icon-192.png" alt=""><p><b>Instala la app</b>Ábrela desde tu pantalla de inicio.</p>
      <button type="button" class="btn btn-sm" data-install>Instalar</button><button type="button" class="x" data-banner-x aria-label="Cerrar">×</button></div>`;
  }

  async function doInstall() {
    if (M.Install.canPrompt()) {
      const r = await M.Install.prompt();
      if (r === 'accepted') toast('¡Listo! Busca MAJOBELLA en tu pantalla de inicio.');
      render(app.tab);
      return;
    }
    openSheet(sheetHead('Instala la app', M.Install.isIOS ? 'En iPhone se instala desde Safari en dos toques.' : 'Desde el menú de tu navegador.') + installSteps());
  }
  function installSteps() {
    if (M.Install.isIOS) {
      return `<ol class="ob-steps"><li><b>1</b><span>Toca <strong>Compartir</strong> ${I.iosShare} abajo en Safari.</span></li><li><b>2</b><span>Elige <strong>Agregar a inicio</strong>.</span></li><li><b>3</b><span>Toca <strong>Agregar</strong>. La app aparece en tu pantalla.</span></li></ol>`;
    }
    return `<ol class="ob-steps"><li><b>1</b><span>Abre el menú <strong>⋮</strong> de tu navegador.</span></li><li><b>2</b><span>Toca <strong>Instalar app</strong> o <strong>Agregar a pantalla de inicio</strong>.</span></li><li><b>3</b><span>Confirma. La app aparece en tu pantalla.</span></li></ol>`;
  }

  /* ======================================================================
     INICIO
     ====================================================================== */
  function renderInicio() {
    const u = M.Auth.user;
    const name = firstName((u && (u.firstName || u.name)) || profile().name);
    const today = M.todayKey();
    const a = nextAppt();
    setTopAction({ html: avatarHtml('tb-avatar'), label: 'Perfil', onClick: () => { location.hash = '#perfil'; } });
    let hero;
    if (a) {
      const consent = a.consent && a.consent.needed && !a.consent.signed && a.consent.url;
      hero = `<article class="hero-appt press" data-appt="${esc(a.id)}">
        <p class="kicker">Tu próxima cita</p>
        <h3>${esc(names(a))}</h3>
        <p class="when">${esc(whenText(a))}</p>
        <span class="count">${esc(countdown(a))}</span>
        ${consent ? `<div class="alert">Antes de tu cita, firma el consentimiento (2 minutos).</div>` : ''}
        <div class="acts">
          ${consent ? `<a class="btn btn-light" href="${esc(a.consent.url)}" data-stop>Firmar consentimiento</a>` : ''}
          ${mapsUrl() ? `<a class="btn btn-ghost" href="${esc(mapsUrl())}" target="_blank" rel="noopener" data-stop>${I.pin} Cómo llegar</a>` : ''}
        </div>
      </article>`;
    } else {
      hero = `<article class="hero-appt hero-empty">
        <p class="kicker">${app.apptsAt ? 'Sin citas próximas' : 'Tu próxima cita'}</p>
        <h3>${app.apptsAt ? 'Reserva tu momento' : 'Buscando tus citas…'}</h3>
        <p class="when">Elige tu servicio, día y hora en menos de un minuto.</p>
        <div class="acts"><a class="btn" href="#reservar">Reservar cita</a></div>
      </article>`;
    }
    const promos = [];
    (M.promos || []).forEach((p) => {
      const svc = (p.services || []).includes('todos') ? 'todos los servicios' : (p.services || []).map((id) => (M.serviceById[id] ? M.serviceById[id].name.toLowerCase() : '')).filter(Boolean).join(', ');
      promos.push(`<a class="promo-card dark press" href="#reservar" data-promo-svc="${esc((p.services || []).filter((x) => x !== 'todos').join(','))}"><span>${esc(p.name)}</span><b>${p.kind === 'monto' ? `${M.fmtPrice(p.value)} menos` : `${p.value}% de descuento`}</b><span>En ${esc(svc)}${p.until ? ` · hasta el ${longDate(p.until)}` : ''}</span></a>`);
    });
    ((M.site && M.site.packages) || []).slice(0, 3).forEach((k) => {
      promos.push(`<button type="button" class="promo-card press" data-buy-pkg="${esc(k.id)}" style="border:0;text-align:left"><span>Paquete</span><b>${esc(k.name)}</b><span>${M.fmtPrice(k.price)}${k.savings > 0 ? ` · ahorras ${M.fmtPrice(k.savings)}` : ''}</span></button>`);
    });
    if (M.site && M.site.giftShop && M.site.giftShop.enabled) promos.push(`<button type="button" class="promo-card press" data-buy-gift style="border:0;text-align:left"><span>Tarjetas de regalo</span><b>Regala un momento para ella</b><span>Llega al instante por correo</span></button>`);
    const svcs = M.services.slice(0, 8).map((s) => {
      const p = M.promoFor ? M.promoFor(s.id) : null;
      return `<button type="button" class="svc-card press" data-quick-svc="${esc(s.id)}"><b>${esc(s.name)}</b><span>${M.fmtDurationShort(s.durationMinutes)}</span><em>${p ? `<s style="color:var(--faint);font-weight:400">${M.fmtPrice(s.price)}</s> ` : ''}${s.priceFrom ? 'Desde ' : ''}${M.fmtPrice(p ? s.price - p.discount : s.price)}</em></button>`;
    }).join('');
    const wa = waUrl();
    $('s-inicio').innerHTML = `
      <div class="head"><p class="kicker">${esc(M.weekdayName(today))} ${esc(longDate(today))}</p><h1 class="large-title">${name ? `Hola, ${esc(name)}` : 'Hola'}</h1></div>
      ${installBanner()}
      ${hero}
      <div class="quick">
        <a href="#reservar">${I.calPlus}<span>Reservar</span></a>
        <a href="#citas">${I.cal}<span>Mis citas</span></a>
        <a href="#billetera">${I.wallet}<span>Billetera</span></a>
        ${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener">${I.chat}<span>WhatsApp</span></a>` : `<a href="#perfil">${I.user}<span>Perfil</span></a>`}
      </div>
      ${app.loyal && app.loyal.enabled ? `<div class="sec-title"><h2>Tu fidelidad</h2></div>${loyaltyCard()}` : ''}
      ${promos.length ? `<div class="sec-title"><h2>Para ti</h2></div><div class="hscroll">${promos.join('')}</div>` : ''}
      <div class="sec-title"><h2>Reserva rápida</h2><a href="#reservar">Ver todo</a></div>
      <div class="hscroll">${svcs}</div>
      <div class="sec-title"><h2>El estudio</h2></div>
      <div class="list">
        ${mapsUrl() ? `<a class="row" href="${esc(mapsUrl())}" target="_blank" rel="noopener"><span class="ri">${I.pin}</span><span class="rt">Cómo llegar<small>${esc(C.contact.address || 'MAJOBELLA Beauty Studio')}</small></span>${I.chev}</a>` : ''}
        <button type="button" class="row" data-hours><span class="ri">${I.clock}</span><span class="rt">Horario<small>${esc(todayHours())}</small></span>${I.chev}</button>
        ${wa ? `<a class="row" href="${esc(wa)}" target="_blank" rel="noopener"><span class="ri">${I.chat}</span><span class="rt">Escríbenos por WhatsApp<small>Para dudas e información</small></span>${I.chev}</a>` : ''}
      </div>`;
  }
  function todayHours() {
    const h = M.Schedule.hoursFor(M.todayKey());
    return h ? `Hoy abierto de ${M.fmtTime12(h.open)} a ${M.fmtTime12(h.close)}` : 'Hoy cerrado';
  }
  function hoursSheet() {
    const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const rows = [1, 2, 3, 4, 5, 6, 0].map((d) => { const h = C.schedule.hours[d]; return `<li><span>${DAYS[d][0].toUpperCase() + DAYS[d].slice(1)}</span><span>${h ? `${M.fmtTime12(h.open)} – ${M.fmtTime12(h.close)}` : 'Cerrado'}</span></li>`; }).join('');
    openSheet(sheetHead('Horario', esc(C.contact.address || '')) + `<ul class="hours">${rows}</ul>${mapsUrl() ? `<a class="btn btn-block" style="margin-top:18px" href="${esc(mapsUrl())}" target="_blank" rel="noopener">${I.pin} Abrir en Google Maps</a>` : ''}`);
  }

  /* ======================================================================
     RESERVAR (servicios → día y hora → confirmar → listo)
     ====================================================================== */
  const SCH = C.schedule;
  const bk = {
    step: 1, ids: [], date: null, time: null, cat: 'Todas', hold: null, result: null, fastest: null, timerT: null,
    items() { return this.ids.map((id) => M.serviceById[id]).filter(Boolean); },
    minutes() { return this.items().reduce((t, s) => t + s.durationMinutes, 0); },
    go(n) { location.hash = n > 1 ? `#reservar/${n}` : '#reservar'; },
    setStepFromHash(sub) {
      let n = Number(sub) || 1;
      if (n === 4 && !this.result) n = 1;
      if (n >= 2 && n < 4 && !this.ids.length) n = 1;
      if (n === 3 && !(this.date && this.time)) n = this.ids.length ? 2 : 1;
      if (n < 4) this.result = n === 1 && this.result ? null : this.result;
      this.step = n;
    },
    render() {
      const back = $('tb-back');
      if (this.step > 1 && this.step < 4) { back.hidden = false; $('tb-mark').hidden = true; back.onclick = () => this.go(this.step - 1); }
      $('tb-title').textContent = ['Reservar', 'Reservar', 'Día y hora', 'Confirmar', 'Listo'][this.step];
      if (this.shownStep !== this.step) { this.shownStep = this.step; window.scrollTo(0, 0); }
      [null, this.renderServices, this.renderWhen, this.renderConfirm, this.renderDone][this.step].call(this);
    },
    stepper() { return `<div class="stepper" aria-hidden="true">${[1, 2, 3].map((i) => `<span class="${i <= this.step ? 'on' : ''}"></span>`).join('')}</div>`; },
    toggle(id) {
      this.ids = this.ids.includes(id) ? this.ids.filter((x) => x !== id) : [...this.ids, id];
      this.time = null; vibrate(6);
    },

    /* ---- 1. Servicios ---- */
    renderServices() {
      const categories = (M.serviceCategories && M.serviceCategories.length)
        ? M.serviceCategories
        : [...new Set(M.services.map(s=>s.category))].map(name=>({id:name,name}));
      const cat = categories.find(c=>c.name===this.cat);
      if (!cat) {
        this.cat='Todas';
        $('s-reservar').innerHTML = `<div class="head">${this.stepper()}<p class="kicker">PASO 1 DE 3</p><h1 class="large-title">Reserva tu momento</h1><p class="lead">Elige la categoría que mejor se adapte a ti.</p></div>
          <div id="bk-list" class="bk-categories">${categories.map(c=>{
            return `<button type="button" class="bk-category-tile" data-cat="${esc(c.name)}">
              <b>${esc(c.name)}</b><em>Explorar →</em>
            </button>`;
          }).join('')}</div>`;
        this.servicesBar(); return;
      }
      const items=M.services.filter(s=>s.categoryId===cat.id||s.category===cat.name);
      const groups=(M.serviceGroups||[]).filter(g=>g.categoryId===cat.id);
      const direct=items.filter(s=>!s.parentId||!groups.some(g=>g.id===s.parentId));
      $('s-reservar').innerHTML = `<div class="head bk-category-head">${this.stepper()}<p class="kicker">PASO 1 DE 3 · ${esc(cat.name)}</p>
        <h1 class="large-title">${esc(cat.name)}</h1><p class="lead">Elige los servicios que deseas reservar.</p></div>
        <button type="button" class="bk-back" data-cat="Todas">← Todas las categorías</button>
        <div id="bk-list">${groups.map(g=>{
          const children=items.filter(s=>s.parentId===g.id);
          return `<details class="bk-service-group" data-group="${esc(g.id)}" ${this.expandedGroup===g.id?'open':''}>
            <summary><strong>${esc(g.name)}</strong><span class="bk-group-plus" aria-hidden="true">+</span><small>Ver opciones</small></summary>
            <div>${children.map(s=>this.svcItem(s)).join('')}</div></details>`;
        }).join('')}${direct.map(s=>this.svcItem(s)).join('')}</div>`;
      $('bk-list').addEventListener('click', e=>{
        const details=e.target.closest('summary')?.closest('details[data-group]');
        if(details)this.expandedGroup=details.open?'':details.dataset.group;
      });
      this.servicesBar();
    },
    svcItem(s) {
      const on = this.ids.includes(s.id);
      const p = M.promoFor ? M.promoFor(s.id) : null;
      const dep = M.depositPct ? M.depositPct(s) : null;
      return `<div class="svc-item${on ? ' on' : ''}">
        <span class="st"><b>${esc(s.name)}</b><small>${M.fmtDurationShort(s.durationMinutes)}${dep === 0 ? ' · sin depósito' : ''}</small>
          <span class="price">${p ? `<s>${M.fmtPrice(s.price)}</s>` : ''}${s.priceFrom ? 'Desde ' : ''}${M.fmtPrice(p ? s.price - p.discount : s.price)}${p ? `<span class="promo">${esc(M.promoLabel(p))}</span>` : ''}</span></span>
        <div class="bk-svc-actions">
          <button type="button" class="bk-svc-detail" data-svc-info="${esc(s.id)}">Ver detalle</button>
          <button type="button" class="bk-svc-add" data-svc-add="${esc(s.id)}" aria-pressed="${on}" aria-label="${on ? 'Quitar' : 'Añadir'} ${esc(s.name)}">${on ? '✓' : '+'}</button>
        </div></div>`;
    },
    servicesBar() {
      const items = this.items();
      if (!items.length) { setActionbar(''); return; }
      const pr = M.Pricing.local(items);
      setActionbar(`<div class="ab-text"><b>${items.some((s) => s.priceFrom) ? 'Desde ' : ''}${M.fmtPrice(pr.totalRD)}</b><small>${items.length > 1 ? `${items.length} servicios · ` : ''}${M.fmtDuration(this.minutes())}</small></div><button type="button" class="btn" data-bk-next="2">Continuar</button>`);
    },
    infoSheet(id) {
      const s = M.serviceById[id];
      const ul = (arr) => (arr && arr.length ? `<ul style="margin:6px 0 0;padding-left:18px;color:var(--ink-2)">${arr.map((x) => `<li style="margin:4px 0">${esc(x)}</li>`).join('')}</ul>` : '');
      openSheet(sheetHead(esc(s.name), `${M.fmtDuration(s.durationMinutes)} · ${s.priceFrom ? 'Desde ' : ''}${M.fmtPrice(s.price)}`) + `
        <p style="margin:0 0 14px">${esc(s.description || '')}</p>
        ${s.idealFor ? `<p class="kicker">Ideal para</p><p style="margin:6px 0 14px">${esc(s.idealFor)}</p>` : ''}
        ${s.includes && s.includes.length ? `<p class="kicker">Incluye</p>${ul(s.includes)}` : ''}
        ${s.prep && s.prep.length ? `<p class="kicker" style="margin-top:14px">Antes de tu cita</p>${ul(s.prep)}` : ''}
        ${s.results ? `<p class="kicker" style="margin-top:14px">Resultado</p><p style="margin:6px 0 0">${esc(s.results)}</p>` : ''}
        <button type="button" class="btn btn-block" style="margin-top:20px" data-svc-add="${esc(s.id)}">${this.ids.includes(s.id) ? 'Quitar de mi cita' : 'Añadir a mi cita'}</button>`);
    },

    /* ---- 2. Día y hora ---- */
    renderWhen() {
      const minutes = this.minutes();
      $('s-reservar').innerHTML = `
        <div class="head">${this.stepper()}<p class="kicker">Paso 2 de 3 · ${esc(M.fmtDuration(minutes))}</p><h1 class="large-title">¿Cuándo te viene bien?</h1><p class="lead">Solo ves los horarios libres.</p></div>
        <button type="button" class="fastest" id="bk-fast" disabled><span class="ri" style="width:36px;height:36px;border-radius:10px;background:#fff;display:grid;place-items:center">${I.bolt}</span><span><b>Primer horario libre</b><small id="bk-fast-l">Buscando…</small></span></button>
        <div class="days" id="bk-days" role="listbox" aria-label="Día">${this.daysHtml()}</div>
        <div id="bk-slots" style="margin-top:18px"></div>
        ${M.waitlistInfo && M.waitlistInfo.enabled ? '<p style="text-align:center;margin:22px 0 0"><button type="button" class="link-btn" data-wait>¿No encuentras horario? Lista de espera</button></p>' : ''}`;
      this.whenBar();
      if (this.date) this.renderSlots();
      else $('bk-slots').innerHTML = '<p class="muted" style="margin:0">Elige un día.</p>';
      const sel = document.querySelector('.day.on');
      if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
      if (API.enabled()) API.refreshBusy().then(() => { if (this.step === 2 && app.tab === 'reservar') { $('bk-days').innerHTML = this.daysHtml(); this.renderSlots(); this.findFastest(); } }).catch(() => { $('bk-fast-l').textContent = 'No pudimos leer la agenda.'; });
      else this.findFastest();
    },
    daysHtml() {
      const minutes = this.minutes() || SCH.slotStepMinutes;
      const today = M.todayKey();
      let html = '';
      for (let i = 0; i <= SCH.maxDaysAhead; i++) {
        const key = M.addDaysKey(today, i);
        const p = M.parseKey(key);
        const dow = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay();
        const st = API.dayStatus(key, minutes);
        const off = st === 'closed' || st === 'full';
        const label = i === 0 ? 'Hoy' : i === 1 ? 'Mañ.' : WSHORT[dow];
        const tag = st === 'full' ? 'Lleno' : st === 'closed' ? '' : (p.d === 1 || i === 0 ? MSHORT[p.m] : '');
        html += `<button type="button" class="day${key === this.date ? ' on' : ''}" data-day="${key}" ${off ? 'disabled' : ''} role="option" aria-selected="${key === this.date}" aria-label="${M.weekdayName(key)} ${longDate(key)}${st === 'full' ? ', lleno' : st === 'closed' ? ', cerrado' : ''}"><small>${label}</small><b>${p.d}</b><i>${tag}</i></button>`;
      }
      return html;
    },
    async renderSlots() {
      const box = $('bk-slots');
      if (!box || !this.date) return;
      const req = (this.slotReq = (this.slotReq || 0) + 1);
      let res;
      try { res = await API.availability(this.date, this.minutes()); }
      catch (e) { box.innerHTML = `<p class="msg err">No pudimos leer la agenda. ${esc(e.message)}</p>`; return; }
      if (req !== this.slotReq || this.step !== 2) return;
      if (this.time && !res.slots.includes(this.time)) { this.time = null; this.whenBar(); }
      if (!res.all.length || !res.slots.length) { box.innerHTML = `<div class="empty" style="padding:20px 10px">${I.clock}<p>Ese día ya no quedan horas para esta duración.</p></div>`; return; }
      const groups = { Mañana: [], Tarde: [] };
      res.all.forEach((s) => (parseInt(s.time, 10) < 12 ? groups.Mañana : groups.Tarde).push(s));
      box.innerHTML = `<p class="month-label" style="margin-top:0">${esc(M.weekdayName(this.date))} ${esc(longDate(this.date))}</p>` + Object.entries(groups).filter(([, v]) => v.length).map(([label, v]) => `
        <div class="slot-group"><p>${label}</p><div class="slots">${v.map((s) => `<button type="button" class="slot${s.time === this.time ? ' on' : ''}" data-time="${s.time}" ${s.busy ? 'disabled aria-label="Reservado"' : ''}>${M.fmtTime12(s.time)}</button>`).join('')}</div></div>`).join('');
    },
    async findFastest() {
      const minutes = this.minutes();
      const today = M.todayKey();
      for (let i = 0; i <= SCH.maxDaysAhead; i++) {
        const key = M.addDaysKey(today, i);
        if (!M.Schedule.isOpenDay(key)) continue;
        let r;
        try { r = await API.availability(key, minutes); } catch (e) { break; }
        if (r.slots.length) {
          this.fastest = { date: key, time: r.slots[0] };
          const l = $('bk-fast-l'); const b = $('bk-fast');
          if (l && b && this.step === 2) { l.textContent = `${i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${M.weekdayName(key)} ${longDate(key)}`}, ${M.fmtTime12(r.slots[0])}`; b.disabled = false; }
          return;
        }
      }
      const l = $('bk-fast-l'); if (l) l.textContent = 'No hay horarios libres por ahora.';
    },
    whenBar() {
      if (!(this.date && this.time)) { setActionbar(''); return; }
      setActionbar(`<div class="ab-text"><b>${esc(M.fmtTime12(this.time))}</b><small>${esc(M.weekdayName(this.date))} ${esc(longDate(this.date))}</small></div><button type="button" class="btn" data-bk-next="3">Continuar</button>`);
    },
    waitSheet() {
      const p = profile();
      const min = M.todayKey(), max = M.addDaysKey(min, SCH.maxDaysAhead);
      openSheet(sheetHead('Lista de espera', 'Te avisamos por correo si se libera un horario ese día.') + `
        <div class="fld"><label for="w-date">Día</label><input id="w-date" type="date" min="${min}" max="${max}" value="${esc(this.date || '')}"></div>
        <div class="fld"><label for="w-fr">Horario</label><select id="w-fr"><option value="cualquiera">Cualquier hora</option><option value="manana">Mañana</option><option value="tarde">Tarde</option></select></div>
        <div class="fld"><label for="w-name">Nombre</label><input id="w-name" autocomplete="name" value="${esc(p.name || '')}"></div>
        <div class="two" style="margin-top:12px"><div class="fld"><label for="w-phone">Teléfono</label><input id="w-phone" type="tel" value="${esc(p.phone || '')}"></div><div class="fld" style="margin-top:0"><label for="w-email">Correo</label><input id="w-email" type="email" value="${esc(p.email || '')}"></div></div>
        <p class="msg" id="w-msg"></p>
        <button type="button" class="btn btn-block" id="w-join">Avisarme</button>`, {
        onMount: (b) => b.querySelector('#w-join').addEventListener('click', async (e) => {
          const msg = b.querySelector('#w-msg');
          const client = { name: b.querySelector('#w-name').value.trim(), phone: b.querySelector('#w-phone').value.trim(), email: b.querySelector('#w-email').value.trim() };
          const date = b.querySelector('#w-date').value;
          if (!date) { msg.className = 'msg err'; msg.textContent = 'Elige el día.'; return; }
          e.currentTarget.disabled = true; msg.className = 'msg'; msg.textContent = 'Guardando…';
          try {
            const r = await API.waitlistJoin({ date, franja: b.querySelector('#w-fr').value, services: this.ids, client });
            store.set(K.profile, { ...profile(), ...client });
            if (r.available && r.available.length) { msg.className = 'msg ok'; msg.textContent = `¡Ese día ya hay horario libre: ${r.available.slice(0, 3).map(M.fmtTime12).join(', ')}! Te dejamos en la lista igual.`; this.date = date; this.time = null; }
            else { msg.className = 'msg ok'; msg.textContent = r.already ? 'Ya estabas en la lista. Te avisaremos.' : `Listo. Te avisaremos a ${client.email}.`; }
          } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
          e.currentTarget.disabled = false;
        }),
        onClose: () => { if (this.step === 2) this.renderWhen(); },
      });
    },

    /* ---- 3. Confirmar ---- */
    renderConfirm() {
      const p = profile();
      const items = this.items();
      if (p.email || p.phone) M.Pricing.client = { email: p.email || '', phone: p.phone || '' };
      if (app.loyal && app.loyal.eligible && !M.Pricing.loyal) { M.Pricing.loyal = true; M.Pricing.refresh(items).then(() => this.step === 3 && this.renderConfirm()).catch(() => {}); }
      const needBday = !p.birthday;
      const end = new Date(M.studioDate(this.date, this.time).getTime() + this.minutes() * 60000);
      const endHH = end.toLocaleTimeString('en-GB', { timeZone: SCH.timeZone, hour: '2-digit', minute: '2-digit' });
      $('s-reservar').innerHTML = `
        <div class="head">${this.stepper()}<p class="kicker">Paso 3 de 3</p><h1 class="large-title">Confirma tu cita</h1></div>
        <div class="sum"><h3>${esc(items.map((s) => s.name).join(' + '))}</h3><p class="sum-when">${esc(M.weekdayName(this.date))} ${esc(longDate(this.date))} · ${esc(M.fmtTime12(this.time))} – ${esc(M.fmtTime12(endHH))}</p>
          <dl class="lines" id="bk-lines"></dl></div>
        <div class="sec-title"><h2>¿Tienes un código?</h2></div>
        <div class="code-row fld"><input id="bk-code" placeholder="Descuento, tarjeta o paquete" autocomplete="off" autocapitalize="characters" value="${esc(this.pendingCode || '')}"><button type="button" class="btn btn-soft btn-sm" id="bk-code-go" style="min-height:50px">Aplicar</button></div>
        <p class="msg" id="bk-code-msg"></p><div id="bk-tags"></div>
        <div class="sec-title"><h2>Tus datos</h2></div>
        ${personFields('bk', p, { emailHint: 'Ahí te llega la confirmación.' })}
        ${needBday ? `<div class="fld"><label>Tu cumpleaños <span style="font-weight:400">(opcional · te enviamos un regalo)</span></label><div class="two">${bdaySelects('bk-bd', '')}</div></div>` : ''}
        <div class="fld"><label for="bk-notes">Nota para el estudio <span style="font-weight:400">(opcional)</span></label><input id="bk-notes" placeholder="Alergias, dudas…"></div>
        <p class="note" id="bk-policy"></p>`;
      bindPerson($('s-reservar'), 'bk');
      this.refreshLines();
      this.renderTags();
      if (this.pendingCode) { const c = this.pendingCode; this.pendingCode = ''; this.applyCode(c); }
    },
    pricing() { return M.Pricing.current(this.items()); },
    refreshLines() {
      const pr = this.pricing();
      const items = this.items();
      const from = items.some((s) => s.priceFrom) ? 'Desde ' : '';
      $('bk-lines').innerHTML = `
        <div><dt>Precio</dt><dd>${from}${M.fmtPrice(pr.subtotalRD)}</dd></div>
        ${pr.discountRD > 0 ? `<div><dt>Descuento${pr.promoName ? `<small>${esc(pr.promoName)}</small>` : ''}</dt><dd>−${M.fmtPrice(pr.discountRD)}</dd></div>` : ''}
        ${pr.giftAppliedRD > 0 ? `<div><dt>${pr.giftKind === 'bono' ? 'Paquete' : 'Tarjeta de regalo'}</dt><dd>−${M.fmtPrice(pr.giftAppliedRD)}</dd></div>` : ''}
        <div class="total"><dt>Depósito hoy</dt><dd>${M.fmtPrice(pr.depositRD)}${pr.depositRD > 0 ? `<small>${M.fmtUSD(pr.depositUSD)} con PayPal</small>` : `<small>${pr.giftAppliedRD > 0 ? 'cubierto' : 'no requiere depósito'}</small>`}</dd></div>
        <div><dt>Al terminar</dt><dd>${from}${M.fmtPrice(pr.balanceRD)}<small>efectivo, transferencia o PayPal</small></dd></div>`;
      const hrs = (C.policies && C.policies.changeHours) || 24;
      $('bk-policy').innerHTML = `${pr.depositRD > 0 ? `Con ${hrs} horas o más de aviso puedes cambiar la fecha o cancelar y te devolvemos el depósito. ` : ''}Llega 10 minutos antes. Al reservar aceptas los <a href="../terminos.html">términos</a> y la <a href="../cancelacion.html">política de cancelación</a>.`;
      const label = pr.depositRD > 0 ? `Pagar ${M.fmtPrice(pr.depositRD)}` : 'Confirmar cita';
      setActionbar(`<div class="ab-text"><b>${from}${M.fmtPrice(pr.totalRD)}</b><small>${pr.depositRD > 0 ? `Hoy ${M.fmtPrice(pr.depositRD)} · resto al terminar` : 'Sin pago hoy'}</small></div><button type="button" class="btn" id="bk-pay">${label}</button>`);
    },
    renderTags() {
      const tags = [];
      if (M.Pricing.code) tags.push(`<span class="pill dark" style="margin:0 6px 6px 0">Código ${esc(M.Pricing.code)} <button type="button" data-clear-code="code" style="border:0;background:none;color:#fff;margin-left:6px;cursor:pointer" aria-label="Quitar">×</button></span>`);
      if (M.Pricing.gift) tags.push(`<span class="pill dark" style="margin:0 6px 6px 0">${/^PAQ-/.test(M.Pricing.gift) ? 'Paquete' : 'Tarjeta'} ${esc(M.Pricing.gift)} <button type="button" data-clear-code="gift" style="border:0;background:none;color:#fff;margin-left:6px;cursor:pointer" aria-label="Quitar">×</button></span>`);
      const box = $('bk-tags'); if (box) box.innerHTML = tags.join('');
    },
    async applyCode(raw) {
      const v = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
      const msg = $('bk-code-msg');
      if (!v) return;
      msg.className = 'msg'; msg.textContent = 'Revisando…';
      try {
        const res = await API.checkCode(this.ids, v, v);
        const pr = res.pricing;
        if (pr.giftStatus === 'ok') { M.Pricing.gift = v; msg.className = 'msg ok'; msg.textContent = pr.giftKind === 'bono' ? `Paquete aplicado: te quedan ${pr.bonoLeft} sesiones (esta incluida).` : `Tarjeta aplicada: ${M.fmtPrice(Math.min(pr.giftBalanceRD, pr.totalRD))}.`; }
        else if (pr.giftStatus === 'notApplicable') { msg.className = 'msg err'; msg.textContent = 'Ese paquete es para otro servicio.'; }
        else if (pr.codeStatus === 'ok') { M.Pricing.code = v; msg.className = 'msg ok'; msg.textContent = `Código aplicado${pr.promoName ? `: ${pr.promoName}` : ''}.`; }
        else if (pr.codeStatus === 'notBetter') { M.Pricing.code = v; msg.className = 'msg'; msg.textContent = 'Tu cita ya tiene un descuento mayor; siempre se aplica el mejor.'; }
        else if (pr.codeStatus === 'notApplicable') { msg.className = 'msg err'; msg.textContent = 'Ese código no aplica a estos servicios.'; }
        else { msg.className = 'msg err'; msg.textContent = 'No encontramos ese código o ya venció.'; }
        if (M.Pricing.code === v || M.Pricing.gift === v) { const inp = $('bk-code'); if (inp) inp.value = ''; vibrate(10); }
        await M.Pricing.refresh(this.items());
      } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
      if (this.step === 3) { this.refreshLines(); this.renderTags(); }
    },
    readClient() {
      const v = readPerson($('s-reservar'), 'bk');
      if (!v) return null;
      v.notes = $('bk-notes').value.trim();
      const d = $('bk-bd-d'), m = $('bk-bd-m');
      const p = profile();
      v.birthday = d && m && d.value && m.value ? `${m.value}-${d.value}` : (p.birthday || '');
      store.set(K.profile, { ...p, name: v.name, firstName: v.firstName, lastName: v.lastName, phone: v.phone, email: v.email, birthday: v.birthday });
      return v;
    },
    appointment(client) {
      const items = this.items();
      const start = M.studioDate(this.date, this.time);
      return {
        services: items.map((s) => ({ id: s.id, name: s.name, price: s.price, durationMinutes: s.durationMinutes })),
        date: this.date, time: this.time, start: start.toISOString(), end: new Date(start.getTime() + this.minutes() * 60000).toISOString(),
        durationMinutes: this.minutes(), totalPrice: items.reduce((t, s) => t + s.price, 0), client, origen: 'App',
      };
    },
    async pay(btn) {
      const client = this.readClient();
      if (!client) return;
      if (!API.enabled()) { toast('El sistema de reservas no está conectado.'); return; }
      const a = this.appointment(client);
      const pr = this.pricing();
      if (pr.depositRD <= 0) {
        btn.disabled = true; btn.textContent = 'Confirmando…';
        try {
          const res = await API.hold(a, M.Auth.token);
          if (!res.confirmed) throw new Error('No se pudo confirmar. Inténtalo de nuevo.');
          this.finish(a, res, res.appointment);
        } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Confirmar cita'; API.refreshBusy(true).catch(() => {}); }
        return;
      }
      const pp = M.PayPal.configured(), tf = M.Transfer.enabled();
      if (pp && tf) this.methodSheet(a, pr);
      else if (tf) this.transferSheet(a, pr);
      else this.paySheet(a, pr);
    },
    methodSheet(a, pr) {
      openSheet(sheetHead('¿Cómo pagas el depósito?', `${M.fmtPrice(pr.depositRD)} hoy · ${M.fmtPrice(pr.balanceRD)} al terminar`) + `
        <div class="stack">
          <button type="button" class="method press" data-method="paypal"><span class="ri">${I.card}</span><span class="rt">PayPal o tarjeta<small>${M.fmtUSD(pr.depositUSD)} · tu cita queda confirmada al instante</small></span>${I.chev}</button>
          <button type="button" class="method press" data-method="transferencia"><span class="ri">${I.bank}</span><span class="rt">Transferencia bancaria<small>${M.fmtPrice(pr.depositRD)} en pesos · subes el comprobante y te confirmamos</small></span>${I.chev}</button>
        </div>`, {
        onMount: (b) => b.addEventListener('click', (e) => {
          const m = e.target.closest('[data-method]');
          if (!m) return;
          if (m.dataset.method === 'paypal') this.paySheet(a, pr); else this.transferSheet(a, pr);
        }),
      });
    },

    /* ---- Depósito por transferencia ---- */
    transferSheet(a, pr) {
      this.tfSent = false;
      const render = (b) => {
        const h = this.hold && this.hold.transfer ? this.hold : null;
        if (!h) {
          b.innerHTML = sheetHead('Pago por transferencia', `Depósito de ${M.fmtPrice(pr.depositRD)} en pesos`) + `
            <ol class="tf-steps"><li><b>Te apartamos el horario</b> por ${M.Transfer.minutes()} minutos.</li><li><b>Transfieres</b> desde la app de tu banco.</li><li><b>Subes la foto</b> del comprobante y te confirmamos.</li></ol>
            <button type="button" class="btn btn-block" id="tf-hold">Apartar mi horario</button><p class="msg" id="tf-msg"></p>`;
          b.querySelector('#tf-hold').addEventListener('click', async (e) => {
            const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Apartando…';
            try {
              const res = await API.hold(a, M.Auth.token, { method: 'transferencia' });
              if (res.confirmed) { closeSheet(() => this.finish(a, res, res.appointment)); return; }
              this.hold = { ...res, transfer: true };
              const record = { ...a, id: res.id, status: 'retenida', token: res.manageToken, remote: true, createdAt: new Date().toISOString(),
                payment: { depositRD: res.depositRD, balanceRD: res.balanceRD, depositPaid: false, depositMethod: 'transferencia', transfer: { deadline: res.expiresAt, proof: false } } };
              M.Appointments.add(record);
              vibrate(8);
              render(b);
            } catch (err) { btn.disabled = false; btn.textContent = 'Apartar mi horario'; const m = b.querySelector('#tf-msg'); m.className = 'msg err'; m.textContent = err.message; API.refreshBusy(true).catch(() => {}); }
          });
          return;
        }
        b.innerHTML = sheetHead('Transfiere y sube el comprobante', '') + `
          <p class="note" style="margin-top:0"><span class="timer" id="pay-timer">${I.clock}<span></span></span></p>
          ${proofHtml(h.accounts || M.Transfer.accounts(), h.depositRD, 'tf')}
          <p class="note">¿Lo haces luego? Cierra esta ventana: tu horario queda apartado y lo subes desde <b>Mis citas</b>.</p>`;
        this.startTimer(b);
        mountProof(b, 'tf', async (file, account, ref) => {
          const res = await API.transferProof(h.id, { token: h.manageToken }, file, account, ref);
          this.tfSent = true; this.paid = true;
          M.Appointments.update(h.id, { status: res.appointment.status, payment: res.appointment.payment });
          const done = this.hold; this.hold = null; this.stopTimer();
          closeSheet(() => this.finish(a, done, res.appointment));
        });
      };
      openSheet('', {
        onMount: (b) => render(b),
        onClose: () => {
          this.stopTimer();
          if (this.hold && this.hold.transfer && !this.tfSent) {
            const h = this.hold; this.hold = null;
            toast(`Tu horario está apartado hasta las ${M.Transfer.deadlineText({ payment: { transfer: { deadline: h.expiresAt } } })}: sube el comprobante desde Mis citas`);
            this.ids = []; this.date = null; this.time = null;
            app.apptsAt = 0; loadAppts(true);
            setTimeout(() => { location.hash = '#citas'; }, 30);
          }
        },
      });
    },
    paySheet(a, pr) {
      const sigNow = JSON.stringify([this.ids, this.date, this.time, a.client.email]);
      openSheet(sheetHead('Paga tu depósito', 'Con PayPal: tarjeta o cuenta.') + `
        <div class="surface" style="padding:16px"><dl class="lines" style="margin:0;padding:0;border:0">
          <div><dt>Depósito hoy</dt><dd>${M.fmtPrice(pr.depositRD)}<small>${M.fmtUSD(pr.depositUSD)} · tasa RD$ ${esc(C.payments.usdRate)}</small></dd></div>
          <div><dt>Al terminar</dt><dd>${M.fmtPrice(pr.balanceRD)}</dd></div></dl></div>
        <p class="note"><span class="timer" id="pay-timer">${I.clock}<span>Te apartamos el horario mientras pagas.</span></span></p>
        <div class="pp-box" id="pp-box"></div>
        <p class="msg" id="pay-msg"></p>
        ${C.payments.paypalClientId && /sandbox|test/i.test(String(C.payments.paypalEnv || '')) ? '<p class="note">Modo de prueba: no se cobra dinero real.</p>' : ''}`, {
        onMount: (b) => this.mountPayPal(b, a, sigNow),
        onClose: () => { this.stopTimer(); if (this.hold && !this.paid) { API.release(this.hold.id, this.hold.manageToken); this.hold = null; } },
      });
    },
    async mountPayPal(b, a, sigNow) {
      const msg = (t, k) => { const m = b.querySelector('#pay-msg'); if (m) { m.className = `msg${k ? ` ${k}` : ''}`; m.textContent = t || ''; } };
      this.paid = false;
      try {
        await M.PayPal.render(b.querySelector('#pp-box'), {
          createOrder: async () => {
            msg('');
            if (this.hold && this.hold.sig === sigNow && new Date(this.hold.expiresAt).getTime() - Date.now() > 60000) return this.hold.orderId;
            if (this.hold) { API.release(this.hold.id, this.hold.manageToken); this.hold = null; }
            try {
              const res = await API.hold(a, M.Auth.token);
              this.hold = { ...res, sig: sigNow };
              this.startTimer(b);
              return res.orderId;
            } catch (err) { msg(err.message, 'err'); API.refreshBusy(true).catch(() => {}); throw err; }
          },
          onApprove: async (orderId) => {
            if (!this.hold) { msg('El horario se liberó antes de pagar. No se te cobró; inténtalo otra vez.', 'err'); return; }
            msg('Confirmando tu pago…');
            try {
              const res = await API.capture(this.hold.id, orderId);
              this.paid = true;
              const h = this.hold; this.hold = null;
              this.stopTimer();
              closeSheet(() => this.finish(a, h, res.appointment));
            } catch (err) { msg(err.message, 'err'); }
          },
          onCancel: () => msg('Cerraste PayPal sin pagar. Tu horario sigue apartado unos minutos.'),
          onError: () => msg('PayPal no pudo completar el pago. Inténtalo de nuevo.', 'err'),
        });
      } catch (err) { msg(err.message, 'err'); }
    },
    startTimer(b) {
      this.stopTimer();
      const tick = () => {
        const left = this.hold ? Math.max(0, new Date(this.hold.expiresAt).getTime() - Date.now()) : 0;
        const el = b.querySelector('#pay-timer span');
        if (!el) return;
        const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
        el.textContent = left ? `Horario apartado por ${mm}:${String(ss).padStart(2, '0')}` : 'El tiempo terminó: vuelve a intentarlo.';
        if (!left) this.stopTimer();
      };
      tick(); this.timerT = setInterval(tick, 1000);
    },
    stopTimer() { clearInterval(this.timerT); this.timerT = null; },
    finish(a, hold, appt) {
      const record = { ...a, ...appt, client: { ...a.client, ...(appt && appt.client) }, token: hold.manageToken, remote: true, createdAt: new Date().toISOString() };
      M.Appointments.add(record);
      this.result = record;
      this.ids = []; this.date = null; this.time = null;
      M.Pricing.clear('gift'); M.Pricing.clear('code'); M.Pricing.loyal = false;
      app.apptsAt = 0; loadAppts(true); loadWallet();
      if (app.loyal) app.loyal.eligible = false;
      vibrate([12, 40, 12]);
      API.refreshBusy(true).catch(() => {});
      this.go(4);
    },

    /* ---- 4. Listo ---- */
    renderDone() {
      const r = this.result;
      if (!r) { this.go(1); return; }
      const consent = r.consent && r.consent.needed && !r.consent.signed && r.consent.url;
      const cal = M.CalendarLinks.googleUrl({ title: `Cita en MAJOBELLA · ${names(r)}`, start: new Date(r.start), end: new Date(r.end), description: `Código: ${r.id}`, location: C.contact.address || 'MAJOBELLA Beauty Studio' });
      const waiting = r.status === 'por-confirmar';
      $('s-reservar').innerHTML = `
        <div class="done"><div class="ring">${I.check}</div><h2>${waiting ? '¡Comprobante enviado!' : '¡Cita confirmada!'}</h2>
          <p>${esc(names(r))}<br><b style="color:var(--ink)">${esc(whenText(r))}</b></p>
          <p style="font-size:14px">${waiting ? 'Tu horario está apartado. Te confirmamos la cita por correo en cuanto veamos el depósito.' : `Te enviamos la confirmación a ${esc(r.client && r.client.email)}.`}</p></div>
        ${consent ? `<div class="warn-box" style="margin-bottom:12px">Antes de tu cita, firma el consentimiento. Toma 2 minutos.</div><a class="btn btn-block" href="${esc(r.consent.url)}">${I.pen} Firmar consentimiento</a>` : ''}
        <div class="stack" style="margin-top:12px">
          <a class="btn btn-block ${consent ? 'btn-ghost' : ''}" href="${esc(cal)}" target="_blank" rel="noopener">${I.calPlus} Añadir a mi calendario</a>
          <a class="btn btn-block btn-ghost" href="#citas">Ver mis citas</a>
        </div>`;
    },
  };

  /* ---- Datos de la clienta: nombre, apellido, teléfono y correo con las mismas reglas que el servidor ---- */
  const V = M.Validate;
  function nameParts(p) {
    if (p && p.firstName) return { first: p.firstName, last: p.lastName || '' };
    const u = M.Auth.user;
    return V.splitName((p && p.name) || (u && u.name) || '');
  }
  function personFields(prefix, p, opts = {}) {
    const n = nameParts(p);
    const email = p.email || (M.Auth.user && M.Auth.user.email) || '';
    return `<div class="two">
        <div class="fld" id="${prefix}-first-f"><label for="${prefix}-first">Nombre</label><input id="${prefix}-first" autocomplete="given-name" value="${esc(n.first)}"><span class="err"></span></div>
        <div class="fld" id="${prefix}-last-f" style="margin-top:0"><label for="${prefix}-last">Apellido</label><input id="${prefix}-last" autocomplete="family-name" value="${esc(n.last)}"><span class="err"></span></div></div>
      <div class="fld" id="${prefix}-phone-f"><label for="${prefix}-phone">Teléfono</label><input id="${prefix}-phone" type="tel" autocomplete="tel" placeholder="809-555-1234" value="${esc(p.phone || '')}"><span class="err"></span></div>
      <div class="fld" id="${prefix}-email-f"><label for="${prefix}-email">Correo</label><input id="${prefix}-email" type="email" autocomplete="email" value="${esc(email)}"><span class="err"></span>${opts.emailHint ? `<small class="hint">${opts.emailHint}</small>` : ''}</div>`;
  }
  function bindPerson(root, prefix) {
    const q = (x) => root.querySelector(`#${prefix}-${x}`);
    V.bindName(q('first')); V.bindName(q('last')); V.bindPhone(q('phone'));
    ['first', 'last', 'phone', 'email'].forEach((k) => q(k).addEventListener('input', () => q(`${k}-f`).classList.remove('bad')));
  }
  /* Valida y devuelve { name, firstName, lastName, phone, email } o null (marca los campos con su mensaje). optional: todo opcional pero válido si se llena */
  function readPerson(root, prefix, optional) {
    const q = (x) => root.querySelector(`#${prefix}-${x}`);
    const first = q('first').value.trim(), last = q('last').value.trim(), phone = q('phone').value.trim(), email = q('email').value.trim().toLowerCase();
    const ph = V.phone(phone);
    const errs = {
      first: optional && !first ? '' : V.namePart(first, 'nombre'),
      last: optional && !last ? '' : V.namePart(last, 'apellido'),
      phone: optional && !phone ? '' : (ph.ok ? '' : (phone ? V.phoneError : 'Escribe tu teléfono.')),
      email: optional && !email ? '' : (V.email(email) ? '' : (email ? V.emailError : 'Escribe tu correo.')),
    };
    let firstBad = null;
    Object.entries(errs).forEach(([k, m]) => {
      const f = q(`${k}-f`);
      f.classList.toggle('bad', !!m);
      f.querySelector('.err').textContent = m;
      if (m && !firstBad) firstBad = f;
    });
    if (firstBad) { firstBad.querySelector('input').focus(); firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' }); vibrate(20); return null; }
    const firstName = V.properName(first), lastName = V.properName(last);
    q('first').value = firstName; q('last').value = lastName; if (ph.ok) q('phone').value = ph.value;
    return { name: V.fullName(firstName, lastName), firstName, lastName, phone: ph.ok ? ph.value : '', email };
  }

  function bdaySelects(prefix, value) {
    const [m, d] = /^\d{2}-\d{2}$/.test(value || '') ? value.split('-') : ['', ''];
    return `<select id="${prefix}-d" aria-label="Día"><option value="">Día</option>${Array.from({ length: 31 }, (_, i) => { const x = String(i + 1).padStart(2, '0'); return `<option value="${x}"${x === d ? ' selected' : ''}>${i + 1}</option>`; }).join('')}</select>
      <select id="${prefix}-m" aria-label="Mes"><option value="">Mes</option>${MONTHS.map((n, i) => { const x = String(i + 1).padStart(2, '0'); return `<option value="${x}"${x === m ? ' selected' : ''}>${n}</option>`; }).join('')}</select>`;
  }

  /* ======================================================================
     MIS CITAS
     ====================================================================== */
  let citasView = 'proximas';
  function renderCitas() {
    setTopAction({ html: I.refresh, label: 'Actualizar', onClick: async () => { $('tb-action').classList.add('spin'); await loadAppts(true); toast('Citas actualizadas'); } });
    const up = app.appts.filter(isUpcoming).sort((a, b) => a.start.localeCompare(b.start));
    const past = app.appts.filter((a) => !isUpcoming(a) && !['retenida', 'expirada'].includes(a.status)).sort((a, b) => b.start.localeCompare(a.start));
    const list = citasView === 'proximas' ? up : past;
    const src = app.apptsSource === 'agenda' ? 'Actualizadas con la agenda del estudio.' : app.apptsError ? 'Sin conexión: se muestran las guardadas en este celular.' : (M.Auth.user ? '' : 'Citas reservadas desde este celular. Inicia sesión para verlas en cualquier dispositivo.');
    $('s-citas').innerHTML = `
      <div class="head"><h1 class="large-title">Mis citas</h1>${src ? `<p class="lead">${esc(src)}</p>` : ''}</div>
      <div class="seg" role="tablist"><button type="button" class="${citasView === 'proximas' ? 'on' : ''}" data-cview="proximas" role="tab">Próximas${up.length ? ` · ${up.length}` : ''}</button><button type="button" class="${citasView === 'anteriores' ? 'on' : ''}" data-cview="anteriores" role="tab">Anteriores</button></div>
      ${!app.apptsAt ? '<div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:90px;margin-top:10px"></div>'
        : list.length ? list.map((a, i) => apptCard(a, citasView === 'proximas' && i === 0)).join('')
          : `<div class="empty">${I.cal}<p>${citasView === 'proximas' ? 'No tienes citas próximas.' : 'Aún no hay citas anteriores.'}</p>${citasView === 'proximas' ? '<a class="btn" href="#reservar">Reservar cita</a>' : ''}</div>`}`;
  }
  function apptCard(a, isNext) {
    const p = M.parseKey(a.date);
    const st = a.status || 'pendiente';
    const past = !isUpcoming(a);
    const label = past && st === 'confirmada' ? 'Realizada' : st === 'retenida' ? 'Falta el comprobante' : (M.STATUS[st] || st);
    const cls = st === 'confirmada' ? (past ? 'off' : 'ok') : st === 'cancelada' ? 'off' : st === 'completada' ? 'off' : 'warn';
    const consent = !past && a.consent && a.consent.needed && !a.consent.signed;
    return `<button type="button" class="appt${isNext ? ' next' : ''}${st === 'cancelada' ? ' is-off' : ''}" data-appt="${esc(a.id)}">
      <span class="date"><b>${p.d}</b><small>${MSHORT[p.m]}</small></span>
      <span class="at"><b>${esc(names(a))}</b><small>${esc(M.weekdayName(a.date))} · ${esc(M.fmtTime12(a.time))} · ${esc(M.fmtDurationShort(a.durationMinutes || 0))}</small>
        <span class="pill ${cls}">${esc(label)}</span>${consent ? ' <span class="pill warn">Falta consentimiento</span>' : ''}${!past && isNext ? ` <span class="pill dark">${esc(countdown(a))}</span>` : ''}</span>
      ${I.chev}</button>`;
  }
  let cancelAsk = null;
  function apptSheet(id) {
    const a = app.appts.find((x) => x.id === id) || M.Appointments.get(id);
    if (!a) return;
    const st = a.status || 'pendiente';
    const past = !isUpcoming(a);
    const remote = a.remote && API.enabled() && M.Appointments.auth(a);
    const p = a.payment || {};
    const hrs = (C.policies && C.policies.changeHours) || 24;
    const left = (new Date(a.start).getTime() - Date.now()) / 3600000;
    const canCancel = remote && ['confirmada', 'por-confirmar'].includes(st) && left > 0;
    const waiting = st === 'retenida' && M.Appointments.waitingProof(a);
    const rc = past ? { ok: false } : M.Reschedule.check(a);
    const viaTransfer = p.depositMethod === 'transferencia';
    const balanceDue = remote && p.depositPaid && p.balanceStatus !== 'pagado' && p.balanceRD > 0 && ['confirmada', 'completada'].includes(st) && M.PayPal.configured() && new Date(a.start).getTime() <= Date.now() + 15 * 60000;
    const consent = !past && a.consent && a.consent.needed;
    const cal = M.CalendarLinks.googleUrl({ title: `Cita en MAJOBELLA · ${names(a)}`, start: new Date(a.start), end: new Date(a.end), description: `Código: ${a.id}`, location: C.contact.address || 'MAJOBELLA Beauty Studio' });
    const wa = waUrl(`Hola, tengo una pregunta sobre mi cita en MAJOBELLA.\n\nServicio: ${names(a)}\nFecha: ${M.weekdayName(a.date)} ${longDate(a.date)}\nHora: ${M.fmtTime12(a.time)}${a.id ? `\nCódigo: ${a.id}` : ''}`);
    const ids = (a.services || []).map((s) => s.id).filter((x) => M.serviceById[x]);
    const askOn = cancelAsk === a.id;
    openSheet(`
      <div class="sheet-head" style="margin-bottom:10px"><div></div><button type="button" class="sheet-x" data-close aria-label="Cerrar">${I.x}</button></div>
      <div class="detail-hero"><p class="kicker">${esc(past && st === 'confirmada' ? 'Realizada' : st === 'retenida' ? 'Falta el comprobante' : (M.STATUS[st] || st))}</p><h3 id="sheet-title">${esc(names(a))}</h3><p>${esc(whenText(a))}</p>${!past ? `<p style="margin-top:6px;font-size:14px;opacity:.75">${esc(countdown(a))}</p>` : ''}</div>
      ${!past && st !== 'cancelada' ? `<div class="grid-acts">
        <a href="${esc(cal)}" target="_blank" rel="noopener">${I.calPlus}<span>Calendario</span></a>
        ${mapsUrl() ? `<a href="${esc(mapsUrl())}" target="_blank" rel="noopener">${I.pin}<span>Cómo llegar</span></a>` : ''}
        ${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener">${I.chat}<span>WhatsApp</span></a>` : ''}
      </div>` : '<div style="height:12px"></div>'}
      ${waiting ? `<div class="warn-box">Tienes hasta las <b>${esc(M.Transfer.deadlineText(a))}</b> para transferir <b>${M.fmtPrice(p.depositRD)}</b> y subir el comprobante. Si no, el horario se libera.</div>
        <button type="button" class="btn btn-block" style="margin:10px 0 4px" data-proof="${esc(a.id)}">${I.up} Subir comprobante</button>` : ''}
      ${st === 'por-confirmar' ? '<div class="ok-box">Recibimos tu comprobante. Te confirmamos por correo en cuanto veamos el depósito.</div>' : ''}
      ${p.refund === 'pendiente' ? `<div class="ok-box">Te devolveremos el depósito de ${M.fmtPrice(p.depositRD)} por transferencia.</div>` : ''}
      ${consent ? (a.consent.signed ? '<div class="ok-box">Consentimiento firmado ✓</div>' : (a.consent.url ? `<div class="warn-box">Falta firmar el consentimiento antes de tu cita.</div><a class="btn btn-block" style="margin-top:10px" href="${esc(a.consent.url)}">${I.pen} Firmar consentimiento</a>` : '')) : ''}
      <dl class="lines">
        <div><dt>Duración</dt><dd>${esc(M.fmtDuration(a.durationMinutes || 0))}</dd></div>
        <div><dt>Total</dt><dd>${M.fmtPrice(a.totalPrice || 0)}</dd></div>
        ${p.discountRD > 0 ? `<div><dt>Descuento</dt><dd>−${M.fmtPrice(p.discountRD)}</dd></div>` : ''}
        ${p.giftRD > 0 ? `<div><dt>Tarjeta de regalo</dt><dd>−${M.fmtPrice(p.giftRD)}</dd></div>` : ''}
        ${a.bono ? `<div><dt>Paquete</dt><dd>${esc(a.bono.code)}</dd></div>` : ''}
        ${p.depositRD > 0 ? `<div><dt>Depósito</dt><dd>${p.refund === 'reembolsado' ? 'Reembolsado' : p.depositPaid ? `${M.fmtPrice(p.depositRD)} ✓` : M.fmtPrice(p.depositRD)}${viaTransfer ? '<small>transferencia</small>' : ''}</dd></div>` : ''}
        ${st !== 'cancelada' && p.balanceRD != null ? `<div><dt>Saldo</dt><dd>${p.balanceStatus === 'pagado' ? 'Pagado ✓' : `${M.fmtPrice(p.balanceRD || 0)}<small>al terminar</small>`}</dd></div>` : ''}
        ${a.id && !String(a.id).startsWith('web-') ? `<div><dt>Código</dt><dd style="font-family:var(--mono);font-weight:400">${esc(a.id)}</dd></div>` : ''}
      </dl>
      <div class="stack" style="margin-top:18px">
        ${balanceDue ? `<button type="button" class="btn btn-block" data-balance="${esc(a.id)}">Pagar saldo con PayPal</button><div class="pp-box" id="bal-box" hidden></div><p class="msg" id="bal-msg"></p>` : ''}
        ${rc.ok ? `<button type="button" class="btn btn-block btn-soft" data-move="${esc(a.id)}">${I.cal} Cambiar fecha</button>` : ''}
        ${!rc.ok && ['used', 'late'].includes(rc.reason) && remote && st === 'confirmada' ? `<p class="note" style="margin:0;text-align:center">${esc(M.Reschedule.reasonText(rc))}</p>` : ''}
        ${ids.length ? `<button type="button" class="btn btn-block btn-soft" data-again="${esc(ids.join(','))}">Reservar de nuevo</button>` : ''}
        ${canCancel ? (askOn
          ? `<div class="warn-box">${left >= hrs ? `Faltan más de ${hrs} horas: te devolvemos el depósito completo${viaTransfer ? ' por transferencia' : ''}.` : `Faltan menos de ${hrs} horas: según la política, el depósito no se devuelve.`}</div>
             <button type="button" class="btn btn-block" style="background:var(--danger);border-color:var(--danger)" data-cancel-yes="${esc(a.id)}">Sí, cancelar mi cita</button>
             <button type="button" class="btn btn-block btn-ghost" data-cancel-no>No, mantenerla</button>`
          : `<button type="button" class="btn btn-block btn-ghost" data-cancel-ask="${esc(a.id)}">Cancelar cita</button>`) : ''}
        ${!remote && !past && st !== 'cancelada' && wa ? `<a class="btn btn-block btn-ghost" href="${esc(wa)}" target="_blank" rel="noopener">Cambiar o cancelar por WhatsApp</a>` : ''}
      </div>`, { onClose: () => { cancelAsk = null; } });
  }
  async function cancelAppt(id, btn) {
    const a = app.appts.find((x) => x.id === id);
    btn.disabled = true; btn.textContent = 'Cancelando…';
    try {
      const res = await API.cancel(id, M.Appointments.auth(a));
      M.Appointments.update(id, { status: 'cancelada', payment: res.appointment && res.appointment.payment });
      cancelAsk = null; closeSheet();
      toast(res.refunded ? 'Cita cancelada. Te devolvimos el depósito.' : res.refundManual ? 'Cita cancelada. Te devolveremos el depósito por transferencia.' : 'Cita cancelada.');
      await loadAppts(true);
    } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Sí, cancelar mi cita'; }
  }
  async function payBalance(id, btn) {
    const a = app.appts.find((x) => x.id === id);
    const auth = M.Appointments.auth(a);
    const box = $('bal-box'), msg = $('bal-msg');
    btn.hidden = true; box.hidden = false;
    try {
      await M.PayPal.render(box, {
        createOrder: async () => { const r = await API.balanceOrder(id, auth); return r.orderId; },
        onApprove: async (orderId) => { msg.textContent = 'Confirmando…'; try { await API.balanceCapture(id, orderId, auth); closeSheet(); toast('¡Saldo pagado! Gracias.'); loadAppts(true); } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; } },
        onError: () => { msg.className = 'msg err'; msg.textContent = 'PayPal no pudo completar el pago.'; },
      });
    } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
  }

  /* ---- Comprobante de transferencia (en la reserva y en Mis citas) ---- */
  function proofHtml(accounts, amount, prefix) {
    return `<div class="tf-amount"><span>Transfiere</span><b>${M.fmtPrice(amount)}</b><button type="button" class="tf-copy" data-copy-tf="${amount}">Copiar monto</button></div>
      ${M.Transfer.accountsHtml(accounts, { name: `${prefix}-acc` })}
      <label class="tf-file press"><input type="file" id="${prefix}-file" accept="image/*,application/pdf">${I.up}<span id="${prefix}-file-l">Subir la foto del comprobante</span></label>
      <img class="tf-preview" id="${prefix}-prev" alt="" hidden>
      <div class="fld"><label for="${prefix}-ref">Número de referencia <span style="font-weight:400">(opcional)</span></label><input id="${prefix}-ref" maxlength="60" autocomplete="off"></div>
      <button type="button" class="btn btn-block" id="${prefix}-send" disabled style="margin-top:14px">Enviar comprobante</button>
      <p class="msg" id="${prefix}-msg"></p>`;
  }
  function mountProof(b, prefix, send) {
    let file = null;
    const q = (x) => b.querySelector(`#${prefix}-${x}`);
    const msg = (t, k) => { const m = q('msg'); m.className = `msg${k ? ` ${k}` : ''}`; m.textContent = t || ''; };
    b.addEventListener('click', (e) => { const c = e.target.closest('[data-copy],[data-copy-tf]'); if (c) { e.preventDefault(); e.stopPropagation(); copy(c.dataset.copy || c.dataset.copyTf, 'Copiado'); } });
    q('file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      q('send').disabled = true;
      if (!f) return;
      try {
        msg('Preparando…');
        file = await M.Transfer.prepare(f);
        q('file-l').textContent = f.name || 'Comprobante listo';
        const pv = q('prev'); pv.hidden = !file.preview; if (file.preview) pv.src = file.preview;
        q('send').disabled = false; msg('');
      } catch (err) { file = null; msg(err.message, 'err'); }
    });
    q('send').addEventListener('click', async () => {
      if (!file) return;
      const btn = q('send'); btn.disabled = true; btn.textContent = 'Enviando…';
      try { await send(file, M.Transfer.pickedAccount(b, `${prefix}-acc`), q('ref').value.trim()); vibrate([12, 40, 12]); }
      catch (err) { btn.disabled = false; btn.textContent = 'Enviar comprobante'; msg(err.message, 'err'); }
    });
  }
  function proofSheet(id) {
    const a = app.appts.find((x) => x.id === id) || M.Appointments.get(id);
    if (!a) return;
    openSheet(sheetHead('Sube tu comprobante', `Antes de las ${esc(M.Transfer.deadlineText(a))}`) + proofHtml(M.Transfer.accounts(), a.payment.depositRD, 'pf'), {
      onMount: (b) => mountProof(b, 'pf', async (file, account, ref) => {
        const r = await API.transferProof(a.id, M.Appointments.auth(a), file, account, ref);
        M.Appointments.update(a.id, { status: r.appointment.status, payment: r.appointment.payment });
        closeSheet(); toast('Comprobante enviado. Te confirmamos pronto.');
        await loadAppts(true);
      }),
    });
  }

  /* ---- Cambiar la fecha ---- */
  function moveSheet(id) {
    const a = app.appts.find((x) => x.id === id) || M.Appointments.get(id);
    if (!a) return;
    const st = { key: null, time: null, days: null, slots: null };
    const left = M.Appointments.changesLeft(a);
    const paint = (b) => {
      const days = (st.days || []).filter((d) => d.free > 0);
      b.querySelector('#mv-body').innerHTML = !st.days ? '<div class="skeleton" style="height:76px"></div>'
        : !days.length ? '<p class="note">No hay horarios libres en las próximas semanas. Escríbenos por WhatsApp.</p>'
          : `<div class="days" role="listbox" aria-label="Nuevo día">${days.map((d) => { const p = M.parseKey(d.key); return `<button type="button" class="day${d.key === st.key ? ' on' : ''}" data-mday="${d.key}" aria-selected="${d.key === st.key}"><small>${esc(M.weekdayName(d.key).slice(0, 3))}</small><b>${p.d}</b><small>${MSHORT[p.m]}</small></button>`; }).join('')}</div>
            ${st.key ? (st.slots == null ? '<div class="skeleton" style="height:48px;margin-top:14px"></div>' : `<div class="slots" style="margin-top:14px">${st.slots.map((t) => `<button type="button" class="slot${t === st.time ? ' on' : ''}" data-mtime="${t}">${esc(M.fmtTime12(t))}</button>`).join('')}</div>`) : '<p class="note">Elige el nuevo día.</p>'}`;
      const go = b.querySelector('#mv-save');
      go.disabled = !(st.key && st.time);
      go.textContent = st.key && st.time ? `Cambiar al ${M.weekdayName(st.key).toLowerCase()} ${M.parseKey(st.key).d}, ${M.fmtTime12(st.time)}` : 'Elige día y hora';
    };
    openSheet(sheetHead('Cambiar fecha', `Ahora: ${esc(whenText(a))}`) + `
      <div id="mv-body"></div>
      <p class="note">${left > 1 ? `Puedes cambiarla ${left} veces más.` : 'Puedes cambiar la fecha una vez.'} Tu depósito pasa a la nueva cita.</p>
      <button type="button" class="btn btn-block" id="mv-save" disabled>Elige día y hora</button><p class="msg" id="mv-msg"></p>`, {
      onMount: async (b) => {
        paint(b);
        b.addEventListener('click', async (e) => {
          const d = e.target.closest('[data-mday]');
          if (d) { st.key = d.dataset.mday; st.time = null; st.slots = null; vibrate(5); paint(b); st.slots = await M.Reschedule.slots(a, st.key); paint(b); return; }
          const t = e.target.closest('[data-mtime]');
          if (t) { st.time = t.dataset.mtime; vibrate(5); paint(b); return; }
          if (e.target.closest('#mv-save')) {
            const btn = b.querySelector('#mv-save'), m = b.querySelector('#mv-msg');
            btn.disabled = true; btn.textContent = 'Cambiando…'; m.textContent = '';
            try {
              const ap = await M.Reschedule.save(a, st.key, st.time);
              closeSheet(); vibrate([12, 40, 12]);
              toast(`Listo: ${M.weekdayName(ap.date).toLowerCase()} ${M.parseKey(ap.date).d} a las ${M.fmtTime12(ap.time)}`);
              await loadAppts(true);
            } catch (err) { m.className = 'msg err'; m.textContent = err.message; paint(b); }
          }
        });
        st.days = await M.Reschedule.days(a, 21);
        if (sheet.open) paint(b);
      },
    });
  }

  /* ======================================================================
     BILLETERA
     ====================================================================== */
  function renderBilletera() {
    setTopAction({ html: I.plus, label: 'Agregar código', onClick: addCodeSheet });
    const items = app.wallet;
    const cards = items.length ? items.map(walletCard).join('') : (!app.walletLoaded && walletCodes().length ? '<div class="skeleton" style="aspect-ratio:1.62"></div>'
      : `<div class="empty" style="padding:24px 10px">${I.wallet}<p>Aquí guardas tus tarjetas de regalo y paquetes para usarlos al reservar.</p></div>`);
    const shop = [];
    if (M.site && M.site.giftShop && M.site.giftShop.enabled && M.PayPal.configured()) shop.push(`<button type="button" class="buy-tile press" data-buy-gift>${I.gift}<b>Regalar una tarjeta</b><span>Desde ${M.fmtPrice(M.site.giftShop.min)} · llega por correo</span></button>`);
    ((M.site && M.site.packages) || []).filter(() => M.PayPal.configured()).forEach((k) => shop.push(`<button type="button" class="buy-tile press" data-buy-pkg="${esc(k.id)}">${I.spark}<b>${esc(k.name)}</b><span>${M.fmtPrice(k.price)}${k.savings > 0 ? ` · ahorras ${M.fmtPrice(k.savings)}` : ''}</span></button>`));
    $('s-billetera').innerHTML = `
      <div class="head"><h1 class="large-title">Billetera</h1><p class="lead">Tus tarjetas de regalo, paquetes y premio de fidelidad.</p></div>
      ${loyaltyCard()}
      <div class="sec-title"><h2>Tarjetas y paquetes</h2></div>
      ${cards}
      <button type="button" class="add-code" data-add-code>${I.plus} Agregar un código</button>
      ${API.enabled() ? (M.Auth.user
        ? `<p class="note" style="text-align:center">Las tarjetas y paquetes con tu correo ${esc(M.Auth.user.email)} aparecen aquí solos.</p>`
        : `<div class="surface sync-card"><b>¿Compraste o te regalaron una tarjeta?</b><p>Inicia sesión con Google en Perfil y aparecen aquí solas, o te enviamos tus códigos al correo.</p><button type="button" class="btn btn-soft btn-sm" data-wallet-mail>${I.mail} Enviarme mis códigos</button></div>`) : ''}
      ${shop.length ? `<div class="sec-title"><h2>Comprar</h2></div><div class="buy-grid">${shop.join('')}</div>` : ''}`;
  }
  function walletCard(w) {
    if (w.type === 'gift') {
      const off = w.status !== 'activa';
      return `<button type="button" class="wcard gift${off ? ' is-off' : ''}" data-wallet="${esc(w.code)}">
        <span class="wk">Tarjeta de regalo${w.to ? ` · para ${esc(w.to)}` : ''}</span>
        <span class="wv">${M.fmtPrice(w.balanceRD)}<small>${off ? esc(w.status[0].toUpperCase() + w.status.slice(1)) : `disponible de ${M.fmtPrice(w.amountRD)}`}${w.expires ? ` · vence ${esc(longDateY(w.expires))}` : ''}</small></span>
        <span class="wb"><code>${esc(w.code)}</code><img src="../assets/logo-majobella.png" alt="" style="width:86px;filter:invert(1);opacity:.9"></span></button>`;
    }
    if (w.type === 'package') {
      const left = Math.max(0, w.sessions - w.used);
      const off = w.status !== 'activo';
      return `<button type="button" class="wcard pkg${off ? ' is-off' : ''}" data-wallet="${esc(w.code)}">
        <span class="wk">Paquete · ${esc(w.serviceName)}</span>
        <span class="wv">${esc(w.name)}<small>${off ? esc(w.status === 'agotado' ? 'Usado completo' : w.status) : `${left} ${left === 1 ? 'sesión disponible' : 'sesiones disponibles'}`}${w.expires ? ` · vence ${esc(longDateY(w.expires))}` : ''}</small></span>
        <span class="wb"><span><span class="dots" aria-hidden="true">${Array.from({ length: w.sessions }, (_, i) => `<span class="${i < w.used ? 'on' : ''}"></span>`).join('')}</span><code>${esc(w.code)}</code></span></span></button>`;
    }
    return `<button type="button" class="wcard pkg is-off" data-wallet="${esc(w.code)}"><span class="wk">Código</span><span class="wv">${esc(w.code)}<small>No lo encontramos</small></span><span></span></button>`;
  }
  function walletSheet(code) {
    const w = app.wallet.find((x) => x.code === code);
    if (!w) return;
    const usable = (w.type === 'gift' && w.status === 'activa') || (w.type === 'package' && w.status === 'activo');
    openSheet(sheetHead(w.type === 'gift' ? 'Tarjeta de regalo' : w.type === 'package' ? esc(w.name) : 'Código', w.type === 'gift' ? (w.from ? `De ${esc(w.from)}${w.to ? ` para ${esc(w.to)}` : ''}` : '') : w.type === 'package' ? esc(w.serviceName) : '') + `
      ${walletCard(w).replace('<button', '<div').replace(/<\/button>$/, '</div>').replace('data-wallet', 'data-x')}
      ${w.message ? `<p style="margin:14px 0 0;font-family:var(--serif);font-style:italic;font-size:17px">“${esc(w.message)}”</p>` : ''}
      <p class="note">Escríbelo en «¿Tienes un código?» al confirmar tu cita${w.type === 'package' ? ': cubre una sesión de ' + esc(w.serviceName) : ''}.</p>
      <div class="stack" style="margin-top:16px">
        ${usable ? `<button type="button" class="btn btn-block" data-use-code="${esc(w.code)}" data-svc="${esc(w.service || '')}">Usar en mi próxima cita</button>` : ''}
        <div class="two"><button type="button" class="btn btn-soft" data-copy="${esc(w.code)}">${I.copy} Copiar</button>
          ${navigator.share ? `<button type="button" class="btn btn-soft" data-share-code="${esc(w.code)}">${I.share} Compartir</button>` : (w.type === 'gift' ? `<button type="button" class="btn btn-soft" data-gift-img="${esc(w.code)}">${I.down} Imagen</button>` : '<span></span>')}</div>
        ${w.type === 'gift' && navigator.share ? `<button type="button" class="btn btn-block btn-soft" data-gift-img="${esc(w.code)}">${I.down} Descargar la tarjeta</button>` : ''}
        <button type="button" class="link-btn" style="color:var(--muted)" data-remove-code="${esc(w.code)}">Quitar de mi billetera</button>
      </div>`);
  }
  function walletMailSheet() {
    const p = profile();
    openSheet(sheetHead('Enviarme mis códigos', 'Te mandamos al correo las tarjetas y paquetes comprados o recibidos con él.') + `
      <div class="fld" id="wm-f"><label for="wm-mail">Tu correo</label><input id="wm-mail" type="email" autocomplete="email" value="${esc(p.email || '')}"><span class="err">Revisa el correo.</span></div>
      <button type="button" class="btn btn-block" id="wm-go" style="margin-top:16px">Enviar</button><p class="msg" id="wm-msg"></p>
      <p class="note">Por seguridad no mostramos los códigos en pantalla: solo la dueña del correo los recibe.</p>`, {
      onMount: (b) => {
        b.querySelector('#wm-go').addEventListener('click', async (e) => {
          const email = b.querySelector('#wm-mail').value.trim();
          const ok = EMAIL.test(email);
          b.querySelector('#wm-f').classList.toggle('bad', !ok);
          if (!ok) return;
          const btn = e.currentTarget, m = b.querySelector('#wm-msg');
          btn.disabled = true; btn.textContent = 'Enviando…';
          try { const r = await API.walletEmail(email); m.className = 'msg ok'; m.textContent = r.message; btn.textContent = 'Enviado'; }
          catch (err) { m.className = 'msg err'; m.textContent = err.message; btn.disabled = false; btn.textContent = 'Enviar'; }
        });
      },
    });
  }

  function addCodeSheet() {
    openSheet(sheetHead('Agregar código', 'De una tarjeta de regalo o un paquete.') + `
      <div class="fld"><label for="ac-code">Código</label><input id="ac-code" placeholder="MJB-XXXX-XXXX o PAQ-XXXX-XXXX" autocomplete="off" autocapitalize="characters"></div>
      <p class="msg" id="ac-msg"></p><button type="button" class="btn btn-block" id="ac-go">Agregar</button>`, {
      onMount: (b) => {
        const go = async () => {
          const code = b.querySelector('#ac-code').value.trim().toUpperCase().replace(/\s+/g, '');
          const msg = b.querySelector('#ac-msg');
          if (code.length < 5) { msg.className = 'msg err'; msg.textContent = 'Escribe el código completo.'; return; }
          msg.className = 'msg'; msg.textContent = 'Buscando…';
          try {
            const r = await API.post({ action: 'walletLookup', codes: [code] }, 'No se pudo revisar el código.');
            const it = (r.items || [])[0];
            if (!it || it.type === 'unknown') { msg.className = 'msg err'; msg.textContent = 'No encontramos ese código.'; return; }
            addToWallet(it.code); app.wallet = [it, ...app.wallet.filter((x) => x.code !== it.code)];
            closeSheet(); toast('Guardado en tu billetera'); vibrate(10);
            if (app.tab === 'billetera') renderBilletera();
          } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
        };
        b.querySelector('#ac-go').addEventListener('click', go);
        b.querySelector('#ac-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        setTimeout(() => b.querySelector('#ac-code').focus(), 350);
      },
    });
  }

  /* ---- Comprar tarjeta de regalo ---- */
  function giftSheet() {
    const shop = M.site.giftShop;
    const p = profile();
    const presets = [1500, 2500, 5000].filter((v) => v >= shop.min && v <= shop.max);
    let amount = presets[1] || presets[0] || shop.min;
    openSheet(sheetHead('Regalar una tarjeta', 'Llega al instante por correo con un código para reservar.') + `
      <div class="amounts" id="g-amts">${presets.map((v) => `<button type="button" data-amt="${v}" class="${v === amount ? 'on' : ''}">${M.fmtPrice(v)}</button>`).join('')}<button type="button" data-amt="otro">Otro</button></div>
      <div class="fld" id="g-other-w" hidden style="margin-top:12px"><label for="g-other">Valor (RD$)</label><input id="g-other" type="number" inputmode="numeric" min="${shop.min}" max="${shop.max}" step="100"></div>
      <div class="two" style="margin-top:14px"><div class="fld"><label for="g-para">Para</label><input id="g-para" maxlength="60"></div><div class="fld" style="margin-top:0"><label for="g-de">De</label><input id="g-de" maxlength="60" value="${esc(p.name ? firstName(p.name) : '')}"></div></div>
      <div class="fld"><label for="g-msg">Dedicatoria <span style="font-weight:400">(opcional)</span></label><input id="g-msg" maxlength="140" placeholder="¡Feliz cumpleaños!"></div>
      <div class="fld" id="g-mail-f"><label for="g-mail">Tu correo</label><input id="g-mail" type="email" value="${esc(p.email || '')}"><span class="err">Ahí te llega la tarjeta.</span></div>
      <div class="fld"><label for="g-mail2">Correo de quien la recibe <span style="font-weight:400">(opcional)</span></label><input id="g-mail2" type="email"></div>
      <label class="check"><input type="checkbox" id="g-terms"><span>Acepto las <a href="../cancelacion.html#tarjetas">condiciones de las tarjetas</a>.</span></label>
      <p class="note" id="g-usd"></p>
      <div class="pp-box" id="g-pp"></div><p class="msg" id="g-msgx"></p>`, {
      onMount: (b) => {
        V.bindName(b.querySelector('#g-para')); V.bindName(b.querySelector('#g-de'));
        const rate = Number(C.payments.usdRate) || 63;
        const val = () => (amount === 'otro' ? Math.round(Number(b.querySelector('#g-other').value) || 0) : amount);
        const usd = () => { const v = val(); b.querySelector('#g-usd').textContent = v ? `Se cobra ${M.fmtUSD(Math.ceil((v / rate) * 100) / 100)} con PayPal (tasa RD$ ${rate}).` : ''; };
        usd();
        b.querySelector('#g-amts').addEventListener('click', (e) => {
          const t = e.target.closest('[data-amt]'); if (!t) return;
          b.querySelectorAll('[data-amt]').forEach((x) => x.classList.toggle('on', x === t));
          amount = t.dataset.amt === 'otro' ? 'otro' : Number(t.dataset.amt);
          b.querySelector('#g-other-w').hidden = amount !== 'otro'; usd();
        });
        b.querySelector('#g-other').addEventListener('input', usd);
        const msg = (t, k) => { const m = b.querySelector('#g-msgx'); m.className = `msg${k ? ` ${k}` : ''}`; m.textContent = t || ''; };
        const valid = () => {
          const v = val();
          if (v < shop.min || v > shop.max) { msg(`El valor debe estar entre ${M.fmtPrice(shop.min)} y ${M.fmtPrice(shop.max)}.`, 'err'); return false; }
          const ok = EMAIL.test(b.querySelector('#g-mail').value.trim());
          b.querySelector('#g-mail-f').classList.toggle('bad', !ok);
          if (!ok) { msg('Escribe tu correo.', 'err'); return false; }
          if (!b.querySelector('#g-terms').checked) { msg('Acepta las condiciones para continuar.', 'err'); return false; }
          msg(''); return true;
        };
        let order = null;
        M.PayPal.render(b.querySelector('#g-pp'), {
          onClick: () => valid(),
          createOrder: async () => {
            if (!valid()) throw new Error('Formulario incompleto');
            const d = { montoRD: val(), para: b.querySelector('#g-para').value.trim(), de: b.querySelector('#g-de').value.trim(), mensaje: b.querySelector('#g-msg').value.trim(), correo: b.querySelector('#g-mail').value.trim(), correoPara: b.querySelector('#g-mail2').value.trim() };
            try { order = await API.giftOrder(d); return order.orderId; } catch (err) { msg(err.message, 'err'); throw err; }
          },
          onApprove: async (orderId) => {
            msg('Confirmando tu pago…');
            try { const r = await API.giftCapture(order.id, orderId); addToWallet(r.gift.codigo); bought('gift', r.gift); } catch (err) { msg(err.message, 'err'); }
          },
          onCancel: () => msg('Pago cancelado. No se te cobró.'),
          onError: () => msg('PayPal no pudo completar el pago.', 'err'),
        }).catch((err) => msg(err.message, 'err'));
      },
    });
  }

  /* ---- Comprar paquete ---- */
  function packageSheet(id) {
    const k = ((M.site && M.site.packages) || []).find((x) => x.id === id);
    if (!k) return;
    const p = profile();
    const rate = Number(C.payments.usdRate) || 63;
    openSheet(sheetHead(esc(k.name), `${esc(k.serviceName)} · ${k.sessions} sesiones`) + `
      <div class="surface"><dl class="lines" style="margin:0;padding:0;border:0">
        <div><dt>Precio del paquete</dt><dd>${M.fmtPrice(k.price)}<small>${M.fmtUSD(Math.ceil((k.price / rate) * 100) / 100)} con PayPal</small></dd></div>
        ${k.savings > 0 ? `<div><dt>Precio normal</dt><dd><s style="color:var(--faint)">${M.fmtPrice(k.regular)}</s></dd></div><div><dt>Ahorras</dt><dd>${M.fmtPrice(k.savings)}</dd></div>` : ''}
        <div><dt>Validez</dt><dd>${k.validDays ? `${k.validDays} días` : 'Sin vencimiento'}</dd></div></dl></div>
      ${k.description ? `<p class="note">${esc(k.description)}</p>` : ''}
      <div style="margin-top:6px">${personFields('k', p)}</div>
      <label class="check"><input type="checkbox" id="k-terms"><span>Acepto las <a href="../cancelacion.html#paquetes">condiciones de los paquetes</a>.</span></label>
      <div class="pp-box" id="k-pp"></div><p class="msg" id="k-msg"></p>`, {
      onMount: (b) => {
        const msg = (t, c) => { const m = b.querySelector('#k-msg'); m.className = `msg${c ? ` ${c}` : ''}`; m.textContent = t || ''; };
        bindPerson(b, 'k');
        let person = null;
        const client = () => person;
        const valid = () => {
          person = readPerson(b, 'k');
          if (!person) { msg('Revisa los campos marcados.', 'err'); return false; }
          if (!b.querySelector('#k-terms').checked) { msg('Acepta las condiciones para continuar.', 'err'); return false; }
          msg(''); return true;
        };
        let order = null;
        M.PayPal.render(b.querySelector('#k-pp'), {
          onClick: () => valid(),
          createOrder: async () => {
            if (!valid()) throw new Error('Formulario incompleto');
            store.set(K.profile, { ...profile(), ...client() });
            try { order = await API.bonoOrder({ paqueteId: k.id, client: client() }); return order.orderId; } catch (err) { msg(err.message, 'err'); throw err; }
          },
          onApprove: async (orderId) => {
            msg('Confirmando tu pago…');
            try { const r = await API.bonoCapture(order.id, orderId); addToWallet(r.bono.codigo); bought('package', r.bono); } catch (err) { msg(err.message, 'err'); }
          },
          onCancel: () => msg('Pago cancelado. No se te cobró.'),
          onError: () => msg('PayPal no pudo completar el pago.', 'err'),
        }).catch((err) => msg(err.message, 'err'));
      },
    });
  }
  function bought(kind, x) {
    vibrate([12, 40, 12]);
    const code = x.codigo;
    openSheet(`<div class="done" style="padding-top:10px"><div class="ring">${I.check}</div><h2>${kind === 'gift' ? '¡Tarjeta lista!' : '¡Paquete activo!'}</h2>
      <p>${kind === 'gift' ? `Tarjeta de ${M.fmtPrice(x.montoRD)}. Te la enviamos por correo y quedó en tu billetera.` : `${x.sesiones} sesiones de ${esc(x.serviceName)}. Quedó en tu billetera.`}</p></div>
      <div class="big-code">${esc(code)}</div>
      <div class="stack">
        ${kind === 'gift' ? `<button type="button" class="btn btn-block" data-gift-dl="${esc(code)}">${I.down} Descargar la tarjeta</button>` : `<button type="button" class="btn btn-block" data-use-code="${esc(code)}" data-svc="${esc(x.servicio || '')}">Reservar mi primera sesión</button>`}
        ${navigator.share ? `<button type="button" class="btn btn-block btn-soft" data-share-text="${esc(kind === 'gift' ? `Te regalo una experiencia en MAJOBELLA Beauty Studio 🎁 Tarjeta de ${M.fmtPrice(x.montoRD)}. Código: ${code}` : `Mi código de paquete MAJOBELLA: ${code}`)}">${I.share} Compartir</button>` : ''}
        <button type="button" class="btn btn-block btn-ghost" data-close>Listo</button>
      </div>`, { onMount: (b) => { if (kind === 'gift') app.lastGift = { ...x, de: x.de }; void b; } });
    loadWallet().then(() => { if (app.tab === 'billetera') renderBilletera(); });
  }

  /* ======================================================================
     PERFIL
     ====================================================================== */
  function renderPerfil() {
    const u = M.Auth.user;
    const p = profile();
    const name = (u && u.name) || p.name || 'Tu perfil';
    const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const hours = [1, 2, 3, 4, 5, 6, 0].map((d) => { const h = C.schedule.hours[d]; return `<li><span>${DAYS[d][0].toUpperCase() + DAYS[d].slice(1)}</span><span>${h ? `${M.fmtTime12(h.open)} – ${M.fmtTime12(h.close)}` : 'Cerrado'}</span></li>`; }).join('');
    const wa = waUrl();
    $('s-perfil').innerHTML = `
      <div class="profile-head">${avatarHtml('avatar-lg')}<div><h1>${esc(name)}</h1><p>${esc((u && u.email) || p.email || 'Completa tus datos para reservar más rápido')}</p></div></div>
      ${M.Auth.configured() && !u ? `<div class="surface"><b style="font-family:var(--serif);font-weight:400;font-size:19px">Tus citas en cualquier celular</b><p class="muted" style="margin:4px 0 0;font-size:14.5px">Inicia sesión con Google para ver todas tus citas y tu tarjeta de fidelidad.</p><div class="gbtn" data-google-button></div></div>` : ''}
      <div class="sec-title"><h2>Cuenta</h2></div>
      <div class="list">
        <button type="button" class="row" data-edit-profile><span class="ri">${I.user}</span><span class="rt">Mis datos<small>${esc([p.phone, p.birthday ? 'cumpleaños guardado' : ''].filter(Boolean).join(' · ') || 'Nombre, teléfono, correo y cumpleaños')}</small></span>${I.chev}</button>
        ${M.Install.available() ? `<button type="button" class="row" data-install><span class="ri">${I.phone}</span><span class="rt">Instalar la app<small>En tu pantalla de inicio</small></span>${I.chev}</button>` : ''}
        ${u ? `<button type="button" class="row" data-signout><span class="ri">${I.out}</span><span class="rt">Cerrar sesión<small>${esc(u.email)}</small></span>${I.chev}</button>` : ''}
      </div>
      <div class="sec-title"><h2>El estudio</h2></div>
      <div class="list">
        ${mapsUrl() ? `<a class="row" href="${esc(mapsUrl())}" target="_blank" rel="noopener"><span class="ri">${I.pin}</span><span class="rt">Cómo llegar<small>${esc(C.contact.address || '')}</small></span>${I.chev}</a>` : ''}
        ${wa ? `<a class="row" href="${esc(wa)}" target="_blank" rel="noopener"><span class="ri">${I.chat}</span><span class="rt">WhatsApp<small>${esc(C.whatsapp.display || '')}</small></span>${I.chev}</a>` : ''}
        ${C.social && C.social.instagram ? `<a class="row" href="${esc(C.social.instagram)}" target="_blank" rel="noopener"><span class="ri">${I.spark}</span><span class="rt">Instagram</span>${I.chev}</a>` : ''}
        <div class="row" style="cursor:default;align-items:flex-start"><span class="ri">${I.clock}</span><span class="rt">Horario<ul class="hours" style="margin-top:6px">${hours}</ul></span></div>
      </div>
      <div class="sec-title"><h2>Ayuda</h2></div>
      <div class="list">
        <a class="row" href="../cancelacion.html"><span class="ri">${I.doc}</span><span class="rt">Cancelación y reembolsos</span>${I.chev}</a>
        <a class="row" href="../privacidad.html"><span class="ri">${I.doc}</span><span class="rt">Privacidad</span>${I.chev}</a>
        <a class="row" href="../terminos.html"><span class="ri">${I.doc}</span><span class="rt">Términos y condiciones</span>${I.chev}</a>
        <a class="row" href="../"><span class="ri">${I.globe}</span><span class="rt">Ver la web completa</span>${I.chev}</a>
      </div>
      <p class="foot-note">MAJOBELLA Beauty Studio · Más yo, más bella.</p>`;
    M.Auth.renderButtons();
  }
  function profileSheet() {
    const p = profile();
    openSheet(sheetHead('Mis datos', 'Se usan para reservar más rápido. Se guardan solo en este celular.') + `
      ${personFields('p', p)}
      <div class="fld"><label>Cumpleaños <span style="font-weight:400">(te enviamos un regalo ese día)</span></label><div class="two">${bdaySelects('p-bd', p.birthday)}</div></div>
      <button type="button" class="btn btn-block" style="margin-top:20px" id="p-save">Guardar</button>
      ${p.name || p.phone ? '<button type="button" class="link-btn" style="display:block;margin:14px auto 0;color:var(--muted)" id="p-forget">Borrar mis datos de este celular</button>' : ''}`, {
      onMount: (b) => {
        bindPerson(b, 'p');
        b.querySelector('#p-save').addEventListener('click', () => {
          const v = readPerson(b, 'p', true);
          if (!v) return;
          const d = b.querySelector('#p-bd-d').value, m = b.querySelector('#p-bd-m').value;
          store.set(K.profile, { ...profile(), ...v, birthday: d && m ? `${m}-${d}` : '' });
          closeSheet(); toast('Datos guardados'); loadLoyalty().then(() => render(app.tab));
        });
        const f = b.querySelector('#p-forget');
        if (f) f.addEventListener('click', () => { try { localStorage.removeItem(K.profile); } catch (e) { /* nada */ } closeSheet(); toast('Datos borrados de este celular'); render(app.tab); });
      },
    });
  }

  /* ======================================================================
     BIENVENIDA E INSTALACIÓN
     ====================================================================== */
  function showOnboard(force) {
    const standalone = M.Install.standalone();
    if (!force && store.get(K.onboard, false)) return;
    const ob = $('onboard');
    const canInstall = !standalone && M.Install.available();
    ob.innerHTML = `
      <img class="ob-logo" src="../assets/logo-majobella.png" alt="MAJOBELLA Beauty Studio">
      <div class="ob-art"><img src="../assets/monograma.png" alt=""></div>
      <h1>${standalone ? 'Bienvenida a tu app' : 'Tu belleza, en tu bolsillo'}</h1>
      <p>Reserva en segundos, mira tus citas, firma tu consentimiento y guarda tus tarjetas de regalo y paquetes.</p>
      ${canInstall && !M.Install.canPrompt() ? installSteps() : ''}
      <div class="stack">
        ${canInstall && M.Install.canPrompt() ? `<button type="button" class="btn btn-block" data-ob-install>${I.phone} Instalar la app</button>` : ''}
        <button type="button" class="btn btn-block ${canInstall && M.Install.canPrompt() ? 'btn-ghost' : ''}" data-ob-close>${standalone ? 'Empezar' : canInstall ? 'Continuar en el navegador' : 'Empezar'}</button>
      </div>`;
    ob.hidden = false;
  }
  function closeOnboard() { store.set(K.onboard, true); $('onboard').hidden = true; }

  /* ======================================================================
     Toques (un solo manejador para toda la app)
     ====================================================================== */
  document.addEventListener('click', async (e) => {
    const t = (sel) => e.target.closest(sel);
    let el;
    if (t('[data-stop]')) return;
    if ((el = t('[data-ob-install]'))) { const r = await M.Install.prompt(); if (r === 'accepted') toast('¡Instalada! Búscala en tu pantalla de inicio.'); closeOnboard(); return; }
    if (t('[data-ob-close]')) { closeOnboard(); return; }
    if (t('[data-install]')) { doInstall(); return; }
    if (t('[data-banner-x]')) { store.set(K.banner, true); render(app.tab); return; }
    if (t('[data-hours]')) { hoursSheet(); return; }
    if ((el = t('[data-appt]'))) { apptSheet(el.dataset.appt); return; }
    if ((el = t('[data-quick-svc]'))) { bk.ids = [el.dataset.quickSvc]; bk.date = null; bk.time = null; bk.go(2); return; }
    if ((el = t('[data-promo-svc]'))) { const ids = el.dataset.promoSvc.split(',').filter((x) => M.serviceById[x]); if (ids.length) { e.preventDefault(); bk.ids = ids; bk.date = null; bk.time = null; bk.go(2); } return; }
    if ((el = t('[data-cat]'))) { bk.cat = el.dataset.cat; bk.renderServices(); return; }
    if ((el = t('[data-svc-info]'))) { e.stopPropagation(); bk.infoSheet(el.dataset.svcInfo); return; }
    if ((el = t('[data-svc-add]'))) { bk.toggle(el.dataset.svcAdd); closeSheet(); bk.renderServices(); return; }
    if ((el = t('[data-svc]')) && el.classList.contains('svc-item')) { bk.toggle(el.dataset.svc); el.outerHTML = bk.svcItem(M.serviceById[el.dataset.svc]); bk.servicesBar(); return; }
    if ((el = t('[data-bk-next]'))) { bk.go(Number(el.dataset.bkNext)); return; }
    if ((el = t('.day[data-day]'))) { if (el.disabled) return; bk.date = el.dataset.day; bk.time = null; document.querySelectorAll('.day').forEach((d) => { const on = d === el; d.classList.toggle('on', on); d.setAttribute('aria-selected', on); }); vibrate(5); bk.whenBar(); bk.renderSlots(); return; }
    if ((el = t('.slot[data-time]'))) { if (el.disabled) return; bk.time = el.dataset.time; document.querySelectorAll('.slot').forEach((s) => s.classList.toggle('on', s === el)); vibrate(5); bk.whenBar(); return; }
    if (t('#bk-fast')) { if (bk.fastest) { bk.date = bk.fastest.date; bk.time = bk.fastest.time; bk.renderWhen(); } return; }
    if (t('[data-wait]')) { bk.waitSheet(); return; }
    if (t('#bk-code-go')) { bk.applyCode($('bk-code').value); return; }
    if ((el = t('[data-clear-code]'))) { M.Pricing.clear(el.dataset.clearCode); try { await M.Pricing.refresh(bk.items()); } catch (err) { /* local */ } bk.refreshLines(); bk.renderTags(); $('bk-code-msg').textContent = ''; return; }
    if ((el = t('#bk-pay'))) { bk.pay(el); return; }
    if ((el = t('[data-cview]'))) { citasView = el.dataset.cview; renderCitas(); return; }
    if ((el = t('[data-proof]'))) { proofSheet(el.dataset.proof); return; }
    if ((el = t('[data-move]'))) { moveSheet(el.dataset.move); return; }
    if (t('[data-wallet-mail]')) { walletMailSheet(); return; }
    if ((el = t('[data-cancel-ask]'))) { cancelAsk = el.dataset.cancelAsk; apptSheet(cancelAsk); return; }
    if (t('[data-cancel-no]')) { const id = cancelAsk; cancelAsk = null; apptSheet(id); return; }
    if ((el = t('[data-cancel-yes]'))) { cancelAppt(el.dataset.cancelYes, el); return; }
    if ((el = t('[data-balance]'))) { payBalance(el.dataset.balance, el); return; }
    if ((el = t('[data-again]'))) { const ids = el.dataset.again.split(','); closeSheet(() => { bk.ids = ids; bk.date = null; bk.time = null; bk.go(2); }); return; }
    if ((el = t('[data-wallet]'))) { walletSheet(el.dataset.wallet); return; }
    if (t('[data-add-code]')) { addCodeSheet(); return; }
    if ((el = t('[data-use-code]'))) {
      bk.pendingCode = el.dataset.useCode;
      const svc = el.dataset.svc;
      closeSheet(() => {
        if (svc && M.serviceById[svc] && !bk.ids.includes(svc)) bk.ids = [svc];
        toast(bk.ids.length ? 'Elige día y hora: el código se aplica al confirmar' : 'Elige tu servicio: el código se aplica al confirmar');
        bk.go(bk.ids.length ? 2 : 1);
      });
      return;
    }
    if ((el = t('[data-copy]'))) { copy(el.dataset.copy, 'Código copiado'); return; }
    if ((el = t('[data-share-code]'))) { const w = app.wallet.find((x) => x.code === el.dataset.shareCode); try { await navigator.share({ title: 'MAJOBELLA', text: w && w.type === 'gift' ? `Tarjeta de regalo MAJOBELLA de ${M.fmtPrice(w.balanceRD)}. Código: ${w.code}` : `Código MAJOBELLA: ${el.dataset.shareCode}` }); } catch (err) { /* cancelado */ } return; }
    if ((el = t('[data-share-text]'))) { try { await navigator.share({ title: 'MAJOBELLA', text: el.dataset.shareText }); } catch (err) { /* cancelado */ } return; }
    if ((el = t('[data-gift-img]'))) { const w = app.wallet.find((x) => x.code === el.dataset.giftImg); if (w) M.GiftCard.download({ codigo: w.code, montoRD: w.balanceRD, para: w.to, comprador: w.from, mensaje: w.message, vence: w.expires }, { webUrl: new URL('../', location.href).href }); return; }
    if ((el = t('[data-gift-dl]'))) { const g = app.lastGift; if (g) M.GiftCard.download(g, { webUrl: new URL('../', location.href).href }); return; }
    if ((el = t('[data-remove-code]'))) { removeFromWallet(el.dataset.removeCode); closeSheet(); toast('Quitado de tu billetera'); renderBilletera(); return; }
    if (t('[data-buy-gift]')) { giftSheet(); return; }
    if ((el = t('[data-buy-pkg]'))) { packageSheet(el.dataset.buyPkg); return; }
    if (t('[data-edit-profile]')) { profileSheet(); return; }
    if (t('[data-signout]')) { M.Auth.signOut(); M.myLoyalty = null; toast('Sesión cerrada'); return; }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('svc-item')) { e.preventDefault(); e.target.click(); }
    if (e.key === 'Escape' && sheet.open) closeSheet();
  });

  /* ======================================================================
     Arranque
     ====================================================================== */
  async function start() {
    const q = new URLSearchParams(location.search);
    if (q.get('instalar')) { store.set(K.onboard, false); history.replaceState(null, '', location.pathname + location.hash); }
    M.Auth.init();
    M.Auth.onChange(() => { Promise.all([loadAppts(true), loadWallet()]).then(loadLoyalty).then(() => render(app.tab)); });
    M.Install.onChange(() => render(app.tab));
    // Cambios del estudio (precios, horario, promociones): se ven sin recargar
    API.onCatalogChange(() => {
      const busy = sheet.open || (app.tab === 'reservar' && bk.step >= 3);
      if (!busy) render(app.tab); else app.catalogDirty = true;
    });
    route();
    if (API.enabled()) {
      await Promise.race([API.loadCatalog().catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
    }
    await Promise.all([loadAppts(true), loadWallet()]);
    await loadLoyalty();
    render(app.tab);
    showOnboard(!!q.get('instalar'));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadAppts(); });
  }
  M.Install.register('../sw.js');
  start();
})(window.MJB);
