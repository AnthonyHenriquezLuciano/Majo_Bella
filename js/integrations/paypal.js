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
        <div class="pp-premium-header"><p class="pp-premium-eyebrow">MAJOBELLA · CHECKOUT SEGURO</p><span class="pp-premium-counter" aria-live="polite">01 / ${String(eligible.length).padStart(2,'0')}</span></div>
        <h3>Elige tu forma de pago</h3>
        <p class="pp-premium-subtitle">Una experiencia sencilla, protegida y diseñada para ti.</p>
        <div class="pp-premium-carousel" aria-label="Carrusel de métodos de pago">
          <button type="button" class="pp-premium-nav" data-pp-prev aria-label="Método anterior">‹</button>
          <div class="pp-premium-methods" role="tablist" aria-label="Métodos de pago disponibles">
            ${eligible.map((x,i)=>`<button type="button" id="${prefix}-tab-${x.key}" role="tab" class="pp-premium-method${i===0?' is-active':''}" data-pp-mode="${x.key}" aria-controls="${prefix}-frame-${x.key}" aria-selected="${i===0}" tabindex="${i===0?'0':'-1'}"><span class="pp-premium-method-icon" aria-hidden="true">${x.key==='card'?'▣':'P'}</span><span class="pp-premium-method-copy"><strong>${x.label}</strong><small>${x.key==='card'?'Solo cuando PayPal habilite esta opción':'Autoriza el pago desde tu cuenta'}</small></span><span class="pp-premium-method-go" aria-hidden="true">↗</span></button>`).join('')}
          </div>
          <button type="button" class="pp-premium-nav" data-pp-next aria-label="Método siguiente">›</button>
        </div>
        <div class="pp-premium-dots" aria-hidden="true">${eligible.map((x,i)=>`<span data-pp-dot="${x.key}" class="${i===0?'is-active':''}"></span>`).join('')}</div>
        <div class="pp-premium-hint" aria-live="polite"></div>
        <div class="pp-premium-frames">${eligible.map((x)=>`<div id="${prefix}-frame-${x.key}" role="tabpanel" aria-labelledby="${prefix}-tab-${x.key}" data-pp-frame="${x.key}"><div id="${prefix}-${x.key}"></div></div>`).join('')}</div>
        <div class="pp-premium-trust"><span>♢ Compra protegida</span><span>♢ Confirmación verificada</span><span>♢ Atención del estudio</span></div>
        <p class="pp-premium-secure">El cobro se procesa en PayPal. MAJOBELLA no almacena datos de tarjetas. La tarjeta sin cuenta y sus funciones dependen de la elegibilidad de PayPal.</p>
        <p class="pp-premium-error" role="alert" hidden></p>
      </div>`;
      const root=el.querySelector('[data-paypal-checkout]');
      const alert=root.querySelector('.pp-premium-error');
      const hint=root.querySelector('.pp-premium-hint');
      let current=eligible[0].key;
      const active=(key,focus=false)=>{
        const index=eligible.findIndex(x=>x.key===key);
        if(index<0)return;
        current=key;
        eligible.forEach(x=>{
          const on=x.key===key;
          const btn=root.querySelector('[data-pp-mode="'+x.key+'"]');
          btn.classList.toggle('is-active',on);
          btn.setAttribute('aria-selected',String(on));
          btn.tabIndex=on?0:-1;
          root.querySelector('[data-pp-frame="'+x.key+'"]').hidden=!on;
          root.querySelector('[data-pp-dot="'+x.key+'"]').classList.toggle('is-active',on);
        });
        root.querySelector('.pp-premium-counter').textContent=String(index+1).padStart(2,'0')+' / '+String(eligible.length).padStart(2,'0');
        hint.textContent=eligible[index].hint;
        alert.hidden=true;
        if(focus)root.querySelector('[data-pp-mode="'+key+'"]').focus();
      };
      const move=(direction,focus=false)=>{
        const i=eligible.findIndex(x=>x.key===current);
        active(eligible[(i+direction+eligible.length)%eligible.length].key,focus);
      };
      root.querySelectorAll('[data-pp-mode]').forEach(btn=>{
        btn.addEventListener('click',()=>active(btn.dataset.ppMode));
        btn.addEventListener('keydown',e=>{
          if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1,true);}
          if(e.key==='Home'||e.key==='End'){e.preventDefault();active(eligible[e.key==='Home'?0:eligible.length-1].key,true);}
        });
      });
      root.querySelector('[data-pp-prev]').addEventListener('click',()=>move(-1,true));
      root.querySelector('[data-pp-next]').addEventListener('click',()=>move(1,true));
      root.querySelectorAll('.pp-premium-nav').forEach(b=>b.hidden=eligible.length<2);
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
