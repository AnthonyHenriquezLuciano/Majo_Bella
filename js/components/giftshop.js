/* MAJOBELLA · Comprar tarjetas de regalo en la web (PayPal)
   El backend crea la orden, cobra y genera el código; la clienta lo recibe por correo
   y puede descargar la tarjeta aquí mismo. */
(function (M) {
  const $ = (id) => document.getElementById(id);
  const API = M.BookingAPI;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  let shop = null, order = null, sold = null;

  const amount = () => {
    const v = (document.querySelector('#gf-chips input:checked') || {}).value;
    return v === 'otro' ? Math.round(Number($('gf-other').value) || 0) : Number(v) || 0;
  };
  const values = () => {
    const f = $('gift-form');
    return { montoRD: amount(), para: f.para.value.trim(), de: f.de.value.trim(), mensaje: f.mensaje.value.trim(), correo: f.correo.value.trim(), correoPara: f.correoPara.value.trim() };
  };
  const msg = (t, kind) => { const m = $('gf-msg'); m.textContent = t || ''; m.className = `gf-msg${kind ? ` is-${kind}` : ''}`; };

  function preview() {
    const v = values();
    $('gc-amt').textContent = M.fmtPrice(v.montoRD || 0);
    $('gc-who').textContent = [v.para ? `Para ${v.para}` : '', v.de ? `de ${v.de}` : ''].filter(Boolean).join(' · ');
    $('gc-msg').textContent = v.mensaje ? `“${v.mensaje}”` : '';
    const rate = Number(M.config.payments.usdRate) || 63;
    $('gf-note').textContent = v.montoRD
      ? `Se cobra en dólares: ${M.fmtUSD(Math.ceil((v.montoRD / rate) * 100) / 100)} (tasa RD$ ${rate} por US$ 1). Válida ${shop.validDays >= 365 ? `${Math.round(shop.validDays / 365) === 1 ? '1 año' : `${Math.round(shop.validDays / 365)} años`}` : `${shop.validDays} días`} para cualquier servicio.`
      : '';
  }

  function validate() {
    const f = $('gift-form');
    const v = values();
    let ok = true;
    const mark = (input, bad) => { input.closest('.field').classList.toggle('has-error', bad); if (bad && ok) input.focus(); if (bad) ok = false; };
    if (v.montoRD < shop.min || v.montoRD > shop.max) {
      msg(`El valor debe estar entre ${M.fmtPrice(shop.min)} y ${M.fmtPrice(shop.max)}.`, 'error');
      if (document.querySelector('#gf-chips input:checked').value === 'otro') $('gf-other').focus();
      return false;
    }
    mark(f.correo, !EMAIL.test(v.correo));
    mark(f.correoPara, !!v.correoPara && !EMAIL.test(v.correoPara));
    if (!ok) { msg('Revisa los campos marcados.', 'error'); return false; }
    if (!$('gf-terms').checked) { msg('Acepta las condiciones de las tarjetas de regalo para continuar.', 'error'); $('gf-terms').focus(); return false; }
    msg('');
    return true;
  }

  function done(gift) {
    sold = gift;
    $('gift-form').hidden = true;
    $('gift-done').hidden = false;
    $('gc-code').textContent = gift.codigo;
    $('gd-code').textContent = gift.codigo;
    $('gd-text').textContent = `Te enviamos la tarjeta de ${M.fmtPrice(gift.montoRD)} a tu correo${order && order.correoPara ? ' y a quien la recibe' : ''}. Se usa escribiendo el código al reservar.${gift.vence ? ` Válida hasta el ${new Intl.DateTimeFormat('es', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${gift.vence}T12:00:00Z`))}.` : ''}`;
    const web = location.origin + location.pathname;
    const text = `${gift.para ? `${gift.para}, ` : ''}te regalo una experiencia en MAJOBELLA Beauty Studio 🎁\nTarjeta de regalo: ${M.fmtPrice(gift.montoRD)}\nCódigo: ${gift.codigo}${gift.mensaje ? `\n“${gift.mensaje}”` : ''}\nReserva en ${web}reservar.html y escribe el código al confirmar.`;
    $('gd-wa').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
    $('gift-done').focus();
  }

  async function renderPay() {
    try {
      await M.PayPal.render($('gf-pay'), {
        onClick: () => validate(),
        createOrder: async () => {
          if (!validate()) throw new Error('Formulario incompleto');
          msg('Preparando el pago…');
          try {
            const v = values();
            const res = await API.giftOrder(v);
            order = { ...res, correoPara: v.correoPara };
            msg('');
            return res.orderId;
          } catch (err) { msg(err.message, 'error'); throw err; }
        },
        onApprove: async (orderId) => {
          msg('Confirmando tu pago…');
          try {
            const res = await API.giftCapture(order.id, orderId);
            msg('');
            done(res.gift);
          } catch (err) { msg(`${err.message} Si se te cobró, escríbenos por WhatsApp con tu correo.`, 'error'); }
        },
        onCancel: () => msg('Pago cancelado. No se te cobró.'),
        onError: (err) => { if (!$('gf-msg').classList.contains('is-error')) msg(err && err.message && err.message !== 'Formulario incompleto' ? err.message : 'PayPal no pudo completar el pago. Inténtalo de nuevo.', 'error'); },
      });
    } catch (err) { $('gf-pay').innerHTML = ''; msg(err.message, 'error'); }
  }

  M.initGiftShop = function () {
    shop = (M.site || {}).giftShop;
    if (!shop || !shop.enabled || !API.enabled() || !M.PayPal.configured()) return;
    $('regalar').hidden = false;
    // Montos dentro del rango configurado
    document.querySelectorAll('#gf-chips input').forEach((i) => {
      if (i.value !== 'otro' && (Number(i.value) < shop.min || Number(i.value) > shop.max)) i.closest('.gf-chip').hidden = true;
    });
    if (!document.querySelector('#gf-chips input:checked:not([value=otro])') || document.querySelector('#gf-chips input:checked').closest('.gf-chip').hidden) {
      const first = document.querySelector('#gf-chips .gf-chip:not([hidden]) input');
      if (first) first.checked = true;
    }
    $('gf-other').min = shop.min; $('gf-other').max = shop.max;
    const f = $('gift-form');
    M.Validate.bindName(f.para); M.Validate.bindName(f.de);
    f.addEventListener('input', (e) => {
      if (e.target.closest('.field')) e.target.closest('.field').classList.remove('has-error');
      preview();
    });
    f.addEventListener('change', (e) => {
      if (e.target.name === 'terms' && e.target.checked && $('gf-msg').classList.contains('is-error')) msg('');
      if (e.target.name === 'amt') {
        $('gf-other-wrap').hidden = e.target.value !== 'otro';
        if (e.target.value === 'otro') $('gf-other').focus();
      }
      preview();
    });
    f.addEventListener('submit', (e) => e.preventDefault());
    $('gd-download').addEventListener('click', () => sold && M.GiftCard.download(sold, { webUrl: location.origin + location.pathname }));
    $('gd-again').addEventListener('click', () => {
      sold = null; order = null;
      f.reset(); $('gf-other-wrap').hidden = true;
      $('gift-done').hidden = true; f.hidden = false;
      $('gc-code').textContent = 'MJB-····-····';
      preview(); renderPay();
    });
    preview();
    // PayPal se carga cuando la sección se acerca a la pantalla
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { io.disconnect(); renderPay(); } }, { rootMargin: '300px' });
      io.observe($('regalar'));
    } else renderPay();
  };
})(window.MJB);
