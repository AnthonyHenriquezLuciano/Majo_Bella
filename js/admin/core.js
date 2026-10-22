/* MAJOBELLA · Dashboard: núcleo
   - Carga todos los datos del estudio con una sola consulta (adminData) y los guarda en A.data.
   - Cada sección (agenda, clientas, dinero, promociones, web, ajustes) se registra en A.sections.
   - admin.html?demo usa datos de ejemplo generados en el navegador (js/admin/demo.js). */
(function (M) {
  const A = (M.Admin = {});
  const $ = (A.$ = (id) => document.getElementById(id));
  const esc = (A.esc = M.escapeHtml);
  A.DEMO = new URLSearchParams(location.search).has('demo');
  A.ACTIVE = ['confirmada', 'completada', 'no-asistio'];
  A.STATUS = { retenida: 'Pagando', 'por-confirmar': 'Por confirmar', expirada: 'Pago sin completar', confirmada: 'Confirmada', completada: 'Realizada', 'no-asistio': 'No asistió', cancelada: 'Cancelada', bloqueo: 'Bloqueado' };
  A.data = null;
  A.METHOD = { efectivo: 'Efectivo', transferencia: 'Transferencia', paypal: 'PayPal', tarjeta: 'Tarjeta', 'tarjeta de regalo': 'Tarjeta de regalo', cortesia: 'Cortesía' };
  A.methodName = (m) => A.METHOD[m] || m || '';
  A.methodLower = (m) => (m === 'paypal' ? 'PayPal' : A.methodName(m).toLowerCase());
  A.sections = {};

  /* ---------- Fechas ---------- */
  const TZ = M.config.schedule.timeZone;
  A.addDays = (key, n) => { const { y, m, d } = M.parseKey(key); const t = new Date(Date.UTC(y, m, d + n)); return M.dateKey(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
  A.dow = (key) => { const { y, m, d } = M.parseKey(key); return new Date(Date.UTC(y, m, d)).getUTCDay(); };
  A.utc = (key) => { const { y, m, d } = M.parseKey(key); return Date.UTC(y, m, d); };
  A.daysIn = (r) => { const out = []; for (let k = r.from; k <= r.to; k = A.addDays(k, 1)) out.push(k); return out; };
  A.cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  A.monthRange = (key) => { const { y, m } = M.parseKey(key); return { from: M.dateKey(y, m, 1), to: M.dateKey(y, m, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()) }; };
  A.shiftMonth = (key, n) => { const { y, m } = M.parseKey(key); const t = new Date(Date.UTC(y, m + n, 1)); return M.dateKey(t.getUTCFullYear(), t.getUTCMonth(), 1); };
  A.hhmm = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  A.dayOf = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };
  A.dayTitle = (key) => A.cap(new Intl.DateTimeFormat('es', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(A.utc(key)));
  A.shortDate = (key) => (key ? new Intl.DateTimeFormat('es', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(A.utc(key)).replace('.', '') : '—');
  A.daysBetween = (a, b) => Math.round((A.utc(b) - A.utc(a)) / 86400000);
  A.monthName = (key) => { const { y, m } = M.parseKey(key); return A.cap(M.monthTitle(y, m)); };

  A.money = (n) => M.fmtPrice(Number(n) || 0);
  A.sum = (list, fn) => list.reduce((t, x) => t + (Number(fn(x)) || 0), 0);
  A.plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

  /* Identificador de clienta (igual que en Code.gs) */
  A.clientKey = (email, phone, name) => {
    const e = String(email || '').trim().toLowerCase();
    if (e) return `e:${e}`;
    const t = String(phone || '').replace(/\D/g, '').slice(-10);
    if (t) return `t:${t}`;
    return `n:${String(name || '').trim().toLowerCase()}`;
  };
  A.waLink = (phone, text) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 10) return '';
    return `https://wa.me/${digits.length === 10 ? `1${digits}` : digits}?text=${encodeURIComponent(text)}`;
  };

  /* ---------- Bloqueos (igual que blockIntervals_ en Code.gs) ---------- */
  A.blockIntervals = (from, to) => {
    const out = [];
    const blocks = (A.data && A.data.blocks) || [];
    A.daysIn({ from, to }).forEach((key) => {
      const dw = A.dow(key);
      blocks.forEach((b) => {
        const hit = b.tipo === 'semanal'
          ? String(b.dias).split(',').includes(String(dw)) && key >= b.fechaDesde && (!b.fechaHasta || key <= b.fechaHasta)
          : key >= b.fechaDesde && key <= (b.fechaHasta || b.fechaDesde);
        if (hit) out.push({ block: b, date: key, start: M.studioDate(key, b.horaDesde || '00:00').toISOString(), end: M.studioDate(key, b.horaHasta || '23:59').toISOString() });
      });
    });
    return out;
  };

  /* ---------- Datos ---------- */
  A.settingsMap = () => Object.fromEntries(((A.data && A.data.settings) || []).map((s) => [s.key, s.value]));
  A.setting = (k, def) => { const v = A.settingsMap()[k]; const n = Number(String(v || '').replace(',', '.')); return v === undefined || v === '' ? def : (Number.isFinite(n) ? n : v); };
  A.services = () => ((A.data && A.data.services) || []).filter((s) => s.tipo !== 'grupo' && !/^no$/i.test(String(s.activo))).map((s) => ({
    id: s.id, name: s.nombre, durationMinutes: Number(s.duracionMin) || 30, price: Number(s.precioRD) || 0, returnDays: Number(s.volverDias) || 0,
    retoqueDias: Number(s.retoqueDias) || 0, consentimiento: s.consentimiento || 'no',
  }));
  A.serviceName = (id) => { const s = ((A.data && A.data.services) || []).find((x) => x.id === id); return s ? s.nombre : id; };

  function applySchedule() {
    const sc = A.data && A.data.schedule;
    if (!sc) return;
    M.config.schedule.hours = sc.hours;
    M.config.schedule.blockedDates = sc.blocked || [];
    if (sc.step) M.config.schedule.slotStepMinutes = sc.step;
  }

  /* ---------- API ---------- */
  A.call = async (action, payload = {}) => {
    if (A.DEMO) return A.demo.handle(action, payload);
    try {
      return await M.BookingAPI.post({ action, idToken: M.Auth.token, device_label: A.deviceLabel(), ...payload }, 'No se pudo completar la acción.');
    } catch (err) {
      if (/sesión expiró|no tiene acceso/i.test(err.message)) { M.Auth.signOut(); A.showGate(err.message); }
      throw err;
    }
  };

  /* "iPhone · Safari", "Windows · Chrome"… para el registro de accesos */
  A.deviceLabel = () => {
    const ua = navigator.userAgent || '';
    const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Otro';
    const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
    return `${os} · ${br}`;
  };

  A.load = async (silent) => {
    if (A.loading) return A.loading;
    $('ad-loading').hidden = false;
    A.loading = (async () => {
      try {
        const res = await A.call('adminData');
        // Si hay un diálogo abierto o se está escribiendo, no se redibuja por debajo (se aplica al cerrar)
        if (silent && (document.querySelector('dialog[open]') || A.editing())) { A.pending = res; return; }
        A.data = res;
        A.loadedAt = Date.now();
        applySchedule();
        if (res.sheetUrl) ['ad-sheet', 'ad-sheet-m'].forEach((id) => { const a = $(id); if (a) { a.href = res.sheetUrl; a.hidden = false; a.textContent = /supabase/.test(res.sheetUrl) ? 'Abrir base de datos' : 'Abrir hoja'; } });
        A.render();
      } catch (err) {
        if (!$('ad-main').hidden && !silent) A.toast(err.message);
      } finally { $('ad-loading').hidden = true; A.loading = null; }
    })();
    return A.loading;
  };
  /* ¿Está escribiendo en un campo de la página? (no se interrumpe con una actualización) */
  A.editing = () => { const el = document.activeElement; return !!(el && el.closest && el.closest('#ad-main') && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); };
  /* Actualización silenciosa: al volver a la pestaña y cada 3 minutos (citas nuevas, comprobantes…) */
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && A.data && Date.now() - (A.loadedAt || 0) > 60000) A.load(true); });
  setInterval(() => { if (A.data && document.visibilityState === 'visible' && Date.now() - (A.loadedAt || 0) > 180000) A.load(true); }, 30000);
  document.addEventListener('close', () => { if (A.pending) { A.data = A.pending; A.pending = null; applySchedule(); A.render(); } }, true);

  /* Cambio optimista: se ve al instante y, si el servidor falla, se deshace */
  A.optimistic = async (list, id, patchFn, request, okMsg) => {
    const arr = A.data[list] || [];
    const i = arr.findIndex((x) => x.id === id);
    const before = i >= 0 ? JSON.parse(JSON.stringify(arr[i])) : null;
    if (i >= 0) { patchFn(arr[i]); A.render(); }
    try {
      const res = await request();
      if (res && res.item) A.upsert(list, res.item);
      A.render();
      if (okMsg) A.toast(okMsg);
      return res;
    } catch (err) {
      if (before) { arr[i] = before; A.render(); }
      A.toast(`No se guardó: ${err.message}`);
      throw err;
    }
  };

  /* Cambios locales tras guardar (evita recargar todo) */
  A.upsert = (list, item, key = 'id') => {
    const arr = A.data[list] || (A.data[list] = []);
    const i = arr.findIndex((x) => x[key] === item[key]);
    if (i >= 0) arr[i] = item; else arr.push(item);
  };
  A.remove = (list, id, key = 'id') => { A.data[list] = (A.data[list] || []).filter((x) => x[key] !== id); };

  /* ---------- Navegación por secciones ---------- */
  A.current = 'agenda';
  A.go = (name) => {
    if (!A.sections[name]) name = 'agenda';
    A.current = name;
    document.querySelectorAll('[data-section]').forEach((s) => { s.hidden = s.dataset.section !== name; });
    document.querySelectorAll('.ad-tabs [data-sec], .ad-bottom [data-sec], .more-list [data-sec]').forEach((b) => { const on = b.dataset.sec === name; b.classList.toggle('is-on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    const more = $('ad-more');
    if (more) more.classList.toggle('is-on', more.dataset.moreFor.split(' ').includes(name));
    if (location.hash.slice(1) !== name) history.replaceState(null, '', `${location.search}#${name}`);
    A.render();
    window.scrollTo({ top: 0 });
  };
  A.render = () => {
    if (!A.data) return;
    const s = A.sections[A.current];
    if (s && s.render) s.render();
    A.labelTables(document.querySelector(`[data-section="${A.current}"]`));
  };
  /* Numerito en una pestaña (0 = se quita) */
  A.badge = (sel, n, label) => {
    document.querySelectorAll(sel).forEach((tab) => {
      let b = tab.querySelector('.tab-badge');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'tab-badge'; tab.appendChild(b); }
      b.textContent = n;
      b.setAttribute('aria-label', label || String(n));
    });
  };
  /* En el celular las tablas se ven como tarjetas: cada celda lleva el nombre de su columna */
  A.labelTables = (root) => {
    if (!root) return;
    root.querySelectorAll('table.tbl').forEach((t) => {
      const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent.replace(/\u00ad/g, '').trim());
      if (!heads.length) return;
      t.classList.add('has-labels');
      t.querySelectorAll('tbody tr').forEach((tr) => {
        [...tr.children].forEach((td, i) => { if (heads[i] && !td.hasAttribute('data-l')) td.setAttribute('data-l', heads[i]); else if (!heads[i]) td.classList.add('no-l'); });
      });
    });
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sec]');
    if (b) { e.preventDefault(); A.go(b.dataset.sec); return; }
    if (e.target.closest('#ad-more')) { A.open('dlg-more'); return; }
    if (e.target.closest('[data-refresh]')) { A.load(); return; }
    // Saltos dentro de una sección (Ajustes): sin cambiar la dirección, que guarda la sección abierta
    const j = e.target.closest('.jump a[href^="#"]');
    if (j) { e.preventDefault(); const t = document.querySelector(j.getAttribute('href')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  /* ---------- Avisos, diálogos y detalle de gráficos ---------- */
  A.toast = (text) => {
    const t = $('ad-toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(A.toast.t); A.toast.t = setTimeout(() => { t.hidden = true; }, 3600);
  };
  A.open = (id) => { const d = $(id); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); return d; };
  A.close = (id) => { const d = $(id); if (d.close) d.close(); else d.removeAttribute('open'); };
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]');
    if (c) A.close(c.dataset.close || c.closest('dialog').id);
  });
  A.busy = async (btn, fn) => {
    if (btn) btn.disabled = true;
    try { return await fn(); } finally { if (btn) btn.disabled = false; }
  };

  const tip = $('ad-tip');
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('.hit');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 12);
    tip.style.transform = `translate(${x}px, ${e.clientY - 36}px)`;
  });

  /* Barras verticales de una sola serie con detalle al pasar el cursor */
  A.barChart = (el, data, opts) => {
    const w = Math.max(240, el.clientWidth || 300), h = opts.height || 150;
    const pad = { t: 10, r: 6, b: 24, l: opts.money ? 52 : 26 };
    const max = Math.max(1, ...data.map((d) => d.value));
    const ticks = !opts.money && max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const step = iw / data.length;
    const bw = Math.max(3, Math.min(22, step - 2));
    const y = (v) => pad.t + ih - (v / max) * ih;
    const every = Math.ceil(data.length / (opts.maxLabels || 10));
    const fmt = opts.money ? (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)) : String;
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="${esc(opts.label)}">`;
    ticks.forEach((t) => { svg += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${pad.l - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${fmt(t)}</text>`; });
    data.forEach((d, i) => {
      const x = pad.l + i * step + (step - bw) / 2;
      const bh = (d.value / max) * ih;
      const r = Math.min(4, bw / 2, bh);
      if (d.value > 0) svg += `<path class="bar${d.highlight ? ' is-hl' : ''}" d="M${x},${pad.t + ih} V${pad.t + ih - bh + r} Q${x},${pad.t + ih - bh} ${x + r},${pad.t + ih - bh} H${x + bw - r} Q${x + bw},${pad.t + ih - bh} ${x + bw},${pad.t + ih - bh + r} V${pad.t + ih} Z"/>`;
      if (i % every === 0) svg += `<text x="${x + bw / 2}" y="${h - 6}" class="tick" text-anchor="middle">${esc(d.label)}</text>`;
      svg += `<rect class="hit" x="${pad.l + i * step}" y="${pad.t}" width="${step}" height="${ih}" data-tip="${esc(d.tip)}"/>`;
    });
    svg += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}" class="axis"/></svg>`;
    el.innerHTML = svg + (opts.empty && !data.some((d) => d.value) ? `<p class="chart-empty">${opts.empty}</p>` : '');
  };

  /* Barras horizontales con etiqueta y valor (servicios, origen…) */
  A.hbars = (rows, empty) => {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return rows.length ? rows.map((r) => `
      <div class="sb-row"><div class="sb-top"><span>${esc(r.label)}</span><span>${esc(r.text)}</span></div>
      <div class="sb-track"><span style="width:${(r.value / max) * 100}%"></span></div></div>`).join('') : `<p class="chart-empty">${empty}</p>`;
  };

  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(A.render, 180); });

  /* ---------- Acceso ---------- */
  A.showGate = (msg) => {
    $('ad-gate').hidden = false; $('ad-main').hidden = true; $('ad-tabs').hidden = true; $('ad-bottom').hidden = true; $('ad-search-open').hidden = true; document.body.classList.remove('is-in');
    if (msg !== undefined) $('gate-msg').textContent = msg;
    if (!M.BookingAPI.enabled() && !A.DEMO) $('gate-text').textContent = 'El dashboard se activa al conectar la hoja de reservas (booking.apiUrl en js/config.js). Mientras tanto puedes verlo con datos de ejemplo.';
    else if (!M.Auth.configured()) $('gate-text').textContent = 'Falta el ID de cliente de Google en js/config.js.';
    renderUser();
  };
  function renderUser() {
    const u = A.DEMO ? { name: 'Modo de ejemplo' } : M.Auth.user;
    $('ad-user').innerHTML = u
      ? `<span class="ad-uname">${esc(u.name || u.email)}</span>${A.DEMO ? '<a class="chip-btn" href="admin.html">Salir del ejemplo</a>' : '<button type="button" class="chip-btn" id="ad-out">Cerrar sesión</button>'}`
      : '';
    const out = $('ad-out');
    if (out) out.addEventListener('click', () => { $('gate-msg').textContent = ''; M.Auth.signOut(); });
  }
  async function enter() {
    $('ad-gate').hidden = true; $('ad-main').hidden = false; $('ad-tabs').hidden = false; $('ad-bottom').hidden = false; $('ad-search-open').hidden = false; document.body.classList.add('is-in');
    renderUser();
    A.bindInputs();
    Object.values(A.sections).forEach((s) => s.init && s.init());
    A.current = A.sections[location.hash.slice(1)] ? location.hash.slice(1) : 'agenda';
    await A.load();
    A.loadedAt = Date.now();
    A.go(A.current);
  }
  $('ad-refresh-all').addEventListener('click', () => A.load());

  /* Nombres y teléfonos con el mismo formato que en la web (ver js/core/validate.js) */
  A.bindInputs = (root) => {
    (root || document).querySelectorAll('[data-v="name"]').forEach((i) => M.Validate.bindName(i));
    (root || document).querySelectorAll('[data-v="phone"]').forEach((i) => M.Validate.bindPhone(i));
  };
  /* '' si el teléfono y el correo (si se escribieron) están bien; si no, el mensaje */
  A.checkContact = (phone, email) => {
    if (phone && !M.Validate.phone(phone).ok) return `Teléfono: ${M.Validate.phoneError}`;
    if (email && !M.Validate.email(email)) return M.Validate.emailError;
    return '';
  };

  A.start = () => {
    if (A.DEMO) {
      const bn = $('ad-banner');
      bn.hidden = false;
      bn.textContent = 'Datos de ejemplo: nada de esto es real y los cambios se pierden al recargar.';
      enter();
      return;
    }
    let entered = false;
    A.showGate('');
    M.Auth.onChange((u) => {
      if (u && M.BookingAPI.enabled()) { if (!entered) { entered = true; enter(); } }
      else { entered = false; A.showGate(u && !M.BookingAPI.enabled() ? 'Falta conectar la hoja de reservas (booking.apiUrl).' : undefined); }
    });
    M.Auth.init();
  };
})(window.MJB);
