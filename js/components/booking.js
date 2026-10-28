/* MAJOBELLA · Reserva: servicio → fecha → hora → datos → depósito con PayPal
   - Los días y horas ya reservados se ven en gris para todas (con o sin sesión).
   - "Primer horario disponible" elige fecha y hora en un toque.
   - La cita se aparta pagando el depósito de cada servicio (lo define el estudio en el dashboard) con PayPal;
     el saldo se paga al terminar, en efectivo o con PayPal desde "Citas".
   - Sin backend configurado, la reserva se envía como solicitud por WhatsApp (modo temporal). */
(function (M) {
  const WEEK = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const WEEK_FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const SHORT = new Intl.DateTimeFormat('es', { timeZone: 'UTC', weekday: 'short' });
  const CLIENT_KEY = 'mjb.client.v1';
  const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;

  const loadClient = () => { try { return JSON.parse(localStorage.getItem(CLIENT_KEY)); } catch (e) { return null; } };
  const saveClient = (c) => { try { localStorage.setItem(CLIENT_KEY, JSON.stringify(c)); } catch (e) { /* sin almacenamiento */ } };
  const forgetClient = () => { try { localStorage.removeItem(CLIENT_KEY); } catch (e) { /* sin almacenamiento */ } };

  /* Preparación y evento de calendario de una cita (también los usa Mis Citas, en otra página) */
  M.prepFor = (ids) => {
    const seen = new Set();
    return ids.map((id) => M.serviceById[id]).filter(Boolean)
      .flatMap((s) => (s.prep || []).map((p) => ({ s: s.name, p })))
      .filter(({ p }) => (seen.has(p) ? false : seen.add(p)));
  };

  M.calendarEvent = function (a, pending) {
    const names = a.services.map((s) => s.name).join(' + ');
    const prep = M.prepFor(a.services.map((s) => s.id)).map(({ p }) => `- ${p}`);
    const payLine = a.payment ? `Depósito pagado: ${M.fmtPrice(a.payment.depositRD)}. Saldo al terminar: ${M.fmtPrice(a.payment.balanceRD)}.` : '';
    return {
      title: `Cita en MAJOBELLA · ${names}`,
      start: new Date(a.start), end: new Date(a.end),
      description: [
        `Servicio: ${names}`, `Duración: ${M.fmtDuration(a.durationMinutes)}`, `Precio: ${M.fmtPrice(a.totalPrice)}`,
        pending ? 'Estado: solicitud enviada, pendiente de confirmación.' : 'Estado: confirmada.',
        payLine,
        a.id && !String(a.id).startsWith('web-') ? `Código de reserva: ${a.id}` : '',
        prep.length ? `\nAntes de tu cita:\n${prep.join('\n')}` : '',
      ].filter(Boolean).join('\n'),
      location: M.config.contact.address || 'MAJOBELLA Beauty Studio',
    };
  };

  M.initBooking = function () {
    const $ = (id) => document.getElementById(id);
    const svcBox = $('bk-services'), calTitle = $('bk-month'), calGrid = $('bk-grid');
    const prevBtn = $('bk-prev'), nextBtn = $('bk-next'), dateOut = $('bk-date-label');
    const quick = $('bk-quickdays'), calToggle = $('bk-cal-toggle'), calendar = $('bk-calendar');
    const fastest = $('bk-fastest'), fastestLabel = $('bk-fastest-label'), fastestBtn = $('bk-fastest-btn');
    const slotsBox = $('bk-slots'), slotsMsg = $('bk-slots-msg');
    const form = $('bk-form'), confirmBtn = $('bk-confirm'), missing = $('bk-missing');
    const modeNote = $('bk-mode'), result = $('bk-result'), policy = $('bk-policy');
    const pay = { panel: $('bk-pay'), info: $('bk-pay-info'), timer: $('bk-pay-timer'), box: $('bk-paypal'), msg: $('bk-pay-msg'), back: $('bk-pay-back'), methods: $('bk-pay-methods'), pp: $('bk-pp'), tf: $('bk-tf') };
    const steps = [...document.querySelectorAll('.booking-flow .step')];
    const signinHint = $('bk-signin-hint'), remember = $('bk-remember'), savedNote = $('bk-saved-note');
    const sum = { svc: $('sum-service'), date: $('sum-date'), time: $('sum-time'), dur: $('sum-duration'), price: $('sum-price'), dep: $('sum-deposit'), bal: $('sum-balance') };
    const P = M.config.policies || {};
    const PAY = M.config.payments;
    const API = M.BookingAPI;

    const t0 = M.parseKey(M.todayKey());
    let view = { y: t0.y, m: t0.m };
    let slotReq = 0, fastReq = 0, firstSlot = null;
    let hold = null, holdTimer = null, paying = false, takenNotice = false;
    let payMethod = 'paypal';
    let consentPayload = [];

    /* ---- Modo de reserva ---- */
    let canPayPal = false, canTransfer = false, mode = 'none', sandbox = false;
    function refreshPaymentMode() {
      canPayPal = M.PayPal.configured();
      canTransfer = M.Transfer.enabled();
      mode = API.enabled()
      ? (canPayPal || canTransfer ? 'pay' : 'paysoon')
      : (M.WhatsApp.isConfigured() ? 'request' : 'none');
    document.querySelectorAll('[data-pay-only]').forEach((n) => { n.hidden = mode !== 'pay'; });
    confirmBtn.textContent = mode === 'pay' ? 'Confirmar y pagar mi abono' : mode === 'request' ? 'Enviar solicitud' : 'Confirmar cita';
      sandbox = PAY.paypalEnv === 'sandbox';
    modeNote.innerHTML = {
      pay: `El abono de tu reserva se valida al pagar. ${canPayPal ? 'Con PayPal la confirmación es automática. ' : ''}${canTransfer ? 'Por transferencia, el estudio confirma después de revisar el comprobante. ' : ''}El saldo restante se paga el día de la cita.${sandbox && canPayPal ? ' <strong>Modo de prueba: sin cobros reales.</strong>' : ''}`,
      paysoon: 'Los pagos en línea se están activando. Si tienes dudas, escríbenos por WhatsApp.',
      request: 'La reserva con depósito en línea se activa pronto. Por ahora tu cita se envía como solicitud y te confirmamos por WhatsApp.',
      none: 'Reserva en línea pendiente de activar.',
    }[mode];
    }
    refreshPaymentMode();
    function renderPolicy() {
      const items = M.totals().items;
      const label = items.length ? M.depositPctLabel(items) : null;
      const none = items.length && M.depositRatio(items) === 0;
      const text = [
        mode === 'pay' && none ? 'Este servicio no requiere depósito: tu cita se confirma al instante y pagas al terminar.' : '',
        mode === 'pay' && !none ? `Para reservar tu cita, abonas ${label ? `el ${label}` : 'el importe indicado según el servicio'}. El saldo restante se paga el día de tu visita, en efectivo, transferencia o PayPal.` : '',
        mode === 'pay' && !none && P.changeHours ? `Con ${P.changeHours} horas o más de aviso puedes cambiar la fecha desde Mis Citas o cancelar y te devolvemos el depósito.` : '',
        mode !== 'pay' && P.changeHours ? `Puedes cambiar o cancelar hasta ${P.changeHours} horas antes.` : '',
        P.arriveEarlyMinutes ? `Te recomendamos llegar ${P.arriveEarlyMinutes} minutos antes.` : '',
      ].filter(Boolean).join(' ');
      policy.innerHTML = `${M.escapeHtml(text)} Al reservar aceptas los <a href="terminos.html" target="_blank">términos</a> y la <a href="cancelacion.html" target="_blank">política de cancelación</a>. <a href="privacidad.html" target="_blank">Privacidad</a>`;
    }
    renderPolicy();

    /* ---- 1. Servicios · jerarquía real del catálogo público ---- */
    function renderServiceChoices() {
      const categories = Array.isArray(M.serviceCategories) && M.serviceCategories.length
        ? M.serviceCategories : [...new Set(M.services.map(s => s.category || 'Servicios'))].map(name => ({ id: name, name }));
      const groups = M.serviceGroups || [];
      const selected = new Set(M.state.selected);
      const option = s => `<label class="bk-service-choice">
        <input type="checkbox" value="${M.escapeHtml(s.id)}"${selected.has(s.id) ? ' checked' : ''}>
        <span class="bk-service-content"><strong>${M.escapeHtml(s.name)}</strong>
          <small>${M.fmtDurationShort(s.durationMinutes)} · ${s.priceFrom ? 'Desde ' : ''}${M.fmtPrice(Number(s.price) || 0)}</small></span>
        <span class="bk-service-indicator" aria-hidden="true"></span>
      </label>`;
      svcBox.innerHTML = categories.map(cat => {
        const items = M.services.filter(s => s.categoryId === cat.id || (!s.categoryId && s.category === cat.name));
        if (!items.length) return '';
        const chosen = items.filter(s => selected.has(s.id)).length;
        const parents = groups.filter(g => g.categoryId === cat.id && items.some(s => s.parentId === g.id));
        const parentIds = new Set(parents.map(g => g.id));
        const direct = items.filter(s => !s.parentId || !parentIds.has(s.parentId));
        return `<details class="bk-service-category"${chosen ? ' open' : ''}>
          <summary class="bk-category-head">
            <span class="bk-category-copy"><strong>${M.escapeHtml(cat.name)}</strong>
              <small>${items.length} ${items.length === 1 ? 'opción' : 'opciones'}</small></span>
            <span class="bk-category-status" data-bk-selected>${chosen ? chosen + ' seleccionada' + (chosen !== 1 ? 's' : '') : 'Ver servicios'}</span>
            <span class="bk-accordion-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div class="bk-category-content">
            ${parents.map(g => {
              const children = items.filter(s => s.parentId === g.id);
              const active = children.some(s => selected.has(s.id));
              return `<details class="bk-service-group"${active ? ' open' : ''}>
                <summary class="bk-service-group-head"><span>${M.escapeHtml(g.name)}</span><span class="bk-accordion-chevron" aria-hidden="true">⌄</span></summary>
                ${g.description ? `<p>${M.escapeHtml(g.description)}</p>` : ''}
                <div class="bk-service-options">${children.map(option).join('')}</div>
              </details>`;
            }).join('')}
            ${direct.length ? `<div class="bk-service-options">${direct.map(option).join('')}</div>` : ''}
          </div>
        </details>`;
      }).join('') || '<p class="bk-service-none">Pronto estarán disponibles nuestros servicios. Escríbenos para recibir información.</p>';
    }
    function syncServiceChoiceCounts() {
      svcBox.querySelectorAll('.bk-service-category').forEach(cat => {
        const amount = cat.querySelectorAll('input:checked').length;
        const counter = cat.querySelector('[data-bk-selected]');
        if (counter) counter.textContent = amount ? amount + ' seleccionada' + (amount === 1 ? '' : 's') : 'Ver servicios';
      });
    }
    renderServiceChoices();
    svcBox.addEventListener('change', e => {
      if (e.target.matches('input[type="checkbox"]')) M.toggleService(e.target.value, 'booking');
    });

    /* ---- 2. Fecha ---- */
    const minutesNow = () => M.totals().minutes || M.config.schedule.slotStepMinutes;

    function nextOpenDays(n) {
      const out = [];
      for (let i = 0; i <= M.config.schedule.maxDaysAhead && out.length < n; i++) {
        const d = new Date(Date.UTC(t0.y, t0.m, t0.d + i));
        const key = M.dateKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        if (M.Schedule.isOpenDay(key)) out.push({ key, i });
      }
      return out;
    }
    function dayLabel({ key, i }) {
      if (i === 0) return 'Hoy';
      if (i === 1) return 'Mañana';
      const { y, m, d } = M.parseKey(key);
      const w = SHORT.format(Date.UTC(y, m, d)).replace('.', '');
      return w.charAt(0).toUpperCase() + w.slice(1);
    }
    function renderQuick() {
      const min = minutesNow();
      quick.innerHTML = nextOpenDays(6).map((day) => {
        const { d } = M.parseKey(day.key);
        const full = API.dayStatus(day.key, min) === 'full';
        const sel = day.key === M.state.dateKey;
        return `<button type="button" class="qday${sel ? ' is-selected' : ''}${full ? ' is-full' : ''}" data-key="${day.key}" aria-pressed="${sel}" ${full ? 'disabled' : ''} aria-label="${M.weekdayName(day.key)} ${M.dayMonth(day.key)}${full ? ', completo' : ''}">
          <span class="qd-w">${dayLabel(day)}</span><span class="qd-d">${d}</span>${full ? '<span class="qd-full">Completo</span>' : ''}</button>`;
      }).join('');
    }
    quick.addEventListener('click', (e) => {
      const b = e.target.closest('.qday');
      if (b && !b.disabled) M.set({ dateKey: b.dataset.key, time: null }, 'booking-date');
    });
    calToggle.addEventListener('click', () => {
      const open = calendar.hidden;
      calendar.hidden = !open;
      calToggle.setAttribute('aria-expanded', String(open));
      calToggle.textContent = open ? 'Ocultar calendario' : 'Ver más fechas';
      if (open && !M.reduceMotion()) gsap.from(calendar, { opacity: 0, y: -8, duration: 0.4, ease: 'power2.out' });
    });

    function renderCalendar() {
      calTitle.textContent = M.monthTitle(view.y, view.m);
      const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
      const lead = (first + 6) % 7;
      const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
      let html = WEEK.map((d, i) => `<span class="cal-dow" aria-hidden="true" title="${WEEK_FULL[i]}">${d}</span>`).join('');
      for (let i = 0; i < lead; i++) html += '<span class="cal-pad"></span>';
      const today = M.todayKey();
      const min = minutesNow();
      for (let d = 1; d <= days; d++) {
        const key = M.dateKey(view.y, view.m, d);
        const status = API.dayStatus(key, min);
        const ok = status === 'open' || status === 'unknown';
        const sel = key === M.state.dateKey;
        html += `<button type="button" class="cal-day${sel ? ' is-selected' : ''}${key === today ? ' is-today' : ''}${status === 'full' ? ' is-full' : ''}" data-key="${key}" ${ok ? '' : 'disabled'} aria-pressed="${sel}" aria-label="${M.weekdayName(key)} ${M.dayMonth(key)}${status === 'full' ? ', completo' : ok ? '' : ', no disponible'}">${d}</button>`;
      }
      calGrid.innerHTML = html;
      const cur = view.y * 12 + view.m, minM = t0.y * 12 + t0.m;
      const maxD = new Date(Date.UTC(t0.y, t0.m, t0.d + M.config.schedule.maxDaysAhead));
      prevBtn.disabled = cur <= minM;
      nextBtn.disabled = cur >= maxD.getUTCFullYear() * 12 + maxD.getUTCMonth();
    }
    prevBtn.addEventListener('click', () => { view = view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 }; renderCalendar(); });
    nextBtn.addEventListener('click', () => { view = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 }; renderCalendar(); });
    calGrid.addEventListener('click', (e) => {
      const b = e.target.closest('.cal-day');
      if (b && !b.disabled) M.set({ dateKey: b.dataset.key, time: null }, 'booking-date');
    });

    /* Primer horario disponible para la duración elegida */
    async function findFastest() {
      const t = M.totals();
      firstSlot = null;
      if (!t.items.length) { fastest.hidden = true; return; }
      const req = ++fastReq;
      fastest.hidden = false;
      fastestLabel.textContent = 'Buscando…';
      fastestBtn.disabled = true;
      for (const day of nextOpenDays(21)) {
        let res;
        try { res = await API.availability(day.key, t.minutes); } catch (e) { break; }
        if (req !== fastReq) return;
        if (res.slots.length) { firstSlot = { key: day.key, time: res.slots[0], i: day.i }; break; }
      }
      if (req !== fastReq) return;
      if (!firstSlot) { fastestLabel.textContent = API.busyError() ? 'No pudimos consultar la agenda' : 'Sin horarios en las próximas semanas'; return; }
      const when = firstSlot.i === 0 ? 'Hoy' : firstSlot.i === 1 ? 'Mañana' : `${M.weekdayName(firstSlot.key)} ${M.dayMonth(firstSlot.key)}`;
      fastestLabel.textContent = `${when}, ${M.fmtTime12(firstSlot.time)}`;
      fastestBtn.disabled = false;
    }
    fastestBtn.addEventListener('click', () => {
      if (!firstSlot) return;
      M.set({ dateKey: firstSlot.key, time: firstSlot.time }, 'booking-fast');
      guide('#step-datos');
    });

    /* ---- 3. Horas (las reservadas se ven en gris) ---- */
    async function renderSlots() {
      const { dateKey } = M.state;
      const t = M.totals();
      if (!t.items.length) { slotsBox.innerHTML = ''; slotsMsg.textContent = 'Elige primero un servicio: la duración define las horas disponibles.'; return; }
      if (!dateKey) { slotsBox.innerHTML = ''; slotsMsg.textContent = 'Elige un día para ver las horas disponibles.'; return; }
      const req = ++slotReq;
      if (!slotsBox.children.length) slotsMsg.textContent = 'Buscando horas disponibles…';
      let res;
      try { res = await API.availability(dateKey, t.minutes); }
      catch (err) { if (req === slotReq) { slotsBox.innerHTML = ''; slotsMsg.textContent = `No pudimos consultar la agenda. Intenta de nuevo en unos minutos. (Detalle: ${err.message})`; } return; }
      if (req !== slotReq) return;
      // Si la hora elegida acaba de ocuparse, se libera la selección
      if (M.state.time && !res.slots.includes(M.state.time) && !hold) { takenNotice = true; M.set({ time: null }, 'booking-taken'); return; }
      if (!res.all.length) { slotsBox.innerHTML = ''; slotsMsg.textContent = 'Ese día ya no quedan horas para esta duración. Prueba con otro día o usa "Primer horario disponible".'; return; }
      slotsMsg.textContent = takenNotice ? 'La hora que habías elegido acaba de reservarse. Elige otra, por favor.'
        : res.slots.length ? '' : 'Ese día ya está completo para esta duración. Prueba con otro día o usa "Primer horario disponible".';
      takenNotice = false;
      const groups = { 'Mañana': [], 'Tarde': [] };
      res.all.forEach((s) => (parseInt(s.time, 10) < 12 ? groups['Mañana'] : groups['Tarde']).push(s));
      const anyBusy = res.all.some((s) => s.busy);
      slotsBox.innerHTML = Object.entries(groups).filter(([, v]) => v.length).map(([label, v]) => `
        <div class="slot-group">
          <p class="slot-label">${label}</p>
          <div class="slot-row">${v.map((s) => {
            const sel = s.time === M.state.time;
            return `<button type="button" class="slot${sel ? ' is-selected' : ''}${s.busy ? ' is-busy' : ''}" data-time="${s.time}" aria-pressed="${sel}" ${s.busy ? `disabled aria-label="${M.fmtTime12(s.time)}, reservado"` : ''}>${M.fmtTime12(s.time)}</button>`;
          }).join('')}</div>
        </div>`).join('') + (anyBusy ? '<p class="slot-legend"><span class="sl-box" aria-hidden="true"></span>En gris: horarios ya reservados</p>' : '');
    }
    slotsBox.addEventListener('click', (e) => {
      const b = e.target.closest('.slot');
      if (!b || b.disabled) return;
      M.set({ time: b.dataset.time }, 'booking-slot');
      if (!valid.name() || !valid.phone() || !valid.email()) guide('#step-datos');
    });

    function guide(sel) {
      if (!isNarrow()) return;
      setTimeout(() => M.scrollTo(sel), 250);
    }

    /* ---- 4. Datos ---- */
    const V = M.Validate;
    const fields = { first: $('bk-first'), last: $('bk-last'), phone: $('bk-phone'), email: $('bk-email'), notes: $('bk-notes') };
    const valid = {
      first: () => !V.namePart(fields.first.value, 'nombre'),
      last: () => !V.namePart(fields.last.value, 'apellido'),
      phone: () => V.phone(fields.phone.value).ok,
      email: () => V.email(fields.email.value),
    };
    valid.name = () => valid.first() && valid.last();
    const fullName = () => V.fullName(fields.first.value, fields.last.value);
    V.bindName(fields.first); V.bindName(fields.last); V.bindPhone(fields.phone);
    Object.values(fields).forEach((f) => f.addEventListener('input', () => { closePay(); renderSummary(); }));
    Object.entries(valid).forEach(([k, fn]) => {
      if (!fields[k]) return;
      fields[k].addEventListener('blur', () => fields[k].closest('.field').classList.toggle('has-error', !!fields[k].value && !fn()));
      fields[k].addEventListener('input', () => { if (fn()) fields[k].closest('.field').classList.remove('has-error'); });
    });
    function fillName(c) {
      const sp = c.firstName ? { first: c.firstName, last: c.lastName || '' } : V.splitName(c.name);
      fields.first.value = sp.first || ''; fields.last.value = sp.last || '';
    }

    const saved = loadClient();
    if (saved) {
      fillName(saved);
      fields.phone.value = saved.phone || '';
      fields.email.value = saved.email || '';
      savedNote.hidden = false;
    }
    $('bk-forget').addEventListener('click', () => {
      forgetClient();
      Object.values(fields).forEach((f) => { f.value = ''; });
      savedNote.hidden = true;
      renderSummary();
    });

    function renderSignin(u) {
      if (u) {
        signinHint.innerHTML = `<p>Reservando como <strong>${M.escapeHtml(u.name || u.email)}</strong> · ${M.escapeHtml(u.email)}</p>`;
        if (!fields.first.value.trim() && !fields.last.value.trim()) fillName({ firstName: u.firstName || V.splitName(u.name).first, lastName: u.lastName || V.splitName(u.name).last });
        if (!fields.email.value.trim()) fields.email.value = u.email || '';
      } else {
        signinHint.innerHTML = '<p>¿Ya eres clienta? <button type="button" class="link-inline" data-open-auth>Inicia sesión</button> y completamos tus datos. También puedes reservar como invitada.</p>';
      }
      renderSummary();
    }
    M.Auth.onChange(renderSignin);

    /* ---- Resumen ---- */
    function missingList() {
      const out = [];
      if (!M.state.selected.length) out.push('un servicio');
      if (!M.state.dateKey) out.push('el día');
      if (!M.state.time) out.push('la hora');
      if (!valid.first()) out.push('tu nombre');
      if (!valid.last()) out.push('tu apellido');
      if (!valid.phone()) out.push('tu teléfono');
      if (!valid.email()) out.push('tu correo');
      return out;
    }
    const endTime = (hhmm, minutes) => {
      const [h, m] = hhmm.split(':').map(Number);
      const t = h * 60 + m + minutes;
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    };

    function renderSummary() {
      const t = M.totals();
      const st = M.state;
      sum.svc.textContent = t.items.length ? t.items.map((s) => s.name).join(' + ') : '—';
      sum.date.textContent = st.dateKey ? `${M.weekdayName(st.dateKey)}, ${M.dayMonth(st.dateKey)}` : '—';
      sum.time.textContent = st.time ? `${M.fmtTime12(st.time)} – ${M.fmtTime12(endTime(st.time, t.minutes))}` : '—';
      sum.dur.textContent = t.minutes ? M.fmtDuration(t.minutes) : '—';
      const pr = M.Pricing.current(t.items);
      const from = t.hasFrom ? 'Desde ' : '';
      sum.price.innerHTML = t.items.length
        ? (pr.discountRD > 0 ? `<s>${M.fmtPrice(pr.subtotalRD)}</s> ${from}${M.fmtPrice(pr.totalRD)}` : from + M.fmtPrice(pr.totalRD))
        : '—';
      $('sum-disc-row').hidden = !(t.items.length && pr.discountRD > 0);
      $('sum-discount').innerHTML = pr.discountRD > 0 ? `−${M.fmtPrice(pr.discountRD)}${pr.promoName ? `<small>${M.escapeHtml(pr.promoName)}</small>` : ''}` : '—';
      $('sum-gift-row').hidden = !(t.items.length && pr.giftAppliedRD > 0);
      $('sum-gift-label').textContent = pr.giftKind === 'bono' ? 'Paquete' : 'Tarjeta de regalo';
      $('sum-gift').innerHTML = pr.giftAppliedRD > 0 ? `−${M.fmtPrice(pr.giftAppliedRD)}` : '—';
      if (mode === 'pay') {
        sum.dep.innerHTML = t.items.length ? (pr.depositRD > 0 ? `${M.fmtPrice(pr.depositRD)}<small>${canPayPal ? `${M.fmtUSD(pr.depositUSD)} con PayPal${canTransfer ? ' o RD$ por transferencia' : ''}` : 'por transferencia'}</small>` : `${M.fmtPrice(0)}<small>${pr.giftAppliedRD > 0 ? (pr.giftKind === 'bono' ? 'cubierto con tu paquete' : 'cubierto con tu tarjeta de regalo') : 'no requiere depósito'}</small>`) : '—';
        sum.bal.innerHTML = t.items.length ? `${from}${M.fmtPrice(pr.balanceRD)}<small>efectivo, transferencia o PayPal</small>` : '—';
        confirmBtn.textContent = t.items.length && pr.depositRD <= 0 ? (pr.giftAppliedRD > 0 ? (pr.giftKind === 'bono' ? 'Confirmar con mi paquete' : 'Confirmar con tarjeta de regalo') : 'Confirmar cita') : 'Confirmar y pagar mi abono';
        renderPolicy();
      }
      const miss = missingList();
      missing.textContent = miss.length ? `Falta ${miss.length > 1 ? miss.slice(0, -1).join(', ') + ' y ' + miss.slice(-1) : miss[0]}.` : (pay.panel.hidden ? 'Todo listo.' : '');
      confirmBtn.disabled = !!miss.length || mode === 'none' || mode === 'paysoon';
      const done = [!!t.items.length, !!st.dateKey, !!st.time, valid.name() && valid.phone() && valid.email()];
      steps.forEach((s, i) => s.classList.toggle('is-done', !!done[i]));
    }

    function appointment() {
      const t = M.totals();
      const start = M.studioDate(M.state.dateKey, M.state.time);
      const end = new Date(start.getTime() + t.minutes * 60000);
      return {
        services: t.items.map((s) => ({ id: s.id, name: s.name, price: s.price, durationMinutes: s.durationMinutes })),
        date: M.state.dateKey, time: M.state.time,
        start: start.toISOString(), end: end.toISOString(),
        durationMinutes: t.minutes, totalPrice: t.price, currency: M.config.currency.symbol,
        client: { name: fullName(), firstName: V.properName(fields.first.value), lastName: V.properName(fields.last.value), phone: V.phone(fields.phone.value).value, email: fields.email.value.trim().toLowerCase(), notes: fields.notes.value.trim(), birthday: birthday() },
        origen: $('bk-origen').value, consents: consentPayload,
      };
    }

    function showResult(a, kind, waLink) {
      const evt = M.calendarEvent(a, kind === 'request');
      const g = M.CalendarLinks.googleUrl(evt);
      const prep = M.prepFor(a.services.map((s) => s.id));
      const p = a.payment;
      result.hidden = false;
      result.innerHTML = `
        <p class="result-title">${kind === 'paid' ? '¡Listo! Tu cita está confirmada.' : kind === 'transfer' ? '¡Recibimos tu comprobante!' : 'Tu solicitud está lista para enviar.'}</p>
        <p class="result-text">${kind === 'transfer'
          ? `Tu horario del ${M.weekdayName(a.date).toLowerCase()} ${M.dayMonth(a.date)} a las ${M.fmtTime12(a.time)} queda apartado. Te confirmamos la cita por correo en cuanto veamos el depósito (normalmente el mismo día). Puedes ver su estado en Mis Citas.`
          : kind === 'paid'
          ? `Te esperamos el ${M.weekdayName(a.date).toLowerCase()} ${M.dayMonth(a.date)} a las ${M.fmtTime12(a.time)}. ${p.depositRD > 0 ? `Recibimos tu depósito de ${M.fmtPrice(p.depositRD)} (${M.fmtUSD(p.depositUSD)}).` : (p.giftRD > 0 ? 'Tu tarjeta de regalo cubrió el depósito.' : '')} ${p.balanceRD > 0 ? `Al terminar pagas ${M.fmtPrice(p.balanceRD)} en efectivo, transferencia o PayPal.` : 'Tu cita ya está pagada.'} Te enviamos la confirmación a ${M.escapeHtml(a.client.email)}.`
          : 'Envía el mensaje que se abrió en WhatsApp y MAJOBELLA te responderá para confirmar tu cita.'}</p>
        ${kind !== 'request' ? `<p class="result-code">Código de reserva <strong>${M.escapeHtml(a.id)}</strong></p>` : ''}
        ${prep.length ? `<div class="result-prep"><p class="rp-title">Para tu cita</p><ul>${prep.map(({ p: x }) => `<li>${M.escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
        <div class="result-actions">
          <a class="btn btn-line" href="${g}" target="_blank" rel="noopener">Google Calendar</a>
          <button type="button" class="btn btn-line" id="bk-ics">Apple / Outlook (.ics)</button>
          ${waLink ? `<a class="btn btn-quiet" href="${waLink}" target="_blank" rel="noopener">Abrir WhatsApp otra vez</a>` : ''}
          <a class="btn btn-quiet" href="citas.html">Ver mis citas</a>
          ${M.config.contact.mapsUrl ? `<a class="btn btn-quiet" href="${M.escapeHtml(M.config.contact.mapsUrl)}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}
        </div>`;
      $('bk-ics').addEventListener('click', () => M.CalendarLinks.downloadICS(evt));
      if (!M.reduceMotion()) gsap.from(result, { opacity: 0, y: 14, duration: 0.9, ease: 'power2.out' });
      if (isNarrow()) setTimeout(() => result.scrollIntoView({ behavior: M.reduceMotion() ? 'auto' : 'smooth', block: 'center' }), 200);
    }

    function rememberClient(a) {
      if (remember.checked) { saveClient({ name: a.client.name, firstName: a.client.firstName, lastName: a.client.lastName, phone: a.client.phone, email: a.client.email, birthday: a.client.birthday || '' }); savedNote.hidden = false; }
      else forgetClient();
    }

    /* ---- 5. Pago del depósito ---- */
    const sig = () => JSON.stringify([M.state.selected, M.state.dateKey, M.state.time, fields.first.value, fields.last.value, fields.phone.value, fields.email.value]);

    function payMessage(text, tone) {
      pay.msg.textContent = text || '';
      pay.msg.className = `pay-msg${tone ? ` is-${tone}` : ''}`;
    }

    function stopTimer() { clearInterval(holdTimer); holdTimer = null; pay.timer.hidden = true; }
    function startTimer(el) {
      stopTimer();
      const out = el || pay.timer;
      out.hidden = false;
      const tick = () => {
        if (!hold) return stopTimer();
        const left = Math.max(0, new Date(hold.expiresAt).getTime() - Date.now());
        const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
        out.textContent = hold.transfer
          ? `Tu horario está apartado por ${mm}:${String(ss).padStart(2, '0')}. Transfiere y sube el comprobante antes de que termine.`
          : `Te apartamos este horario por ${mm}:${String(ss).padStart(2, '0')} mientras pagas.`;
        if (!left) {
          const wasTransfer = hold.transfer;
          hold = null; stopTimer();
          if (wasTransfer) { pay.methods.hidden = !(canPayPal && canTransfer); pay.tf.innerHTML = ''; renderTransfer(); }
          payMessage(wasTransfer ? 'Se acabó el tiempo y el horario se liberó. Si ya transferiste, sube el comprobante desde Mis Citas o escríbenos por WhatsApp.' : 'Se acabó el tiempo para pagar y el horario se liberó. Puedes intentarlo de nuevo.', 'warn');
          API.refreshBusy(true).catch(() => {});
        }
      };
      tick();
      holdTimer = setInterval(tick, 1000);
    }

    function releaseHold() {
      if (!hold) return Promise.resolve();
      const done = API.release(hold.id, hold.manageToken);
      hold = null; stopTimer();
      return done;
    }

    function closePay(force) {
      if (pay.panel.hidden || paying) return;
      if (hold && hold.transfer && !force) return; // el horario sigue apartado mientras transfiere
      releaseHold();
      pay.panel.hidden = true;
      pay.box.innerHTML = '';
      pay.tf.innerHTML = '';
      payMessage('');
      confirmBtn.hidden = false;
    }

    async function openPay() {
      pay.methods.hidden = !(canPayPal && canTransfer);
      confirmBtn.hidden = true;
      pay.panel.hidden = false;
      payMessage('');
      setMethod(canPayPal ? (payMethod === 'transferencia' && canTransfer ? 'transferencia' : 'paypal') : 'transferencia');
      renderSummary();
      if (!M.reduceMotion()) gsap.from(pay.panel, { opacity: 0, y: 10, duration: 0.5, ease: 'power2.out' });
    }

    async function mountPayPal() {
      const t = M.totals();
      const dep = M.Pricing.current(t.items);
      const base = dep.totalRD - (dep.giftAppliedRD || 0);
      const pctLabel = M.depositPctLabel(t.items);
      pay.info.innerHTML = `Hoy pagas <strong>${M.fmtUSD(dep.depositUSD)}</strong> (${M.fmtPrice(dep.depositRD)}${pctLabel ? `, el ${pctLabel} de ${M.fmtPrice(base)}` : ` de ${M.fmtPrice(base)}`}). Al terminar pagas ${M.fmtPrice(dep.balanceRD)} en efectivo, transferencia o PayPal. <span class="pay-rate">Tasa: RD$ ${PAY.usdRate} por US$ 1. ${PAY.fxAutomatic ? '<a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Referencia de mercado · ExchangeRate-API</a>' : 'Establecida por MAJOBELLA.'}</span>`;
      pay.box.innerHTML = '';
      const opened = sig();
      try {
        await M.PayPal.render(pay.box, {
          createOrder: async () => {
            payMessage('');
            if (hold && hold.sig === opened && new Date(hold.expiresAt).getTime() - Date.now() > 60000) return hold.orderId;
            releaseHold();
            try {
              const a = appointment();
              const res = await API.hold(a, M.Auth.token);
              hold = { ...res, sig: opened, appt: a };
              startTimer();
              if (Number(res.depositUSD) !== Number(dep.depositUSD)) {
                pay.info.innerHTML = `Hoy pagas <strong>${M.fmtUSD(res.depositUSD)}</strong> (${M.fmtPrice(res.depositRD)}). Al terminar pagas ${M.fmtPrice(res.balanceRD)} en efectivo o con PayPal.`;
              }
              return res.orderId;
            } catch (err) {
              payMessage(err.message, 'error');
              API.refreshBusy(true).catch(() => {});
              throw err;
            }
          },
          onApprove: async (orderId) => {
            if (!hold) { payMessage('El horario se liberó antes de completar el pago. No se te cobró; inténtalo de nuevo.', 'error'); return; }
            paying = true;
            payMessage('Confirmando tu pago…');
            const h = hold;
            try {
              const res = await API.capture(h.id, orderId);
              const ap = res.appointment;
              stopTimer(); hold = null;
              const record = { ...h.appt, ...ap, client: { ...h.appt.client, ...ap.client }, token: h.manageToken, remote: true, createdAt: new Date().toISOString() };
              M.Appointments.add(record);
              rememberClient(record);
              paying = false;
              pay.panel.hidden = true; pay.box.innerHTML = ''; confirmBtn.hidden = false;
              M.Pricing.clear('gift'); M.Pricing.clear('code'); M.Pricing.loyal = false; $('bk-loyal').hidden = true; renderCodeTags(); codeMsg.textContent = '';
              M.set({ time: null }, 'booked'); // ese horario ya es suyo; se libera la selección
              showResult(record, 'paid');
              API.refreshBusy(true).catch(() => {});
            } catch (err) {
              paying = false;
              stopTimer(); hold = null;
              payMessage(err.message, 'error');
              API.refreshBusy(true).catch(() => {});
            }
          },
          onCancel: () => {
            payMessage('Cerraste PayPal sin pagar. Tu horario quedó libre; puedes intentarlo otra vez.', 'warn');
            releaseHold().then(() => API.refreshBusy(true)).catch(() => {});
          },
          onError: () => {
            releaseHold();
            if (!pay.msg.textContent) payMessage('PayPal no pudo procesar el pago. No se te cobró; intenta de nuevo o usa otra tarjeta.', 'error');
          },
        });
      } catch (err) {
        payMessage(err.message, 'error');
      }
    }
    pay.back.addEventListener('click', () => {
      if (hold && hold.transfer && !confirm('Se liberará el horario que te apartamos. Si ya transferiste, mejor sube el comprobante. ¿Cambiar la cita?')) return;
      closePay(true); renderSummary();
    });

    /* ---- Forma de pago: PayPal o transferencia ---- */
    function setMethod(m) {
      if (hold && !hold.transfer && m === 'transferencia') releaseHold();
      payMethod = m;
      pay.methods.querySelectorAll('[data-method]').forEach((b) => { const on = b.dataset.method === m; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
      pay.pp.hidden = m !== 'paypal';
      pay.tf.hidden = m !== 'transferencia';
      payMessage('');
      if (m === 'transferencia') renderTransfer();
      else mountPayPal();
    }
    pay.methods.addEventListener('click', (e) => { const b = e.target.closest('[data-method]'); if (b && !(hold && hold.transfer)) setMethod(b.dataset.method); });
    M.Transfer.bindCopy(pay.tf);

    function renderTransfer() {
      const dep = M.Pricing.current(M.totals().items);
      const amount = hold && hold.transfer ? hold.depositRD : dep.depositRD;
      if (!(hold && hold.transfer)) {
        pay.tf.innerHTML = `
          <p class="pay-info">Hoy transfieres <strong>${M.fmtPrice(amount)}</strong> en pesos, sin conversión. Al terminar pagas ${M.fmtPrice(dep.balanceRD)}.</p>
          <ol class="tf-steps"><li>Te apartamos el horario por ${M.Transfer.minutes()} minutos.</li><li>Transfieres desde tu banco a la cuenta del estudio.</li><li>Subes la foto del comprobante y te confirmamos la cita.</li></ol>
          <button type="button" class="btn btn-primary" id="bk-tf-hold">Apartar mi horario y ver las cuentas</button>`;
        $('bk-tf-hold').addEventListener('click', holdTransfer);
        return;
      }
      pay.tf.innerHTML = `
        <p class="pay-timer" id="bk-tf-timer" aria-live="polite"></p>
        <p class="tf-amount">Transfiere <b>${M.fmtPrice(amount)}</b><button type="button" class="tf-copy" data-copy="${amount}">Copiar monto</button></p>
        ${M.Transfer.accountsHtml(hold.accounts || M.Transfer.accounts(), { name: 'bk-tf-acc' })}
        <div class="tf-upload">
          <label class="tf-file"><input type="file" id="bk-tf-file" accept="image/*,application/pdf"><span id="bk-tf-file-l">Subir la foto del comprobante</span></label>
          <img class="tf-preview" id="bk-tf-prev" alt="" hidden>
          <label class="field tf-ref"><span>Número de referencia <em>(opcional)</em></span><input id="bk-tf-ref" maxlength="60" inputmode="text" autocomplete="off"></label>
          <button type="button" class="btn btn-primary" id="bk-tf-send" disabled>Enviar comprobante</button>
          <p class="tf-later">¿Aún no transfieres? Puedes subirlo después desde <a href="citas.html">Mis Citas</a> antes de que termine el tiempo.</p>
        </div>`;
      let file = null;
      $('bk-tf-file').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        $('bk-tf-send').disabled = true;
        if (!f) return;
        try {
          payMessage('Preparando el comprobante…');
          file = await M.Transfer.prepare(f);
          $('bk-tf-file-l').textContent = f.name;
          const prev = $('bk-tf-prev'); prev.hidden = !file.preview; if (file.preview) prev.src = file.preview;
          $('bk-tf-send').disabled = false;
          payMessage('');
        } catch (err) { file = null; payMessage(err.message, 'error'); }
      });
      $('bk-tf-send').addEventListener('click', async () => {
        if (!file || !hold) return;
        const btn = $('bk-tf-send');
        btn.disabled = true; btn.textContent = 'Enviando…'; paying = true;
        try {
          const h = hold;
          const res = await API.transferProof(h.id, { token: h.manageToken }, file, M.Transfer.pickedAccount(pay.tf, 'bk-tf-acc'), $('bk-tf-ref').value.trim());
          const ap = res.appointment;
          M.Appointments.update(h.id, { status: ap.status, payment: ap.payment });
          stopTimer(); hold = null; paying = false;
          pay.panel.hidden = true; pay.tf.innerHTML = ''; confirmBtn.hidden = false;
          M.Pricing.clear('gift'); M.Pricing.clear('code'); M.Pricing.loyal = false; $('bk-loyal').hidden = true; renderCodeTags(); codeMsg.textContent = '';
          M.set({ time: null }, 'booked');
          showResult(M.Appointments.get(h.id) || { ...h.appt, ...ap }, 'transfer');
          API.refreshBusy(true).catch(() => {});
        } catch (err) {
          paying = false;
          btn.disabled = false; btn.textContent = 'Enviar comprobante';
          payMessage(err.message, 'error');
        }
      });
      startTimer($('bk-tf-timer'));
    }

    async function holdTransfer() {
      const btn = $('bk-tf-hold');
      btn.disabled = true; btn.textContent = 'Apartando tu horario…';
      payMessage('');
      try {
        const a = appointment();
        const res = await API.hold(a, M.Auth.token, { method: 'transferencia' });
        if (res.confirmed) { confirmedWithoutPayment(a, res); return; }
        hold = { ...res, appt: a };
        // Queda en "Mis Citas" para subir el comprobante después
        const record = { ...a, id: res.id, status: 'retenida', token: res.manageToken, remote: true, createdAt: new Date().toISOString(),
          payment: { depositRD: res.depositRD, balanceRD: res.balanceRD, depositPaid: false, depositMethod: 'transferencia', transfer: { deadline: res.expiresAt, proof: false } } };
        M.Appointments.add(record);
        rememberClient(record);
        pay.methods.hidden = true;
        renderTransfer();
        API.refreshBusy(true).catch(() => {});
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Apartar mi horario y ver las cuentas';
        payMessage(err.message, 'error');
        API.refreshBusy(true).catch(() => {});
      }
    }

    /* La tarjeta de regalo cubre todo el depósito: se confirma sin PayPal */
    async function confirmWithGift(a) {
      confirmBtn.disabled = true;
      const label = confirmBtn.textContent;
      confirmBtn.textContent = 'Confirmando…';
      try {
        const res = await API.hold(a, M.Auth.token);
        if (!res.confirmed) throw new Error('No se pudo confirmar la cita. Intenta de nuevo.');
        confirmedWithoutPayment(a, res);
      } catch (err) {
        result.hidden = false;
        result.innerHTML = `<p class="result-title">No pudimos confirmar la cita.</p><p class="result-text">${M.escapeHtml(err.message)}</p>`;
      } finally {
        confirmBtn.textContent = label;
        renderSummary();
      }
    }

    function confirmedWithoutPayment(a, res) {
      const ap = res.appointment;
      const record = { ...a, ...ap, client: { ...a.client, ...ap.client }, token: res.manageToken, remote: true, createdAt: new Date().toISOString() };
      M.Appointments.add(record);
      rememberClient(record);
      pay.panel.hidden = true; confirmBtn.hidden = false;
      M.Pricing.clear('gift'); M.Pricing.clear('code'); M.Pricing.loyal = false; $('bk-loyal').hidden = true; renderCodeTags(); codeMsg.textContent = '';
      M.set({ time: null }, 'booked');
      showResult(record, 'paid');
      API.refreshBusy(true).catch(() => {});
    }

    /* ---- Código de descuento o tarjeta de regalo ---- */
    const codeInput = $('bk-code'), codeMsg = $('bk-code-msg'), codeTags = $('bk-code-tags');
    function renderCodeTags() {
      const tags = [];
      if (M.Pricing.code) tags.push(`<span class="ctag">Código ${M.escapeHtml(M.Pricing.code)}<button type="button" data-clear="code" aria-label="Quitar código">×</button></span>`);
      if (M.Pricing.gift) tags.push(`<span class="ctag">${/^PAQ-/.test(M.Pricing.gift) ? 'Paquete' : 'Tarjeta'} ${M.escapeHtml(M.Pricing.gift)}<button type="button" data-clear="gift" aria-label="Quitar">×</button></span>`);
      codeTags.innerHTML = tags.join('');
    }
    async function applyCode() {
      const v = codeInput.value.trim().toUpperCase().replace(/\s+/g, '');
      const items = M.totals().items;
      if (!v) return;
      if (!items.length) { codeMsg.textContent = 'Elige primero tus servicios.'; return; }
      codeMsg.textContent = 'Revisando…';
      try {
        const res = await API.checkCode(items.map((s) => s.id), v, v);
        const pr = res.pricing;
        if (pr.giftStatus === 'ok' && pr.giftKind === 'bono') {
          M.Pricing.gift = v;
          codeMsg.textContent = `Paquete aplicado: ${pr.bonoName}. Te quedan ${pr.bonoLeft} ${pr.bonoLeft === 1 ? 'sesión' : 'sesiones'} (esta incluida).`;
        } else if (pr.giftStatus === 'notApplicable') {
          codeMsg.textContent = 'Ese paquete es para otro servicio. Añade ese servicio a tu cita para usarlo.';
        } else if (pr.giftStatus === 'ok') {
          M.Pricing.gift = v;
          codeMsg.textContent = `Tarjeta de regalo aplicada: ${M.fmtPrice(Math.min(pr.giftBalanceRD, pr.totalRD))} de ${M.fmtPrice(pr.giftBalanceRD)} disponibles.`;
        } else if (pr.codeStatus === 'ok') {
          M.Pricing.code = v;
          codeMsg.textContent = `Código aplicado${pr.promoName ? `: ${pr.promoName}` : ''}.`;
        } else if (pr.codeStatus === 'notBetter') {
          M.Pricing.code = v; // se usará si al cambiar los servicios pasa a ser el mejor descuento
          codeMsg.textContent = 'Tu cita ya tiene un descuento mayor; siempre se aplica el mejor.';
        } else if (pr.codeStatus === 'notApplicable') {
          M.Pricing.code = v;
          codeMsg.textContent = 'Ese código no aplica a los servicios que elegiste por ahora.';
        } else {
          codeMsg.textContent = 'No encontramos ese código o ya venció.';
        }
        if (M.Pricing.code === v || M.Pricing.gift === v) codeInput.value = '';
        await M.Pricing.refresh(items);
      } catch (err) { codeMsg.textContent = err.message; }
      renderCodeTags();
      closePay();
      renderSummary();
    }
    $('bk-code-apply').addEventListener('click', applyCode);
    /* Aplica un código desde otra sección (por ejemplo, al comprar un paquete) */
    M.applyBookingCode = (code) => {
      const box = $('bk-promo');
      if (box && box.tagName === 'DETAILS') box.open = true;
      codeInput.value = code;
      return applyCode();
    };
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } });
    codeTags.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-clear]');
      if (!b) return;
      M.Pricing.clear(b.dataset.clear);
      codeMsg.textContent = '';
      renderCodeTags();
      try { await M.Pricing.refresh(M.totals().items); } catch (err) { /* sin conexión: se usa el precio local */ }
      closePay(); renderSummary();
    });
    let priceT = null;
    function repriceSoon() {
      if (!(M.Pricing.code || M.Pricing.gift || M.Pricing.loyal)) return;
      clearTimeout(priceT);
      priceT = setTimeout(async () => {
        try { await M.Pricing.refresh(M.totals().items); } catch (err) { /* se reintenta al pagar */ }
        renderSummary();
      }, 250);
    }

    /* ---- Cumpleaños (día y mes, sin año) ---- */
    const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    $('bk-bday-d').insertAdjacentHTML('beforeend', Array.from({ length: 31 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}">${i + 1}</option>`).join(''));
    $('bk-bday-m').insertAdjacentHTML('beforeend', MONTHS.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${m}</option>`).join(''));
    function birthday() { const d = $('bk-bday-d').value, m = $('bk-bday-m').value; return d && m ? `${m}-${d}` : ''; }
    if (saved && saved.birthday) { const [bm, bd] = saved.birthday.split('-'); $('bk-bday-m').value = bm || ''; $('bk-bday-d').value = bd || ''; }

    /* ---- Premio de fidelidad: se revisa al escribir el correo o el teléfono ---- */
    const loyaltyInfo = M.loyalty || { enabled: false };
    let loyalSig = '';
    async function checkLoyalty() {
      if (!loyaltyInfo.enabled || !API.enabled()) return;
      const client = { email: valid.email() ? fields.email.value.trim() : '', phone: valid.phone() ? V.phone(fields.phone.value).value : '' };
      if (!client.email && !client.phone) return;
      const key = `${client.email}|${client.phone}`;
      if (key === loyalSig) return;
      loyalSig = key;
      try {
        const res = await API.loyalty(client);
        const was = M.Pricing.loyal;
        M.Pricing.client = client;
        M.Pricing.loyal = !!res.eligible;
        const note = $('bk-loyal');
        note.hidden = !res.eligible;
        if (res.eligible) note.innerHTML = `<strong>¡Tienes tu premio de fidelidad!</strong> ${res.kind === 'monto' ? M.fmtPrice(res.value) : `${res.value}%`} de descuento en esta cita por tus ${res.every} visitas.`;
        if (!was && !res.eligible) return; // nada cambió: no se toca el pago en curso
        await M.Pricing.refresh(M.totals().items);
      } catch (err) { return; /* sin premio si no hay conexión */ }
      closePay(); renderSummary();
    }
    [fields.email, fields.phone].forEach((f) => f.addEventListener('blur', checkLoyalty));
    if (saved) setTimeout(checkLoyalty, 300);

    /* ---- Lista de espera ---- */
    const wait = { box: $('bk-wait'), panel: $('bk-wait-box') };
    const waitOn = API.enabled() && !!(M.waitlistInfo && M.waitlistInfo.enabled);
    function renderWait() {
      wait.box.hidden = !waitOn || !M.state.selected.length;
      if (wait.box.hidden) return;
      const max = M.addDaysKey ? M.addDaysKey(M.todayKey(), M.config.schedule.maxDaysAhead) : '';
      $('bk-wait-date').min = M.todayKey();
      if (max) $('bk-wait-date').max = max;
      if (M.state.dateKey && !$('bk-wait-date').dataset.touched) $('bk-wait-date').value = M.state.dateKey;
      const who = valid.name() && valid.phone() && valid.email();
      $('bk-wait-who').textContent = who ? `Te avisaremos a ${fields.email.value.trim()}.` : 'Completa tu nombre, teléfono y correo en "Tus datos" para unirte.';
    }
    $('bk-wait-date').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
    $('bk-wait-open').addEventListener('click', () => { wait.panel.hidden = !wait.panel.hidden; renderWait(); });
    $('bk-wait-join').addEventListener('click', async (e) => {
      const msg = $('bk-wait-msg');
      if (!(valid.name() && valid.phone() && valid.email())) { msg.textContent = 'Completa tu nombre, teléfono y correo en "Tus datos".'; msg.className = 'gf-msg is-error'; M.scrollTo('#step-datos'); return; }
      const date = $('bk-wait-date').value;
      if (!date) { msg.textContent = 'Elige el día.'; msg.className = 'gf-msg is-error'; return; }
      const btn = e.currentTarget; btn.disabled = true; msg.className = 'gf-msg'; msg.textContent = 'Guardando…';
      try {
        const res = await API.waitlistJoin({ date, franja: $('bk-wait-franja').value, services: M.state.selected, client: { name: fullName(), firstName: fields.first.value.trim(), lastName: fields.last.value.trim(), phone: V.phone(fields.phone.value).value, email: fields.email.value.trim() } });
        if (res.available && res.available.length) {
          msg.innerHTML = `¡Ese día ya hay horario libre: ${res.available.slice(0, 4).map(M.fmtTime12).join(', ')}! Puedes reservarlo ahora. Igual te dejamos en la lista.`;
          if (date !== M.state.dateKey) M.set({ dateKey: date, time: null }, 'booking-date');
        } else msg.textContent = res.already ? 'Ya estabas en la lista de ese día. Te avisaremos por correo.' : `Listo. Te avisaremos a ${fields.email.value.trim()} si se libera un horario.`;
      } catch (err) { msg.textContent = err.message; msg.className = 'gf-msg is-error'; }
      btn.disabled = false;
    });

    // "¿Cómo nos conociste?" sugerido por el enlace con el que llegó
    if (M.Origin.guess() && !$('bk-origen').value) $('bk-origen').value = M.Origin.guess();

    confirmBtn.addEventListener('click', async () => {
      if (missingList().length) return;
      const a = appointment();
      result.hidden = true;
      try {
        const prepared = M.Consent ? await M.Consent.prepare(a.services.map(s=>s.id),a.client.name) : [];
        if (prepared === null) return;
        consentPayload = prepared;
        a.consents = prepared;
      } catch (err) { M.toast ? M.toast(err.message) : alert(err.message); return; }
      if (mode === 'pay' && M.Pricing.current(M.totals().items).depositRD <= 0) {
        confirmWithGift(a);
      } else if (mode === 'pay') {
        openPay();
      } else if (mode === 'request') {
        const msg = M.WhatsApp.buildMessage({ services: M.totals().items, dateKey: a.date, time: a.time, name: a.client.name }, 'Hola, quiero solicitar una cita en MAJOBELLA.')
          + `\n\nTeléfono: ${a.client.phone}\nCorreo: ${a.client.email}${a.client.notes ? `\nNota: ${a.client.notes}` : ''}`;
        const link = M.WhatsApp.link(msg);
        const tmp = document.createElement('a');
        tmp.href = link; tmp.target = '_blank'; tmp.rel = 'noopener';
        document.body.appendChild(tmp); tmp.click(); tmp.remove();
        M.Appointments.add({ ...a, id: `web-${Date.now()}`, status: 'pendiente', remote: false, createdAt: new Date().toISOString() });
        rememberClient(a);
        showResult(a, 'request', link);
      }
    });
    form.addEventListener('submit', (e) => e.preventDefault());

    /* ---- Agenda en vivo: se actualiza al volver a la pestaña y cada dos minutos ---- */
    if (API.enabled()) {
      API.onBusy(() => { renderQuick(); renderCalendar(); renderSlots(); findFastest(); });
      API.refreshBusy().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') API.refreshBusy().catch(() => {}); });
      setInterval(() => { if (document.visibilityState === 'visible' && !paying) API.refreshBusy(true).catch(() => {}); }, 120000);
    }

    /* ---- Sincronización con el estado compartido ---- */
    M.on((st, source) => {
      closePay();
      svcBox.querySelectorAll('input').forEach((i) => { i.checked = st.selected.includes(i.value); });
      syncServiceChoiceCounts();
      // Selecciones que llegan desde Servicios o desde un enlace de reserva
      // deben quedar visibles al abrir su categoría y su subservicio.
      svcBox.querySelectorAll('input:checked').forEach(input => {
        const group = input.closest('.bk-service-group');
        const category = input.closest('.bk-service-category');
        if (group) group.open = true;
        if (category) category.open = true;
      });
      if (st.dateKey) {
        const { y, m } = M.parseKey(st.dateKey);
        if (y !== view.y || m !== view.m) view = { y, m };
        dateOut.textContent = `${M.weekdayName(st.dateKey)} · ${M.dayMonth(st.dateKey)}`;
      } else {
        dateOut.textContent = '';
      }
      renderQuick();
      renderCalendar();
      if (source === 'booking-slot') {
        slotsBox.querySelectorAll('.slot').forEach((b) => { const s = b.dataset.time === st.time; b.classList.toggle('is-selected', s); b.setAttribute('aria-pressed', s); });
      } else {
        renderSlots();
      }
      if (!['booking-slot', 'booking-date', 'booking-fast', 'booking-taken', 'booked'].includes(source)) findFastest();
      if (source === 'booking-date') guide('#step-hora');
      result.hidden = true;
      if (!['booking-date', 'booking-slot', 'booking-fast', 'booking-taken', 'booked'].includes(source)) repriceSoon();
      renderSummary();
      renderWait();
    });

    M.refreshBookingCatalog = () => { renderServiceChoices(); refreshPaymentMode(); renderPolicy(); renderQuick(); renderCalendar(); renderSlots(); findFastest(); renderSummary(); };

    renderQuick();
    renderCalendar();
    renderSlots();
    renderSignin(M.Auth.user);
    findFastest();
  };
})(window.MJB);
