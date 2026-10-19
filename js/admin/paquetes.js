/* MAJOBELLA · Dashboard: paquetes de sesiones y premio de fidelidad (dentro de Promociones) */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const METHOD = { efectivo: 'Efectivo', transferencia: 'Transferencia', paypal: 'PayPal', cortesia: 'Cortesía' };
  let editing = null;
  const on = (v) => /^s[ií]$/i.test(String(v || '').trim());
  const svcName = (id) => A.serviceName(id);
  const svcPrice = (id) => { const s = A.services().find((x) => x.id === id); return s ? s.price : 0; };

  /* Avance de fidelidad de una clienta (igual que el backend) */
  A.loyaltyOf = function (c) {
    const s = A.settingsMap();
    if (!on(s.fidelidadActiva)) return null;
    const every = Number(s.fidelidadVisitas) || 5;
    const appts = (c.appts || []).slice().sort((a, b) => a.start.localeCompare(b.start));
    let since = '';
    appts.forEach((a) => { if (a.loyalty && ['confirmada', 'completada', 'no-asistio'].includes(a.status)) since = a.start; });
    const visits = appts.filter((a) => a.status === 'completada' && (!since || a.start > since)).length;
    return { every, visits: Math.min(visits, every), eligible: visits >= every, kind: s.fidelidadTipo === 'monto' ? 'monto' : 'porcentaje', value: Number(s.fidelidadValor) || 0 };
  };
  A.loyaltyText = (l) => (l.kind === 'monto' ? A.money(l.value) : `${l.value}%`);

  function render() {
    const pk = (A.data.packages || []).slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    const sold = (A.data.bonos || []);
    $('pk-list').innerHTML = pk.length ? pk.map((k) => {
      const regular = svcPrice(k.servicio) * (Number(k.sesiones) || 0);
      const n = sold.filter((b) => b.paqueteId === k.id).length;
      return `<li class="promo"><div class="pr-main">
          <div class="pr-top"><p class="t-name">${esc(k.nombre)}</p><span class="pill ${on(k.activo) ? 'st-confirmada' : 'st-cancelada'}">${on(k.activo) ? (on(k.enWeb) ? 'En la web' : 'Solo en el estudio') : 'Pausado'}</span></div>
          <p class="t-sub">${esc(svcName(k.servicio))} · ${A.plural(Number(k.sesiones) || 0, 'sesión', 'sesiones')} · <strong>${A.money(k.precioRD)}</strong>${regular > Number(k.precioRD) ? ` (normal ${A.money(regular)}, ahorra ${A.money(regular - Number(k.precioRD))})` : ''}</p>
          <p class="t-sub">${Number(k.venceDias) ? `Válido ${k.venceDias} días` : 'Sin vencimiento'}${n ? ` · ${A.plural(n, 'vendido')}` : ''}</p></div>
        <div class="due-actions">
          <button type="button" class="act" data-pk-sell="${esc(k.id)}">Vender</button>
          <button type="button" class="act" data-pk-edit="${esc(k.id)}">Editar</button>
          <button type="button" class="act act-ghost" data-pk-del="${esc(k.id)}">Borrar</button></div></li>`;
    }).join('') : '<li class="empty">Aún no tienes paquetes. Crea uno con el servicio, las sesiones y el precio.</li>';

    const active = sold.filter((b) => b.estado === 'activo');
    const left = active.reduce((t, b) => t + (Number(b.sesiones) - Number(b.usadas || 0)), 0);
    $('bn-summary').textContent = `${A.plural(active.length, 'paquete activo', 'paquetes activos')} · ${A.plural(left, 'sesión', 'sesiones')} por usar`;
    const STATE = { activo: ['Activo', 'st-confirmada'], agotado: ['Usado', 'st-completada'], anulado: ['Anulado', 'st-cancelada'] };
    $('bn-list').innerHTML = sold.length ? sold.slice().sort((a, b) => String(b.creada).localeCompare(String(a.creada))).map((b) => {
      const [lbl, cls] = STATE[b.estado] || [b.estado, ''];
      const used = Number(b.usadas) || 0, total = Number(b.sesiones) || 0;
      const wa = A.waLink(b.telefono, `Hola ${String(b.clienta).split(' ')[0]}, tu código del paquete ${b.nombre} es ${b.codigo}. Escríbelo al reservar cada sesión en la web.`);
      return `<li class="promo"><div class="pr-main">
          <div class="pr-top"><p class="t-name"><code>${esc(b.codigo)}</code> · ${esc(b.clienta)}</p><span class="pill ${cls}">${lbl}</span></div>
          <p class="t-sub">${esc(b.nombre)} · <strong>${used} de ${total}</strong> sesiones usadas</p>
          <div class="bn-dots" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<span class="${i < used ? 'is-on' : ''}"></span>`).join('')}</div>
          <p class="t-sub">${A.money(b.montoRD)} · ${esc(b.paypalOrden ? 'PayPal · comprado en la web' : (METHOD[b.metodoPago] || b.metodoPago))} · vendido ${A.shortDate(b.vendida)}${b.vence ? ` · vence ${A.shortDate(b.vence)}` : ''}</p></div>
        <div class="due-actions">
          ${b.estado !== 'anulado' && used < total ? `<button type="button" class="act" data-bn-use="${esc(b.id)}" title="Para sesiones agendadas a mano">Usó 1 sesión</button>` : ''}
          ${used > 0 ? `<button type="button" class="act act-ghost" data-bn-undo="${esc(b.id)}">Devolver 1</button>` : ''}
          <button type="button" class="act" data-gift-copy="${esc(b.codigo)}">Copiar código</button>
          ${wa ? `<a class="act" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          <button type="button" class="act act-ghost" data-bn-toggle="${esc(b.id)}">${b.estado === 'anulado' ? 'Reactivar' : 'Anular'}</button></div></li>`;
    }).join('') : '<li class="empty">Aún no has vendido paquetes.</li>';

    renderLoyalty();
  }

  function renderLoyalty() {
    const s = A.settingsMap();
    const f = $('ly-form');
    if (!f.contains(document.activeElement)) {
      f.fidelidadActiva.checked = on(s.fidelidadActiva);
      f.fidelidadVisitas.value = s.fidelidadVisitas || 5;
      f.fidelidadValor.value = s.fidelidadValor || 20;
      f.fidelidadTipo.value = s.fidelidadTipo === 'monto' ? 'monto' : 'porcentaje';
    }
    if (!on(s.fidelidadActiva)) { $('ly-list').innerHTML = ''; return; }
    const ready = A.clients().map((c) => ({ c, l: A.loyaltyOf(c) })).filter((x) => x.l && x.l.eligible);
    const close = A.clients().map((c) => ({ c, l: A.loyaltyOf(c) })).filter((x) => x.l && !x.l.eligible && x.l.visits === x.l.every - 1);
    const li = ({ c, l }, ok) => {
      const wa = A.waLink(c.phone, ok ? `Hola ${c.name.split(' ')[0]}, ¡tienes tu premio de fidelidad en MAJOBELLA! Tu próxima cita tiene ${A.loyaltyText(l)} de descuento. Resérvala en la web con tu mismo correo o teléfono.` : '');
      return `<li><div><p class="t-name"><button type="button" class="link" data-client="${esc(c.key)}">${esc(c.name)}</button></p><p class="t-sub">${ok ? `Premio disponible: ${A.loyaltyText(l)}` : `Le falta 1 visita (${l.visits} de ${l.every})`}</p></div>${ok && wa ? `<div class="due-actions"><a class="act" href="${wa}" target="_blank" rel="noopener">Avisar por WhatsApp</a></div>` : ''}</li>`;
    };
    $('ly-list').innerHTML = ready.length || close.length ? ready.map((x) => li(x, true)).join('') + close.map((x) => li(x, false)).join('') : '<li class="empty">Ninguna clienta tiene el premio por ahora.</li>';
  }

  /* ---------- Paquete ---------- */
  function openPkg(id) {
    editing = id ? A.data.packages.find((k) => k.id === id) : null;
    const f = $('pkg-form');
    f.reset();
    $('pk-h').textContent = editing ? 'Editar paquete' : 'Nuevo paquete';
    $('pkg-svc').innerHTML = A.services().map((s) => `<option value="${esc(s.id)}">${esc(s.name)} · ${A.money(s.price)}</option>`).join('');
    const k = editing || { sesiones: 4, venceDias: 180, enWeb: 'si', activo: 'si' };
    f.nombre.value = k.nombre || '';
    if (k.servicio) f.servicio.value = k.servicio;
    f.sesiones.value = k.sesiones || 4;
    f.precioRD.value = k.precioRD || '';
    f.venceDias.value = k.venceDias != null ? k.venceDias : 180;
    f.descripcion.value = k.descripcion || '';
    f.enWeb.checked = on(k.enWeb || 'si');
    f.activo.checked = on(k.activo || 'si');
    $('pkg-msg').textContent = '';
    pkgPreview();
    A.open('dlg-pkg');
  }
  function pkgPreview() {
    const f = $('pkg-form');
    const regular = svcPrice(f.servicio.value) * (Number(f.sesiones.value) || 0);
    const price = Number(f.precioRD.value) || 0;
    $('pkg-preview').textContent = regular ? `Valor normal: ${A.money(regular)}${price ? (price < regular ? ` · la clienta ahorra ${A.money(regular - price)} (${Math.round((1 - price / regular) * 100)}%)` : ' · sin ahorro') : ''}` : '';
  }
  async function savePkg(e) {
    e.preventDefault();
    const f = $('pkg-form');
    const pkg = { id: editing ? editing.id : '', nombre: f.nombre.value.trim(), servicio: f.servicio.value, sesiones: f.sesiones.value, precioRD: f.precioRD.value, venceDias: f.venceDias.value, descripcion: f.descripcion.value.trim(), enWeb: f.enWeb.checked ? 'si' : 'no', activo: f.activo.checked ? 'si' : 'no' };
    await A.busy($('pkg-save'), async () => {
      try { const res = await A.call('adminSavePackage', { pkg }); A.upsert('packages', Object.assign({}, editing || {}, res.pkg)); A.close('dlg-pkg'); render(); A.toast(pkg.enWeb === 'si' ? 'Paquete guardado. Ya se ve en la web.' : 'Paquete guardado.'); }
      catch (err) { $('pkg-msg').textContent = err.message; }
    });
  }

  /* ---------- Vender ---------- */
  function openSell(pkgId) {
    const list = (A.data.packages || []).filter((k) => on(k.activo));
    if (!list.length) { A.toast('Primero crea un paquete.'); return; }
    const f = $('sell-form');
    f.reset();
    $('sell-pkg').innerHTML = list.map((k) => `<option value="${esc(k.id)}" data-price="${esc(k.precioRD)}">${esc(k.nombre)} · ${A.money(k.precioRD)}</option>`).join('');
    if (pkgId) f.paqueteId.value = pkgId;
    f.montoRD.value = (list.find((k) => k.id === f.paqueteId.value) || list[0]).precioRD;
    $('sell-clients').innerHTML = A.clientsIndex().map((c) => `<option value="${esc(c.name)}">${esc([c.phone, c.email].filter(Boolean).join(' · '))}</option>`).join('');
    $('sell-msg').textContent = '';
    A.open('dlg-sell');
  }
  async function sell(e) {
    e.preventDefault();
    const f = $('sell-form');
    await A.busy($('sell-save'), async () => {
      try {
        const res = await A.call('adminSellBono', { paqueteId: f.paqueteId.value, client: { name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim() }, montoRD: f.montoRD.value, metodoPago: f.metodoPago.value, notify: f.notify.checked && !!f.email.value.trim() });
        A.data.bonos = A.data.bonos || [];
        A.data.bonos.push(res.bono);
        A.close('dlg-sell'); render();
        A.toast(`Paquete vendido: ${res.bono.codigo}`);
      } catch (err) { $('sell-msg').textContent = err.message; }
    });
  }

  async function updateBono(id, patch, btn) {
    await A.busy(btn, async () => {
      try { const res = await A.call('adminSaveBono', Object.assign({ id }, patch)); A.upsert('bonos', res.bono); render(); }
      catch (err) { A.toast(err.message); }
    });
  }

  /* Se engancha a la sección Promociones */
  const base = A.sections.promos;
  A.sections.promos = {
    render() { base.render(); render(); },
    init() {
      base.init();
      $('pk-new').addEventListener('click', () => openPkg(null));
      $('bn-new').addEventListener('click', () => openSell(null));
      const pf = $('pkg-form');
      pf.addEventListener('input', pkgPreview); pf.addEventListener('change', pkgPreview); pf.addEventListener('submit', savePkg);
      const sf = $('sell-form');
      sf.addEventListener('submit', sell);
      sf.addEventListener('change', (e) => { if (e.target.name === 'paqueteId') sf.montoRD.value = e.target.selectedOptions[0].dataset.price; });
      sf.addEventListener('input', (e) => {
        if (e.target.name !== 'name') return;
        const c = A.clientsIndex().find((x) => x.name === e.target.value);
        if (c) { sf.phone.value = c.phone || ''; sf.email.value = c.email || ''; }
      });
      $('ly-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const settings = { fidelidadActiva: f.fidelidadActiva.checked ? 'si' : 'no', fidelidadVisitas: f.fidelidadVisitas.value, fidelidadValor: f.fidelidadValor.value, fidelidadTipo: f.fidelidadTipo.value };
        await A.busy($('ly-save'), async () => {
          try { A.data = await A.call('adminSaveSettings', { settings }); f.blur(); document.activeElement.blur(); A.sections.promos.render(); A.toast('Premio de fidelidad guardado.'); }
          catch (err) { A.toast(err.message); }
        });
      });
      $('sec-promos').addEventListener('click', async (e) => {
        const t = (sel) => e.target.closest(sel);
        let b;
        if ((b = t('[data-pk-edit]'))) { openPkg(b.dataset.pkEdit); return; }
        if ((b = t('[data-pk-sell]'))) { openSell(b.dataset.pkSell); return; }
        if ((b = t('[data-pk-del]'))) {
          if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '¿Borrar?'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Borrar'; }, 4000); return; }
          await A.busy(b, async () => { try { await A.call('adminDeletePackage', { id: b.dataset.pkDel }); A.remove('packages', b.dataset.pkDel); render(); A.toast('Paquete borrado. Los vendidos siguen activos.'); } catch (err) { A.toast(err.message); } });
          return;
        }
        if ((b = t('[data-bn-use]'))) { const x = A.data.bonos.find((y) => y.id === b.dataset.bnUse); updateBono(x.id, { usadas: (Number(x.usadas) || 0) + 1 }, b); return; }
        if ((b = t('[data-bn-undo]'))) { const x = A.data.bonos.find((y) => y.id === b.dataset.bnUndo); updateBono(x.id, { usadas: Math.max(0, (Number(x.usadas) || 0) - 1) }, b); return; }
        if ((b = t('[data-bn-toggle]'))) { const x = A.data.bonos.find((y) => y.id === b.dataset.bnToggle); updateBono(x.id, { estado: x.estado === 'anulado' ? 'activo' : 'anulado' }, b); }
      });
    },
  };
})(window.MJB);
