/* MAJOBELLA · Reserva: servicio → fecha → hora → datos → confirmar
   Pensada para tardar menos de un minuto:
   - "Primer horario disponible" elige fecha y hora en un toque.
   - Los próximos días aparecen como accesos rápidos; el calendario completo es opcional.
   - Los datos de la clienta se recuerdan en el dispositivo (si lo acepta) o se completan con Google.
   - Cada paso se marca al completarse y el resumen muestra la hora de término. */
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
    const steps = [...document.querySelectorAll('.booking-flow .step')];
    const signinHint = $('bk-signin-hint'), remember = $('bk-remember'), savedNote = $('bk-saved-note');
    const sum = { svc: $('sum-service'), date: $('sum-date'), time: $('sum-time'), dur: $('sum-duration'), price: $('sum-price') };
    const P = M.config.policies || {};

    const t0 = M.parseKey(M.todayKey());
    let view = { y: t0.y, m: t0.m };
    let slotReq = 0, fastReq = 0, firstSlot = null;

    /* Modo de confirmación según la configuración */
    const mode = M.BookingAPI.enabled() ? 'api' : (M.WhatsApp.isConfigured() ? 'whatsapp' : 'none');
    modeNote.textContent = {
      api: 'Solo ves horas libres en la agenda de MAJOBELLA. La confirmación es inmediata.',
      whatsapp: 'Al confirmar se abre WhatsApp con tu cita lista para enviar. MAJOBELLA te responde para confirmarla.',
      none: 'Reserva en línea pendiente de activar: falta el número de WhatsApp o la conexión de agenda en js/config.js.',
    }[mode];
    policy.textContent = [
      P.changeHours ? `Puedes cambiar o cancelar hasta ${P.changeHours} horas antes.` : '',
      P.arriveEarlyMinutes ? `Te recomendamos llegar ${P.arriveEarlyMinutes} minutos antes.` : '',
    ].filter(Boolean).join(' ');

    /* ---- 1. Servicios ---- */
    svcBox.innerHTML = M.services.map((s) => `
      <label class="chip">
        <input type="checkbox" id="bk-svc-${s.id}" value="${s.id}">
        <span>${M.escapeHtml(s.name)} <em>${M.fmtDurationShort(s.durationMinutes)}</em></span>
      </label>`).join('');
    svcBox.addEventListener('change', (e) => { if (e.target.matches('input')) M.toggleService(e.target.value, 'booking'); });

    /* ---- 2. Fecha: accesos rápidos, primer horario y calendario completo ---- */
    function nextBookableDays(n) {
      const out = [];
      for (let i = 0; i <= M.config.schedule.maxDaysAhead && out.length < n; i++) {
        const d = new Date(Date.UTC(t0.y, t0.m, t0.d + i));
        const key = M.dateKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        if (M.Schedule.isBookableDay(key)) out.push({ key, i });
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
      quick.innerHTML = nextBookableDays(6).map((day) => {
        const { d } = M.parseKey(day.key);
        const sel = day.key === M.state.dateKey;
        return `<button type="button" class="qday${sel ? ' is-selected' : ''}" data-key="${day.key}" aria-pressed="${sel}" aria-label="${M.weekdayName(day.key)} ${M.dayMonth(day.key)}">
          <span class="qd-w">${dayLabel(day)}</span><span class="qd-d">${d}</span></button>`;
      }).join('');
    }
    quick.addEventListener('click', (e) => {
      const b = e.target.closest('.qday');
      if (b) M.set({ dateKey: b.dataset.key, time: null }, 'booking-date');
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
      for (let d = 1; d <= days; d++) {
        const key = M.dateKey(view.y, view.m, d);
        const ok = M.Schedule.isBookableDay(key);
        const sel = key === M.state.dateKey;
        html += `<button type="button" class="cal-day${sel ? ' is-selected' : ''}${key === today ? ' is-today' : ''}" data-key="${key}" ${ok ? '' : 'disabled'} aria-pressed="${sel}" aria-label="${M.weekdayName(key)} ${M.dayMonth(key)}${ok ? '' : ', no disponible'}">${d}</button>`;
      }
      calGrid.innerHTML = html;
      const cur = view.y * 12 + view.m, min = t0.y * 12 + t0.m;
      const maxD = new Date(Date.UTC(t0.y, t0.m, t0.d + M.config.schedule.maxDaysAhead));
      prevBtn.disabled = cur <= min;
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
      for (const day of nextBookableDays(14)) {
        let res;
        try { res = await M.BookingAPI.availability(day.key, t.minutes); } catch (e) { break; }
        if (req !== fastReq) return;
        if (res.slots.length) { firstSlot = { key: day.key, time: res.slots[0], i: day.i }; break; }
      }
      if (req !== fastReq) return;
      if (!firstSlot) { fastestLabel.textContent = 'Sin horarios en las próximas dos semanas'; return; }
      const when = firstSlot.i === 0 ? 'Hoy' : firstSlot.i === 1 ? 'Mañana' : `${M.weekdayName(firstSlot.key)} ${M.dayMonth(firstSlot.key)}`;
      fastestLabel.textContent = `${when}, ${M.fmtTime12(firstSlot.time)}`;
      fastestBtn.disabled = false;
    }
    fastestBtn.addEventListener('click', () => {
      if (!firstSlot) return;
      M.set({ dateKey: firstSlot.key, time: firstSlot.time }, 'booking-fast');
      guide('#step-datos');
    });

    /* ---- 3. Horas ---- */
    async function renderSlots() {
      const { dateKey } = M.state;
      const t = M.totals();
      slotsBox.innerHTML = '';
      if (!t.items.length) { slotsMsg.textContent = 'Elige primero un servicio: la duración define las horas disponibles.'; return; }
      if (!dateKey) { slotsMsg.textContent = 'Elige un día para ver las horas disponibles.'; return; }
      slotsMsg.textContent = 'Buscando horas disponibles…';
      const req = ++slotReq;
      let res;
      try { res = await M.BookingAPI.availability(dateKey, t.minutes); }
      catch (err) { if (req === slotReq) slotsMsg.textContent = 'No pudimos consultar la agenda. Intenta de nuevo en unos minutos o escríbenos por WhatsApp.'; return; }
      if (req !== slotReq) return;
      if (!res.slots.length) { slotsMsg.textContent = 'Ese día ya no quedan horas para esta duración. Prueba con otro día o usa "Primer horario disponible".'; return; }
      slotsMsg.textContent = '';
      const groups = { 'Mañana': [], 'Tarde': [] };
      res.slots.forEach((s) => (parseInt(s, 10) < 12 ? groups['Mañana'] : groups['Tarde']).push(s));
      slotsBox.innerHTML = Object.entries(groups).filter(([, v]) => v.length).map(([label, v]) => `
        <div class="slot-group">
          <p class="slot-label">${label}</p>
          <div class="slot-row">${v.map((s) => `<button type="button" class="slot${s === M.state.time ? ' is-selected' : ''}" data-time="${s}" aria-pressed="${s === M.state.time}">${M.fmtTime12(s)}</button>`).join('')}</div>
        </div>`).join('');
    }
    slotsBox.addEventListener('click', (e) => {
      const b = e.target.closest('.slot');
      if (!b) return;
      M.set({ time: b.dataset.time }, 'booking-slot');
      if (!valid.name() || !valid.phone() || !valid.email()) guide('#step-datos');
    });

    /* En pantallas pequeñas, lleva suavemente al siguiente paso */
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
    Object.values(fields).forEach((f) => f.addEventListener('input', renderSummary));
    Object.entries(valid).forEach(([k, fn]) => {
      fields[k].addEventListener('blur', () => fields[k].closest('.field').classList.toggle('has-error', !!fields[k].value && !fn()));
      fields[k].addEventListener('input', () => { if (fn()) fields[k].closest('.field').classList.remove('has-error'); });
    });

    // Datos recordados de una reserva anterior en este dispositivo
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
      const miss = missingList();
      missing.textContent = miss.length ? `Falta ${miss.length > 1 ? miss.slice(0, -1).join(', ') + ' y ' + miss.slice(-1) : miss[0]}.` : 'Todo listo.';
      confirmBtn.disabled = !!miss.length || mode === 'none';
      // Pasos completados
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
        client: { name: fields.name.value.trim(), phone: fields.phone.value.trim(), email: fields.email.value.trim(), notes: fields.notes.value.trim(), googleSub: M.Auth.user ? M.Auth.user.sub : null },
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
      return {
        title: `Cita en MAJOBELLA · ${names}`,
        start: new Date(a.start), end: new Date(a.end),
        description: [
          `Servicio: ${names}`, `Duración: ${M.fmtDuration(a.durationMinutes)}`, `Precio: ${M.fmtPrice(a.totalPrice)}`,
          pending ? 'Estado: pendiente de confirmación por WhatsApp.' : 'Estado: confirmada.',
          prep.length ? `\nAntes de tu cita:\n${prep.join('\n')}` : '',
        ].join('\n'),
        location: M.config.contact.address || 'MAJOBELLA Beauty Studio',
      };
    };

    function showResult(a, kind, waLink) {
      const evt = M.calendarEvent(a, kind === 'whatsapp');
      const g = M.CalendarLinks.googleUrl(evt);
      const prep = M.prepFor(a.services.map((s) => s.id));
      result.hidden = false;
      result.innerHTML = `
        <p class="result-title">${kind === 'api' ? '¡Listo! Tu cita está confirmada.' : 'Tu cita está lista para enviar.'}</p>
        <p class="result-text">${kind === 'api'
          ? `Te esperamos el ${M.weekdayName(a.date).toLowerCase()} ${M.dayMonth(a.date)} a las ${M.fmtTime12(a.time)}.`
          : 'Envía el mensaje que se abrió en WhatsApp y MAJOBELLA te responderá para confirmarla.'}</p>
        ${prep.length ? `<div class="result-prep"><p class="rp-title">Para tu cita</p><ul>${prep.map(({ p }) => `<li>${M.escapeHtml(p)}</li>`).join('')}</ul></div>` : ''}
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

    confirmBtn.addEventListener('click', async () => {
      if (missingList().length) return;
      const a = appointment();
      if (mode === 'api') {
        confirmBtn.disabled = true;
        const label = confirmBtn.textContent;
        confirmBtn.textContent = 'Confirmando…';
        try {
          const res = await M.BookingAPI.create(a, M.Auth.token);
          M.Appointments.add({ ...a, id: res.id || `web-${Date.now()}`, status: 'confirmada', remote: true, createdAt: new Date().toISOString() });
          rememberClient(a);
          showResult(a, 'api');
        } catch (err) {
          result.hidden = false;
          result.innerHTML = `<p class="result-title">No pudimos confirmar la cita.</p><p class="result-text">${M.escapeHtml(err.message)} Elige otra hora o escríbenos por WhatsApp.</p>`;
          findFastest(); renderSlots();
        } finally {
          confirmBtn.textContent = label;
          renderSummary();
        }
      } else if (mode === 'whatsapp') {
        const msg = M.WhatsApp.buildMessage({ services: M.totals().items, dateKey: a.date, time: a.time, name: a.client.name })
          + `\n\nTeléfono: ${a.client.phone}\nCorreo: ${a.client.email}${a.client.notes ? `\nNota: ${a.client.notes}` : ''}`;
        const link = M.WhatsApp.link(msg);
        const tmp = document.createElement('a');
        tmp.href = link; tmp.target = '_blank'; tmp.rel = 'noopener';
        document.body.appendChild(tmp); tmp.click(); tmp.remove();
        M.Appointments.add({ ...a, id: `web-${Date.now()}`, status: 'pendiente', remote: false, createdAt: new Date().toISOString() });
        rememberClient(a);
        showResult(a, 'whatsapp', link);
      }
    });
    form.addEventListener('submit', (e) => e.preventDefault());

    /* ---- Sincronización con el estado compartido ---- */
    M.on((st, source) => {
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
      if (source !== 'booking-slot' && source !== 'booking-date' && source !== 'booking-fast') findFastest();
      if (source === 'booking-date') guide('#step-hora');
      result.hidden = true;
      renderSummary();
    });

    renderQuick();
    renderCalendar();
    renderSlots();
    renderSignin(M.Auth.user);
    findFastest();
  };
})(window.MJB);
