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

    /* Checkout elegante y seguro: cuenta PayPal + tarjeta únicamente si la cuenta es elegible.
       PayPal aloja el ingreso de la tarjeta; MAJOBELLA no captura ni almacena datos PCI. */
    async render(el, handlers) {
      el.innerHTML = '<div class="pp-premium-loading" role="status">Preparando tu pago protegido…</div>';
      const sdk = await this.load();
      const sources = [
        {key:'paypal',funding:sdk.FUNDING?.PAYPAL,label:'Pagar con PayPal',hint:'Utiliza el saldo o los métodos asociados a tu cuenta.'},
        {key:'card',funding:sdk.FUNDING?.CARD,label:'Tarjeta de crédito o débito',hint:'Sin cuenta PayPal, cuando este método está habilitado.'}
      ].filter(x=>x.funding);
      const eligible=sources.filter(x=>{
        try{return sdk.Buttons({fundingSource:x.funding}).isEligible();}catch(e){return false;}
      });
      if(!eligible.length)throw new Error('No hay métodos de PayPal habilitados para este navegador o cuenta. Puedes elegir transferencia si está disponible.');
      const prefix='pp-'+Math.random().toString(36).slice(2,9);
      el.innerHTML = `<div class="pp-premium" data-paypal-checkout>
        <p class="pp-premium-eyebrow">PAGO PROTEGIDO · MAJOBELLA</p>
        <h3>Elige cómo pagar</h3>
        <div class="pp-premium-methods" role="group" aria-label="Método de pago">
          ${eligible.map((x,i)=>`<button type="button" class="pp-premium-method${i===0?' is-active':''}" data-pp-mode="${x.key}" aria-pressed="${i===0}"><span class="pp-premium-method-icon" aria-hidden="true">${x.key==='card'?'▣':'P'}</span><span>${x.label}</span><span aria-hidden="true">→</span></button>`).join('')}
        </div>
        <div class="pp-premium-hint" aria-live="polite"></div>
        <div class="pp-premium-frames">${eligible.map((x,i)=>`<div data-pp-frame="${x.key}" ${i?'hidden':''}><div id="${prefix}-${x.key}"></div></div>`).join('')}</div>
        <p class="pp-premium-secure">🔒 Procesado directamente por PayPal · No guardamos tu tarjeta</p>
        <p class="pp-premium-error" role="alert" hidden></p>
      </div>`;
      const root=el.querySelector('[data-paypal-checkout]');
      const alert=root.querySelector('.pp-premium-error');
      const hint=root.querySelector('.pp-premium-hint');
      const active=(key)=>{
        eligible.forEach(x=>{
          const on=x.key===key;
          const btn=root.querySelector('[data-pp-mode="'+x.key+'"]');
          btn.classList.toggle('is-active',on);btn.setAttribute('aria-pressed',String(on));
          root.querySelector('[data-pp-frame="'+x.key+'"]').hidden=!on;
        });
        hint.textContent=eligible.find(x=>x.key===key)?.hint||'';
        alert.hidden=true;
      };
      root.querySelectorAll('[data-pp-mode]').forEach(btn=>btn.addEventListener('click',()=>active(btn.dataset.ppMode)));
      for(const x of eligible){
        const buttons=sdk.Buttons({
          fundingSource:x.funding,
          style:{layout:'vertical',color:x.key==='paypal'?'black':'white',shape:'rect',label:'pay',height:48,tagline:false},
          onClick:(data,actions)=>{
            alert.hidden=true;
            return handlers.onClick&&handlers.onClick()===false?actions.reject():actions.resolve();
          },
          createOrder:()=>handlers.createOrder(),
          onApprove:async(data)=>{try{await handlers.onApprove(data.orderID);}catch(err){alert.textContent='El pago necesita verificarse antes de reintentarlo. Consulta tu historial o contacta al estudio.';alert.hidden=false;throw err;}},
          onCancel:()=>handlers.onCancel?.(),
          onError:(err)=>{
            alert.textContent='No logramos comprobar el resultado del pago. Antes de repetirlo, revisa tu actividad de PayPal para evitar cargos duplicados.';
            alert.hidden=false;handlers.onError?.(err);
          }
        });
        await buttons.render('#'+prefix+'-'+x.key);
      }
      active(eligible[0].key);
      return root;
    },
  };
})(window.MJB);
