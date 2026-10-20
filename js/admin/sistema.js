/* MAJOBELLA · Dashboard: cuentas para transferencias, seguridad y avisos del sistema (Ajustes)
   y cierre de sesión por inactividad. */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const TYPES = { pago: 'Cobro', correo: 'Correo', automatizacion: 'Automático', sistema: 'Sistema' };
  let editing = null;

  /* ---------- Pago por transferencia ---------- */
  function renderTransfer() {
    const s = A.settingsMap();
    const on = !/^no$/i.test(s.transferenciaActiva || 'si');
    const accs = (A.data.accounts || []).slice().sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    const active = accs.filter((a) => !/^no$/i.test(a.activa));
    $('aj-transfer-set').innerHTML = `
      <label class="set"><span class="set-l">Aceptar depósitos por transferencia</span><span class="set-i"><select name="transferenciaActiva" data-set><option value="si"${on ? ' selected' : ''}>Sí</option><option value="no"${on ? '' : ' selected'}>No</option></select></span></label>
      <label class="set"><span class="set-l">Tiempo para subir el comprobante</span><span class="set-i"><input name="transferenciaMinutos" data-set type="number" min="10" max="1440" step="5" value="${esc(s.transferenciaMinutos || '60')}"><em>min</em></span></label>
      <p class="hint">${on && active.length ? `Activo en la web con ${A.plural(active.length, 'cuenta', 'cuentas')}.` : on ? '<b>Falta añadir al menos una cuenta</b> para que aparezca en la web.' : 'Desactivado: en la web solo se paga con PayPal.'} Si la clienta no sube el comprobante a tiempo, el horario se libera solo.</p>`;
    $('aj-accounts').innerHTML = accs.length ? accs.map((a) => `
      <li class="acc${/^no$/i.test(a.activa) ? ' is-off' : ''}">
        <div><p class="acc-bank">${esc(a.banco)} <span>· ${esc(a.tipo || '')}</span>${/^no$/i.test(a.activa) ? ' <span class="pill st-cancelada">Oculta</span>' : ''}</p>
          <p class="acc-num">${esc(a.numero)}</p>
          <p class="acc-sub">${esc(a.titular)}${a.documento ? ` · ${esc(a.documento)}` : ''}${a.nota ? ` · ${esc(a.nota)}` : ''}</p></div>
        <button type="button" class="act" data-acc="${esc(a.id)}">Editar</button></li>`).join('')
      : '<li class="empty">Aún no hay cuentas. Añade la cuenta donde quieres recibir los depósitos.</li>';
  }
  function openAccount(id) {
    editing = id ? (A.data.accounts || []).find((x) => x.id === id) : null;
    const f = $('acc-form');
    f.reset();
    $('acc-msg').textContent = '';
    $('acc-del').hidden = !editing;
    if (editing) {
      ['banco', 'numero', 'titular', 'documento', 'nota', 'orden'].forEach((k) => { f[k].value = editing[k] || ''; });
      f.tipo.value = editing.tipo || 'Ahorros';
      f.activa.checked = !/^no$/i.test(editing.activa);
    } else f.orden.value = (A.data.accounts || []).length + 1;
    A.open('dlg-acc');
  }
  async function saveAccount(e) {
    e.preventDefault();
    const f = $('acc-form');
    const account = { id: editing ? editing.id : '', banco: f.banco.value.trim(), tipo: f.tipo.value, numero: f.numero.value.trim(), titular: f.titular.value.trim(), documento: f.documento.value.trim(), nota: f.nota.value.trim(), orden: f.orden.value, activa: f.activa.checked ? 'si' : 'no' };
    if (!account.banco || !account.numero || !account.titular) { $('acc-msg').textContent = 'Escribe el banco, el número y el titular.'; return; }
    await A.busy($('acc-save'), async () => {
      try {
        const res = await A.call('adminSaveAccount', { account });
        A.data.accounts = res.accounts;
        A.close('dlg-acc'); renderTransfer();
        A.toast('Cuenta guardada. Ya se ve en la web al pagar por transferencia.');
      } catch (err) { $('acc-msg').textContent = err.message; }
    });
  }
  async function deleteAccount() {
    if (!editing || !confirm(`¿Eliminar la cuenta ${editing.banco} ${editing.numero}?`)) return;
    await A.busy($('acc-del'), async () => {
      try {
        const res = await A.call('adminDeleteAccount', { id: editing.id });
        A.data.accounts = res.accounts;
        A.close('dlg-acc'); renderTransfer(); A.toast('Cuenta eliminada.');
      } catch (err) { $('acc-msg').textContent = err.message; }
    });
  }

  /* ---------- Seguridad ---------- */
  function shareLine(title, info, what) {
    if (!info) return `<li class="sec-item"><span class="sec-dot is-warn"></span><div><p class="sec-t">${title}</p><p class="sec-s">No se pudo revisar con quién está compartida.</p></div></li>`;
    const others = [...(info.editors || []), ...(info.viewers || [])].filter((e) => !(A.data.security.admins || []).map((x) => x.toLowerCase()).includes(String(e).toLowerCase()));
    const open = info.access && info.access !== 'PRIVATE';
    const ok = !open && !others.length;
    return `<li class="sec-item"><span class="sec-dot${ok ? '' : ' is-warn'}"></span><div><p class="sec-t">${title}</p><p class="sec-s">${ok ? `Privada: solo tú la ves. Guarda ${what}.`
      : `${open ? '<b>Cualquiera con el enlace puede abrirla.</b> ' : ''}${others.length ? `También la ven: ${others.map(esc).join(', ')}. ` : ''}Guarda ${what}: en Google Drive → Compartir, deja solo tu cuenta.`}</p></div></li>`;
  }
  function renderSecurity() {
    const sec = A.data.security || {};
    const s = A.settingsMap();
    const ts = sec.turnstile || {};
    const tsState = ts.siteKey && ts.secret ? ['', 'Activa: las reservas, compras y la lista de espera piden la verificación (casi siempre invisible). En la app de clientas se pide iniciar sesión en su lugar.']
      : ts.siteKey ? ['is-warn', `Falta la clave secreta: añade TURNSTILE_SECRET en ${sec.database ? 'los secretos de Supabase' : 'Apps Script → Propiedades del script'}.`]
        : ['is-off', `Desactivada. Pega aquí la clave del sitio de Cloudflare Turnstile (gratis) y la secreta en ${sec.database ? 'los secretos de Supabase' : 'Apps Script'}.`];
    const acc = (sec.accesses || []).slice(0, 8);
    $('aj-security').innerHTML = `<ul class="sec-list">
      <li class="sec-item"><span class="sec-dot"></span><div><p class="sec-t">Acceso al dashboard</p><p class="sec-s">Solo pueden entrar estas cuentas de Google: <b>${(sec.admins || []).map(esc).join(', ') || '—'}</b>. Se cambian en ${sec.database ? 'Supabase → Edge Functions → Secrets' : 'Apps Script → Propiedades del script'} → ADMIN_EMAILS.</p></div></li>
      <li class="sec-item"><span class="sec-dot${(M.config.app || {}).studioAndroidUrl ? '' : ' is-off'}"></span><div><p class="sec-t">App del estudio (Android)</p><p class="sec-s">La agenda, las transferencias por confirmar, tus clientas y el dinero en tu celular, con un aviso por cada reserva nueva. Entra con la misma cuenta del dashboard. ${(M.config.app || {}).studioAndroidUrl ? `<a href="${esc(M.config.app.studioAndroidUrl)}">Descargar MAJOBELLA Estudio</a>` : 'Se publica en GitHub → Releases → «app» cuando se arman las apps.'}</p></div></li>
      ${sec.database ? `<li class="sec-item"><span class="sec-dot"></span><div><p class="sec-t">Base de datos</p><p class="sec-s">PostgreSQL en Supabase, privada: nadie la lee desde el navegador ni desde las apps, todo pasa por la API. Guarda las citas y los datos de tus clientas.</p></div></li>`
        : shareLine('Hoja de cálculo', sec.sheet, 'las citas y los datos de tus clientas')}
      ${shareLine(sec.database ? 'Archivos (carpeta privada)' : 'Carpeta de fichas en Drive', sec.folder, 'fotos, consentimientos y comprobantes')}
      <li class="sec-item"><span class="sec-dot${sec.paypalEnv === 'live' ? '' : ' is-warn'}"></span><div><p class="sec-t">PayPal</p><p class="sec-s">${sec.paypalEnv === 'live' ? 'Cobrando de verdad (modo en vivo).' : 'En modo de prueba: no se cobra dinero real. Cámbialo a «live» cuando quieras cobrar.'} La clave secreta vive solo en ${sec.database ? 'los secretos de Supabase' : 'Apps Script'}.</p></div></li>
      <li class="sec-item"><span class="sec-dot ${tsState[0]}"></span><div><p class="sec-t">Protección contra robots</p><p class="sec-s">${tsState[1]}</p>
        <label class="set"><span class="set-l">Clave del sitio (Turnstile)</span><span class="set-i"><input name="turnstileSiteKey" data-set value="${esc(s.turnstileSiteKey || '')}" placeholder="0x4AAAA…" autocomplete="off"></span></label></div></li>
      <li class="sec-item"><span class="sec-dot"></span><div><p class="sec-t">Cerrar sesión por inactividad</p>
        <label class="set"><span class="set-l">Cerrar el dashboard tras</span><span class="set-i"><input name="adminInactividadMin" data-set type="number" min="5" max="480" step="5" value="${esc(s.adminInactividadMin || '30')}"><em>min sin usar</em></span></label></div></li>
      <li class="sec-item"><span class="sec-dot"></span><div><p class="sec-t">Últimos accesos</p>${acc.length ? `<ul class="acc-log">${acc.map((x) => `<li>${esc(x.email)} · ${esc(x.device || 'dispositivo')} · ${new Date(x.at).toLocaleString('es-DO', { timeZone: M.config.schedule.timeZone, dateStyle: 'medium', timeStyle: 'short' })}</li>`).join('')}</ul>` : '<p class="sec-s">Aún no hay registros.</p>'}
        <p class="sec-s">Si ves un acceso que no reconoces, cambia la contraseña de esa cuenta de Google y activa la verificación en dos pasos.</p></div></li>
    </ul>`;
  }

  /* ---------- Avisos del sistema ---------- */
  function renderErrors() {
    const list = (A.data.errors || []);
    const open = list.filter((e) => !e.resuelto), done = list.filter((e) => e.resuelto).slice(0, 15);
    $('aj-err-all').hidden = !open.length;
    $('aj-errors').innerHTML = list.length ? open.concat(done).map((e) => `
      <li class="syserr${e.resuelto ? ' is-done' : ''}${e.tipo === 'pago' && !e.resuelto ? ' is-hot' : ''}">
        <div><p class="err-t"><span class="pill ${e.resuelto ? 'st-completada' : e.tipo === 'pago' ? 'st-cancelada' : 'st-retenida'}">${esc(TYPES[e.tipo] || e.tipo)}</span> ${new Date(e.fecha).toLocaleString('es-DO', { timeZone: M.config.schedule.timeZone, dateStyle: 'medium', timeStyle: 'short' })}${e.ref ? ` · ${esc(e.ref)}` : ''}</p>
          <p class="err-m">${esc(e.mensaje)}</p>${e.detalle ? `<p class="err-d">${esc(e.detalle)}</p>` : ''}</div>
        ${e.resuelto ? '<span class="muted">Revisado</span>' : `<button type="button" class="act" data-err="${esc(e.row)}">Revisado</button>`}</li>`).join('')
      : '<li class="empty">Todo funciona bien: no hay avisos.</li>';
    updateBadge();
  }
  function updateBadge() {
    const n = ((A.data && A.data.errors) || []).filter((e) => !e.resuelto).length;
    const p = ((A.data && A.data.items) || []).filter((a) => a.status === 'por-confirmar' || a.refundPending).length;
    A.badge('.ad-tabs [data-sec="ajustes"], .more-list [data-sec="ajustes"], #ad-more', n, `${n} avisos del sistema`);
    A.badge('.ad-tabs [data-sec="agenda"], .ad-bottom [data-sec="agenda"]', p, `${p} pendientes`);
  }
  async function resolve(payload, btn) {
    await A.busy(btn, async () => {
      try { const res = await A.call('adminResolveErrors', payload); A.data.errors = res.errors; renderErrors(); A.render(); }
      catch (err) { A.toast(err.message); }
    });
  }

  const base = A.sections.ajustes;
  A.sections.ajustes = Object.assign({}, base, {
    render() { base.render(); renderTransfer(); renderSecurity(); renderErrors(); },
    init() {
      base.init();
      $('aj-acc-add').addEventListener('click', () => openAccount(null));
      $('aj-accounts').addEventListener('click', (e) => { const b = e.target.closest('[data-acc]'); if (b) openAccount(b.dataset.acc); });
      $('acc-form').addEventListener('submit', saveAccount);
      $('acc-del').addEventListener('click', deleteAccount);
      $('aj-errors').addEventListener('click', (e) => { const b = e.target.closest('[data-err]'); if (b) resolve({ row: b.dataset.err }, b); });
      $('aj-err-all').addEventListener('click', (e) => resolve({ all: true }, e.currentTarget));
      document.addEventListener('click', (e) => { if (e.target.closest('[data-goto-errors]')) setTimeout(() => $('aj-errors-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); });
    },
  });

  // La insignia de avisos se actualiza en cualquier sección
  const render0 = A.render;
  A.render = () => { render0(); updateBadge(); };

  /* ---------- Cierre de sesión por inactividad ---------- */
  if (!A.DEMO) {
    let last = Date.now();
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { last = Date.now(); }, { passive: true }));
    setInterval(() => {
      if (!A.data || !M.Auth.user) return;
      const mins = Number(A.settingsMap().adminInactividadMin) || 30;
      if (Date.now() - last > mins * 60000) {
        last = Date.now();
        M.Auth.signOut();
        A.showGate(`Cerramos la sesión tras ${mins} minutos sin usar el dashboard. Vuelve a entrar con Google.`);
      }
    }, 30000);
  }
})(window.MJB);
