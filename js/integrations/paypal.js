/* MAJOBELLA · Botones de PayPal (SDK de JavaScript)
   Solo usa el ID de cliente público (config.payments.paypalClientId).
   Las órdenes se crean y se cobran en el backend; aquí solo se muestran los botones. */
(function (M) {
  let loading = null;

  M.PayPal = {
    configured() {
      const P = M.config.payments || {};
      return !!(P.enabled && String(P.paypalClientId || '').trim());
    },

    load() {
      if (window.paypal && window.paypal.Buttons) return Promise.resolve(window.paypal);
      if (loading) return loading;
      const P = M.config.payments;
      const params = new URLSearchParams({
        'client-id': P.paypalClientId.trim(),
        currency: 'USD',
        intent: 'capture',
        components: 'buttons',
        'disable-funding': 'paylater,venmo',
      });
      loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `https://www.paypal.com/sdk/js?${params}`;
        s.async = true;
        s.dataset.namespace = 'paypal';
        s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error('PayPal no cargó.')));
        s.onerror = () => { loading = null; reject(new Error('No se pudo cargar PayPal. Revisa tu conexión.')); };
        document.head.appendChild(s);
      });
      return loading;
    },

    /* Dibuja los botones en `el`. handlers: onClick() → false para no abrir PayPal, createOrder() → orderId, onApprove(orderId), onCancel(), onError(err) */
    async render(el, handlers) {
      el.innerHTML = '<p class="pp-loading">Cargando PayPal…</p>';
      const paypal = await this.load();
      el.innerHTML = '';
      const buttons = paypal.Buttons({
        style: { layout: 'vertical', color: 'black', shape: 'pill', label: 'pay', height: 46, tagline: false },
        onClick: (data, actions) => (handlers.onClick && handlers.onClick() === false ? actions.reject() : actions.resolve()),
        createOrder: () => handlers.createOrder(),
        onApprove: (data) => handlers.onApprove(data.orderID),
        onCancel: () => handlers.onCancel && handlers.onCancel(),
        onError: (err) => handlers.onError && handlers.onError(err),
      });
      if (buttons.isEligible && !buttons.isEligible()) throw new Error('PayPal no está disponible en este navegador.');
      await buttons.render(el);
      return buttons;
    },
  };
})(window.MJB);
