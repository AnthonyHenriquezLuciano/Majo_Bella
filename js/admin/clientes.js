/* MAJOBELLA · Dashboard: Clientas
   Lista y ficha (citas, gasto, última visita, notas, fotos de antes/después y consentimiento),
   clientas por volver, de dónde vienen y reservas que no completaron el pago. */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const st = { tab: 'todas', q: '', sort: 'recientes', period: 'mes', profile: null };
  const thumbs = new Map(); // id de archivo → URL local
  const FILE_LABEL = { antes: 'Antes', despues: 'Después', consentimiento: 'Consentimiento', otro: 'Otros' };

  /* ---------- Clientas a partir de las citas ---------- */
  const paidOf = (a) => {
    const p = a.payment || {};
    let t = 0;
    if (p.depositPaid && p.refund !== 'reembolsado') t += Number(p.depositRD) || 0;
    if (p.balanceStatus === 'pagado' && a.status !== 'cancelada') t += Number(p.balanceRD) || 0;
    return t;
  };

  A.clients = () => {
    const map = new Map();
    const today = M.todayKey();
    A.data.items.filter((a) => a.status !== 'bloqueo' && a.client && a.client.name).forEach((a) => {
      const key = a.clientKey || A.clientKey(a.client.email, a.client.phone, a.client.name);
      if (!map.has(key)) map.set(key, { key, name: a.client.name, phone: '', email: '', appts: [], attempts: [] });
      const c = map.get(key);
      if (a.status === 'expirada') { c.attempts.push(a); return; }
      c.appts.push(a);
      c.name = a.client.name || c.name;
      c.phone = a.client.phone || c.phone;
      c.email = a.client.email || c.email;
    });
    const meta = new Map((A.data.clients || []).map((x) => [x.clave, x]));
    const files = A.data.files || [];
    return [...map.values()].filter((c) => c.appts.length).map((c) => {
      c.appts.sort((x, y) => x.start.localeCompare(y.start));
      const done = c.appts.filter((a) => a.status === 'completada');
      const upcoming = c.appts.filter((a) => a.status === 'confirmada' && a.date >= today);
      const m = meta.get(c.key) || {};
      return Object.assign(c, {
        name: m.nombre || c.name, phone: m.telefono || c.phone, email: m.correo || c.email,
        notes: m.notas || '', birthday: m.cumpleanos || '',
        visits: done.length, noShows: c.appts.filter((a) => a.status === 'no-asistio').length,
        spent: A.sum(c.appts, paidOf),
        lastVisit: done.length ? done[done.length - 1].date : '',
        next: upcoming[0] || null,
        firstDate: c.appts[0].date, firstCreated: c.appts[0].createdAt || c.appts[0].start,
        origin: (c.appts.find((a) => a.origin) || {}).origin || '',
        files: files.filter((f) => f.clave === c.key),
      });
    });
  };
  A.clientsIndex = () => A.clients().sort((a, b) => a.name.localeCompare(b.name, 'es'));

  /* ---------- Render ---------- */
  function render() {
    document.querySelectorAll('#cl-tabs [data-tab]').forEach((b) => { const on = b.dataset.tab === st.tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('[data-cl-pane]').forEach((p) => { p.hidden = p.dataset.clPane !== st.tab; });
    const clients = A.clients();
    const due = dueList(clients);
    const abandoned = abandonedList(clients);
    $('cl-n-todas').textContent = clients.length;
    $('cl-n-volver').textContent = due.filter((d) => d.days >= 0).length;
    $('cl-n-pagos').textContent = abandoned.length;
    const retouch = retouchList(clients);
    const bdays = birthdayList(clients);
    $('cl-n-retoques').textContent = retouch.length;
    $('cl-n-cumple').textContent = bdays.length;
    if (st.tab === 'retoques') renderRetouch(retouch);
    if (st.tab === 'cumple') renderBirthdays(bdays);
    if (st.tab === 'todas') renderAll(clients);
    if (st.tab === 'volver') renderDue(due);
    if (st.tab === 'origen') renderOrigin(clients);
    if (st.tab === 'pagos') renderAbandoned(abandoned);
    if (st.profile && $('dlg-client').open) renderProfile();
  }

  function renderAll(clients) {
    const q = st.q.trim().toLowerCase();
    let list = clients.filter((c) => !q || [c.name, c.phone, c.email].join(' ').toLowerCase().includes(q));
    const sorts = {
      recientes: (a, b) => (b.lastVisit || b.firstDate).localeCompare(a.lastVisit || a.firstDate),
      gasto: (a, b) => b.spent - a.spent,
      visitas: (a, b) => b.visits - a.visits,
      nombre: (a, b) => a.name.localeCompare(b.name, 'es'),
    };
    list = list.sort(sorts[st.sort]);
    $('cl-summary').textContent = `${A.plural(list.length, 'clienta')} · ${A.money(A.sum(list, (c) => c.spent))} cobrados en total`;
    $('cl-list').innerHTML = list.length ? `
      <table class="tbl">
        <thead><tr><th>Clienta</th><th class="num">Visitas</th><th class="num">Gastado</th><th>Última visita</th><th>Próxima cita</th></tr></thead>
        <tbody>${list.map((c) => `
          <tr data-client="${esc(c.key)}" tabindex="0">
            <td><span class="t-name">${esc(c.name)}</span><span class="t-sub">${esc(c.phone || c.email || '')}${c.noShows ? ` · <span class="tag tag-warn">${A.plural(c.noShows, 'ausencia')}</span>` : ''}${c.files.length ? ` · <span class="tag">${A.plural(c.files.length, 'archivo')}</span>` : ''}</span></td>
            <td class="num">${c.visits}</td>
            <td class="num">${A.money(c.spent)}</td>
            <td>${c.lastVisit ? A.shortDate(c.lastVisit) : '<span class="muted">Aún no</span>'}</td>
            <td>${c.next ? `${A.shortDate(c.next.date)}, ${M.fmtTime12(c.next.time)}` : '<span class="muted">—</span>'}</td>
          </tr>`).join('')}</tbody>
      </table>` : `<p class="empty">${q ? 'Ninguna clienta coincide con la búsqueda.' : 'Aún no hay clientas registradas.'}</p>`;
  }

  /* Por volver: según "volverDias" de cada servicio (una fila por clienta) */
  function dueList(clients) {
    const today = M.todayKey();
    const days = Object.fromEntries(A.services().map((s) => [s.id, s.returnDays]));
    const out = [];
    clients.forEach((c) => {
      if (c.next) return; // ya tiene cita
      const last = {};
      c.appts.filter((a) => a.status === 'completada').forEach((a) => (a.services || []).forEach((s) => { if (!last[s.id] || a.date > last[s.id].date) last[s.id] = { date: a.date, name: s.name }; }));
      const due = [];
      Object.entries(last).forEach(([id, v]) => {
        const every = days[id];
        if (!every) return;
        const dueDate = A.addDays(v.date, every);
        const diff = A.daysBetween(dueDate, today); // positivo: ya pasó la fecha
        if (diff >= -7 && diff <= 120) due.push({ serviceId: id, service: v.name, last: v.date, dueDate, days: diff, every });
      });
      if (!due.length) return;
      due.sort((a, b) => b.days - a.days);
      out.push({ client: c, items: due, days: due[0].days });
    });
    return out.sort((a, b) => b.days - a.days);
  }

  function renderDue(list) {
    const web = A.settingsMap().webUrl || '';
    $('cl-due').innerHTML = list.length ? list.map((d) => {
      const first = d.client.name.split(' ')[0];
      const main = d.items[0];
      const names = d.items.map((x) => x.service.toLowerCase());
      const svcText = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0];
      const weeks = Math.max(1, Math.round(A.daysBetween(main.last, M.todayKey()) / 7));
      const msg = `Hola ${first}, ¿cómo estás? Ya pasaron ${weeks} semanas desde tu servicio de ${main.service.toLowerCase()} en MAJOBELLA. ¿Te reservamos tu próxima cita de ${svcText}?${web ? ` Puedes elegir tu horario aquí: ${web}#reservar` : ''}`;
      const wa = A.waLink(d.client.phone, msg);
      const when = d.days > 0 ? `<span class="tag tag-warn">Le tocaba hace ${A.plural(d.days, 'día')}</span>` : d.days === 0 ? '<span class="tag tag-warn">Le toca hoy</span>' : `<span class="tag">Le toca en ${A.plural(-d.days, 'día')}</span>`;
      return `<li class="due">
        <div><button type="button" class="t-name link" data-client="${esc(d.client.key)}">${esc(d.client.name)}</button>
          <ul class="due-svcs">${d.items.map((x) => `<li>${esc(x.service)} · última vez ${A.shortDate(x.last)} · vuelve cada ${x.every} días</li>`).join('')}</ul>
          <p>${when}</p></div>
        <div class="due-actions">
          ${wa ? `<a class="act act-dark" href="${wa}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}
          <button type="button" class="act" data-book="${esc(d.client.key)}">Agendar</button>
        </div></li>`;
    }).join('') : '<li class="empty">Ninguna clienta está por volver en los próximos 7 días. Los días de cada servicio se cambian en Ajustes → Servicios.</li>';
  }

  /* Retoques: servicios con "retoque a los N días" sin retoque reservado */
  function retouchList(clients) {
    const today = M.todayKey();
    const svc = Object.fromEntries(A.services().filter((x) => x.retoqueDias > 0).map((x) => [x.id, x]));
    const out = [];
    clients.forEach((c) => {
      c.appts.filter((a) => a.status === 'completada').forEach((a) => {
        (a.services || []).forEach((sv) => {
          const def = svc[sv.id];
          if (!def) return;
          const ideal = A.addDays(a.date, def.retoqueDias);
          const after = c.appts.some((b) => b.id !== a.id && b.date > a.date && ['confirmada', 'completada'].includes(b.status) && (b.services || []).some((x) => x.id === sv.id));
          const diff = A.daysBetween(ideal, today);
          if (!after && diff >= -21 && diff <= 30) out.push({ client: c, appt: a, service: def, ideal, days: diff });
        });
      });
    });
    return out.sort((x, y) => x.ideal.localeCompare(y.ideal));
  }
  function renderRetouch(list) {
    const web = A.settingsMap().webUrl || '';
    $('cl-retouch').innerHTML = list.length ? list.map((r) => {
      const first = r.client.name.split(' ')[0];
      const wa = A.waLink(r.client.phone, `Hola ${first}, te escribimos de MAJOBELLA. Ya se acerca el retoque de tu ${r.service.name.toLowerCase()} (lo ideal es alrededor del ${M.dayMonth(r.ideal)}). ¿Te lo agendamos?${web ? ` También puedes reservarlo aquí: ${web}?servicio=${r.service.id}#reservar` : ''}`);
      const when = r.days > 0 ? `<span class="tag tag-warn">Fecha ideal hace ${A.plural(r.days, 'día')}</span>` : r.days === 0 ? '<span class="tag tag-warn">Fecha ideal: hoy</span>' : `<span class="tag">Fecha ideal en ${A.plural(-r.days, 'día')}</span>`;
      return `<li class="due"><div><button type="button" class="t-name link" data-client="${esc(r.client.key)}">${esc(r.client.name)}</button>
          <p class="t-sub">${esc(r.service.name)} el ${A.shortDate(r.appt.date)} · retoque ideal ${A.shortDate(r.ideal)}${r.appt.retouchNoticeAt && /^\d{4}-/.test(r.appt.retouchNoticeAt) ? ' · correo enviado' : ''}</p><p>${when}</p></div>
        <div class="due-actions">${wa ? `<a class="act act-dark" href="${wa}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}<button type="button" class="act" data-book="${esc(r.client.key)}">Agendar</button></div></li>`;
    }).join('') : `<li class="empty">${A.services().some((x) => x.retoqueDias > 0) ? 'No hay retoques pendientes en estas semanas.' : 'Ningún servicio tiene días de retoque. Configúralo en Ajustes → Servicios.'}</li>`;
  }

  /* Cumpleaños de los próximos 30 días */
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const mdOf = (v) => { const t = String(v || ''); const m = t.match(/^(?:\d{4}-)?(\d{2})-(\d{2})$/); return m ? `${m[1]}-${m[2]}` : ''; };
  function birthdayList(clients) {
    const today = M.todayKey();
    const out = [];
    clients.forEach((c) => {
      const md = mdOf(c.birthday);
      if (!md) return;
      for (let i = 0; i <= 30; i++) { const k = A.addDays(today, i); if (k.slice(5) === md) { out.push({ client: c, md, days: i }); break; } }
    });
    return out.sort((a, b) => a.days - b.days);
  }
  function renderBirthdays(list) {
    const s = A.settingsMap();
    const auto = /^s[ií]$/i.test(s.cumpleActivo || '');
    $('cl-bday-note').textContent = auto ? `Ese día les llega un correo con un código de ${s.cumpleDescuento || 15}% (válido ${s.cumpleDias || 30} días). Se cambia en Correos.` : 'El correo de cumpleaños está apagado (Correos → Cumpleaños).';
    $('cl-bday').innerHTML = list.length ? list.map((b) => {
      const [m, d] = b.md.split('-').map(Number);
      const wa = A.waLink(b.client.phone, `¡Feliz cumpleaños, ${b.client.name.split(' ')[0]}! De parte de todo MAJOBELLA te deseamos un día precioso.`);
      return `<li class="due"><div><button type="button" class="t-name link" data-client="${esc(b.client.key)}">${esc(b.client.name)}</button>
        <p class="t-sub">${d} de ${MONTHS[m - 1]} · ${b.days === 0 ? '<strong>hoy</strong>' : b.days === 1 ? 'mañana' : `en ${b.days} días`}</p></div>
        <div class="due-actions">${wa ? `<a class="act" href="${wa}" target="_blank" rel="noopener">Felicitar por WhatsApp</a>` : ''}</div></li>`;
    }).join('') : '<li class="empty">Nadie cumple años en los próximos 30 días. Las clientas pueden dejar su cumpleaños al reservar, o lo añades en su ficha.</li>';
  }

  /* De dónde vienen */
  function periodRange() {
    const today = M.todayKey();
    if (st.period === 'mes') return A.monthRange(today);
    if (st.period === '3m') return { from: A.shiftMonth(today, -2), to: today };
    if (st.period === 'ano') return { from: `${today.slice(0, 4)}-01-01`, to: today };
    return { from: '0000-01-01', to: '9999-12-31' };
  }
  function renderOrigin(clients) {
    const r = periodRange();
    const inP = (iso) => { const k = A.dayOf(iso); return k >= r.from && k <= r.to; };
    const fresh = clients.filter((c) => inP(c.firstCreated));
    const by = (list, fn) => { const m = {}; list.forEach((x) => { const k = fn(x) || 'Sin dato'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const total = fresh.length;
    $('cl-origin-new').innerHTML = A.hbars(by(fresh, (c) => c.origin).map(([k, n]) => ({ label: k, value: n, text: `${n} · ${Math.round((n / total) * 100)}%` })), 'Sin clientas nuevas en este periodo.');
    const bookings = A.data.items.filter((a) => a.status !== 'bloqueo' && a.status !== 'expirada' && a.createdAt && inP(a.createdAt));
    const bt = bookings.length;
    $('cl-origin-all').innerHTML = A.hbars(by(bookings, (a) => a.origin).map(([k, n]) => ({ label: k, value: n, text: `${n} · ${Math.round((n / bt) * 100)}%` })), 'Sin reservas en este periodo.');
    const channels = by(bookings.filter((a) => a.channel && a.channel !== 'dashboard'), (a) => a.channel);
    $('cl-origin-channel').innerHTML = channels.length ? `<table class="tbl"><thead><tr><th>Llegaron desde</th><th class="num">Reservas</th></tr></thead><tbody>${channels.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table>`
      : '<p class="chart-empty">Aún no hay datos de enlaces. Comparte la web con ?utm_source=instagram (o tiktok, google…) para saber de qué publicación llegan.</p>';
    $('cl-origin-kpi').innerHTML = `<div class="kpi"><p class="kpi-l">Clientas nuevas</p><p class="kpi-v">${total}</p><p class="kpi-s">en el periodo</p></div>
      <div class="kpi"><p class="kpi-l">Reservas</p><p class="kpi-v">${bt}</p><p class="kpi-s">${bookings.filter((a) => a.createdBy === 'estudio').length} creadas a mano</p></div>`;
  }

  /* Reservas que no completaron el pago */
  function abandonedList(clients) {
    const confirmedAfter = (a) => {
      const key = a.clientKey;
      const c = clients.find((x) => x.key === key);
      return c && c.appts.some((b) => (b.createdAt || '') > (a.createdAt || ''));
    };
    return A.data.items.filter((a) => a.status === 'expirada' && !confirmedAfter(a)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
  function renderAbandoned(list) {
    const month = A.monthRange(M.todayKey());
    const inM = (a) => { const k = A.dayOf(a.createdAt || a.start); return k >= month.from && k <= month.to; };
    const tried = A.data.items.filter((a) => a.createdBy !== 'estudio' && (a.status === 'expirada' || a.payment.depositMethod === 'paypal') && inM(a));
    const lost = tried.filter((a) => a.status === 'expirada');
    const rate = tried.length ? Math.round((lost.length / tried.length) * 100) : 0;
    $('cl-pay-kpi').innerHTML = `<div class="kpi"><p class="kpi-l">Este mes</p><p class="kpi-v">${rate}%</p><p class="kpi-s">${lost.length} de ${tried.length} no completaron el pago</p></div>
      <div class="kpi"><p class="kpi-l">Valor no cobrado</p><p class="kpi-v">${A.money(A.sum(lost, (a) => a.totalPrice))}</p><p class="kpi-s">en citas sin completar este mes</p></div>`;
    $('cl-pay-list').innerHTML = list.length ? list.map((a) => {
      const first = (a.client.name || '').split(' ')[0];
      const msg = `Hola ${first}, te escribimos de MAJOBELLA. Vimos que intentaste reservar ${a.servicesText.toLowerCase()} para el ${M.weekdayName(a.date).toLowerCase()} ${M.dayMonth(a.date)} y no se completó el pago. ¿Te ayudamos a terminar tu reserva?`;
      const wa = A.waLink(a.client.phone, msg);
      return `<li class="due">
        <div><p class="t-name">${esc(a.client.name)}</p>
          <p class="t-sub">${esc(a.servicesText)} · ${A.money(a.totalPrice)} · quería el ${A.shortDate(a.date)}, ${M.fmtTime12(a.time)}</p>
          <p class="t-sub">Intentó pagar el ${a.createdAt ? new Date(a.createdAt).toLocaleString('es-DO', { timeZone: M.config.schedule.timeZone, dateStyle: 'medium', timeStyle: 'short' }) : '—'}${a.origin ? ` · llegó por ${esc(a.origin)}` : ''}</p></div>
        <div class="due-actions">
          ${wa ? `<a class="act act-dark" href="${wa}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}
          ${a.client.email ? `<a class="act" href="mailto:${esc(a.client.email)}">Correo</a>` : ''}
        </div></li>`;
    }).join('') : '<li class="empty">Nadie dejó un pago a medias.</li>';
  }

  /* ---------- Ficha de la clienta ---------- */
  function openProfile(key) {
    st.profile = key;
    renderProfile();
    A.open('dlg-client');
  }
  A.openClient = openProfile;

  function renderProfile() {
    const c = A.clients().find((x) => x.key === st.profile);
    if (!c) { $('cp-body').innerHTML = '<p class="empty">No encontramos a esta clienta.</p>'; return; }
    const wa = A.waLink(c.phone, `Hola ${c.name.split(' ')[0]}, te escribimos de MAJOBELLA.`);
    const k = (l, v, s) => `<div class="kpi"><p class="kpi-l">${l}</p><p class="kpi-v">${v}</p>${s ? `<p class="kpi-s">${s}</p>` : ''}</div>`;
    const group = (tipo) => {
      const files = c.files.filter((f) => f.tipo === tipo).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
      return `<div class="fgroup">
        <div class="fg-head"><h4>${FILE_LABEL[tipo]}</h4>
          <label class="act act-file">Subir<input type="file" data-upload="${tipo}" accept="${tipo === 'consentimiento' ? 'image/*,application/pdf' : 'image/*'}" multiple hidden></label></div>
        <div class="fgrid">${files.length ? files.map((f) => `
          <figure class="fthumb" data-file="${esc(f.id)}">
            <button type="button" class="ft-open" data-view-file="${esc(f.id)}" aria-label="Ver ${esc(f.nombre)}">${f.mime === 'application/pdf' ? '<span class="ft-pdf">PDF</span>' : `<img alt="" data-thumb="${esc(f.id)}"${thumbs.has(f.id) ? ` src="${thumbs.get(f.id)}"` : ''}>`}</button>
            <figcaption>${A.shortDate(f.fecha)}</figcaption>
          </figure>`).join('') : '<p class="hint">Sin archivos.</p>'}</div></div>`;
    };
    $('cp-title').textContent = c.name;
    $('cp-body').innerHTML = `
      <p class="cp-contact">${c.phone ? `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>` : ''}${wa ? ` · <a href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.origin ? ` · Nos conoció por ${esc(c.origin)}` : ''}</p>
      <div class="kpis kpis-4">
        ${k('Visitas', c.visits, c.noShows ? `${A.plural(c.noShows, 'ausencia')}` : 'realizadas')}
        ${k('Ha gastado', A.money(c.spent), 'pagos recibidos')}
        ${k('Última visita', c.lastVisit ? A.shortDate(c.lastVisit) : '—', c.lastVisit ? `hace ${A.plural(A.daysBetween(c.lastVisit, M.todayKey()), 'día')}` : '')}
        ${k('Próxima cita', c.next ? A.shortDate(c.next.date) : '—', c.next ? M.fmtTime12(c.next.time) : '<button type="button" class="link" data-book="' + esc(c.key) + '">Agendar</button>')}
      </div>
      <form class="cp-notes" id="cp-notes">
        <label>Notas de la clienta <span class="opt">(alergias, tipo de piel, pigmento y técnica usados…)</span>
          <textarea name="notas" rows="4" maxlength="3000">${esc(c.notes)}</textarea></label>
        <div class="row2">
          <label>Cumpleaños<span class="bday-sel">${bdaySelects(c.birthday)}</span></label>
          <div class="cp-save"><button type="submit" class="btn-dark">Guardar notas</button></div>
        </div>
      </form>
      <div class="cp-h-row"><h3 class="cp-h">Fotos y consentimiento</h3>${c.files.some((f) => f.tipo === 'antes') && c.files.some((f) => f.tipo === 'despues') ? '<button type="button" class="act" data-publish>Publicar en la galería</button>' : ''}</div>
      <p class="hint">Se guardan en una carpeta privada de tu Google Drive. Las fotos se reducen a buena calidad antes de subir.</p>
      <label class="cp-date">Fecha de las fotos <input type="date" id="cp-file-date" value="${M.todayKey()}"></label>
      <p class="cp-up-msg" id="cp-up-msg" aria-live="polite"></p>
      ${['antes', 'despues', 'consentimiento'].map(group).join('')}${c.files.some((f) => f.tipo === 'otro') ? group('otro') : ''}
      ${profileExtras(c)}
      <h3 class="cp-h">Citas</h3>
      <ul class="cp-appts">${c.appts.slice().reverse().map((a) => `
        <li><span class="cpa-d">${A.shortDate(a.date)} · ${M.fmtTime12(a.time)}</span><span class="cpa-s">${esc(a.servicesText)} · ${A.money(a.totalPrice)}</span><span class="pill st-${esc(a.status)}">${A.STATUS[a.status] || esc(a.status)}</span></li>`).join('')}</ul>`;
    loadThumbs(c.files);
  }

  function bdaySelects(v) {
    const md = mdOf(v);
    const [m, d] = md ? md.split('-') : ['', ''];
    return `<select name="bday-d" aria-label="Día"><option value="">Día</option>${Array.from({ length: 31 }, (_, i) => { const x = String(i + 1).padStart(2, '0'); return `<option value="${x}"${x === d ? ' selected' : ''}>${i + 1}</option>`; }).join('')}</select>
      <select name="bday-m" aria-label="Mes"><option value="">Mes</option>${MONTHS.map((n, i) => { const x = String(i + 1).padStart(2, '0'); return `<option value="${x}"${x === m ? ' selected' : ''}>${n}</option>`; }).join('')}</select>`;
  }
  function profileExtras(c) {
    const parts = [];
    const l = A.loyaltyOf ? A.loyaltyOf(c) : null;
    if (l) parts.push(`<div class="cp-extra"><p class="kpi-l">Fidelidad</p><p>${l.eligible ? `<strong>Premio disponible:</strong> ${A.loyaltyText(l)} en su próxima cita` : `${l.visits} de ${l.every} visitas para el premio de ${A.loyaltyText(l)}`}</p></div>`);
    const key = c.key;
    const bonos = (A.data.bonos || []).filter((b) => A.clientKey(b.correo, b.telefono, b.clienta) === key || (b.correo && b.correo === c.email));
    if (bonos.length) parts.push(`<div class="cp-extra"><p class="kpi-l">Paquetes</p>${bonos.map((b) => `<p><code>${esc(b.codigo)}</code> · ${esc(b.nombre)} · ${Number(b.usadas) || 0} de ${b.sesiones} usadas${b.estado !== 'activo' ? ` · ${esc(b.estado)}` : ''}</p>`).join('')}</div>`);
    const signed = c.appts.filter((a) => a.consent && a.consent.signed).length;
    const pending = c.appts.filter((a) => a.status === 'confirmada' && a.consent && a.consent.needed && !a.consent.signed);
    if (signed || pending.length) parts.push(`<div class="cp-extra"><p class="kpi-l">Consentimiento</p>${signed ? `<p>${A.plural(signed, 'firmado')} en la web (PDF en sus archivos)</p>` : ''}${pending.map((a) => `<p>Falta para el ${A.shortDate(a.date)} · <a href="${esc(a.consent.url)}" target="_blank" rel="noopener">Abrir para firmar</a></p>`).join('')}</div>`);
    const photos = c.appts.find((a) => a.photoPermission);
    if (photos) parts.push(`<div class="cp-extra"><p class="kpi-l">Fotos en la web</p><p>${photos.photoPermission === 'si' ? 'Autorizó publicar sus fotos sin su nombre' : 'No autorizó publicar sus fotos'}</p></div>`);
    return parts.length ? `<div class="cp-extras">${parts.join('')}</div>` : '';
  }

  async function loadThumbs(files) {
    for (const f of files) {
      if (f.mime === 'application/pdf' || thumbs.has(f.id)) continue;
      try {
        const url = await fileUrl(f.id);
        document.querySelectorAll(`[data-thumb="${CSS.escape(f.id)}"]`).forEach((img) => { img.src = url; });
      } catch (e) { /* se intenta al abrir */ }
    }
  }
  async function fileUrl(id) {
    if (thumbs.has(id)) return thumbs.get(id);
    const res = await A.call('adminFile', { id });
    const bin = atob(res.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: res.mime }));
    thumbs.set(id, url);
    return url;
  }

  A.fileUrl = fileUrl;

  async function viewFile(id) {
    const f = A.data.files.find((x) => x.id === id);
    if (!f) return;
    $('fv-title').textContent = `${FILE_LABEL[f.tipo] || 'Archivo'} · ${A.shortDate(f.fecha)}`;
    $('fv-body').innerHTML = '<p class="muted">Cargando…</p>';
    $('fv-delete').dataset.id = id;
    A.open('dlg-file');
    try {
      const url = await fileUrl(id);
      $('fv-body').innerHTML = f.mime === 'application/pdf'
        ? `<iframe src="${url}" title="${esc(f.nombre)}"></iframe>`
        : `<img src="${url}" alt="${esc(f.nombre)}">`;
      $('fv-download').href = url;
      $('fv-download').download = f.nombre;
    } catch (err) { $('fv-body').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  }

  /* Reduce las fotos a 1600 px y las convierte a JPG antes de subir */
  function toBase64(file) {
    if (file.type === 'application/pdf') {
      if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error(`${file.name} pesa más de 12 MB.`));
      return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ data: String(r.result).split(',')[1], mime: 'application/pdf', name: file.name }); r.onerror = () => rej(new Error('No se pudo leer el archivo.')); r.readAsDataURL(file); });
    }
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res({ data: c.toDataURL('image/jpeg', 0.86).split(',')[1], mime: 'image/jpeg', name: file.name.replace(/\.\w+$/, '') + '.jpg' });
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(`No se pudo abrir ${file.name}. Usa JPG o PNG.`)); };
      img.src = url;
    });
  }

  async function upload(input) {
    const tipo = input.dataset.upload;
    const files = [...input.files];
    const msg = $('cp-up-msg');
    for (let i = 0; i < files.length; i++) {
      msg.textContent = `Subiendo ${i + 1} de ${files.length}…`;
      try {
        const f = await toBase64(files[i]);
        const res = await A.call('adminUpload', { clave: st.profile, tipo, mime: f.mime, nombre: f.name, data: f.data, fecha: $('cp-file-date').value });
        A.data.files.push(res.file);
      } catch (err) { msg.textContent = err.message; return; }
    }
    renderProfile();
    A.toast(files.length > 1 ? `${files.length} archivos subidos.` : 'Archivo subido.');
  }

  async function saveNotes(e) {
    e.preventDefault();
    const c = A.clients().find((x) => x.key === st.profile);
    const f = e.target;
    await A.busy(f.querySelector('button'), async () => {
      try {
        const bd = f['bday-d'].value, bm = f['bday-m'].value;
        const res = await A.call('adminSaveClient', { clave: c.key, nombre: c.name, telefono: c.phone, correo: c.email, notas: f.notas.value, cumpleanos: bd && bm ? `${bm}-${bd}` : '' });
        A.upsert('clients', res.client, 'clave');
        A.toast('Notas guardadas.');
      } catch (err) { A.toast(err.message); }
    });
  }

  /* ---------- Inicio ---------- */
  A.sections.clientas = {
    render,
    init() {
      document.querySelectorAll('#cl-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; render(); }));
      $('cl-q').addEventListener('input', (e) => { st.q = e.target.value; render(); });
      $('cl-sort').addEventListener('change', (e) => { st.sort = e.target.value; render(); });
      $('cl-period').addEventListener('change', (e) => { st.period = e.target.value; render(); });
      document.addEventListener('click', (e) => {
        const book = e.target.closest('[data-book]');
        if (book) {
          const c = A.clients().find((x) => x.key === book.dataset.book);
          if ($('dlg-client').open) A.close('dlg-client');
          A.go('agenda');
          A.openNewAppointment({ client: c ? { name: c.name, phone: c.phone, email: c.email } : null });
          return;
        }
        const row = e.target.closest('[data-client]');
        if (row) { openProfile(row.dataset.client); return; }
        if (e.target.closest('[data-publish]')) { A.openPublish(st.profile); return; }
        const v = e.target.closest('[data-view-file]');
        if (v) viewFile(v.dataset.viewFile);
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-client]')) openProfile(e.target.dataset.client); });
      $('cp-body').addEventListener('change', (e) => { if (e.target.matches('[data-upload]')) upload(e.target); });
      $('cp-body').addEventListener('submit', (e) => { if (e.target.id === 'cp-notes') saveNotes(e); });
      $('fv-delete').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Toca otra vez para borrar'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Borrar'; }, 4000); return; }
        b.dataset.confirm = ''; b.textContent = 'Borrar';
        await A.busy(b, async () => {
          try {
            await A.call('adminDeleteFile', { id: b.dataset.id });
            A.remove('files', b.dataset.id);
            A.close('dlg-file');
            renderProfile();
            A.toast('Archivo borrado.');
          } catch (err) { A.toast(err.message); }
        });
      });
    },
  };
})(window.MJB);
