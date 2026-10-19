/* MAJOBELLA · Dashboard de reservas (admin.html)
   Solo funciona con una cuenta de Google incluida en ADMIN_EMAILS (propiedad del script en Apps Script).
   El backend verifica la cuenta en cada consulta; esta página no guarda datos de clientas.
   admin.html?demo muestra la misma vista con datos de ejemplo generados en el navegador. */
(function (M) {
  const $ = (id) => document.getElementById(id);
  const esc = M.escapeHtml;
  const DEMO = new URLSearchParams(location.search).has('demo');
  const ACTIVE = ['confirmada', 'completada', 'no-asistio'];
  const STATUS = { retenida: 'Pagando', confirmada: 'Confirmada', completada: 'Realizada', 'no-asistio': 'No asistió', cancelada: 'Cancelada', bloqueo: 'Bloqueado' };
  const WEEKDAY_SHORT = new Intl.DateTimeFormat('es', { timeZone: 'UTC', weekday: 'short' });
  const DAY_TITLE = new Intl.DateTimeFormat('es', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

  const st = { view: window.matchMedia('(max-width: 720px)').matches ? 'day' : 'week', anchor: M.todayKey(), filter: 'activas', items: [], range: null, settings: null, openCancel: null };

  /* ---------- Fechas ---------- */
  const addDays = (key, n) => { const { y, m, d } = M.parseKey(key); const t = new Date(Date.UTC(y, m, d + n)); return M.dateKey(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
  const dow = (key) => { const { y, m, d } = M.parseKey(key); return new Date(Date.UTC(y, m, d)).getUTCDay(); };
  const utc = (key) => { const { y, m, d } = M.parseKey(key); return Date.UTC(y, m, d); };
  function rangeFor(view, anchor) {
    if (view === 'day') return { from: anchor, to: anchor };
    if (view === 'week') { const from = addDays(anchor, -((dow(anchor) + 6) % 7)); return { from, to: addDays(from, 6) }; }
    const { y, m } = M.parseKey(anchor);
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return { from: M.dateKey(y, m, 1), to: M.dateKey(y, m, last) };
  }
  function daysIn(r) { const out = []; for (let k = r.from; k <= r.to; k = addDays(k, 1)) out.push(k); return out; }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function titleFor(view, r) {
    if (view === 'day') return cap(DAY_TITLE.format(utc(r.from)));
    if (view === 'month') { const { y, m } = M.parseKey(r.from); return cap(M.monthTitle(y, m)); }
    const a = M.parseKey(r.from), b = M.parseKey(r.to);
    return a.m === b.m ? `${a.d} – ${b.d} de ${M.monthTitle(b.y, b.m).split(' ')[0].toLowerCase()}` : `${M.dayMonth(r.from)} – ${M.dayMonth(r.to)}`;
  }
  const hhmm = (iso) => { const d = new Date(iso); const p = new Intl.DateTimeFormat('en-GB', { timeZone: M.config.schedule.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d); return p; };

  /* ---------- API (real o de ejemplo) ---------- */
  const api = DEMO ? demoApi() : {
    list: (from, to) => M.BookingAPI.post({ action: 'adminList', idToken: M.Auth.token, from, to }, 'No se pudo cargar la agenda.'),
    update: (id, op, extra) => M.BookingAPI.post({ action: 'adminUpdate', idToken: M.Auth.token, id, op, ...extra }, 'No se pudo guardar el cambio.'),
    block: (data) => M.BookingAPI.post({ action: 'adminBlock', idToken: M.Auth.token, ...data }, 'No se pudo bloquear el horario.'),
  };

  /* ---------- Acceso ---------- */
  function showGate(msg) {
    $('ad-gate').hidden = false; $('ad-main').hidden = true;
    if (msg !== undefined) $('gate-msg').textContent = msg;
    if (!M.BookingAPI.enabled() && !DEMO) $('gate-text').textContent = 'El dashboard se activa al conectar la hoja de reservas (booking.apiUrl en js/config.js). Mientras tanto puedes verlo con datos de ejemplo.';
    else if (!M.Auth.configured()) $('gate-text').textContent = 'Falta el ID de cliente de Google en js/config.js.';
    renderUser();
  }
  function renderUser() {
    const u = DEMO ? { name: 'Modo de ejemplo' } : M.Auth.user;
    $('ad-user').innerHTML = u
      ? `<span class="ad-uname">${esc(u.name || u.email)}</span>${DEMO ? '<a class="chip-btn" href="admin.html">Salir del ejemplo</a>' : '<button type="button" class="chip-btn" id="ad-out">Cerrar sesión</button>'}`
      : '';
    const out = $('ad-out');
    if (out) out.addEventListener('click', () => { $('gate-msg').textContent = ''; M.Auth.signOut(); });
  }

  async function enter() {
    $('ad-gate').hidden = true; $('ad-main').hidden = false;
    renderUser();
    await load(true);
  }

  /* ---------- Carga ---------- */
  async function load(force) {
    const r = rangeFor(st.view, st.anchor);
    // El gráfico por día usa la semana en la vista diaria
    const fetchRange = st.view === 'day' ? rangeFor('week', st.anchor) : r;
    $('ad-title').textContent = titleFor(st.view, r);
    document.querySelectorAll('.seg [data-view]').forEach((b) => { const on = b.dataset.view === st.view; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
    if (!force && st.range && st.range.from === fetchRange.from && st.range.to === fetchRange.to) { render(); return; }
    $('ad-list').innerHTML = '<p class="muted">Cargando…</p>';
    try {
      const res = await api.list(fetchRange.from, fetchRange.to);
      st.items = res.items || [];
      st.range = fetchRange;
      st.settings = res.settings || null;
      if (res.sheetUrl) { const a = $('ad-sheet'); a.href = res.sheetUrl; a.hidden = false; }
      render();
    } catch (err) {
      if (/acceso|sesión/i.test(err.message)) { if (!DEMO) M.Auth.signOut(); showGate(err.message); return; }
      $('ad-list').innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
  }

  /* ---------- Vista ---------- */
  function inView() {
    const r = rangeFor(st.view, st.anchor);
    return st.items.filter((a) => a.date >= r.from && a.date <= r.to);
  }

  function render() {
    const items = inView();
    renderKpis(items);
    renderMonth(items);
    renderList(items);
    renderCharts();
    const s = st.settings;
    $('ad-settings').innerHTML = s ? `Depósito ${s.depositPercent}% · Tasa RD$ ${s.usdRate} por US$ 1 · Reembolso con ${s.cancelHours} h de aviso · PayPal ${s.paypalEnv === 'live' ? 'en vivo' : 'en modo de prueba'}. Se cambian en la pestaña «Ajustes» de la hoja.` : '';
  }

  function money(items, fn) { return items.reduce((t, a) => t + (fn(a) || 0), 0); }
  function renderKpis(items) {
    const appts = items.filter((a) => a.status !== 'bloqueo');
    const active = appts.filter((a) => ACTIVE.includes(a.status));
    const done = appts.filter((a) => a.status === 'completada');
    const cancelled = appts.filter((a) => a.status === 'cancelada');
    const refunded = cancelled.filter((a) => a.payment && a.payment.refund === 'reembolsado');
    const collected = money(appts, (a) => {
      const p = a.payment || {};
      let t = 0;
      if (p.depositPaid && p.refund !== 'reembolsado') t += p.depositRD;
      if (p.balanceStatus === 'pagado') t += p.balanceRD;
      return t;
    });
    const due = money(active.filter((a) => a.status !== 'no-asistio'), (a) => (a.payment && a.payment.balanceStatus !== 'pagado' ? a.payment.balanceRD : 0));
    const cash = money(appts, (a) => (a.payment && a.payment.balanceStatus === 'pagado' && a.payment.balanceMethod === 'efectivo' ? a.payment.balanceRD : 0));
    const k = (label, value, sub) => `<div class="kpi"><p class="kpi-l">${label}</p><p class="kpi-v">${value}</p><p class="kpi-s">${sub}</p></div>`;
    $('ad-kpis').innerHTML = [
      k('Citas', active.length, `${done.length} realizada${done.length === 1 ? '' : 's'}`),
      k('Cobrado', M.fmtPrice(collected), `${M.fmtPrice(cash)} en efectivo`),
      k('Por cobrar', M.fmtPrice(due), 'saldos al terminar la cita'),
      k('Cancelaciones', cancelled.length, `${refunded.length} con reembolso`),
    ].join('');
  }

  function renderMonth(items) {
    const box = $('ad-month');
    box.hidden = st.view !== 'month';
    if (st.view !== 'month') return;
    const r = rangeFor('month', st.anchor);
    const lead = (dow(r.from) + 6) % 7;
    const today = M.todayKey();
    let html = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span class="mg-dow">${d}</span>`).join('');
    for (let i = 0; i < lead; i++) html += '<span></span>';
    daysIn(r).forEach((key) => {
      const list = items.filter((a) => a.date === key);
      const n = list.filter((a) => ACTIVE.includes(a.status)).length;
      const blocked = list.some((a) => a.status === 'bloqueo');
      const open = !!M.Schedule.hoursFor(key);
      html += `<button type="button" class="mg-day${key === today ? ' is-today' : ''}${open ? '' : ' is-closed'}${n ? ' has' : ''}" data-day="${key}" aria-label="${M.weekdayName(key)} ${M.dayMonth(key)}: ${n} citas${blocked ? ', con bloqueo' : ''}">
        <span class="mg-n">${M.parseKey(key).d}</span>
        ${n ? `<span class="mg-c">${n} cita${n === 1 ? '' : 's'}</span>` : ''}${blocked ? '<span class="mg-b">Bloq.</span>' : ''}</button>`;
    });
    box.innerHTML = html;
  }

  function filtered(items) {
    return items.filter((a) => {
      if (st.filter === 'todas') return true;
      if (st.filter === 'canceladas') return a.status === 'cancelada';
      if (st.filter === 'saldo') return ['confirmada', 'completada'].includes(a.status) && a.payment && a.payment.balanceStatus !== 'pagado';
      return a.status !== 'cancelada';
    }).sort((a, b) => a.start.localeCompare(b.start));
  }

  function waLink(a) {
    const digits = String((a.client && a.client.phone) || '').replace(/\D/g, '');
    if (digits.length < 10) return '';
    const num = digits.length === 10 ? `1${digits}` : digits;
    const first = ((a.client && a.client.name) || '').split(' ')[0];
    const text = `Hola ${first}, te escribimos de MAJOBELLA sobre tu cita del ${M.weekdayName(a.date).toLowerCase()} ${M.dayMonth(a.date)} a las ${M.fmtTime12(a.time)}.`;
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }

  function card(a) {
    const p = a.payment || {};
    const time = `${M.fmtTime12(hhmm(a.start))} – ${M.fmtTime12(hhmm(a.end))}`;
    if (a.status === 'bloqueo') {
      return `<article class="appt is-block"><div class="appt-time">${time}</div><div class="appt-body"><p class="appt-name">Bloqueado</p><p class="appt-svc">${esc(a.servicesText || '')}</p>
        <div class="appt-actions"><button type="button" class="act" data-op="cancelar" data-id="${esc(a.id)}">Quitar bloqueo</button></div></div></article>`;
    }
    const chips = [];
    if (p.depositPaid) chips.push(p.refund === 'reembolsado' ? `<span class="pchip">Depósito ${M.fmtPrice(p.depositRD)} reembolsado</span>` : `<span class="pchip is-ok">Depósito ${M.fmtPrice(p.depositRD)} ✓</span>`);
    else if (a.status === 'retenida') chips.push('<span class="pchip">Pagando el depósito…</span>');
    if (a.status !== 'cancelada' && a.status !== 'retenida') {
      chips.push(p.balanceStatus === 'pagado'
        ? `<span class="pchip is-ok">Saldo ${M.fmtPrice(p.balanceRD)} ✓ ${p.balanceMethod === 'efectivo' ? 'efectivo' : 'PayPal'}</span>`
        : `<span class="pchip is-due">Saldo ${M.fmtPrice(p.balanceRD)} pendiente</span>`);
    }
    const acts = [];
    const act = (op, label, extra = '') => `<button type="button" class="act" data-op="${op}" data-id="${esc(a.id)}" ${extra}>${label}</button>`;
    if (['confirmada', 'completada'].includes(a.status) && p.balanceStatus !== 'pagado') acts.push(act('saldoEfectivo', 'Saldo cobrado en efectivo'));
    if (p.balanceStatus === 'pagado' && p.balanceMethod === 'efectivo') acts.push(act('saldoPendiente', 'Deshacer cobro'));
    if (a.status === 'confirmada') { acts.push(act('completar', 'Marcar realizada')); acts.push(act('noAsistio', 'No asistió')); acts.push(act('cancelar-ask', 'Cancelar…')); }
    if (a.status === 'completada' || a.status === 'no-asistio') acts.push(act('reabrir', 'Reabrir'));
    const ask = st.openCancel === a.id ? `
      <div class="cancel-ask"><p>¿Cancelar la cita de ${esc(a.client.name)}? Le avisamos por correo.</p>
        ${p.depositPaid && p.refund !== 'reembolsado' ? `<button type="button" class="act act-dark" data-op="cancelar" data-refund="1" data-id="${esc(a.id)}">Cancelar y reembolsar ${M.fmtPrice(p.depositRD)}</button>` : ''}
        <button type="button" class="act" data-op="cancelar" data-refund="0" data-id="${esc(a.id)}">Cancelar sin reembolso</button>
        <button type="button" class="act act-ghost" data-op="cancelar-close" data-id="${esc(a.id)}">Volver</button></div>` : '';
    const wa = waLink(a);
    return `
      <article class="appt st-${esc(a.status)}">
        <div class="appt-time">${time}<span class="appt-dur">${M.fmtDurationShort(a.durationMinutes)}</span></div>
        <div class="appt-body">
          <div class="appt-top">
            <p class="appt-name">${esc(a.client.name)}</p>
            <span class="pill st-${esc(a.status)}">${STATUS[a.status] || esc(a.status)}</span>
          </div>
          <p class="appt-svc">${esc(a.servicesText || (a.services || []).map((s) => s.name).join(' + '))} · ${M.fmtPrice(a.totalPrice)}</p>
          <p class="appt-contact">${a.client.phone ? `<a href="tel:${esc(String(a.client.phone).replace(/[^\d+]/g, ''))}">${esc(a.client.phone)}</a>` : ''}${wa ? ` · <a href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${a.client.email ? ` · <a href="mailto:${esc(a.client.email)}">${esc(a.client.email)}</a>` : ''}</p>
          ${chips.length ? `<div class="appt-pay">${chips.join('')}</div>` : ''}
          ${a.client.notes ? `<p class="appt-note">Nota de la clienta: ${esc(a.client.notes)}</p>` : ''}
          <details class="appt-more"><summary>Más</summary>
            <dl>
              <div><dt>Código</dt><dd>${esc(a.id)}</dd></div>
              ${a.createdAt ? `<div><dt>Reservada</dt><dd>${new Date(a.createdAt).toLocaleString('es-DO', { timeZone: M.config.schedule.timeZone, dateStyle: 'medium', timeStyle: 'short' })}</dd></div>` : ''}
              ${p.depositUSD ? `<div><dt>Depósito PayPal</dt><dd>US$ ${esc(p.depositUSD)}${p.paypalCapture ? ` · ${esc(p.paypalCapture)}` : ''}</dd></div>` : ''}
              ${p.refundDetail ? `<div><dt>Reembolso</dt><dd>${esc(p.refundDetail)}</dd></div>` : ''}
              ${a.cancelledBy ? `<div><dt>Cancelada por</dt><dd>${esc(a.cancelledBy)}</dd></div>` : ''}
            </dl>
            <label class="note-l">Nota interna<textarea data-note="${esc(a.id)}" rows="2" maxlength="500" placeholder="Solo la ves tú">${esc(a.internalNote || '')}</textarea></label>
            <button type="button" class="act" data-op="nota" data-id="${esc(a.id)}">Guardar nota</button>
          </details>
          ${acts.length ? `<div class="appt-actions">${acts.join('')}</div>` : ''}
          ${ask}
        </div>
      </article>`;
  }

  function renderList(items) {
    const list = filtered(items);
    const days = st.view === 'day' ? [st.anchor] : [...new Set(list.map((a) => a.date))];
    if (!list.length) {
      const closed = st.view === 'day' && !M.Schedule.hoursFor(st.anchor);
      const msg = closed ? 'El estudio cierra este día.' : st.filter === 'activas' ? 'No hay reservas en este periodo.' : 'No hay reservas con este filtro.';
      $('ad-list').innerHTML = `<p class="empty">${msg}</p>`;
      return;
    }
    $('ad-list').innerHTML = days.map((key) => {
      const rows = list.filter((a) => a.date === key);
      const head = st.view === 'day' ? '' : `<h3 class="day-h"><button type="button" data-day="${key}">${cap(DAY_TITLE.format(utc(key)))}</button><span>${(() => { const n = rows.filter((a) => ACTIVE.includes(a.status)).length; return `${n} cita${n === 1 ? '' : 's'}`; })()}</span></h3>`;
      return `<div class="day-group">${head}${rows.length ? rows.map(card).join('') : '<p class="empty">Sin reservas este día.</p>'}</div>`;
    }).join('');
  }

  /* ---------- Gráficos (una serie, barras finas con detalle al pasar el cursor) ---------- */
  function barChart(el, data, opts) {
    const w = Math.max(240, el.clientWidth || 300), h = opts.height || 150;
    const pad = { t: 10, r: 6, b: 24, l: 26 };
    const max = Math.max(1, ...data.map((d) => d.value));
    const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const step = iw / data.length;
    const bw = Math.max(3, Math.min(22, step - 2));
    const y = (v) => pad.t + ih - (v / max) * ih;
    const every = Math.ceil(data.length / (opts.maxLabels || 10));
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="${esc(opts.label)}">`;
    ticks.forEach((t) => { svg += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${pad.l - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${t}</text>`; });
    data.forEach((d, i) => {
      const x = pad.l + i * step + (step - bw) / 2;
      const bh = (d.value / max) * ih;
      const r = Math.min(4, bw / 2, bh);
      if (d.value > 0) {
        svg += `<path class="bar${d.highlight ? ' is-hl' : ''}" d="M${x},${pad.t + ih} V${pad.t + ih - bh + r} Q${x},${pad.t + ih - bh} ${x + r},${pad.t + ih - bh} H${x + bw - r} Q${x + bw},${pad.t + ih - bh} ${x + bw},${pad.t + ih - bh + r} V${pad.t + ih} Z"/>`;
      }
      if (i % every === 0) svg += `<text x="${x + bw / 2}" y="${h - 6}" class="tick" text-anchor="middle">${esc(d.label)}</text>`;
      svg += `<rect class="hit" x="${pad.l + i * step}" y="${pad.t}" width="${step}" height="${ih}" data-tip="${esc(d.tip)}"/>`;
    });
    svg += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}" class="axis"/></svg>`;
    el.innerHTML = svg + (opts.empty && !data.some((d) => d.value) ? `<p class="chart-empty">${opts.empty}</p>` : '');
  }

  function renderCharts() {
    const items = st.items.filter((a) => ACTIVE.includes(a.status));
    const r = st.view === 'day' ? rangeFor('week', st.anchor) : rangeFor(st.view, st.anchor);
    const days = daysIn(r);
    barChart($('ad-chart-days'), days.map((key) => {
      const n = items.filter((a) => a.date === key).length;
      const lbl = st.view === 'month' ? String(M.parseKey(key).d) : WEEKDAY_SHORT.format(utc(key)).replace('.', '');
      return { label: lbl, value: n, highlight: key === st.anchor && st.view === 'day', tip: `${M.weekdayName(key)} ${M.dayMonth(key)} · ${n} cita${n === 1 ? '' : 's'}` };
    }), { label: 'Citas por día', maxLabels: st.view === 'month' ? 8 : 7, empty: 'Sin citas en este periodo.' });

    const inRange = items.filter((a) => a.date >= r.from && a.date <= r.to);
    const hours = [];
    for (let hr = 8; hr <= 19; hr++) hours.push(hr);
    const counts = hours.map((hr) => inRange.filter((a) => Number(hhmm(a.start).slice(0, 2)) === hr).length);
    const first = counts.findIndex((c) => c), last = counts.length - 1 - [...counts].reverse().findIndex((c) => c);
    const lo = first < 0 ? 2 : Math.min(first, 2), hi = first < 0 ? 9 : Math.max(last, 9);
    barChart($('ad-chart-hours'), hours.slice(lo, hi + 1).map((hr, i) => {
      const n = counts[lo + i];
      const label = `${((hr + 11) % 12) + 1}${hr < 12 ? 'a' : 'p'}`;
      return { label, value: n, tip: `${M.fmtTime12(`${String(hr).padStart(2, '0')}:00`)} · ${n} cita${n === 1 ? '' : 's'}` };
    }), { label: 'Citas por hora de inicio', empty: 'Sin citas en este periodo.' });

    // Servicios: cuántas veces y cuánto suman
    const agg = {};
    inRange.forEach((a) => (a.services || []).forEach((s) => { const k = s.name; agg[k] = agg[k] || { n: 0, rd: 0 }; agg[k].n++; agg[k].rd += s.price || 0; }));
    const rows = Object.entries(agg).sort((a, b) => b[1].n - a[1].n);
    const maxN = Math.max(1, ...rows.map(([, v]) => v.n));
    $('ad-services').innerHTML = rows.length ? rows.map(([name, v]) => `
      <div class="sb-row"><div class="sb-top"><span>${esc(name)}</span><span>${v.n} · ${M.fmtPrice(v.rd)}</span></div>
      <div class="sb-track"><span style="width:${(v.n / maxN) * 100}%"></span></div></div>`).join('') : '<p class="chart-empty">Sin servicios en este periodo.</p>';
  }

  /* Detalle al pasar el cursor por las barras */
  const tip = $('ad-tip');
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest && e.target.closest('.hit');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 12);
    tip.style.transform = `translate(${x}px, ${e.clientY - 36}px)`;
  });

  function toast(text) {
    const t = $('ad-toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  /* ---------- Eventos ---------- */
  document.querySelectorAll('.seg [data-view]').forEach((b) => b.addEventListener('click', () => { st.view = b.dataset.view; load(); }));
  $('ad-prev').addEventListener('click', () => { st.anchor = shift(-1); load(); });
  $('ad-next').addEventListener('click', () => { st.anchor = shift(1); load(); });
  $('ad-today').addEventListener('click', () => { st.anchor = M.todayKey(); load(); });
  $('ad-refresh').addEventListener('click', () => load(true));
  $('ad-filter').addEventListener('change', (e) => { st.filter = e.target.value; render(); });
  function shift(dir) {
    if (st.view === 'day') return addDays(st.anchor, dir);
    if (st.view === 'week') return addDays(st.anchor, dir * 7);
    const { y, m } = M.parseKey(st.anchor);
    const t = new Date(Date.UTC(y, m + dir, 1));
    return M.dateKey(t.getUTCFullYear(), t.getUTCMonth(), 1);
  }

  document.addEventListener('click', async (e) => {
    const day = e.target.closest('[data-day]');
    if (day) { st.anchor = day.dataset.day; st.view = 'day'; load(); return; }
    const b = e.target.closest('[data-op]');
    if (!b) return;
    const { op, id } = b.dataset;
    if (op === 'cancelar-ask') { st.openCancel = id; render(); return; }
    if (op === 'cancelar-close') { st.openCancel = null; render(); return; }
    const extra = {};
    if (op === 'cancelar') extra.refund = b.dataset.refund === '1';
    if (op === 'nota') { const ta = document.querySelector(`[data-note="${CSS.escape(id)}"]`); extra.note = ta ? ta.value : ''; }
    b.disabled = true;
    try {
      const res = await api.update(id, op, extra);
      st.items = st.items.map((a) => (a.id === id ? res.item : a));
      st.openCancel = null;
      render();
      toast({ saldoEfectivo: 'Saldo marcado como cobrado.', completar: 'Cita marcada como realizada.', noAsistio: 'Marcada como no asistió.', cancelar: 'Cita cancelada.', nota: 'Nota guardada.', reabrir: 'Cita reabierta.', saldoPendiente: 'Cobro deshecho.' }[op] || 'Guardado.');
    } catch (err) { b.disabled = false; toast(err.message); }
  });

  /* Bloquear horario */
  const dlg = $('ad-block'), bform = $('ad-block-form');
  $('ad-block-open').addEventListener('click', () => {
    bform.date.value = st.anchor; $('ad-block-msg').textContent = '';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  });
  $('ad-block-cancel').addEventListener('click', () => dlg.close());
  bform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { date: bform.date.value, from: bform.from.value, to: bform.to.value, reason: bform.reason.value.trim() };
    $('ad-block-save').disabled = true;
    try {
      const res = await api.block(data);
      st.items.push(res.item);
      dlg.close(); bform.reason.value = '';
      render(); toast('Horario bloqueado.');
    } catch (err) { $('ad-block-msg').textContent = err.message; }
    $('ad-block-save').disabled = false;
  });

  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (!$('ad-main').hidden) renderCharts(); }, 150); });

  /* ---------- Datos de ejemplo (solo admin.html?demo) ---------- */
  function demoApi() {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const names = ['Ana Pérez', 'Laura Martínez', 'Carolina Reyes', 'Paola Jiménez', 'Michelle Santos', 'Yarisa Gómez', 'Nicole Peña', 'Daniela Cruz', 'Sofía Taveras', 'Wendy Rosario'];
    const items = [];
    const today = M.todayKey();
    for (let i = -35; i <= 30; i++) {
      const key = addDays(today, i);
      const hrs = M.Schedule.hoursFor(key);
      if (!hrs) continue;
      const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      let t = toMin(hrs.open) + (rnd() < 0.5 ? 0 : 30);
      const n = Math.floor(rnd() * (i < 0 ? 5 : 4));
      for (let j = 0; j < n; j++) {
        const svcs = [M.services[Math.floor(rnd() * M.services.length)]];
        if (rnd() < 0.25) svcs.push(M.services[Math.floor(rnd() * M.services.length)]);
        const uniq = [...new Map(svcs.map((s) => [s.id, s])).values()];
        const minutes = uniq.reduce((a, s) => a + s.durationMinutes, 0);
        if (t + minutes > toMin(hrs.close)) break;
        const time = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
        const start = M.studioDate(key, time);
        const total = uniq.reduce((a, s) => a + s.price, 0);
        const dep = Math.round(total / 2);
        let status = i < 0 ? (rnd() < 0.9 ? 'completada' : 'no-asistio') : 'confirmada';
        if (rnd() < 0.08) status = 'cancelada';
        const name = names[Math.floor(rnd() * names.length)];
        const paidBal = status === 'completada' && rnd() < 0.92;
        items.push({
          id: `MJB-DEMO-${items.length + 1}`, status, date: key, time,
          start: start.toISOString(), end: new Date(start.getTime() + minutes * 60000).toISOString(),
          durationMinutes: minutes, totalPrice: total,
          services: uniq.map((s) => ({ id: s.id, name: s.name, price: s.price })), servicesText: uniq.map((s) => s.name).join(' + '),
          client: { name, phone: `809 555 ${String(1000 + Math.floor(rnd() * 8999))}`, email: `${name.split(' ')[0].toLowerCase()}@ejemplo.com`, notes: rnd() < 0.15 ? 'Piel sensible.' : '' },
          payment: { depositRD: dep, depositUSD: (Math.ceil((dep / 63) * 100) / 100).toFixed(2), depositPaid: true, balanceRD: total - dep, balanceStatus: paidBal ? 'pagado' : 'pendiente', balanceMethod: paidBal ? (rnd() < 0.7 ? 'efectivo' : 'paypal') : '', refund: status === 'cancelada' && rnd() < 0.6 ? 'reembolsado' : '' },
          createdAt: new Date(start.getTime() - 5 * 86400000).toISOString(), internalNote: '',
        });
        t += minutes + (rnd() < 0.5 ? 30 : 60);
      }
    }
    const later = addDays(today, 9);
    items.push({ id: 'BLQ-DEMO', status: 'bloqueo', date: later, time: '10:00', start: M.studioDate(later, '10:00').toISOString(), end: M.studioDate(later, '13:00').toISOString(), durationMinutes: 180, servicesText: 'Curso de actualización', client: {}, payment: {} });
    const wait = () => new Promise((r) => setTimeout(r, 250));
    return {
      async list(from, to) {
        await wait();
        return { ok: true, items: items.filter((a) => a.date >= from && a.date <= to).map((a) => JSON.parse(JSON.stringify(a))), settings: { usdRate: 63, depositPercent: 50, cancelHours: 24, paypalEnv: 'sandbox' } };
      },
      async update(id, op, extra) {
        await wait();
        const a = items.find((x) => x.id === id);
        const p = a.payment;
        if (op === 'completar') a.status = 'completada';
        if (op === 'noAsistio') a.status = 'no-asistio';
        if (op === 'reabrir') a.status = 'confirmada';
        if (op === 'saldoEfectivo') { p.balanceStatus = 'pagado'; p.balanceMethod = 'efectivo'; }
        if (op === 'saldoPendiente') { p.balanceStatus = 'pendiente'; p.balanceMethod = ''; }
        if (op === 'nota') a.internalNote = extra.note;
        if (op === 'cancelar') { a.status = 'cancelada'; if (extra.refund) p.refund = 'reembolsado'; a.cancelledBy = 'estudio'; }
        return { ok: true, item: JSON.parse(JSON.stringify(a)) };
      },
      async block(d) {
        await wait();
        const it = { id: `BLQ-${Date.now()}`, status: 'bloqueo', date: d.date, time: d.from, start: M.studioDate(d.date, d.from).toISOString(), end: M.studioDate(d.date, d.to).toISOString(), durationMinutes: 0, servicesText: d.reason || 'Bloqueado', client: {}, payment: {} };
        items.push(it);
        return { ok: true, item: it };
      },
    };
  }

  /* ---------- Inicio ---------- */
  if (DEMO) {
    const bn = $('ad-banner');
    bn.hidden = false;
    bn.textContent = 'Datos de ejemplo: nada de esto es real y los cambios se pierden al recargar.';
    enter();
    return;
  }
  let entered = false;
  showGate('');
  M.Auth.onChange((u) => {
    if (u && M.BookingAPI.enabled()) { if (!entered) { entered = true; enter(); } }
    else { entered = false; showGate(u && !M.BookingAPI.enabled() ? 'Falta conectar la hoja de reservas (booking.apiUrl).' : undefined); }
  });
  M.Auth.init();
})(window.MJB);
