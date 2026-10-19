/* MAJOBELLA · Dashboard: Correos
   Recordatorios, reseñas, retoques, cumpleaños y lista de espera se envían solos (tarea cada hora en Apps Script).
   Aquí se activan, se ajustan, se ven de ejemplo, se prueban y se revisa el historial. */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const TYPES = {
    recordatorio: 'Recordatorio', resena: 'Pedir reseña', retoque: 'Retoque', cumpleanos: 'Cumpleaños', espera: 'Lista de espera',
    confirmacion: 'Confirmación', cambio: 'Cambio de horario', cancelacion: 'Cancelación', consentimiento: 'Consentimiento', paquete: 'Paquete',
    tarjeta: 'Tarjeta de regalo', aviso: 'Aviso para ti', prueba: 'Prueba', otro: 'Otro', transferencia: 'Transferencia', billetera: 'Billetera',
  };
  const AUTOS = [
    { tipo: 'recordatorio', key: 'recordatorioActivo', title: 'Recordatorio de la cita', text: 'Con la dirección, el saldo y, si falta, el enlace para firmar el consentimiento.', inputs: [['recordatorioHoras', 'horas antes', 1, 72]] },
    { tipo: 'resena', key: 'resenaActiva', title: 'Pedir reseña de Google', text: 'Después de marcar la cita como realizada. Una vez cada 120 días por clienta.', inputs: [['resenaHoras', 'horas después', 0, 72]] },
    { tipo: 'retoque', key: 'retoqueActivo', title: 'Aviso de retoque', text: 'Una semana antes de la fecha ideal del retoque, si aún no lo reservó.', inputs: [] },
    { tipo: 'cumpleanos', key: 'cumpleActivo', title: 'Cumpleaños', text: 'El día de su cumpleaños, con un código de un solo uso.', inputs: [['cumpleDescuento', '% de descuento', 1, 100], ['cumpleDias', 'días de validez', 1, 365]] },
    { tipo: 'espera', key: 'esperaActiva', title: 'Lista de espera', text: 'Cuando se libera un horario en un día lleno, avisa a quien lo espera. También muestra la lista de espera en la web.', inputs: [] },
  ];
  const OTHERS = [['confirmacion', 'Confirmación de la cita'], ['transferencia', 'Comprobante de transferencia recibido'], ['transferenciaRechazada', 'Transferencia rechazada'], ['cambio', 'Cambio de fecha'], ['cancelacion', 'Cancelación'], ['consentimiento', 'Copia del consentimiento firmado'], ['paquete', 'Paquete comprado'], ['billetera', 'Mis códigos (billetera)']];

  const on = (v) => /^s[ií]$/i.test(String(v || '').trim());
  const ago = (iso) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${A.plural(min, 'minuto')}`;
    const h = Math.round(min / 60);
    return h < 48 ? `hace ${A.plural(h, 'hora')}` : `el ${A.shortDate(iso.slice(0, 10))}`;
  };

  function render() {
    const s = A.settingsMap();
    const au = A.data.automation || {};
    const parts = [];
    if (au.trigger === false) parts.push('<strong>Los envíos automáticos no están activos:</strong> en Apps Script ejecuta la función <code>setup</code> una vez.');
    if (au.lastRun && au.lastRun.at) parts.push(`Última revisión automática ${ago(au.lastRun.at)}.`);
    else if (au.trigger) parts.push('Se revisa cada hora.');
    if (au.quota != null) parts.push(`Gmail permite enviar ${au.quota} correos más hoy.`);
    if (A.DEMO) parts.push('Ejemplo: en el modo demo no se envía nada.');
    $('ml-status').innerHTML = parts.join(' ');

    const retouch = A.services().filter((x) => Number(x.retoqueDias) > 0);
    $('ml-autos').innerHTML = AUTOS.map((a) => {
      let note = '';
      if (a.tipo === 'resena' && !s.googleResenaUrl) note = '<p class="auto-warn">Falta el enlace para dejar reseña: ponlo en Web → Perfil de Google.</p>';
      if (a.tipo === 'retoque') note = `<p class="hint">${retouch.length ? `Retoque: ${retouch.map((x) => `${esc(x.name)} a los ${x.retoqueDias} días`).join(' · ')}.` : 'Ningún servicio tiene días de retoque.'} Se cambia en Ajustes → Servicios.</p>`;
      return `<div class="auto-row">
        <label class="auto-toggle"><input type="checkbox" name="${a.key}" ${on(s[a.key]) ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="auto-title">${a.title}</span></label>
        <p class="auto-text">${a.text}</p>
        ${a.inputs.length ? `<div class="auto-inputs">${a.inputs.map(([k, l, min, max]) => `<label><input type="number" name="${k}" min="${min}" max="${max}" step="1" value="${esc(s[k] || '')}"><span>${l}</span></label>`).join('')}</div>` : ''}
        ${note}
        <div class="auto-acts"><button type="button" class="act" data-mail-view="${a.tipo}">Ver ejemplo</button><button type="button" class="act" data-mail-test="${a.tipo}">Enviarme una prueba</button></div>
      </div>`;
    }).join('');

    $('ml-others').innerHTML = OTHERS.map(([t, l]) => `<li><p class="t-name">${l}</p><div class="due-actions"><button type="button" class="act" data-mail-view="${t}">Ver ejemplo</button><button type="button" class="act" data-mail-test="${t}">Probar</button></div></li>`).join('');

    const needs = A.services().filter((x) => on(x.consentimiento));
    $('ml-consent-svcs').innerHTML = needs.length
      ? `Lo firman las clientas de: <strong>${needs.map((x) => esc(x.name)).join(', ')}</strong>. El enlace va en la confirmación y en el recordatorio; también puedes abrirlo desde la Agenda. Se cambia en Ajustes → Servicios.`
      : 'Ningún servicio pide consentimiento. Actívalo en Ajustes → Servicios.';
    const cf = $('ml-consent-form');
    if (document.activeElement !== cf.consentimientoTexto) cf.consentimientoTexto.value = s.consentimientoTexto || '';
    renderLog();
  }

  function renderLog() {
    const all = A.data.emails || [];
    const sel = $('ml-filter');
    const types = [...new Set(all.map((e) => e.tipo))];
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todos</option>' + types.map((t) => `<option value="${esc(t)}">${esc(TYPES[t] || t)}</option>`).join('');
    sel.value = types.includes(cur) ? cur : '';
    const rows = all.filter((e) => !sel.value || e.tipo === sel.value).slice(0, 150);
    $('ml-log').innerHTML = rows.length ? rows.map((e) => `<tr>
      <td>${e.fecha ? new Date(e.fecha).toLocaleString('es-DO', { timeZone: M.config.schedule.timeZone, dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
      <td>${esc(TYPES[e.tipo] || e.tipo)}</td><td>${esc(e.para)}</td><td>${esc(e.asunto)}</td>
      <td>${e.estado === 'enviado' ? '<span class="pill st-confirmada">Enviado</span>' : '<span class="pill st-cancelada">No se envió</span>'}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">Aún no se ha enviado ningún correo.</td></tr>';
  }

  async function save(e) {
    e.preventDefault();
    const f = $('ml-form');
    const settings = {};
    AUTOS.forEach((a) => {
      settings[a.key] = f[a.key].checked ? 'si' : 'no';
      a.inputs.forEach(([k]) => { settings[k] = f[k].value.trim(); });
    });
    await A.busy($('ml-save'), async () => {
      try { A.data = await A.call('adminSaveSettings', { settings }); render(); A.toast('Correos automáticos guardados.'); }
      catch (err) { A.toast(err.message); }
    });
  }

  async function saveConsent(e) {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    await A.busy(btn, async () => {
      try { A.data = await A.call('adminSaveSettings', { settings: { consentimientoTexto: e.target.consentimientoTexto.value.trim() } }); render(); A.toast('Texto del consentimiento guardado.'); }
      catch (err) { A.toast(err.message); }
    });
  }

  async function preview(tipo, btn) {
    await A.busy(btn, async () => {
      try {
        const res = await A.call('adminEmailPreview', { tipo });
        $('mp-subject').innerHTML = `<strong>Asunto:</strong> ${esc(res.subject)}`;
        $('mp-frame').srcdoc = res.html;
        A.open('dlg-mail');
      } catch (err) { A.toast(err.message); }
    });
  }
  async function test(tipo, btn) {
    await A.busy(btn, async () => {
      try { const res = await A.call('adminEmailTest', { tipo }); A.toast(`Prueba enviada a ${res.to}.`); }
      catch (err) { A.toast(err.message); }
    });
  }

  A.sections.correos = {
    render,
    init() {
      $('ml-form').addEventListener('submit', save);
      $('ml-consent-form').addEventListener('submit', saveConsent);
      $('ml-consent-default').addEventListener('click', () => { $('ml-consent-form').consentimientoTexto.value = A.data.consentDefault || ''; });
      $('ml-filter').addEventListener('change', renderLog);
      $('sec-correos').addEventListener('click', (e) => {
        const v = e.target.closest('[data-mail-view]');
        if (v) { preview(v.dataset.mailView, v); return; }
        const t = e.target.closest('[data-mail-test]');
        if (t) test(t.dataset.mailTest, t);
      });
      $('ml-run').addEventListener('click', async (e) => {
        await A.busy(e.currentTarget, async () => {
          try {
            const res = await A.call('adminRunAutomations', {});
            A.data.automation = res.automation; A.data.emails = res.emails;
            const r = res.result || {};
            const total = ['recordatorios', 'resenas', 'retoques', 'cumpleanos', 'espera'].reduce((t, k) => t + (Number(r[k]) || 0), 0);
            render();
            A.toast(total ? `Listo: ${A.plural(total, 'correo')} enviado${total === 1 ? '' : 's'}.` : 'Revisado: no había correos pendientes.');
          } catch (err) { A.toast(err.message); }
        });
      });
    },
  };
})(window.MJB);
