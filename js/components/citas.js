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
    let payingId = null;

    function paymentLine(a) {
      const p = a.payment;
      if (!p) return '';
      const parts = [];
      if (p.refund === 'reembolsado') parts.push(`Depósito de ${M.fmtPrice(p.depositRD)} reembolsado`);
      else if (p.depositPaid) parts.push(`Depósito pagado: ${M.fmtPrice(p.depositRD)}`);
      if (a.status !== 'cancelada') {
        parts.push(p.balanceStatus === 'pagado'
          ? `Saldo pagado${p.balanceMethod ? ` (${p.balanceMethod === 'efectivo' ? 'efectivo' : 'PayPal'})` : ''}`
          : `Saldo al terminar: ${M.fmtPrice(p.balanceRD)}`);
      }
      return `<p class="cita-pay">${parts.join(' · ')}</p>`;
    }

    function item(a, past) {
      const { y, m, d } = M.parseKey(a.date);
      const names = (a.services || []).map((s) => s.name).join(' + ');
      const st = a.status || 'pendiente';
      const label = past && st === 'confirmada' ? 'Realizada' : M.STATUS[st] || st;
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
        const question = M.WhatsApp.isConfigured() ? `<a class="btn btn-quiet" href="${waLink(a)}" target="_blank" rel="noopener">${remote ? '¿Dudas? WhatsApp' : 'Reprogramar'}</a>` : '';
        actions = `
        ${prep.length ? `<details class="cita-prep"><summary>Antes de tu cita</summary><ul>${prep.map(({ p }) => `<li>${M.escapeHtml(p)}</li>`).join('')}</ul></details>` : ''}
        <div class="cita-actions">
          <a class="btn btn-line" href="${calendarUrl(a)}" target="_blank" rel="noopener">Añadir al calendario</a>
          ${payBtn}${question}${cancelBtn}
        </div>${payBox}
        ${pendingCancel === a.id && remote ? `<p class="cita-warn">${hoursLeft(a) >= cancelHours() ? `Faltan más de ${cancelHours()} horas: te devolvemos el depósito completo en PayPal.` : `Faltan menos de ${cancelHours()} horas: según la política, el depósito no se devuelve.`}</p>` : ''}`;
      }
      return `
        <li class="cita${cancelled ? ' is-cancelled' : ''}">
          <div class="cita-date" aria-hidden="true"><span class="cd-day">${d}</span><span class="cd-month">${MONTH.format(Date.UTC(y, m, d)).replace('.', '')}</span></div>
          <div class="cita-body">
            <p class="cita-when">${M.weekdayName(a.date)} · ${M.fmtTime12(a.time)}</p>
            <p class="cita-what">${M.escapeHtml(names)}</p>
            <p class="cita-meta">${M.fmtDuration(a.durationMinutes)} · ${M.fmtPrice(a.totalPrice)}${a.id && !String(a.id).startsWith('web-') ? ` · ${M.escapeHtml(a.id)}` : ''}</p>
            ${paymentLine(a)}
            ${actions}
          </div>
          <span class="cita-status st-${st}">${label}</span>
        </li>`;
    }

    function cancelConfirmText(a) {
      if (!(a.remote && M.BookingAPI.enabled())) return 'Toca otra vez para cancelar';
      return hoursLeft(a) >= cancelHours() ? 'Toca otra vez: cancelar y reembolsar' : 'Toca otra vez: cancelar sin reembolso';
    }
    function canCancel(a) {
      if (a.remote && M.BookingAPI.enabled()) return a.status === 'confirmada' && !!M.Appointments.auth(a);
      return M.WhatsApp.isConfigured();
    }
    function calendarUrl(a) {
      const names = (a.services || []).map((s) => s.name).join(' + ');
      return M.CalendarLinks.googleUrl({
        title: `Cita en MAJOBELLA · ${names}`, start: new Date(a.start), end: new Date(a.end),
        description: `Servicio: ${names}`, location: M.config.contact.address || 'MAJOBELLA Beauty Studio',
      });
    }
    function waLink(a, kind) {
      const names = (a.services || []).map((s) => s.name).join(' + ');
      const intro = kind === 'cancelar' ? 'Hola, quiero cancelar mi cita en MAJOBELLA.'
        : a.remote ? 'Hola, tengo una pregunta sobre mi cita en MAJOBELLA.' : 'Hola, quiero reprogramar mi cita en MAJOBELLA.';
      return M.WhatsApp.link(`${intro}\n\nServicio: ${names}\n\nFecha: ${M.weekdayName(a.date)} ${M.dayMonth(a.date)}\n\nHora: ${M.fmtTime12(a.time)}${a.id && !String(a.id).startsWith('web-') ? `\n\nCódigo: ${a.id}` : ''}${a.client && a.client.name ? `\n\nNombre: ${a.client.name}` : ''}`);
    }

    async function renderList() {
      list.setAttribute('aria-busy', 'true');
      const { items, source: src, error } = await M.Appointments.list();
      list.removeAttribute('aria-busy');
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
        : `<li class="citas-empty"><p>${view === 'proximas' ? 'No tienes citas próximas.' : 'Aún no hay citas anteriores.'}</p>${view === 'proximas' ? '<a class="btn btn-primary" href="#reservar">Agendar cita</a>' : ''}</li>`;
      source.textContent = src === 'agenda'
        ? 'Actualizadas con la agenda de MAJOBELLA.'
        : (error ? `No pudimos leer la agenda (${error}). Se muestran las citas guardadas en este dispositivo.` : 'Se muestran las citas reservadas desde este dispositivo.');
      list._items = items;
      if (payingId) mountBalance(payingId);
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
      renderList();
    }));

    list.addEventListener('click', async (e) => {
      const again = e.target.closest('[data-again]');
      if (again) { M.selectOnly(again.dataset.again.split(','), 'citas'); M.scrollTo('#reservar'); return; }
      const bal = e.target.closest('[data-balance]');
      if (bal) { payingId = bal.dataset.balance; renderList(); return; }
      if (e.target.closest('[data-balance-close]')) { payingId = null; renderList(); return; }
      const b = e.target.closest('[data-cancel]');
      if (!b) return;
      const id = b.dataset.cancel;
      const a = (list._items || []).find((x) => x.id === id);
      if (!a) return;
      if (pendingCancel !== id) { pendingCancel = id; renderList(); setTimeout(() => { if (pendingCancel === id) { pendingCancel = null; renderList(); } }, 8000); return; }
      pendingCancel = null;
      if (a.remote && M.BookingAPI.enabled()) {
        b.disabled = true; b.textContent = 'Cancelando…';
        try {
          const r = await M.BookingAPI.cancel(id, M.Appointments.auth(a));
          M.Appointments.update(id, { status: 'cancelada', payment: r.appointment && r.appointment.payment });
          M.toast && M.toast(r.refunded ? 'Cita cancelada. Te devolvimos el depósito en PayPal.' : 'Cita cancelada.');
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
