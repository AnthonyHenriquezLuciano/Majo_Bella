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
  const canPurchase = () => API.enabled() && M.PayPal.configured();
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
    const grid = $('pk-grid'), empty = $('pk-empty');
    if (!grid) return;
    empty.hidden = list.length > 0;
    grid.classList.toggle('pk-single-package', list.length === 1);
    grid.innerHTML = list.map(k => {
      const original = Number(k.regular) || 0, savings = Math.max(0, Number(k.savings) || 0);
      const savingPercent = original > 0 ? Math.round(savings / original * 100) : 0;
      const help = M.WhatsApp?.link(`Hola, quiero información del paquete ${k.name} de MAJOBELLA.`) || 'index.html#contacto';
      return `<article class="pk-card">
        <div class="pk-card-visual">
          <div class="pk-card-visual-top"><span>MAJOBELLA</span><span>CLUB · PAQUETES</span></div>
          <img class="pk-card-flower" src="assets/flower-majobella.svg" alt="" loading="lazy" width="190" height="190">
          <span class="pk-card-glint" aria-hidden="true">✧</span>
          <div class="pk-card-visual-bottom">
            <span>UN MOMENTO QUE FLORECE</span>
            <strong>${esc(k.name)}</strong>
            <small>MÁS YO, MÁS BELLA.</small>
          </div>
        </div>
        <div class="pk-card-body">
          <div class="pk-card-top">
            <span class="pk-svc">${esc(k.serviceName)}</span>
            ${savingPercent > 0 ? `<span class="pk-discount">AHORRA ${savingPercent}%</span>` : ''}
          </div>
          <h3>${esc(k.name)}</h3>
          <p class="pk-desc">${esc(k.description||'Tu tratamiento, en varias sesiones para disfrutarlo con continuidad.')}</p>
          <div class="pk-card-benefits">
            <div><span>SESIONES INCLUIDAS</span><strong>${Number(k.sessions)||0}</strong></div>
            <div><span>VIGENCIA</span><strong>${esc(validity(k.validDays))}</strong></div>
          </div>
          <div class="pk-card-bottom">
            <span class="pk-price-label">TU INVERSIÓN</span>
            <p class="pk-price">${M.fmtPrice(k.price)}</p>
            ${savings > 0 ? `<p class="pk-save">Ahorras ${M.fmtPrice(savings)} <s>${M.fmtPrice(original)}</s></p>` : ''}
            ${canPurchase() ? `<button type="button" class="btn btn-primary pk-main-action" data-pk="${esc(k.id)}">Elegir este paquete <span aria-hidden="true">↗</span></button>`
            : `<a class="btn btn-line pk-main-action" href="${esc(help)}" rel="noopener"${/^https?:/.test(help)?' target="_blank"':''}>Consultar este paquete <span aria-hidden="true">↗</span></a>`}
          </div>
        </div>
      </article>`;
    }).join('');
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
    $('pk-done-book').onclick = (e) => { e.preventDefault(); M.goBook(M.serviceById[b.servicio] ? [b.servicio] : [], b.codigo, 'package'); };
    $('pk-done').focus();
  }

  M.refreshPackages = function () {
    if (!$('pk-grid')) return;
    list = ((M.site || {}).packages || []).filter(k => M.serviceById[k.service]);
    render();
  };
  M.initPackages = function () {
    list = ((M.site || {}).packages || []).filter(k => M.serviceById[k.service]);
    $('paquetes').hidden = false;
    render();
    V.bindName($('pk-first')); V.bindName($('pk-last')); V.bindPhone($('pk-phone'));
    $('pk-grid').addEventListener('click', e => {
      const b=e.target.closest('[data-pk]');
      if(b && canPurchase())open(b.dataset.pk);
    });
    $('pk-cancel').addEventListener('click', () => { $('pk-buy').hidden=true; M.scrollTo('#paquetes'); });
    $('pk-buy').addEventListener('input', e => { const n=e.target.closest('.field'); if(n)n.classList.remove('has-error'); });
    $('pk-terms').addEventListener('change', e => { if(e.target.checked && $('pk-msg').classList.contains('is-error'))msg(''); });
    void buttons;
  };
})(window.MJB);
