/* MAJOBELLA · Dashboard: Agenda
   Vista por día, semana o mes; cobros; citas creadas a mano; reprogramar; bloqueos que se repiten. */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const WEEKDAY_SHORT = new Intl.DateTimeFormat('es', { timeZone: 'UTC', weekday: 'short' });
  const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const st = { view: window.matchMedia('(max-width: 720px)').matches ? 'day' : 'week', anchor: M.todayKey(), filter: 'activas', openCancel: null, openBlock: null };

  function rangeFor(view, anchor) {
    if (view === 'day') return { from: anchor, to: anchor };
    if (view === 'week') { const from = A.addDays(anchor, -((A.dow(anchor) + 6) % 7)); return { from, to: A.addDays(from, 6) }; }
    return A.monthRange(anchor);
  }
  function titleFor(view, r) {
    if (view === 'day') return A.dayTitle(r.from);
    if (view === 'month') return A.monthName(r.from);
    const a = M.parseKey(r.from), b = M.parseKey(r.to);
    return a.m === b.m ? `${a.d} – ${b.d} de ${M.monthTitle(b.y, b.m).split(' ')[0].toLowerCase()}` : `${M.dayMonth(r.from)} – ${M.dayMonth(r.to)}`;
  }

  /* Citas y bloqueos de un rango (los bloqueos se muestran como tarjetas) */
  function itemsIn(r) {
    const appts = A.data.items.filter((a) => a.date >= r.from && a.date <= r.to && a.status !== 'expirada');
    const blocks = A.blockIntervals(r.from, r.to).map((x) => ({
      id: x.block.id, virtual: true, block: x.block, status: 'bloqueo', date: x.date, time: x.block.horaDesde,
      start: x.start, end: x.end, servicesText: x.block.motivo, client: {}, payment: {},
    }));
    return appts.concat(blocks);
  }

  /* ---------- Horas libres para crear o mover una cita ---------- */
  A.freeSlots = (date, minutes, exceptId) => {
    const hrs = M.Schedule.hoursFor(date);
    if (!hrs || !date) return [];
    const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const step = M.config.schedule.slotStepMinutes || 30;
    const now = Date.now();
    const busy = A.data.items.filter((a) => a.id !== exceptId && (['confirmada', 'completada', 'no-asistio', 'bloqueo'].includes(a.status) || (a.status === 'retenida' && new Date(a.holdUntil).getTime() > now)))
      .map((a) => [new Date(a.start).getTime(), new Date(a.end).getTime()])
      .concat(A.blockIntervals(date, date).map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()]));
    const out = [];
    for (let t = toMin(hrs.open); t + minutes <= toMin(hrs.close); t += step) {
      const time = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      const s = M.studioDate(date, time).getTime(), e = s + minutes * 60000;
      out.push({ time, busy: busy.some(([bs, be]) => s < be && e > bs), past: s < now });
    }
    return out;
  };
  function slotChips(box, date, minutes, exceptId, input) {
    const slots = A.freeSlots(date, minutes, exceptId).filter((x) => !x.past);
    if (!date) { box.innerHTML = ''; return; }
    if (!M.Schedule.hoursFor(date)) { box.innerHTML = '<p class="hint">Ese día el estudio está cerrado. Puedes escribir la hora a mano.</p>'; return; }
    box.innerHTML = slots.length ? slots.map((s) => `<button type="button" class="slot-chip${s.busy ? ' is-busy' : ''}${input.value === s.time ? ' is-on' : ''}" data-time="${s.time}" ${s.busy ? 'title="Ocupado"' : ''}>${M.fmtTime12(s.time)}</button>`).join('') : '<p class="hint">No quedan horas ese día.</p>';
  }

  /* ---------- Render ---------- */
  function render() {
    const r = rangeFor(st.view, st.anchor);
    $('ag-title').textContent = titleFor(st.view, r);
    document.querySelectorAll('#ag-seg [data-view]').forEach((b) => { const on = b.dataset.view === st.view; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
    const items = itemsIn(r);
    renderKpis(items);
    renderMonth(items);
    renderList(items);
    renderCharts();
    const s = A.settingsMap();
    $('ag-settings').innerHTML = `Depósito ${esc(s.porcentajeDeposito || '50')}% · Tasa RD$ ${esc(s.tasaUSD || '63')} por US$ 1 · Reembolso con ${esc(s.horasCancelacion || '24')} h de aviso · PayPal ${A.data.paypalEnv === 'live' ? 'en vivo' : 'en modo de prueba'}. <button type="button" class="link" data-sec="ajustes">Cambiar en Ajustes</button>`;
  }

  function renderKpis(items) {
    const appts = items.filter((a) => a.status !== 'bloqueo');
    const active = appts.filter((a) => A.ACTIVE.includes(a.status));
    const done = appts.filter((a) => a.status === 'completada');
    const cancelled = appts.filter((a) => a.status === 'cancelada');
    const refunded = cancelled.filter((a) => a.payment && a.payment.refund === 'reembolsado');
    const due = A.sum(active.filter((a) => a.status !== 'no-asistio'), (a) => (a.payment && a.payment.balanceStatus !== 'pagado' ? a.payment.balanceRD : 0));
    const value = A.sum(active, (a) => a.totalPrice);
    const k = (label, v, sub) => `<div class="kpi"><p class="kpi-l">${label}</p><p class="kpi-v">${v}</p><p class="kpi-s">${sub}</p></div>`;
    $('ag-kpis').innerHTML = [
      k('Citas', active.length, `${done.length} realizada${done.length === 1 ? '' : 's'}`),
      k('Valor de las citas', A.money(value), 'servicios agendados'),
      k('Por cobrar', A.money(due), 'saldos al terminar la cita'),
      k('Cancelaciones', cancelled.length, `${refunded.length} con reembolso`),
    ].join('');
  }

  function renderMonth(items) {
    const box = $('ag-month');
    box.hidden = st.view !== 'month';
    if (st.view !== 'month') return;
    const r = rangeFor('month', st.anchor);
    const lead = (A.dow(r.from) + 6) % 7;
    const today = M.todayKey();
    let html = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span class="mg-dow">${d}</span>`).join('');
    for (let i = 0; i < lead; i++) html += '<span></span>';
    A.daysIn(r).forEach((key) => {
      const list = items.filter((a) => a.date === key);
      const n = list.filter((a) => A.ACTIVE.includes(a.status)).length;
      const blocked = list.some((a) => a.status === 'bloqueo');
      const open = !!M.Schedule.hoursFor(key);
      html += `<button type="button" class="mg-day${key === today ? ' is-today' : ''}${open ? '' : ' is-closed'}${n ? ' has' : ''}" data-day="${key}" aria-label="${M.weekdayName(key)} ${M.dayMonth(key)}: ${n} citas${blocked ? ', con bloqueo' : ''}">
        <span class="mg-n">${M.parseKey(key).d}</span>
        ${n ? `<span class="mg-c">${A.plural(n, 'cita')}</span>` : ''}${blocked ? '<span class="mg-b">Bloq.</span>' : ''}</button>`;
    });
    box.innerHTML = html;
  }

  function filtered(items) {
    return items.filter((a) => {
      if (st.filter === 'todas') return true;
      if (st.filter === 'canceladas') return a.status === 'cancelada';
      if (st.filter === 'saldo') return ['confirmada', 'completada'].includes(a.status) && a.payment && a.payment.balanceStatus !== 'pagado' && a.payment.balanceRD > 0;
      return a.status !== 'cancelada';
    }).sort((a, b) => a.start.localeCompare(b.start));
  }

  function blockText(b) {
    const hours = b.horaDesde === '00:00' && b.horaHasta === '23:59' ? 'todo el día' : `${M.fmtTime12(b.horaDesde)} – ${M.fmtTime12(b.horaHasta)}`;
    if (b.tipo === 'semanal') {
      const days = String(b.dias).split(',').map((d) => DAYS[Number(d)]).join(', ');
      return `Cada ${days.toLowerCase()}, ${hours}${b.fechaHasta ? ` · hasta ${A.shortDate(b.fechaHasta)}` : ''}`;
    }
    if (b.tipo === 'rango') return `Del ${A.shortDate(b.fechaDesde)} al ${A.shortDate(b.fechaHasta)}, ${hours}`;
    return `${A.shortDate(b.fechaDesde)}, ${hours}`;
  }
  A.blockText = blockText;

  function card(a) {
    const p = a.payment || {};
    const time = `${M.fmtTime12(A.hhmm(a.start))} – ${M.fmtTime12(A.hhmm(a.end))}`;
    if (a.status === 'bloqueo') {
      const repeats = a.block && a.block.tipo !== 'unico';
      const ask = st.openBlock === `${a.id}|${a.date}`;
      return `<article class="appt is-block"><div class="appt-time">${time}</div><div class="appt-body"><p class="appt-name">Bloqueado</p>
        <p class="appt-svc">${esc(a.servicesText || '')}${a.block ? ` · ${esc(blockText(a.block))}` : ''}</p>
        <div class="appt-actions">${ask
          ? `<span class="ask-t">${repeats ? 'Se quitan todas las repeticiones de este bloqueo.' : '¿Quitar este bloqueo?'}</span><button type="button" class="act act-dark" data-op="block-delete" data-id="${esc(a.id)}">Quitar</button><button type="button" class="act act-ghost" data-op="block-ask-close">Volver</button>`
          : `<button type="button" class="act" data-op="block-ask" data-id="${esc(a.id)}" data-date="${a.date}">Quitar bloqueo</button>`}</div></div></article>`;
    }
    const chips = [];
    if (p.discountRD > 0) chips.push(`<span class="pchip">Descuento ${A.money(p.discountRD)}${a.code ? ` · ${esc(a.code)}` : ''}</span>`);
    if (p.giftRD > 0) chips.push(`<span class="pchip">Tarjeta de regalo ${A.money(p.giftRD)}</span>`);
    if (p.depositRD > 0 && p.depositPaid) chips.push(p.refund === 'reembolsado' ? `<span class="pchip">Depósito ${A.money(p.depositRD)} reembolsado</span>` : `<span class="pchip is-ok">Depósito ${A.money(p.depositRD)} ✓ ${esc(A.methodLower(p.depositMethod))}</span>`);
    else if (a.status === 'retenida') chips.push('<span class="pchip">Pagando el depósito…</span>');
    else if (a.status !== 'cancelada' && !(p.depositRD > 0)) chips.push('<span class="pchip">Sin depósito</span>');
    if (a.status !== 'cancelada' && a.status !== 'retenida' && p.balanceRD > 0) {
      chips.push(p.balanceStatus === 'pagado'
        ? `<span class="pchip is-ok">Saldo ${A.money(p.balanceRD)} ✓ ${esc(A.methodLower(p.balanceMethod))}</span>`
        : `<span class="pchip is-due">Saldo ${A.money(p.balanceRD)} pendiente</span>`);
    }
    const acts = [];
    const act = (op, label, extra = '') => `<button type="button" class="act" data-op="${op}" data-id="${esc(a.id)}" ${extra}>${label}</button>`;
    if (['confirmada', 'completada'].includes(a.status) && p.balanceStatus !== 'pagado' && p.balanceRD > 0) { acts.push(act('saldoEfectivo', 'Saldo en efectivo')); acts.push(act('saldoTransferencia', 'Saldo por transferencia')); }
    if (p.balanceStatus === 'pagado' && ['efectivo', 'transferencia'].includes(p.balanceMethod)) acts.push(act('saldoPendiente', 'Deshacer cobro'));
    if (a.status === 'confirmada') { acts.push(act('completar', 'Marcar realizada')); acts.push(act('move', 'Reprogramar')); acts.push(act('noAsistio', 'No asistió')); acts.push(act('cancelar-ask', 'Cancelar…')); }
    if (a.status === 'completada' || a.status === 'no-asistio') acts.push(act('reabrir', 'Reabrir'));
    const ask = st.openCancel === a.id ? `
      <div class="cancel-ask"><p>¿Cancelar la cita de ${esc(a.client.name)}?${a.client.email ? ' Le avisamos por correo.' : ''}</p>
        ${p.depositRD > 0 && p.depositPaid && p.refund !== 'reembolsado' ? `<button type="button" class="act act-dark" data-op="cancelar" data-refund="1" data-id="${esc(a.id)}">Cancelar y ${p.depositMethod === 'paypal' ? 'reembolsar' : 'devolver'} ${A.money(p.depositRD)}</button>` : ''}
        <button type="button" class="act" data-op="cancelar" data-refund="0" data-id="${esc(a.id)}">Cancelar sin reembolso</button>
        <button type="button" class="act act-ghost" data-op="cancelar-close" data-id="${esc(a.id)}">Volver</button></div>` : '';
    const wa = A.waLink(a.client.phone, `Hola ${(a.client.name || '').split(' ')[0]}, te escribimos de MAJOBELLA sobre tu cita del ${M.weekdayName(a.date).toLowerCase()} ${M.dayMonth(a.date)} a las ${M.fmtTime12(a.time)}.`);
    return `
      <article class="appt st-${esc(a.status)}">
        <div class="appt-time">${time}<span class="appt-dur">${M.fmtDurationShort(a.durationMinutes)}</span></div>
        <div class="appt-body">
          <div class="appt-top">
            <button type="button" class="appt-name" data-client="${esc(a.clientKey || A.clientKey(a.client.email, a.client.phone, a.client.name))}">${esc(a.client.name)}</button>
            <span class="pill st-${esc(a.status)}">${A.STATUS[a.status] || esc(a.status)}</span>
          </div>
          <p class="appt-svc">${esc(a.servicesText || (a.services || []).map((s) => s.name).join(' + '))} · ${A.money(a.totalPrice)}${a.createdBy === 'estudio' ? ' · <span class="tag">Creada a mano</span>' : ''}${a.rescheduledFrom ? ' · <span class="tag">Reprogramada</span>' : ''}</p>
          <p class="appt-contact">${a.client.phone ? `<a href="tel:${esc(String(a.client.phone).replace(/[^\d+]/g, ''))}">${esc(a.client.phone)}</a>` : ''}${wa ? ` · <a href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${a.client.email ? ` · <a href="mailto:${esc(a.client.email)}">${esc(a.client.email)}</a>` : ''}</p>
          ${chips.length ? `<div class="appt-pay">${chips.join('')}</div>` : ''}
          ${a.client.notes ? `<p class="appt-note">Nota de la clienta: ${esc(a.client.notes)}</p>` : ''}
          <details class="appt-more"><summary>Más</summary>
            <dl>
              <div><dt>Código</dt><dd>${esc(a.id)}</dd></div>
              ${a.createdAt ? `<div><dt>Reservada</dt><dd>${new Date(a.createdAt).toLocaleString('es-DO', { timeZone: M.config.schedule.timeZone, dateStyle: 'medium', timeStyle: 'short' })}</dd></div>` : ''}
              ${a.origin ? `<div><dt>Nos conoció por</dt><dd>${esc(a.origin)}${a.channel && a.channel !== 'dashboard' ? ` · ${esc(a.channel)}` : ''}</dd></div>` : ''}
              ${a.rescheduledFrom ? `<div><dt>Horario anterior</dt><dd>${esc(a.rescheduledFrom)}</dd></div>` : ''}
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
    const days = st.view === 'day' ? [st.anchor] : [...new Set(list.map((a) => a.date))].sort();
    if (!list.length) {
      const closed = st.view === 'day' && !M.Schedule.hoursFor(st.anchor);
      $('ag-list').innerHTML = `<p class="empty">${closed ? 'El estudio cierra este día.' : st.filter === 'activas' ? 'No hay reservas en este periodo.' : 'No hay reservas con este filtro.'}</p>`;
      return;
    }
    $('ag-list').innerHTML = days.map((key) => {
      const rows = list.filter((a) => a.date === key);
      const n = rows.filter((a) => A.ACTIVE.includes(a.status)).length;
      const head = st.view === 'day' ? '' : `<h3 class="day-h"><button type="button" data-day="${key}">${A.dayTitle(key)}</button><span>${A.plural(n, 'cita')}</span></h3>`;
      return `<div class="day-group">${head}${rows.length ? rows.map(card).join('') : '<p class="empty">Sin reservas este día.</p>'}</div>`;
    }).join('');
  }

  function renderCharts() {
    const items = A.data.items.filter((a) => A.ACTIVE.includes(a.status));
    const r = st.view === 'day' ? rangeFor('week', st.anchor) : rangeFor(st.view, st.anchor);
    A.barChart($('ag-chart-days'), A.daysIn(r).map((key) => {
      const n = items.filter((a) => a.date === key).length;
      const lbl = st.view === 'month' ? String(M.parseKey(key).d) : WEEKDAY_SHORT.format(A.utc(key)).replace('.', '');
      return { label: lbl, value: n, highlight: key === st.anchor && st.view === 'day', tip: `${M.weekdayName(key)} ${M.dayMonth(key)} · ${A.plural(n, 'cita')}` };
    }), { label: 'Citas por día', maxLabels: st.view === 'month' ? 8 : 7, empty: 'Sin citas en este periodo.' });

    const inRange = items.filter((a) => a.date >= r.from && a.date <= r.to);
    const hours = [];
    for (let hr = 8; hr <= 19; hr++) hours.push(hr);
    const counts = hours.map((hr) => inRange.filter((a) => Number(A.hhmm(a.start).slice(0, 2)) === hr).length);
    const first = counts.findIndex((c) => c), last = counts.length - 1 - [...counts].reverse().findIndex((c) => c);
    const lo = first < 0 ? 2 : Math.min(first, 2), hi = first < 0 ? 9 : Math.max(last, 9);
    A.barChart($('ag-chart-hours'), hours.slice(lo, hi + 1).map((hr, i) => {
      const n = counts[lo + i];
      return { label: `${((hr + 11) % 12) + 1}${hr < 12 ? 'a' : 'p'}`, value: n, tip: `${M.fmtTime12(`${String(hr).padStart(2, '0')}:00`)} · ${A.plural(n, 'cita')}` };
    }), { label: 'Citas por hora de inicio', empty: 'Sin citas en este periodo.' });

    const agg = {};
    inRange.forEach((a) => (a.services || []).forEach((s) => { agg[s.name] = agg[s.name] || { n: 0, rd: 0 }; agg[s.name].n++; agg[s.name].rd += s.price || 0; }));
    $('ag-services').innerHTML = A.hbars(Object.entries(agg).sort((a, b) => b[1].n - a[1].n).map(([name, v]) => ({ label: name, value: v.n, text: `${v.n} · ${A.money(v.rd)}` })), 'Sin servicios en este periodo.');
  }

  /* ---------- Acciones de las tarjetas ---------- */
  async function onClick(e) {
    if (A.current !== 'agenda') return;
    const day = e.target.closest('[data-day]');
    if (day) { st.anchor = day.dataset.day; st.view = 'day'; render(); return; }
    const b = e.target.closest('[data-op]');
    if (!b || !b.closest('#sec-agenda')) return;
    const { op, id } = b.dataset;
    if (op === 'cancelar-ask') { st.openCancel = id; render(); return; }
    if (op === 'cancelar-close') { st.openCancel = null; render(); return; }
    if (op === 'block-ask') { st.openBlock = `${id}|${b.dataset.date}`; render(); return; }
    if (op === 'block-ask-close') { st.openBlock = null; render(); return; }
    if (op === 'move') { openMove(id); return; }
    if (op === 'block-delete') {
      await A.busy(b, async () => {
        try {
          await A.call('adminDeleteBlock', { id });
          A.remove('blocks', id);
          const legacy = A.data.items.find((x) => x.id === id);
          if (legacy) legacy.status = 'cancelada';
          st.openBlock = null; render(); A.toast('Bloqueo quitado.');
        } catch (err) { A.toast(err.message); }
      });
      return;
    }
    const extra = {};
    if (op === 'cancelar') extra.refund = b.dataset.refund === '1';
    if (op === 'nota') { const ta = document.querySelector(`[data-note="${CSS.escape(id)}"]`); extra.note = ta ? ta.value : ''; }
    await A.busy(b, async () => {
      try {
        const res = await A.call('adminUpdate', { id, op, ...extra });
        A.upsert('items', res.item);
        st.openCancel = null;
        render();
        A.toast({ saldoEfectivo: 'Saldo cobrado en efectivo.', saldoTransferencia: 'Saldo cobrado por transferencia.', completar: 'Cita marcada como realizada.', noAsistio: 'Marcada como no asistió.', cancelar: 'Cita cancelada.', nota: 'Nota guardada.', reabrir: 'Cita reabierta.', saldoPendiente: 'Cobro deshecho.' }[op] || 'Guardado.');
      } catch (err) { A.toast(err.message); }
    });
  }

  /* ---------- Nueva cita ---------- */
  function openNew(prefill = {}) {
    const f = $('nc-form');
    f.reset();
    $('nc-msg').textContent = ''; $('nc-force').hidden = true;
    $('nc-services').innerHTML = A.services().map((s) => `<label class="chk"><input type="checkbox" name="svc" value="${esc(s.id)}" data-min="${s.durationMinutes}" data-price="${s.price}"><span>${esc(s.name)} <em>${M.fmtDurationShort(s.durationMinutes)} · ${A.money(s.price)}</em></span></label>`).join('');
    $('nc-clients').innerHTML = A.clientsIndex().map((c) => `<option value="${esc(c.name)}">${esc([c.phone, c.email].filter(Boolean).join(' · '))}</option>`).join('');
    f.date.value = prefill.date || (st.view === 'day' ? st.anchor : M.todayKey());
    if (prefill.client) { f.name.value = prefill.client.name || ''; f.phone.value = prefill.client.phone || ''; f.email.value = prefill.client.email || ''; }
    updateNew();
    A.open('dlg-new');
  }
  A.openNewAppointment = openNew;
  function newMinutes() { return [...$('nc-form').querySelectorAll('[name=svc]:checked')].reduce((t, i) => t + Number(i.dataset.min), 0); }
  function updateNew(fromServices) {
    const f = $('nc-form');
    const checked = [...f.querySelectorAll('[name=svc]:checked')];
    const total = checked.reduce((t, i) => t + Number(i.dataset.price), 0);
    if (fromServices || !f.total.value) f.total.value = checked.length ? total : '';
    $('nc-dur').textContent = checked.length ? M.fmtDuration(newMinutes()) : '—';
    slotChips($('nc-slots'), f.date.value, newMinutes() || 30, null, f.time);
    f.notify.disabled = !f.email.value.trim();
    if (!f.email.value.trim()) f.notify.checked = false;
  }
  async function saveNew(force) {
    const f = $('nc-form');
    const services = [...f.querySelectorAll('[name=svc]:checked')].map((i) => i.value);
    const payload = {
      services, date: f.date.value, time: f.time.value,
      client: { name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), notes: f.notes.value.trim() },
      totalRD: f.total.value, depositRD: f.deposit.value, depositMethod: f.depositMethod.value,
      origen: f.origen.value, notify: f.notify.checked, force: !!force,
    };
    if (!services.length) { $('nc-msg').textContent = 'Elige al menos un servicio.'; return; }
    if (!payload.client.name) { $('nc-msg').textContent = 'Escribe el nombre de la clienta.'; return; }
    if (!payload.time) { $('nc-msg').textContent = 'Elige la hora.'; return; }
    await A.busy($('nc-save'), async () => {
      try {
        const res = await A.call('adminCreate', payload);
        A.upsert('items', res.item);
        A.close('dlg-new');
        st.anchor = res.item.date; if (st.view === 'month') st.view = 'day';
        render();
        A.toast('Cita creada. Ese horario ya se ve ocupado en la web.');
      } catch (err) {
        $('nc-msg').textContent = err.message;
        $('nc-force').hidden = !(err.data && err.data.conflict);
      }
    });
  }

  /* ---------- Reprogramar ---------- */
  let moving = null;
  function openMove(id) {
    moving = A.data.items.find((x) => x.id === id);
    if (!moving) return;
    const f = $('mv-form');
    f.reset();
    $('mv-msg').textContent = ''; $('mv-force').hidden = true;
    $('mv-current').innerHTML = `<strong>${esc(moving.client.name)}</strong> · ${esc(moving.servicesText)}<br>Ahora: ${A.dayTitle(moving.date)}, ${M.fmtTime12(moving.time)}`;
    f.date.value = moving.date;
    f.notify.disabled = !moving.client.email;
    f.notify.checked = !!moving.client.email;
    slotChips($('mv-slots'), f.date.value, moving.durationMinutes, moving.id, f.time);
    A.open('dlg-move');
  }
  async function saveMove(force) {
    const f = $('mv-form');
    if (!f.date.value || !f.time.value) { $('mv-msg').textContent = 'Elige la nueva fecha y hora.'; return; }
    await A.busy($('mv-save'), async () => {
      try {
        const res = await A.call('adminReschedule', { id: moving.id, date: f.date.value, time: f.time.value, notify: f.notify.checked, force: !!force });
        A.upsert('items', res.item);
        A.close('dlg-move');
        st.anchor = res.item.date;
        render();
        A.toast(f.notify.checked ? 'Cita movida. Le avisamos por correo.' : 'Cita movida.');
      } catch (err) {
        $('mv-msg').textContent = err.message;
        $('mv-force').hidden = !(err.data && err.data.conflict);
      }
    });
  }

  /* ---------- Bloqueos ---------- */
  function renderBlocks() {
    const list = (A.data.blocks || []).slice().sort((a, b) => (a.fechaDesde || '').localeCompare(b.fechaDesde || ''));
    const legacy = A.data.items.filter((a) => a.status === 'bloqueo' && a.date >= M.todayKey());
    const today = M.todayKey();
    const rows = list.filter((b) => b.tipo === 'semanal' ? (!b.fechaHasta || b.fechaHasta >= today) : (b.fechaHasta || b.fechaDesde) >= today);
    $('bl-list').innerHTML = rows.length || legacy.length ? rows.map((b) => `
      <li><div><p class="bl-t">${esc(b.motivo || 'Bloqueado')}</p><p class="bl-s">${esc(blockText(b))}${b.tipo === 'semanal' ? ' · <span class="tag">Se repite</span>' : ''}</p></div>
      <button type="button" class="act" data-bl-del="${esc(b.id)}">Quitar</button></li>`).join('') + legacy.map((a) => `
      <li><div><p class="bl-t">${esc(a.servicesText || 'Bloqueado')}</p><p class="bl-s">${A.shortDate(a.date)}, ${M.fmtTime12(A.hhmm(a.start))} – ${M.fmtTime12(A.hhmm(a.end))}</p></div>
      <button type="button" class="act" data-bl-del="${esc(a.id)}">Quitar</button></li>`).join('')
      : '<li class="empty">No hay bloqueos activos.</li>';
  }
  function openBlocks() {
    const f = $('bl-form');
    f.reset();
    f.fechaDesde.value = st.view === 'day' ? st.anchor : M.todayKey();
    $('bl-msg').textContent = '';
    syncBlockForm();
    renderBlocks();
    A.open('dlg-blocks');
  }
  function syncBlockForm() {
    const f = $('bl-form');
    const tipo = f.tipo.value;
    $('bl-hasta-wrap').hidden = tipo === 'unico';
    $('bl-hasta-label').textContent = tipo === 'semanal' ? 'Hasta (opcional)' : 'Hasta';
    $('bl-days').hidden = tipo !== 'semanal';
    $('bl-hours').hidden = f.allday.checked;
  }
  async function saveBlock(e) {
    e.preventDefault();
    const f = $('bl-form');
    const payload = {
      tipo: f.tipo.value, fechaDesde: f.fechaDesde.value, fechaHasta: f.tipo.value === 'unico' ? f.fechaDesde.value : f.fechaHasta.value,
      horaDesde: f.allday.checked ? '00:00' : f.horaDesde.value, horaHasta: f.allday.checked ? '23:59' : f.horaHasta.value,
      dias: [...f.querySelectorAll('[name=dia]:checked')].map((i) => i.value).join(','), motivo: f.motivo.value.trim(),
    };
    await A.busy($('bl-save'), async () => {
      try {
        const res = await A.call('adminBlock', payload);
        A.data.blocks.push(res.block);
        f.motivo.value = '';
        $('bl-msg').textContent = '';
        renderBlocks(); render();
        A.toast('Bloqueo guardado. Esas horas ya se ven ocupadas en la web.');
      } catch (err) { $('bl-msg').textContent = err.message; }
    });
  }

  /* ---------- Inicio ---------- */
  A.sections.agenda = {
    render,
    init() {
      document.querySelectorAll('#ag-seg [data-view]').forEach((b) => b.addEventListener('click', () => { st.view = b.dataset.view; render(); }));
      const shift = (dir) => {
        if (st.view === 'day') return A.addDays(st.anchor, dir);
        if (st.view === 'week') return A.addDays(st.anchor, dir * 7);
        return A.shiftMonth(st.anchor, dir);
      };
      $('ag-prev').addEventListener('click', () => { st.anchor = shift(-1); render(); });
      $('ag-next').addEventListener('click', () => { st.anchor = shift(1); render(); });
      $('ag-today').addEventListener('click', () => { st.anchor = M.todayKey(); render(); });
      $('ag-filter').addEventListener('change', (e) => { st.filter = e.target.value; render(); });
      $('ag-new').addEventListener('click', () => openNew());
      $('ag-blocks').addEventListener('click', openBlocks);
      document.addEventListener('click', onClick);

      // Nueva cita
      const nf = $('nc-form');
      nf.addEventListener('change', (e) => { if (e.target.name === 'svc') updateNew(true); else if (e.target.name === 'date') updateNew(); });
      nf.addEventListener('input', (e) => {
        if (e.target.name === 'email') updateNew();
        if (e.target.name === 'name') {
          const c = A.clientsIndex().find((x) => x.name === e.target.value);
          if (c) { nf.phone.value = c.phone || ''; nf.email.value = c.email || ''; updateNew(); }
        }
        if (e.target.name === 'time') slotChips($('nc-slots'), nf.date.value, newMinutes() || 30, null, nf.time);
      });
      $('nc-slots').addEventListener('click', (e) => { const b = e.target.closest('[data-time]'); if (b) { nf.time.value = b.dataset.time; slotChips($('nc-slots'), nf.date.value, newMinutes() || 30, null, nf.time); } });
      nf.addEventListener('submit', (e) => { e.preventDefault(); saveNew(false); });
      $('nc-force').addEventListener('click', () => saveNew(true));

      // Reprogramar
      const mf = $('mv-form');
      mf.addEventListener('change', (e) => { if (e.target.name === 'date' && moving) slotChips($('mv-slots'), mf.date.value, moving.durationMinutes, moving.id, mf.time); });
      $('mv-slots').addEventListener('click', (e) => { const b = e.target.closest('[data-time]'); if (b) { mf.time.value = b.dataset.time; slotChips($('mv-slots'), mf.date.value, moving.durationMinutes, moving.id, mf.time); } });
      mf.addEventListener('submit', (e) => { e.preventDefault(); saveMove(false); });
      $('mv-force').addEventListener('click', () => saveMove(true));

      // Bloqueos
      const bf = $('bl-form');
      bf.addEventListener('change', syncBlockForm);
      bf.addEventListener('submit', saveBlock);
      $('bl-list').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-bl-del]');
        if (!b) return;
        await A.busy(b, async () => {
          try {
            await A.call('adminDeleteBlock', { id: b.dataset.blDel });
            A.remove('blocks', b.dataset.blDel);
            const legacy = A.data.items.find((x) => x.id === b.dataset.blDel);
            if (legacy) legacy.status = 'cancelada';
            renderBlocks(); render(); A.toast('Bloqueo quitado.');
          } catch (err) { A.toast(err.message); }
        });
      });
    },
  };
})(window.MJB);
