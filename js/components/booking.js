/* MAJOBELLA · Reserva: servicio → fecha → hora → datos → depósito con PayPal
   - Los días y horas ya reservados se ven en gris para todas (con o sin sesión).
   - "Primer horario disponible" elige fecha y hora en un toque.
   - La cita se aparta pagando el depósito (config.payments.depositPercent) con PayPal;
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

  M.initBooking = function () {
    const $ = (id) => document.getElementById(id);
    const svcBox = $('bk-services'), calTitle = $('bk-month'), calGrid = $('bk-grid');
    const prevBtn = $('bk-prev'), nextBtn = $('bk-next'), dateOut = $('bk-date-label');
    const quick = $('bk-quickdays'), calToggle = $('bk-cal-toggle'), calendar = $('bk-calendar');
    const fastest = $('bk-fastest'), fastestLabel = $('bk-fastest-label'), fastestBtn = $('bk-fastest-btn');
    const slotsBox = $('bk-slots'), slotsMsg = $('bk-slots-msg');
    const form = $('bk-form'), confirmBtn = $('bk-confirm'), missing = $('bk-missing');
    const modeNote = $('bk-mode'), result = $('bk-result'), policy = $('bk-policy');
    const pay = { panel: $('bk-pay'), info: $('bk-pay-info'), timer: $('bk-pay-timer'), box: $('bk-paypal'), msg: $('bk-pay-msg'), back: $('bk-pay-back') };
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

    /* ---- Modo de reserva ---- */
    const mode = API.enabled()
      ? (M.PayPal.configured() ? 'pay' : 'paysoon')
      : (M.WhatsApp.isConfigured() ? 'request' : 'none');
    document.querySelectorAll('[data-pay-only]').forEach((n) => { n.hidden = mode !== 'pay'; });
    confirmBtn.textContent = mode === 'pay' ? 'Continuar al pago del depósito' : mode === 'request' ? 'Enviar solicitud' : 'Confirmar cita';
    const sandbox = PAY.paypalEnv === 'sandbox';
    modeNote.innerHTML = {
      pay: `Pagas el depósito con PayPal (tarjeta o cuenta) y tu cita queda confirmada al instante. Te llega un correo con todos los detalles.${sandbox ? ' <strong>Modo de prueba: no se hacen cobros reales.</strong>' : ''}`,
      paysoon: 'Los pagos en línea se están activando. Si tienes dudas, escríbenos por WhatsApp.',
      request: 'La reserva con depósito en línea se activa pronto. Por ahora tu cita se envía como solicitud y te confirmamos por WhatsApp.',
      none: 'Reserva en línea pendiente de activar.',
    }[mode];
    function renderPolicy() {
      const pct = PAY.depositPercent;
      policy.textContent = [
        mode === 'pay' ? `Apartas tu cita con el ${pct}% y pagas el resto al terminar, en efectivo o con PayPal.` : '',
        mode === 'pay' && P.changeHours ? `Si cancelas con ${P.changeHours} horas o más de aviso, te devolvemos el depósito.` : '',
        mode !== 'pay' && P.changeHours ? `Puedes cambiar o cancelar hasta ${P.changeHours} horas antes.` : '',
        P.arriveEarlyMinutes ? `Te recomendamos llegar ${P.arriveEarlyMinutes} minutos antes.` : '',
      ].filter(Boolean).join(' ');
    }
    renderPolicy();

    /* ---- 1. Servicios ---- */
    svcBox.innerHTML = M.services.map((s) => `
      <label class="chip">
        <input type="checkbox" id="bk-svc-${s.id}" value="${s.id}">
        <span>${M.escapeHtml(s.name)} <em>${M.fmtDurationShort(s.durationMinutes)}</em></span>
      </label>`).join('');
    svcBox.addEventListener('change', (e) => { if (e.target.matches('input')) M.toggleService(e.target.value, 'booking'); });

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
      if (M.state.time && !res.slots.includes(M.state.time)) { takenNotice = true; M.set({ time: null }, 'booking-taken'); return; }
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
    const fields = { name: $('bk-name'), phone: $('bk-phone'), email: $('bk-email'), notes: $('bk-notes') };
    const valid = {
      name: () => fields.name.value.trim().length >= 2,
      phone: () => fields.phone.value.replace(/\D/g, '').length >= 10,
      email: () => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email.value.trim()),
    };
    Object.values(fields).forEach((f) => f.addEventListener('input', () => { closePay(); renderSummary(); }));
    Object.entries(valid).forEach(([k, fn]) => {
      fields[k].addEventListener('blur', () => fields[k].closest('.field').classList.toggle('has-error', !!fields[k].value && !fn()));
      fields[k].addEventListener('input', () => { if (fn()) fields[k].closest('.field').classList.remove('has-error'); });
    });

    const saved = loadClient();
    if (saved) {
      fields.name.value = saved.name || '';
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
        if (!fields.name.value.trim()) fields.name.value = u.name || '';
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
      if (!valid.name()) out.push('tu nombre');
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
      sum.price.textContent = t.items.length ? (t.hasFrom ? 'Desde ' : '') + M.fmtPrice(t.price) : '—';
      if (mode === 'pay') {
        const dep = M.deposit(t.price);
        sum.dep.innerHTML = t.items.length ? `${M.fmtPrice(dep.depositRD)}<small>${M.fmtUSD(dep.depositUSD)} con PayPal</small>` : '—';
        sum.bal.innerHTML = t.items.length ? `${t.hasFrom ? 'Desde ' : ''}${M.fmtPrice(dep.balanceRD)}<small>efectivo o PayPal</small>` : '—';
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
        client: { name: fields.name.value.trim(), phone: fields.phone.value.trim(), email: fields.email.value.trim(), notes: fields.notes.value.trim() },
      };
    }

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

    function showResult(a, kind, waLink) {
      const evt = M.calendarEvent(a, kind === 'request');
      const g = M.CalendarLinks.googleUrl(evt);
      const prep = M.prepFor(a.services.map((s) => s.id));
      const p = a.payment;
      result.hidden = false;
      result.innerHTML = `
        <p class="result-title">${kind === 'paid' ? '¡Listo! Tu cita está confirmada.' : 'Tu solicitud está lista para enviar.'}</p>
        <p class="result-text">${kind === 'paid'
          ? `Te esperamos el ${M.weekdayName(a.date).toLowerCase()} ${M.dayMonth(a.date)} a las ${M.fmtTime12(a.time)}. Recibimos tu depósito de ${M.fmtPrice(p.depositRD)} (${M.fmtUSD(p.depositUSD)}); al terminar pagas ${M.fmtPrice(p.balanceRD)} en efectivo o con PayPal. Te enviamos la confirmación a ${M.escapeHtml(a.client.email)}.`
          : 'Envía el mensaje que se abrió en WhatsApp y MAJOBELLA te responderá para confirmar tu cita.'}</p>
        ${kind === 'paid' ? `<p class="result-code">Código de reserva <strong>${M.escapeHtml(a.id)}</strong></p>` : ''}
        ${prep.length ? `<div class="result-prep"><p class="rp-title">Para tu cita</p><ul>${prep.map(({ p: x }) => `<li>${M.escapeHtml(x)}</li>`).join('')}</ul></div>` : ''}
        <div class="result-actions">
          <a class="btn btn-line" href="${g}" target="_blank" rel="noopener">Google Calendar</a>
          <button type="button" class="btn btn-line" id="bk-ics">Apple / Outlook (.ics)</button>
          ${waLink ? `<a class="btn btn-quiet" href="${waLink}" target="_blank" rel="noopener">Abrir WhatsApp otra vez</a>` : ''}
          <a class="btn btn-quiet" href="#citas">Ver mis citas</a>
          ${M.config.contact.mapsUrl ? `<a class="btn btn-quiet" href="${M.escapeHtml(M.config.contact.mapsUrl)}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}
        </div>`;
      $('bk-ics').addEventListener('click', () => M.CalendarLinks.downloadICS(evt));
      if (!M.reduceMotion()) gsap.from(result, { opacity: 0, y: 14, duration: 0.9, ease: 'power2.out' });
      if (isNarrow()) setTimeout(() => result.scrollIntoView({ behavior: M.reduceMotion() ? 'auto' : 'smooth', block: 'center' }), 200);
    }

    function rememberClient(a) {
      if (remember.checked) { saveClient({ name: a.client.name, phone: a.client.phone, email: a.client.email }); savedNote.hidden = false; }
      else forgetClient();
    }

    /* ---- 5. Pago del depósito ---- */
    const sig = () => JSON.stringify([M.state.selected, M.state.dateKey, M.state.time, fields.name.value, fields.phone.value, fields.email.value]);

    function payMessage(text, tone) {
      pay.msg.textContent = text || '';
      pay.msg.className = `pay-msg${tone ? ` is-${tone}` : ''}`;
    }

    function stopTimer() { clearInterval(holdTimer); holdTimer = null; pay.timer.hidden = true; }
    function startTimer() {
      stopTimer();
      pay.timer.hidden = false;
      const tick = () => {
        if (!hold) return stopTimer();
        const left = Math.max(0, new Date(hold.expiresAt).getTime() - Date.now());
        const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
        pay.timer.textContent = `Te apartamos este horario por ${mm}:${String(ss).padStart(2, '0')} mientras pagas.`;
        if (!left) {
          hold = null; stopTimer();
          payMessage('Se acabó el tiempo para pagar y el horario se liberó. Puedes intentarlo de nuevo.', 'warn');
          API.refreshBusy(true).catch(() => {});
        }
      };
      tick();
      holdTimer = setInterval(tick, 1000);
    }

    function releaseHold() {
      if (!hold) return;
      API.release(hold.id, hold.manageToken);
      hold = null; stopTimer();
    }

    function closePay() {
      if (pay.panel.hidden || paying) return;
      releaseHold();
      pay.panel.hidden = true;
      pay.box.innerHTML = '';
      payMessage('');
      confirmBtn.hidden = false;
    }

    async function openPay() {
      const t = M.totals();
      const dep = M.deposit(t.price);
      pay.info.innerHTML = `Hoy pagas <strong>${M.fmtUSD(dep.depositUSD)}</strong> (${M.fmtPrice(dep.depositRD)}, el ${PAY.depositPercent}% de ${M.fmtPrice(t.price)}). Al terminar pagas ${M.fmtPrice(dep.balanceRD)} en efectivo o con PayPal. <span class="pay-rate">Tasa: RD$ ${PAY.usdRate} por US$ 1.</span>`;
      payMessage('');
      confirmBtn.hidden = true;
      pay.panel.hidden = false;
      renderSummary();
      if (!M.reduceMotion()) gsap.from(pay.panel, { opacity: 0, y: 10, duration: 0.5, ease: 'power2.out' });
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
              if (Number(res.depositUSD) !== dep.depositUSD) {
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
            releaseHold();
            payMessage('Cerraste PayPal sin pagar. Tu horario quedó libre; puedes intentarlo otra vez.', 'warn');
            API.refreshBusy(true).catch(() => {});
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
    pay.back.addEventListener('click', () => { closePay(); renderSummary(); });

    confirmBtn.addEventListener('click', () => {
      if (missingList().length) return;
      const a = appointment();
      result.hidden = true;
      if (mode === 'pay') {
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
      if (!['booking-slot', 'booking-date', 'booking-fast', 'booking-taken'].includes(source)) findFastest();
      if (source === 'booking-date') guide('#step-hora');
      result.hidden = true;
      renderSummary();
    });

    M.refreshBookingCatalog = () => { renderPolicy(); renderQuick(); renderCalendar(); renderSlots(); findFastest(); renderSummary(); };

    renderQuick();
    renderCalendar();
    renderSlots();
    renderSignin(M.Auth.user);
    findFastest();
  };
})(window.MJB);
