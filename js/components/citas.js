/* MAJOBELLA · Citas: cuenta (Google) y registro de citas próximas y anteriores */
(function (M) {
  const MONTH = new Intl.DateTimeFormat('es', { timeZone: 'UTC', month: 'short' });

  M.initCitas = function () {
    const account = document.getElementById('account');
    const list = document.getElementById('citas-list');
    const source = document.getElementById('citas-source');
    const tabs = document.querySelectorAll('.citas-tab');
    const headerSlot = document.getElementById('header-account');
    let view = 'proximas';
    let pendingCancel = null;

    /* ---- Cuenta ---- */
    function renderAccount() {
      const u = M.Auth.user;
      if (u) {
        const avatar = u.picture
          ? `<img src="${M.escapeHtml(u.picture)}" alt="" width="44" height="44" referrerpolicy="no-referrer">`
          : `<span>${M.escapeHtml((u.firstName || u.email)[0].toUpperCase())}</span>`;
        account.innerHTML = `
          <div class="acct-user">
            <span class="acct-avatar">${avatar}</span>
            <div><p class="acct-name">${M.escapeHtml(u.name || u.firstName)}</p><p class="acct-mail">${M.escapeHtml(u.email)}</p></div>
          </div>
          <button type="button" class="link-btn" id="acct-out">Cerrar sesión</button>`;
        account.querySelector('#acct-out').addEventListener('click', () => M.Auth.signOut());
      } else if (M.Auth.configured()) {
        account.innerHTML = `
          <div class="acct-copy"><p class="acct-name">Inicia sesión para ver tus citas</p>
          <p class="acct-mail">Con tu cuenta de Google verás tus citas en cualquier dispositivo y tus datos se completan solos al reservar.</p></div>
          <div class="acct-google" data-google-button></div>`;
        M.Auth.renderButtons();
      } else {
        account.innerHTML = `
          <div class="acct-copy"><p class="acct-name">Inicia sesión para ver tus citas</p>
          <p class="acct-mail">El inicio con Google se activa al añadir el ID de cliente en <code>js/config.js</code>. Mientras tanto, aquí ves las citas reservadas desde este dispositivo.</p></div>
          <button type="button" class="google-btn" disabled><span class="g-mark" aria-hidden="true">G</span>Continuar con Google</button>`;
      }
      // Encabezado
      headerSlot.innerHTML = u
        ? `<button type="button" class="header-user" data-open-auth aria-label="Tu cuenta, ${M.escapeHtml(u.firstName || u.name)}">${u.picture ? `<img src="${M.escapeHtml(u.picture)}" alt="" width="30" height="30" referrerpolicy="no-referrer">` : `<span>${M.escapeHtml((u.firstName || 'U')[0])}</span>`}<em>${M.escapeHtml(u.firstName || '')}</em></button>`
        : '<button type="button" class="header-login" data-open-auth>Iniciar sesión</button>';
      document.querySelectorAll('.mobile-login').forEach((b) => { b.textContent = u ? `Tu cuenta · ${u.firstName || u.name}` : 'Iniciar sesión'; });
    }

    /* ---- Lista ---- */
    const PAYMODE = () => M.BookingAPI.enabled() && M.PayPal.configured();
    const cancelHours = () => (M.config.policies && M.config.policies.changeHours) || 24;
    const hoursLeft = (a) => (new Date(a.start).getTime() - Date.now()) / 3600000;
    let payingId = null, proofId = null, moveId = null;
    const move = { days: null, key: null, time: null, slots: null, busy: false, msg: '' };
    const esc = M.escapeHtml;
    // Normaliza saltos heredados que aparecen como «/n» o «\\n».
    const readable = (value) => String(value == null ? '' : value)
      .replaceAll(String.raw`\n`, ' ').replaceAll('/n', ' ')
      .replace(/\s{2,}/g, ' ').trim();

    function paymentLine(a) {
      const p = a.payment;
      if (!p) return '';
      const parts = [];
      if (p.refund === 'reembolsado') parts.push(`Depósito de ${M.fmtPrice(p.depositRD)} reembolsado`);
      else if (p.refund === 'pendiente') parts.push(`Te devolveremos el depósito de ${M.fmtPrice(p.depositRD)} por transferencia`);
      else if (a.status === 'por-confirmar') parts.push(`Comprobante recibido: estamos confirmando tu depósito de ${M.fmtPrice(p.depositRD)}`);
      else if (a.status === 'retenida') parts.push(`Depósito por transferencia: ${M.fmtPrice(p.depositRD)}`);
      else if (p.depositPaid) parts.push(`Depósito pagado: ${M.fmtPrice(p.depositRD)}${p.depositMethod === 'transferencia' ? ' (transferencia)' : ''}`);
      if (a.status !== 'cancelada') {
        parts.push(p.balanceStatus === 'pagado'
          ? `Saldo pagado${p.balanceMethod ? ` (${p.balanceMethod === 'efectivo' ? 'efectivo' : 'PayPal'})` : ''}`
          : `Saldo al terminar: ${M.fmtPrice(p.balanceRD)}`);
      }
      return `<p class="cita-pay">${parts.join(' · ')}</p>`;
    }
    function consentLine(a, past, cancelled) {
      const c = a.consent;
      if (!c || !c.needed || past || cancelled) return '';
      if (c.signed) return '<p class="cita-consent is-ok">Consentimiento firmado ✓</p>';
      return c.url ? `<p class="cita-consent"><a class="btn btn-primary btn-sm" href="${M.escapeHtml(c.url)}">Firmar consentimiento</a><span>Fírmalo antes de tu cita (2 minutos).</span></p>` : '';
    }

    function item(a, past) {
      const { y, m, d } = M.parseKey(a.date);
      const names = (a.services || []).map((s) => readable(s.name)).filter(Boolean).join(' + ');
      const st = a.status || 'pendiente';
      const label = readable(past && st === 'confirmada' ? 'Realizada' : st === 'retenida' ? 'Falta el comprobante' : M.STATUS[st] || st);
      const cancelled = st === 'cancelada' || st === 'cancelacion-solicitada';
      const ids = (a.services || []).map((s) => s.id).filter((id) => M.serviceById[id]);
      const prep = !past && !cancelled ? M.prepFor(ids) : [];
      const again = ids.length ? `<button type="button" class="btn btn-quiet" data-again="${ids.join(',')}">Volver a reservar</button>` : '';
      const remote = a.remote && M.BookingAPI.enabled() && M.Appointments.auth(a);
      const balanceDue = remote && a.payment && a.payment.depositPaid && a.payment.balanceStatus !== 'pagado'
        && ['confirmada', 'completada'].includes(st) && PAYMODE()
        && (st === 'completada' || new Date(a.start).getTime() <= Date.now() + 15 * 60000);
      const payBtn = balanceDue ? `<button type="button" class="btn btn-line" data-balance="${M.escapeHtml(a.id)}">Pagar saldo con PayPal</button>` : '';
      const payBox = payingId === a.id ? `<div class="cita-paybox"><p class="cpb-info">Saldo: <strong>${M.fmtPrice(a.payment.balanceRD)}</strong>, se cobra en dólares con la tasa del día.</p><div class="cpb-buttons" id="cpb-${M.escapeHtml(a.id)}"></div><p class="cpb-msg" aria-live="polite"></p><button type="button" class="link-inline" data-balance-close>Cerrar</button></div>` : '';

      let actions;
      if (past || cancelled) {
        actions = (payBtn || again) ? `<div class="cita-actions">${payBtn}${again}</div>${payBox}` : '';
      } else {
        const cancelBtn = canCancel(a) ? `<button type="button" class="btn btn-quiet" data-cancel="${M.escapeHtml(a.id)}">${pendingCancel === a.id ? cancelConfirmText(a) : 'Cancelar cita'}</button>` : '';
        const rc = M.Reschedule.check(a);
        const moveBtn = rc.ok ? `<button type="button" class="btn btn-line" data-move="${esc(a.id)}">${moveId === a.id ? 'Cerrar' : 'Cambiar fecha'}</button>` : '';
        const waiting = st === 'retenida' && M.Appointments.waitingProof(a);
        const question = M.WhatsApp.isConfigured() ? `<a class="btn btn-quiet" href="${waLink(a)}" target="_blank" rel="noopener">${remote ? '¿Dudas? WhatsApp' : 'Reprogramar'}</a>` : '';
        actions = `
        ${waiting ? `<div class="cita-proof"><p>Tienes hasta las <b>${M.Transfer.deadlineText(a)}</b> para transferir <b>${M.fmtPrice(a.payment.depositRD)}</b> y subir el comprobante. Si no, el horario se libera.</p>
          ${proofId === a.id ? proofBox(a) : `<button type="button" class="btn btn-primary btn-sm" data-proof="${esc(a.id)}">Subir comprobante</button>`}</div>` : ''}
        ${st === 'por-confirmar' ? '<p class="cita-consent">Recibimos tu comprobante. Te confirmamos por correo en cuanto veamos el depósito.</p>' : ''}
        ${prep.length ? `<details class="cita-prep"><summary>Antes de tu cita</summary><ul>${prep.map(({ p }) => `<li>${M.escapeHtml(p)}</li>`).join('')}</ul></details>` : ''}
        <div class="cita-actions">
          <a class="btn btn-line" href="${calendarUrl(a)}" target="_blank" rel="noopener">Añadir al calendario</a>
          ${payBtn}${moveBtn}${question}${cancelBtn}
        </div>${payBox}
        ${moveId === a.id ? moveBox(a) : ''}
        ${!rc.ok && ['used', 'late'].includes(rc.reason) && remote && st === 'confirmada' ? `<p class="cita-hint">${esc(M.Reschedule.reasonText(rc))}</p>` : ''}
        ${pendingCancel === a.id && remote ? `<p class="cita-warn">${hoursLeft(a) >= cancelHours() ? `Faltan más de ${cancelHours()} horas: te devolvemos el depósito completo ${a.payment && a.payment.depositMethod === 'transferencia' ? 'por transferencia' : 'en PayPal'}.` : `Faltan menos de ${cancelHours()} horas: según la política, el depósito no se devuelve.`}</p>` : ''}`;
      }
      return `
        <li class="cita${cancelled ? ' is-cancelled' : ''}">
          <div class="cita-date" aria-hidden="true"><span class="cd-day">${d}</span><span class="cd-month">${MONTH.format(Date.UTC(y, m, d)).replace('.', '')}</span></div>
          <div class="cita-body">
            <p class="cita-when">${M.weekdayName(a.date)} · ${M.fmtTime12(a.time)}</p>
            <p class="cita-what">${M.escapeHtml(names)}</p>
            <p class="cita-meta">${M.fmtDuration(a.durationMinutes)} · ${M.fmtPrice(a.totalPrice)}${a.id && !String(a.id).startsWith('web-') ? ` · ${M.escapeHtml(a.id)}` : ''}</p>
            ${paymentLine(a)}
            ${consentLine(a, past, cancelled)}
            ${actions}
          </div>
          <span class="cita-status st-${st}">${label}</span>
        </li>`;
    }

    function cancelConfirmText(a) {
      if (!(a.remote && M.BookingAPI.enabled())) return 'Toca otra vez para cancelar';
      return hoursLeft(a) >= cancelHours() ? 'Toca otra vez: cancelar y reembolsar' : 'Toca otra vez: cancelar sin reembolso';
    }
    /* Subir el comprobante de la transferencia */
    function proofBox(a) {
      const accs = M.Transfer.accounts();
      return `<div class="cita-proofbox">
        ${accs.length ? M.Transfer.accountsHtml(accs, { name: `pf-${esc(a.id)}` }) : ''}
        <label class="tf-file"><input type="file" accept="image/*,application/pdf" data-proof-file="${esc(a.id)}"><span>Elegir la foto o el PDF</span></label>
        <label class="field tf-ref"><span>Número de referencia <em>(opcional)</em></span><input data-proof-ref maxlength="60" autocomplete="off"></label>
        <div class="cita-actions"><button type="button" class="btn btn-primary btn-sm" data-proof-send="${esc(a.id)}" disabled>Enviar comprobante</button><button type="button" class="link-inline" data-proof-close>Cerrar</button></div>
        <p class="cpb-msg" aria-live="polite"></p></div>`;
    }
    const proofFiles = {};

    /* Cambiar la fecha */
    function moveBox(a) {
      if (!move.days) return '<div class="cita-move"><p class="cpb-msg">Buscando horarios libres…</p></div>';
      const days = move.days.filter((d) => d.free > 0);
      return `<div class="cita-move">
        <p class="cm-title">Elige el nuevo día</p>
        <div class="cm-days">${days.length ? days.map((d) => `<button type="button" class="cm-day${d.key === move.key ? ' is-on' : ''}" data-move-day="${d.key}"><b>${M.parseKey(d.key).d}</b><span>${esc(M.weekdayName(d.key).slice(0, 3))}</span></button>`).join('') : '<p class="cpb-msg">No hay horarios libres en las próximas semanas. Escríbenos por WhatsApp.</p>'}</div>
        ${move.key ? `<p class="cm-title">Hora</p><div class="cm-slots">${move.slots == null ? '<p class="cpb-msg">Cargando…</p>' : move.slots.map((t) => `<button type="button" class="slot${t === move.time ? ' is-selected' : ''}" data-move-time="${t}">${M.fmtTime12(t)}</button>`).join('')}</div>` : ''}
        ${move.key && move.time ? `<button type="button" class="btn btn-primary btn-sm" data-move-save="${esc(a.id)}"${move.busy ? ' disabled' : ''}>${move.busy ? 'Cambiando…' : `Cambiar al ${esc(M.weekdayName(move.key).toLowerCase())} ${esc(M.dayMonth(move.key))}, ${M.fmtTime12(move.time)}`}</button>` : ''}
        <p class="cm-note">${a.changes && a.changes.max > 1 ? `Puedes cambiarla ${M.Appointments.changesLeft(a)} ${M.Appointments.changesLeft(a) === 1 ? 'vez' : 'veces'} más.` : 'Puedes cambiar la fecha una vez.'} Tu depósito pasa a la nueva cita.</p>
        ${move.msg ? `<p class="cpb-msg is-error">${esc(move.msg)}</p>` : ''}</div>`;
    }

    function canCancel(a) {
      if (a.remote && M.BookingAPI.enabled()) return ['confirmada', 'por-confirmar'].includes(a.status) && !!M.Appointments.auth(a);
      return M.WhatsApp.isConfigured();
    }
    function calendarUrl(a) {
      const names = (a.services || []).map((s) => readable(s.name)).filter(Boolean).join(' + ');
      return M.CalendarLinks.googleUrl({
        title: `Cita en MAJOBELLA · ${names}`, start: new Date(a.start), end: new Date(a.end),
        description: `Servicio: ${names}`, location: M.config.contact.address || 'MAJOBELLA Beauty Studio',
      });
    }
    function waLink(a, kind) {
      const names = (a.services || []).map((s) => readable(s.name)).filter(Boolean).join(' + ');
      const intro = kind === 'cancelar' ? 'Hola, quiero cancelar mi cita en MAJOBELLA.'
        : a.remote ? 'Hola, tengo una pregunta sobre mi cita en MAJOBELLA.' : 'Hola, quiero reprogramar mi cita en MAJOBELLA.';
      return M.WhatsApp.link(`${intro}\n\nServicio: ${names}\n\nFecha: ${M.weekdayName(a.date)} ${M.dayMonth(a.date)}\n\nHora: ${M.fmtTime12(a.time)}${a.id && !String(a.id).startsWith('web-') ? `\n\nCódigo: ${a.id}` : ''}${a.client && a.client.name ? `\n\nNombre: ${a.client.name}` : ''}`);
    }

    async function renderList() {
      list.setAttribute('aria-busy', 'true');
      const { items, source: src, error } = await M.Appointments.list();
      list.removeAttribute('aria-busy');
      list._items = items; list._src = src; list._error = error;
      paint();
    }
    /* Vuelve a dibujar con los datos ya cargados (sin consultar la agenda) */
    function paint() {
      const items = list._items || [], src = list._src, error = list._error;
      const now = Date.now();
      const isPast = (a) => new Date(a.end).getTime() < now || a.status === 'completada' || a.status === 'no-asistio';
      const upcoming = items.filter((a) => !isPast(a)).sort((a, b) => a.start.localeCompare(b.start));
      const past = items.filter(isPast).sort((a, b) => b.start.localeCompare(a.start));
      tabs.forEach((t) => {
        const n = t.dataset.view === 'proximas' ? upcoming.length : past.length;
        t.querySelector('.n').textContent = n;
      });
      const rows = view === 'proximas' ? upcoming : past;
      list.innerHTML = rows.length
        ? rows.map((a) => item(a, view === 'anteriores')).join('')
        : `<li class="citas-empty"><p>${view === 'proximas' ? 'No tienes citas próximas.' : 'Aún no hay citas anteriores.'}</p>${view === 'proximas' ? '<a class="btn btn-primary" href="reservar.html">Agendar cita</a>' : ''}</li>`;
      source.textContent = src === 'agenda'
        ? 'Actualizadas con la agenda de MAJOBELLA.'
        : (error ? `No pudimos leer la agenda (${readable(error)}). Se muestran las citas guardadas en este dispositivo.` : 'Se muestran las citas reservadas desde este dispositivo.');
      if (payingId) mountBalance(payingId);
      renderLoyalty();
    }

    /* Tarjeta de fidelidad (con sesión de Google) */
    function renderLoyalty() {
      let box = document.getElementById('citas-loyalty');
      const l = M.Auth.user ? M.myLoyalty : null;
      if (!l || !l.enabled) { if (box) box.hidden = true; return; }
      if (!box) { box = document.createElement('div'); box.id = 'citas-loyalty'; box.className = 'loyalty-card'; list.parentNode.insertBefore(box, list); }
      box.hidden = false;
      const prize = l.kind === 'monto' ? M.fmtPrice(l.value) : `${l.value}%`;
      const dots = Array.from({ length: l.every }, (_, i) => `<span class="lc-dot${i < l.visits ? ' is-on' : ''}" aria-hidden="true"></span>`).join('');
      box.innerHTML = `<p class="label">Tu tarjeta de fidelidad</p>
        <div class="lc-dots">${dots}<span class="lc-prize${l.eligible ? ' is-on' : ''}" aria-hidden="true">${prize}</span></div>
        <p class="lc-text">${l.eligible ? `<strong>¡Tienes tu premio!</strong> ${prize} de descuento en tu próxima cita: se aplica solo al reservar.` : `Llevas ${l.visits} de ${l.every} visitas. Al completar ${l.every}, tu siguiente cita tiene ${prize} de descuento.`}</p>`;
    }

    /* Pago del saldo con PayPal */
    async function mountBalance(id) {
      const box = document.getElementById(`cpb-${id}`);
      const a = (list._items || []).find((x) => x.id === id);
      if (!box || !a) return;
      const msg = box.parentElement.querySelector('.cpb-msg');
      const auth = M.Appointments.auth(a);
      try {
        await M.PayPal.render(box, {
          createOrder: async () => {
            msg.textContent = '';
            try {
              const r = await M.BookingAPI.balanceOrder(id, auth);
              msg.textContent = `Pagarás ${M.fmtUSD(r.balanceUSD)} (${M.fmtPrice(r.balanceRD)}).`;
              return r.orderId;
            } catch (err) { msg.textContent = err.message; throw err; }
          },
          onApprove: async (orderId) => {
            msg.textContent = 'Confirmando tu pago…';
            try {
              const r = await M.BookingAPI.balanceCapture(id, orderId, auth);
              M.Appointments.update(id, { payment: r.appointment.payment, status: r.appointment.status });
              payingId = null;
              M.toast && M.toast('¡Gracias! Tu saldo quedó pagado.');
              renderList();
            } catch (err) { msg.textContent = err.message; }
          },
          onCancel: () => { msg.textContent = 'Cerraste PayPal sin pagar.'; },
          onError: () => { if (!msg.textContent) msg.textContent = 'PayPal no pudo procesar el pago. Intenta de nuevo.'; },
        });
      } catch (err) { msg.textContent = err.message; }
    }

    tabs.forEach((t) => t.addEventListener('click', () => {
      view = t.dataset.view;
      tabs.forEach((x) => { const on = x === t; x.classList.toggle('is-active', on); x.setAttribute('aria-selected', String(on)); });
      paint();
    }));

    M.Transfer.bindCopy(list);
    list.addEventListener('change', async (e) => {
      const inp = e.target.closest('[data-proof-file]');
      if (!inp) return;
      const box = inp.closest('.cita-proofbox');
      const msg = box.querySelector('.cpb-msg'), send = box.querySelector('[data-proof-send]');
      send.disabled = true;
      try { msg.textContent = 'Preparando…'; proofFiles[inp.dataset.proofFile] = await M.Transfer.prepare(inp.files[0]); msg.textContent = inp.files[0].name; send.disabled = false; }
      catch (err) { msg.textContent = err.message; }
    });
    list.addEventListener('click', async (e) => {
      const pf = e.target.closest('[data-proof]');
      if (pf) { proofId = pf.dataset.proof; paint(); return; }
      if (e.target.closest('[data-proof-close]')) { proofId = null; paint(); return; }
      const ps = e.target.closest('[data-proof-send]');
      if (ps) {
        const id = ps.dataset.proofSend, a = (list._items || []).find((x) => x.id === id), box = ps.closest('.cita-proofbox');
        const file = proofFiles[id];
        if (!a || !file) return;
        ps.disabled = true; ps.textContent = 'Enviando…';
        try {
          const r = await M.BookingAPI.transferProof(id, M.Appointments.auth(a), file, M.Transfer.pickedAccount(box, `pf-${id}`), box.querySelector('[data-proof-ref]').value.trim());
          M.Appointments.update(id, { status: r.appointment.status, payment: r.appointment.payment });
          proofId = null; delete proofFiles[id];
          M.toast && M.toast('Comprobante enviado. Te confirmamos pronto.');
          renderList();
        } catch (err) { box.querySelector('.cpb-msg').textContent = err.message; ps.disabled = false; ps.textContent = 'Enviar comprobante'; }
        return;
      }
      const mv = e.target.closest('[data-move]');
      if (mv) {
        const id = mv.dataset.move;
        if (moveId === id) { moveId = null; paint(); return; }
        moveId = id; Object.assign(move, { days: null, key: null, time: null, slots: null, busy: false, msg: '' });
        paint();
        const a = (list._items || []).find((x) => x.id === id);
        move.days = await M.Reschedule.days(a, 21);
        if (moveId === id) paint();
        return;
      }
      const md = e.target.closest('[data-move-day]');
      if (md) {
        const a = (list._items || []).find((x) => x.id === moveId);
        move.key = md.dataset.moveDay; move.time = null; move.slots = null; move.msg = '';
        paint();
        move.slots = await M.Reschedule.slots(a, move.key);
        paint();
        return;
      }
      const mt = e.target.closest('[data-move-time]');
      if (mt) { move.time = mt.dataset.moveTime; paint(); return; }
      const ms = e.target.closest('[data-move-save]');
      if (ms) {
        const a = (list._items || []).find((x) => x.id === moveId);
        move.busy = true; move.msg = ''; paint();
        try {
          const ap = await M.Reschedule.save(a, move.key, move.time);
          moveId = null; move.busy = false;
          M.toast && M.toast(`Listo: tu cita ahora es el ${M.weekdayName(ap.date).toLowerCase()} ${M.dayMonth(ap.date)} a las ${M.fmtTime12(ap.time)}.`);
        } catch (err) { move.busy = false; move.msg = err.message; paint(); return; }
        renderList();
        return;
      }
      const again = e.target.closest('[data-again]');
      if (again) { M.goBook(again.dataset.again.split(','), '', 'citas'); return; }
      const bal = e.target.closest('[data-balance]');
      if (bal) { payingId = bal.dataset.balance; paint(); return; }
      if (e.target.closest('[data-balance-close]')) { payingId = null; paint(); return; }
      const b = e.target.closest('[data-cancel]');
      if (!b) return;
      const id = b.dataset.cancel;
      const a = (list._items || []).find((x) => x.id === id);
      if (!a) return;
      if (pendingCancel !== id) { pendingCancel = id; paint(); setTimeout(() => { if (pendingCancel === id) { pendingCancel = null; paint(); } }, 8000); return; }
      pendingCancel = null;
      if (a.remote && M.BookingAPI.enabled()) {
        b.disabled = true; b.textContent = 'Cancelando…';
        try {
          const r = await M.BookingAPI.cancel(id, M.Appointments.auth(a));
          M.Appointments.update(id, { status: 'cancelada', payment: r.appointment && r.appointment.payment });
          M.toast && M.toast(r.refunded ? 'Cita cancelada. Te devolvimos el depósito en PayPal.' : r.refundManual ? 'Cita cancelada. Te devolveremos el depósito por transferencia.' : 'Cita cancelada.');
          M.BookingAPI.refreshBusy(true).catch(() => {});
        } catch (err) { source.textContent = err.message; }
        renderList();
      } else {
        const tmp = document.createElement('a');
        tmp.href = waLink(a, 'cancelar'); tmp.target = '_blank'; tmp.rel = 'noopener';
        document.body.appendChild(tmp); tmp.click(); tmp.remove();
        M.Appointments.update(id, { status: 'cancelacion-solicitada' });
      }
    });

    M.Auth.onChange(() => { renderAccount(); renderList(); });
    M.Appointments.onChange(renderList);
    renderAccount();
    renderList();
  };
})(window.MJB);
