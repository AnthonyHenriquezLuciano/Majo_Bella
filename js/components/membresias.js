/* MAJOBELLA · Membresías premium: autorización PayPal, renovación automática y comprobantes.
   Nada se activa hasta que PayPal confirma el primer cobro. */
(function(M){
 const $=id=>document.getElementById(id),esc=M.escapeHtml,API=M.BookingAPI;
 let plans=[],mine=[],receipts=[],busy=false;
 const money=n=>'RD$ '+Number(n||0).toLocaleString('es-DO');
 const dollars=n=>'US$ '+Number(n||0).toFixed(2);
 const capability=()=>M.subscriptionCapability||{};
 const states={solicitada:'Pendiente de pago',activa:'Vigente',vencida:'Período vencido',pausada:'En pausa',cancelada:'Cancelada'};
 const isAuto=m=>!!m.paypalSubscriptionId;
 const on=(msg,type='info')=>{const el=$('mb-public-msg');el.textContent=msg;el.dataset.state=type;};
 const safeDate=x=>x?new Date(x+'T12:00:00Z').toLocaleDateString('es-DO',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'—';
 function render(){
   plans=M.membershipPlans||[];
   if(!$('membresias'))return;
   $('membresias').hidden=false;
   $('mb-public-list').innerHTML=plans.length?plans.map(p=>{
     const benefits=String(p.beneficios||'').split(/\r?\n|;/).map(x=>x.trim()).filter(Boolean).slice(0,6);
     const monthly=Number(p.sesionesMes)||0;
     const isRecurring=capability().enabled&&p.renovacion==='automatica_disponible';
     return `<article class="mb-pub-card mb-pay-card">
       <div class="mb-card-top"><span class="mb-pub-overline">TU RITUAL MAJOBELLA</span><span class="mb-card-badge">MENSUAL</span></div>
       <h3>${esc(p.nombre)}</h3>
       <p class="mb-pub-desc">${esc(p.descripcion||'Un plan para cuidar de ti y volver a dedicarte tiempo cada mes.')}</p>
       <div class="mb-card-value"><p class="mb-pub-price">${money(p.precioRD)} <small>/ mes</small></p>
         <p class="mb-pub-session">${monthly} ${monthly===1?'sesión incluida':'sesiones incluidas'} por mes</p></div>
       ${benefits.length?`<div class="mb-card-benefits"><span>LO QUE DISFRUTAS</span><ul>${benefits.map(b=>`<li>${esc(b)}</li>`).join('')}</ul></div>`:''}
       <div class="mb-card-actions">
         ${isRecurring?`<button class="btn btn-primary" type="button" data-mb-auto="${esc(p.id)}">Activar mi ritual mensual</button>
           <p class="mb-pay-small">Renovación autorizada en PayPal: US$ ${Number(p.paypalPrecioUSD||0).toFixed(2)}/mes. Puedes cancelarla desde tu cuenta.</p>`:''}
         <button class="btn ${isRecurring?'btn-ghost':'btn-primary'}" type="button" data-mb-request="${esc(p.id)}">${isRecurring?'Consultar pago con el estudio':'Solicitar esta membresía'}</button>
         ${!isRecurring?'<p class="mb-pay-small">Nuestro equipo te contactará para coordinar el pago. No se genera un cargo automático.</p>':''}
       </div>
     </article>`;
   }).join(''):
    '<div class="mb-public-empty"><h3>Pronto, tu ritual mensual</h3><p>Estamos preparando opciones de membresía para que puedas cuidarte con constancia. Escríbenos y te ayudaremos a elegir tu próxima experiencia.</p><a class="btn btn-line" href="index.html#contacto">Consultar al estudio</a></div>';
 }
 function syncAuth(){
   const user=M.Auth?.user, signed=!!(user&&M.Auth?.token);
   const btn=$('mb-account-login'),welcome=$('mb-account-welcome');
   if(btn)btn.hidden=signed;
   if(welcome){
     welcome.hidden=!signed;
     welcome.textContent=signed?`Hola, ${user.firstName||user.name||'bienvenida'}. Aquí están tus membresías y movimientos.`:'';
   }
 }
 function receiptHtml(p){
  const number=esc(p.id),date=safeDate(String(p.creado||'').slice(0,10)),name=esc(M.Auth?.user?.name||'Clienta MAJOBELLA');
  return `<article class="mb-receipt-sheet"><header><p>MAJOBELLA</p><small>BEAUTY STUDIO · MÁS YO, MÁS BELLA.</small></header>
  <div class="mb-receipt-top"><span>COMPROBANTE DE PAGO</span><h2>Gracias por elegirte.</h2>
  <p>Es un placer acompañarte en cada momento de cuidado personal.</p></div>
  <div class="mb-receipt-row"><span>Referencia</span><strong>${number}</strong></div>
  <div class="mb-receipt-row"><span>Fecha</span><strong>${date}</strong></div>
  <div class="mb-receipt-row"><span>Clienta</span><strong>${name}</strong></div>
  <div class="mb-receipt-row"><span>Membresía</span><strong>${esc(p.nombrePlan)}</strong></div>
  <div class="mb-receipt-row"><span>Procesador</span><strong>PayPal</strong></div>
  <div class="mb-receipt-total"><span>Total confirmado</span><strong>${dollars(p.montoUSD)}</strong>
  <small>Equivalente referencial ${money(p.montoRD)}</small></div>
  <p class="mb-receipt-legal">Comprobante comercial de MAJOBELLA. No es una factura fiscal ni contiene NCF. La conversión a pesos es referencial a la tasa de contratación.</p>
  <footer>MAJOBELLA · MUCHAS GRACIAS POR CONFIAR EN NOSOTROS</footer></article>`;
 }
 function showReceipt(id){
  const p=receipts.find(x=>x.id===id);if(!p)return;
  let dlg=$('mb-receipt-dialog');
  if(!dlg){
   dlg=document.createElement('dialog');dlg.id='mb-receipt-dialog';dlg.className='mb-receipt-dialog';
   document.body.appendChild(dlg);
  }
  dlg.innerHTML=`<div class="mb-receipt-toolbar"><button type="button" data-mb-close>← Cerrar</button><button type="button" data-mb-print>Imprimir / Guardar PDF ↓</button></div>${receiptHtml(p)}`;
  dlg.querySelector('[data-mb-close]').addEventListener('click',()=>dlg.close());
  dlg.querySelector('[data-mb-print]').addEventListener('click',()=>window.print());
  dlg.showModal();
 }
 function mineView(){
  syncAuth();
  $('mb-mine').innerHTML=!M.Auth?.token
    ? '<p class="mb-account-prompt">Inicia sesión con Google para consultar tus membresías y sesiones disponibles.</p>'
    : mine.length?mine.map(m=>{
    const status=m.estadoEfectivo||m.estado,auto=isAuto(m),renew=auto&&m.paypalEstado!=='CANCELLED'&&m.paypalEstado!=='EXPIRED';
    return `<article class="mb-pub-member mb-member-premium">
      <div class="mb-member-premium-top"><span>MAJOBELLA · MI MEMBRESÍA</span>
        <span class="mb-member-pill ${status==='activa'?'is-active':''}">${esc(states[status]||status)}</span></div>
      <h3>${esc(m.nombrePlan)}</h3>
      <p>${Number(m.disponibles)||0} de ${Number(m.sesionesMes)||0} sesiones disponibles</p>
      <small>${m.vence?'Tu período termina el '+safeDate(m.vence):'Pendiente de confirmar el primer cobro'}</small>
      ${auto?`<p class="mb-member-renew">${renew?'Renovación automática con PayPal': 'La renovación automática está desactivada.'}</p>
        ${m.paypalEstado==='PAYMENT_FAILED'?'<p class="mb-pay-warning">No se completó el último cobro. Revisa tu método de pago en PayPal; te acompañamos si necesitas ayuda.</p>':''}
        ${renew?`<button class="mb-member-cancel" type="button" data-mb-cancel="${esc(m.id)}">Cancelar renovación automática</button>`:''}`:
       '<p class="mb-member-renew">Renovación gestionada por el estudio, sin débito automático.</p>'}
    </article>`;
  }).join(''):'<p>Aún no tienes membresías. Elige uno de nuestros planes para comenzar.</p>';
  const receiptContainer=$('mb-payment-history');
  if(receiptContainer)receiptContainer.innerHTML=receipts.length?`<h3>Tus comprobantes</h3>`+receipts.map(p=>
   `<button type="button" class="mb-receipt-item" data-mb-receipt="${esc(p.id)}"><span><b>${esc(p.nombrePlan)}</b>
    <small>${safeDate(String(p.creado).slice(0,10))} · ${esc(p.id)}</small></span><strong>${dollars(p.montoUSD)} ↗</strong></button>`).join(''):'';
 }
 async function loadMine(){
   syncAuth();
   const token=M.Auth?.token;
   if(!token){mine=[];receipts=[];mineView();return;}
   try{
    const [r,p]=await Promise.all([API.post({action:'myMemberships',idToken:token}),
      API.post({action:'myMembershipPayments',idToken:token})]);
    if(token!==M.Auth?.token)return;
    mine=r.memberships||[];receipts=p.payments||[];mineView();
   }catch(err){
    if(token!==M.Auth?.token)return;
    $('mb-mine').textContent='No pudimos cargar tus membresías. Comprueba tu conexión o vuelve a iniciar sesión.';
   }
 }
 async function request(id){
  if(busy)return;
  if(!M.Auth?.token){on('Inicia sesión para enviar tu solicitud con tu correo verificado.');M.openAuth?.();return;}
  const p=plans.find(x=>x.id===id);if(!p)return;
  if(!confirm('Solicitarás '+p.nombre+' por '+money(p.precioRD)+' al mes. El estudio te contactará para coordinar el pago. No hay cobro automático. ¿Continuar?'))return;
  busy=true;on('Preparando tu solicitud…');
  try{
   const result=await API.post({action:'requestMembership',planId:id,idToken:M.Auth.token,nombre:M.Auth.user?.name||''});
   on(result.existing?'Ya tienes una solicitud o membresía vigente de este plan.':
      '¡Solicitud recibida! Te contactaremos para confirmar el pago y activar tus beneficios. Gracias por elegir MAJOBELLA.','ok');
   await loadMine();
  }catch(err){on(err.message||'No pudimos completar tu solicitud.','error');}
  finally{busy=false;}
 }
 async function subscribe(id){
  if(busy)return;
  if(!M.Auth?.token){on('Inicia sesión para continuar con tu suscripción segura.');M.openAuth?.();return;}
  const p=plans.find(x=>x.id===id);if(!p)return;
  if(!confirm('Vas a autorizar un cobro recurrente de US$ '+Number(p.paypalPrecioUSD).toFixed(2)+' cada mes (equivalente referencial '+money(p.precioRD)+' al configurar este plan). PayPal confirmará ese importe antes de aceptarlo. Puedes cancelar la renovación desde Mis membresías. ¿Continuar?'))return;
  busy=true;on('Preparando tu autorización de forma segura…');
  try{
    const r=await API.post({action:'startPaypalSubscription',planId:id,idToken:M.Auth.token,nombre:M.Auth.user?.name||''});
    if(r.approvalUrl&&/^https:\/\//.test(r.approvalUrl)){
      sessionStorage.setItem('mjb.pendingSubscription',r.membresiaId);
      window.location.assign(r.approvalUrl);
    }else{on(r.mensaje||'Ya existe una suscripción pendiente.','ok');await loadMine();}
  }catch(err){on(err.message||'No se pudo iniciar la suscripción. Puedes intentarlo de nuevo.','error');}
  finally{busy=false;}
 }
 async function cancel(id){
  if(busy)return;
  if(!confirm('¿Deseas cancelar la renovación automática? No se harán nuevos cobros mensuales. Conservarás las sesiones de tu período pagado hasta que termine.'))return;
  busy=true;on('Actualizando tu suscripción con PayPal…');
  try{const r=await API.post({action:'cancelPaypalSubscription',id,idToken:M.Auth.token});on(r.mensaje,'ok');await loadMine();}
  catch(err){on(err.message||'No pudimos cancelarla. Escríbenos antes de darla por cancelada.','error');}
  finally{busy=false;}
 }
 async function returnFromPaypal(){
  const url=new URL(location.href),result=url.searchParams.get('mjb_subscription');
  if(!result)return;
  url.searchParams.delete('mjb_subscription');
  history.replaceState(null,'',url.pathname+url.search+url.hash);
  if(result==='cancel'){on('No se autorizó la suscripción. No se han activado sesiones. Puedes intentarlo cuando quieras.');return;}
  const id=sessionStorage.getItem('mjb.pendingSubscription');
  sessionStorage.removeItem('mjb.pendingSubscription');
  if(!id||!M.Auth?.token){on('Volviste de PayPal. Inicia sesión para comprobar el estado de tu membresía.');return;}
  try{
   const r=await API.post({action:'confirmPaypalSubscription',id,idToken:M.Auth.token});
   on(r.pagado?'¡Tu membresía está activa! Nos encantará recibirte.':r.mensaje,'ok');
   await loadMine();
  }catch(err){on('Recibimos tu regreso de PayPal. El cobro se verificará de forma segura; puedes consultar el estado en Mis membresías.');}
 }
 M.initMemberships=function(){
  if(!$('membresias'))return;
  if(!$('mb-payment-history')){
    const e=document.createElement('div');e.id='mb-payment-history';e.className='mb-payment-history';
    $('mb-mine').after(e);
  }
  render();loadMine().then(returnFromPaypal);
  $('membresias').addEventListener('click',e=>{
   const b=e.target.closest('[data-mb-auto],[data-mb-request],[data-mb-cancel],[data-mb-receipt]');
   if(!b)return;
   if(b.dataset.mbAuto)subscribe(b.dataset.mbAuto);
   if(b.dataset.mbRequest)request(b.dataset.mbRequest);
   if(b.dataset.mbCancel)cancel(b.dataset.mbCancel);
   if(b.dataset.mbReceipt)showReceipt(b.dataset.mbReceipt);
  });
  M.Auth.onChange(()=>{loadMine();});
 };
 M.refreshMemberships=render;
})(window.MJB);
