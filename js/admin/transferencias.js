/* MAJOBELLA · Dashboard: transferencias por revisar y reembolsos pendientes (Agenda → Pendientes)
   La clienta sube el comprobante → la cita queda "Por confirmar" → aquí se ve la foto y se confirma o rechaza. */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  let current = null;

  const isTransfer = (a) => a.payment && a.payment.depositMethod === 'transferencia';
  const waitingTransfer = (a) => a.status === 'por-confirmar' || (a.status === 'retenida' && isTransfer(a) && new Date(a.holdUntil).getTime() > Date.now());
  const ago = (iso) => {
    if (!iso) return '';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return `hace ${Math.max(1, m)} min`;
    const h = Math.round(m / 60);
    return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
  };
  const accountText = (id) => { const c = (A.data.accounts || []).find((x) => x.id === id); return c ? `${c.banco} · ${c.numero}` : ''; };

  function renderPending() {
    const box = $('ag-pending');
    if (!box || !A.data) return;
    const tf = A.data.items.filter(waitingTransfer).sort((a, b) => String(a.payment.transfer && a.payment.transfer.sentAt || a.createdAt).localeCompare(String(b.payment.transfer && b.payment.transfer.sentAt || b.createdAt)));
    const refunds = A.data.items.filter((a) => a.refundPending);
    const errs = (A.data.errors || []).filter((e) => !e.resuelto);
    if (!tf.length && !refunds.length && !errs.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    const row = (a, right, sub) => `<li class="pend-item">
      <div><p class="t-name">${esc(a.client.name)} <span class="pill st-${esc(a.status)}">${a.status === 'retenida' ? 'Esperando comprobante' : A.STATUS[a.status] || esc(a.status)}</span></p>
        <p class="t-sub">${esc(A.dayTitle(a.date))}, ${M.fmtTime12(a.time)} · ${esc(a.servicesText)}</p>
        <p class="t-sub">${sub}</p></div>
      <div class="due-actions">${right}</div></li>`;
    box.innerHTML = `
      <div class="panel-head"><h2>Pendientes</h2><span class="muted">${A.plural(tf.length + refunds.length, 'cosa', 'cosas')} por hacer</span></div>
      ${tf.length ? `<p class="pend-h">Transferencias por revisar</p><ul class="pend-list">${tf.map((a) => {
        const t = a.payment.transfer || {};
        const sub = a.status === 'por-confirmar'
          ? `Depósito <b>${A.money(a.payment.depositRD)}</b>${t.account ? ` · ${esc(accountText(t.account))}` : ''}${a.transferRef ? ` · ref. ${esc(a.transferRef)}` : ''} · comprobante ${ago(t.sentAt)}`
          : `Depósito <b>${A.money(a.payment.depositRD)}</b> · tiene hasta las ${M.fmtTime12(A.hhmm(a.holdUntil))} para subir el comprobante`;
        return row(a, `<button type="button" class="act act-dark" data-tf="${esc(a.id)}">${a.status === 'por-confirmar' ? 'Revisar' : 'Confirmar sin comprobante'}</button><button type="button" class="act" data-tf-day="${a.date}">Ver en agenda</button>`, sub);
      }).join('')}</ul>` : ''}
      ${refunds.length ? `<p class="pend-h">Depósitos por devolver</p><ul class="pend-list">${refunds.map((a) => row(a,
        `${A.waLink(a.client.phone, `Hola ${(a.client.name || '').split(' ')[0]}, te escribimos de MAJOBELLA para devolverte el depósito de ${A.money(a.payment.depositRD)}. ¿A qué cuenta te lo transferimos?`) ? `<a class="act" target="_blank" rel="noopener" href="${A.waLink(a.client.phone, `Hola ${(a.client.name || '').split(' ')[0]}, te escribimos de MAJOBELLA para devolverte el depósito de ${A.money(a.payment.depositRD)}. ¿A qué cuenta te lo transferimos?`)}">Pedir cuenta por WhatsApp</a>` : ''}<button type="button" class="act act-dark" data-op="reembolsoHecho" data-id="${esc(a.id)}">Ya lo devolví</button>`,
        `Devolver <b>${A.money(a.payment.depositRD)}</b> ${isTransfer(a) ? 'por transferencia' : 'a mano'} · cancelada ${a.cancelledAt ? A.shortDate(String(a.cancelledAt).slice(0, 10)) : ''}`)).join('')}</ul>` : ''}
      ${errs.length ? `<p class="pend-warn">${errs.some((e) => e.tipo === 'pago') ? '<b>Hay un cobro que necesita revisión.</b> ' : ''}${A.plural(errs.length, 'aviso', 'avisos')} del sistema sin revisar. <button type="button" class="link" data-sec="ajustes" data-goto-errors>Ver avisos</button></p>` : ''}`;
  }

  /* ---------- Revisar ---------- */
  async function openReview(id) {
    current = A.data.items.find((x) => x.id === id);
    if (!current) return;
    const a = current, p = a.payment || {}, t = p.transfer || {};
    const f = $('tf-form');
    f.reset();
    $('tf-reject').hidden = true; $('tf-otro').hidden = true; $('tf-force').hidden = true; $('tf-msg').textContent = '';
    $('tf-no').textContent = 'Rechazar…';
    $('tf-info').innerHTML = `
      <p class="tf-client">${esc(a.client.name)}</p>
      <dl>
        <div><dt>Cita</dt><dd>${esc(A.dayTitle(a.date))}, ${M.fmtTime12(a.time)}<br>${esc(a.servicesText)}</dd></div>
        <div><dt>Depósito esperado</dt><dd><b class="tf-big">${A.money(p.depositRD)}</b></dd></div>
        ${t.account ? `<div><dt>Cuenta</dt><dd>${esc(accountText(t.account))}</dd></div>` : ''}
        ${a.transferRef ? `<div><dt>Referencia</dt><dd>${esc(a.transferRef)}</dd></div>` : ''}
        ${t.sentAt ? `<div><dt>Comprobante</dt><dd>${new Date(t.sentAt).toLocaleString('es-DO', { timeZone: M.config.schedule.timeZone, dateStyle: 'medium', timeStyle: 'short' })}</dd></div>` : ''}
        <div><dt>Contacto</dt><dd>${esc(a.client.phone || '')}${a.client.email ? `<br>${esc(a.client.email)}` : ''}</dd></div>
      </dl>
      <p class="hint">Antes de confirmar, revisa en la app de tu banco que el dinero haya llegado.</p>`;
    $('tf-proof').innerHTML = a.proofId ? '<p class="hint">Cargando comprobante…</p>' : '<p class="hint">Aún no subió el comprobante. Si ya ves el dinero en tu cuenta, puedes confirmar la cita igual.</p>';
    A.open('dlg-tf');
    if (!a.proofId) return;
    try {
      const res = await A.call('adminFile', { id: a.proofId });
      if (current !== a) return;
      const url = `data:${res.mime};base64,${res.data}`;
      if (res.mime === 'application/pdf') {
        const blob = await (await fetch(url)).blob();
        const bu = URL.createObjectURL(blob);
        $('tf-proof').innerHTML = `<object data="${bu}" type="application/pdf" class="tf-pdf"><p class="hint">Tu navegador no muestra el PDF aquí.</p></object><a class="act" href="${bu}" target="_blank" rel="noopener">Abrir el PDF</a>`;
      } else {
        $('tf-proof').innerHTML = `<a href="${url}" target="_blank" rel="noopener" title="Abrir en grande"><img src="${url}" alt="Comprobante de ${esc(a.client.name)}"></a>`;
      }
    } catch (err) { $('tf-proof').innerHTML = `<p class="dlg-msg">${esc(err.message)}</p>`; }
  }

  async function decide(decision, force) {
    const a = current;
    if (!a) return;
    const f = $('tf-form');
    const payload = { id: a.id, decision, force: !!force };
    if (decision === 'rechazar') {
      payload.reason = f.motivo.value === 'otro' ? f.otro.value.trim() : f.motivo.value;
      payload.notify = f.notify.checked;
      if (!payload.reason) { $('tf-msg').textContent = 'Escribe el motivo.'; return; }
    }
    const btn = decision === 'confirmar' ? (force ? $('tf-force') : $('tf-ok')) : $('tf-no');
    await A.busy(btn, async () => {
      try {
        const res = await A.call('adminTransferReview', payload);
        A.upsert('items', res.item);
        A.close('dlg-tf');
        current = null;
        A.render();
        A.toast(decision === 'confirmar' ? 'Cita confirmada. Le enviamos la confirmación por correo.' : 'Transferencia rechazada. El horario quedó libre.');
      } catch (err) {
        $('tf-msg').textContent = err.message;
        $('tf-force').hidden = !(err.data && err.data.conflict);
      }
    });
  }

  // La Agenda dibuja también los pendientes
  const base = A.sections.agenda;
  A.sections.agenda = Object.assign({}, base, {
    render() { base.render(); renderPending(); },
    init() {
      base.init();
      document.addEventListener('click', (e) => {
        const r = e.target.closest('[data-tf]');
        if (r) { openReview(r.dataset.tf); return; }
        const d = e.target.closest('[data-tf-day]');
        if (d) { A.agendaGo(d.dataset.tfDay); }
      });
      $('tf-ok').addEventListener('click', () => decide('confirmar'));
      $('tf-force').addEventListener('click', () => decide('confirmar', true));
      $('tf-no').addEventListener('click', () => {
        if ($('tf-reject').hidden) { $('tf-reject').hidden = false; $('tf-no').textContent = 'Rechazar y liberar el horario'; return; }
        decide('rechazar');
      });
      $('tf-form').motivo.addEventListener('change', (e) => { $('tf-otro').hidden = e.target.value !== 'otro'; });
      $('tf-form').addEventListener('submit', (e) => e.preventDefault());
    },
  });
})(window.MJB);
