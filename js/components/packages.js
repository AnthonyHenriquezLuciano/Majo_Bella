/* MAJOBELLA · Paquetes de sesiones en la web (los crea el estudio en el dashboard → Promociones)
   Se pagan con PayPal; el código llega por correo y se escribe al reservar cada sesión. */
(function (M) {
  const $ = (id) => document.getElementById(id);
  const API = M.BookingAPI;
  const esc = M.escapeHtml;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  let list = [], current = null, order = null, buttons = null;

  const validity = (days) => (!days ? 'Sin fecha de vencimiento' : days % 30 === 0 ? `Válido ${days / 30 === 1 ? '1 mes' : `${days / 30} meses`}` : `Válido ${days} días`);
  const msg = (t, kind) => { $('pk-msg').textContent = t || ''; $('pk-msg').className = `gf-msg${kind ? ` is-${kind}` : ''}`; };
  const V = M.Validate;
  const values = () => ({ name: V.fullName($('pk-first').value, $('pk-last').value), firstName: $('pk-first').value.trim(), lastName: $('pk-last').value.trim(), phone: V.phone($('pk-phone').value).value || $('pk-phone').value.trim(), email: $('pk-email').value.trim().toLowerCase() });

  function validate() {
    const v = values();
    const bad = { 'pk-first': !!V.namePart(v.firstName, 'nombre'), 'pk-last': !!V.namePart(v.lastName, 'apellido'), 'pk-phone': !V.phone($('pk-phone').value).ok, 'pk-email': !EMAIL.test(v.email) };
    let first = null;
    Object.entries(bad).forEach(([id, b]) => { $(id).closest('.field').classList.toggle('has-error', b); if (b && !first) first = $(id); });
    if (first) { first.focus(); msg('Revisa los campos marcados.', 'error'); return false; }
    if (!$('pk-terms').checked) { msg('Acepta las condiciones de los paquetes para continuar.', 'error'); return false; }
    msg('');
    return true;
  }

  function render() {
    $('pk-grid').innerHTML = list.map((k) => `
      <article class="pk-card">
        <p class="pk-svc">${esc(k.serviceName)}</p>
        <h3>${esc(k.name)}</h3>
        <p class="pk-sessions">${k.sessions} ${k.sessions === 1 ? 'sesión' : 'sesiones'}</p>
        <p class="pk-price">${M.fmtPrice(k.price)}${k.savings > 0 ? ` <s>${M.fmtPrice(k.regular)}</s>` : ''}</p>
        ${k.savings > 0 ? `<p class="pk-save">Ahorras ${M.fmtPrice(k.savings)}</p>` : ''}
        ${k.description ? `<p class="pk-desc">${esc(k.description)}</p>` : ''}
        <p class="pk-valid">${validity(k.validDays)}</p>
        <button type="button" class="btn btn-line" data-pk="${esc(k.id)}">Comprar</button>
      </article>`).join('');
  }

  async function open(id) {
    current = list.find((k) => k.id === id);
    if (!current) return;
    order = null;
    $('pk-done').hidden = true;
    $('pk-buy').hidden = false;
    $('pk-buy-title').textContent = current.name;
    // Datos guardados de la última reserva
    try {
      const c = JSON.parse(localStorage.getItem('mjb.client.v1')) || {};
      const sp = c.firstName ? { first: c.firstName, last: c.lastName || '' } : V.splitName(c.name);
      if (!$('pk-first').value && sp.first) { $('pk-first').value = sp.first; $('pk-last').value = sp.last; }
      if (!$('pk-phone').value && c.phone) $('pk-phone').value = c.phone;
      if (!$('pk-email').value && c.email) $('pk-email').value = c.email;
    } catch (e) { /* sin datos */ }
    const rate = Number(M.config.payments.usdRate) || 63;
    $('pk-buy-sub').textContent = `${M.fmtPrice(current.price)} · se cobra en dólares: ${M.fmtUSD(Math.ceil((current.price / rate) * 100) / 100)} (tasa RD$ ${rate} por US$ 1).`;
    msg('');
    M.scrollTo('#pk-buy');
    try {
      buttons = await M.PayPal.render($('pk-pay'), {
        onClick: () => validate(),
        createOrder: async () => {
          if (!validate()) throw new Error('Formulario incompleto');
          msg('Preparando el pago…');
          try { const res = await API.bonoOrder({ paqueteId: current.id, client: values() }); order = res; msg(''); return res.orderId; }
          catch (err) { msg(err.message, 'error'); throw err; }
        },
        onApprove: async (orderId) => {
          msg('Confirmando tu pago…');
          try { const res = await API.bonoCapture(order.id, orderId); msg(''); done(res.bono); }
          catch (err) { msg(`${err.message} Si se te cobró, escríbenos por WhatsApp con tu correo.`, 'error'); }
        },
        onCancel: () => msg('Pago cancelado. No se te cobró.'),
        onError: (err) => { if (!$('pk-msg').classList.contains('is-error')) msg(err && err.message && err.message !== 'Formulario incompleto' ? err.message : 'PayPal no pudo completar el pago. Inténtalo de nuevo.', 'error'); },
      });
    } catch (err) { $('pk-pay').innerHTML = ''; msg(err.message, 'error'); }
  }

  function done(b) {
    $('pk-buy').hidden = true;
    $('pk-done').hidden = false;
    $('pk-done-code').textContent = b.codigo;
    $('pk-done-text').textContent = `Te enviamos el código a tu correo. ${b.sesiones} ${b.sesiones === 1 ? 'sesión' : 'sesiones'} de ${b.serviceName}${b.vence ? `, válido hasta el ${new Intl.DateTimeFormat('es', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${b.vence}T12:00:00Z`))}` : ''}. Escríbelo en "¿Tienes un código o tarjeta?" al reservar.`;
    $('pk-done-book').onclick = () => {
      if (M.serviceById[b.servicio]) M.selectOnly([b.servicio], 'package');
      if (M.applyBookingCode) setTimeout(() => M.applyBookingCode(b.codigo), 50);
    };
    $('pk-done').focus();
  }

  M.refreshPackages = function () {
    if (!$('pk-grid') || $('paquetes').hidden) return;
    list = ((M.site || {}).packages || []).filter((k) => M.serviceById[k.service]);
    render();
  };
  M.initPackages = function () {
    list = ((M.site || {}).packages || []).filter((k) => M.serviceById[k.service]);
    if (!list.length || !API.enabled() || !M.PayPal.configured()) { if (M.showNav) M.showNav('paquetes', false); return; }
    $('paquetes').hidden = false;
    if (M.showNav) M.showNav('paquetes', true); else document.querySelectorAll('[data-nav-for="paquetes"]').forEach((n) => { n.hidden = false; });
    render();
    V.bindName($('pk-first')); V.bindName($('pk-last')); V.bindPhone($('pk-phone'));
    $('pk-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-pk]'); if (b) open(b.dataset.pk); });
    $('pk-cancel').addEventListener('click', () => { $('pk-buy').hidden = true; M.scrollTo('#paquetes'); });
    $('pk-buy').addEventListener('input', (e) => { const f = e.target.closest('.field'); if (f) f.classList.remove('has-error'); });
    $('pk-terms').addEventListener('change', (e) => { if (e.target.checked && $('pk-msg').classList.contains('is-error')) msg(''); });
    void buttons;
  };
})(window.MJB);
