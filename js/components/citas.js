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
    function statusOf(a) {
      if (a.status === 'cancelada' || a.status === 'cancelacion-solicitada') return a.status;
      return a.status || 'pendiente';
    }

    function item(a, past) {
      const { d, m } = M.parseKey(a.date);
      const y = M.parseKey(a.date).y;
      const names = (a.services || []).map((s) => s.name).join(' + ');
      const st = statusOf(a);
      const label = past && st === 'confirmada' ? 'Realizada' : M.STATUS[st] || st;
      const cancelled = st === 'cancelada' || st === 'cancelacion-solicitada';
      const ids = (a.services || []).map((s) => s.id).filter((id) => M.serviceById[id]);
      const prep = !past && !cancelled ? M.prepFor(ids) : [];
      const again = ids.length ? `<button type="button" class="btn btn-quiet" data-again="${ids.join(',')}">Volver a reservar</button>` : '';
      const actions = past || cancelled ? (again ? `<div class="cita-actions">${again}</div>` : '') : `
        ${prep.length ? `<details class="cita-prep"><summary>Antes de tu cita</summary><ul>${prep.map(({ p }) => `<li>${M.escapeHtml(p)}</li>`).join('')}</ul></details>` : ''}
        <div class="cita-actions">
          <a class="btn btn-line" href="${calendarUrl(a)}" target="_blank" rel="noopener">Añadir al calendario</a>
          ${M.WhatsApp.isConfigured() ? `<a class="btn btn-quiet" href="${waLink(a, 'reprogramar')}" target="_blank" rel="noopener">Reprogramar</a>` : ''}
          ${canCancel(a) ? `<button type="button" class="btn btn-quiet" data-cancel="${M.escapeHtml(a.id)}">${pendingCancel === a.id ? 'Toca otra vez para cancelar' : 'Cancelar cita'}</button>` : ''}
        </div>`;
      return `
        <li class="cita${cancelled ? ' is-cancelled' : ''}">
          <div class="cita-date" aria-hidden="true"><span class="cd-day">${d}</span><span class="cd-month">${MONTH.format(Date.UTC(y, m, d)).replace('.', '')}</span></div>
          <div class="cita-body">
            <p class="cita-when">${M.weekdayName(a.date)} · ${M.fmtTime12(a.time)}</p>
            <p class="cita-what">${M.escapeHtml(names)}</p>
            <p class="cita-meta">${M.fmtDuration(a.durationMinutes)} · ${M.fmtPrice(a.totalPrice)}</p>
            ${actions}
          </div>
          <span class="cita-status st-${st}">${label}</span>
        </li>`;
    }

    function canCancel(a) {
      return (a.remote && M.BookingAPI.enabled() && M.Auth.token) || M.WhatsApp.isConfigured();
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
      const verb = kind === 'cancelar' ? 'cancelar' : 'reprogramar';
      return M.WhatsApp.link(`Hola, quiero ${verb} mi cita en MAJOBELLA.\n\nServicio: ${names}\n\nFecha: ${M.weekdayName(a.date)} ${M.dayMonth(a.date)}\n\nHora: ${M.fmtTime12(a.time)}${a.client && a.client.name ? `\n\nNombre: ${a.client.name}` : ''}`);
    }

    async function renderList() {
      list.setAttribute('aria-busy', 'true');
      const { items, source: src, error } = await M.Appointments.list();
      list.removeAttribute('aria-busy');
      const now = Date.now();
      const upcoming = items.filter((a) => new Date(a.end).getTime() >= now).sort((a, b) => a.start.localeCompare(b.start));
      const past = items.filter((a) => new Date(a.end).getTime() < now).sort((a, b) => b.start.localeCompare(a.start));
      tabs.forEach((t) => {
        const n = t.dataset.view === 'proximas' ? upcoming.length : past.length;
        t.querySelector('.n').textContent = n;
      });
      const rows = view === 'proximas' ? upcoming : past;
      list.innerHTML = rows.length
        ? rows.map((a) => item(a, view === 'anteriores')).join('')
        : `<li class="citas-empty"><p>${view === 'proximas' ? 'No tienes citas próximas.' : 'Aún no hay citas anteriores.'}</p>${view === 'proximas' ? '<a class="btn btn-primary" href="#reservar">Agendar cita</a>' : ''}</li>`;
      source.textContent = src === 'agenda'
        ? 'Sincronizadas con la agenda de MAJOBELLA.'
        : (error ? `No pudimos leer la agenda (${error}). Se muestran las citas de este dispositivo.` : 'Se muestran las citas reservadas desde este dispositivo.');
      list._items = items;
    }

    tabs.forEach((t) => t.addEventListener('click', () => {
      view = t.dataset.view;
      tabs.forEach((x) => { const on = x === t; x.classList.toggle('is-active', on); x.setAttribute('aria-selected', String(on)); });
      renderList();
    }));

    list.addEventListener('click', async (e) => {
      const again = e.target.closest('[data-again]');
      if (again) { M.selectOnly(again.dataset.again.split(','), 'citas'); M.scrollTo('#reservar'); return; }
      const b = e.target.closest('[data-cancel]');
      if (!b) return;
      const id = b.dataset.cancel;
      const a = (list._items || []).find((x) => x.id === id);
      if (!a) return;
      if (pendingCancel !== id) { pendingCancel = id; renderList(); setTimeout(() => { if (pendingCancel === id) { pendingCancel = null; renderList(); } }, 5000); return; }
      pendingCancel = null;
      if (a.remote && M.BookingAPI.enabled() && M.Auth.token) {
        b.disabled = true; b.textContent = 'Cancelando…';
        try { await M.BookingAPI.cancel(id, M.Auth.token); M.Appointments.update(id, { status: 'cancelada' }); }
        catch (err) { source.textContent = err.message; }
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
