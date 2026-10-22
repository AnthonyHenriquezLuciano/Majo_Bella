/* MAJOBELLA · Centro de operaciones PayPal en Administración.
   Los pagos reales NO se ejecutan en el navegador; la API exige administración y confirmación. */
(function(M){
 const A=M.Admin,$=A.$,esc=A.esc;
 let store=null,loading=null;
 const name=x=>({deposito:'Depósito de cita',saldo:'Saldo de cita',tarjeta:'Tarjeta de regalo',paquete:'Paquete'}[x]||x);
 const short=s=>String(s||'').length>32?String(s).slice(0,32)+'…':String(s||'');
 function health(c){
  const card=(label,value,note,cl)=>`<div class="pp-op-state ${cl||''}"><span>${label}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`;
  $('ppop-health').innerHTML=[
   card('Entorno',c.env==='live'?'Producción · REAL':'Sandbox · Pruebas',c.env==='live'?'Este entorno mueve dinero real.':'Sin cargos reales durante pruebas.',c.env==='live'?'is-warning':''),
   card('Conexión API',c.credentials?'Credenciales presentes':'Sin configurar',c.credentials?'Pulsa Probar conexión para verificar permisos.':'Se configuran en Supabase → Secrets.',c.credentials?'is-good':'is-warning'),
   card('Webhooks',c.webhook?'ID configurado':'Pendiente',c.verifiedDelivery?'Hay eventos firmados recibidos.':'Sin recepción de eventos firmados confirmada.',c.verifiedDelivery?'is-good':'is-warning'),
   card('Suscripciones',c.subscriptions?'Interruptor habilitado':'Desactivadas',c.subscriptions?'Requiere plan sincronizado y autorización PayPal.':'No se han habilitado cobros automáticos.',c.subscriptions?'is-good':'is-warning')
  ].join('');
 }
 function render(){
  if(!store)return;
  health(store.config);
  const list=store.payments||[];
  $('ppop-payments').innerHTML=list.length?list.slice(0,35).map(p=>
   `<div class="pp-op-item"><div class="pp-op-item-main"><strong>${esc(name(p.tipo))} · ${esc(p.cliente||p.referencia)}</strong>
   <small>${esc(p.referencia)} · PayPal ${esc(short(p.captureId))}</small>
   <small>${esc(p.reason||'')}</small></div><div class="pp-op-item-meta"><strong class="pp-op-amount">${A.money(p.montoRD)}</strong>
   ${p.eligible?`<button type="button" data-pp-refund="${esc(p.referencia)}" data-pp-kind="${esc(p.tipo)}">Reembolsar ↗</button>`:''}</div></div>`).join(''):'<p class="pp-op-empty">Aún no hay capturas de PayPal asociadas a compras registradas.</p>';
  const events=store.events||[];
  $('ppop-events').innerHTML=events.length?events.slice(0,25).map(e=>
   `<div class="pp-op-item"><div class="pp-op-item-main"><strong>${esc(e.tipo||'')}</strong><small>Evento ${esc(short(e.id))} · ${esc(e.referencia||'Sin referencia')}</small>
   <small>${esc(String(e.recibido||'').slice(0,19).replace('T',' · '))}</small></div>
   <div class="pp-op-item-meta"><small class="${e.estado==='requiere_revision'?'pp-op-event-review':''}">${esc(e.estado||'—')}</small></div></div>`).join(''):'<p class="pp-op-empty">No hay eventos verificados registrados. Un Webhook ID configurado no garantiza que PayPal los esté enviando.</p>';
  const refunds=store.refunds||[];
  $('ppop-refunds').innerHTML=refunds.length?refunds.slice(0,30).map(p=>
   `<div class="pp-op-item"><div class="pp-op-item-main"><strong>${esc(name(p.tipo))} · ${esc(p.referencia)}</strong>
   <small>PayPal ${esc(p.paypalReembolsoId||'Por confirmar')} · ${esc(p.motivo||'')}</small></div>
   <div class="pp-op-item-meta"><strong>US$ ${Number(p.montoUSD||0).toFixed(2)}</strong><small>${esc(p.estado)}</small></div></div>`).join(''):'<p class="pp-op-empty">No se han solicitado reembolsos desde este panel.</p>';
 }
 async function refresh(){
  if(loading)return loading;
  loading=(async()=>{try{
   $('ppop-notice').classList.remove('is-error');$('ppop-notice').textContent='Consultando información de pagos protegida…';
   store=await A.call('adminPaypalOperations',{});
   render();$('ppop-notice').textContent='Información revisada en MAJOBELLA. Para permisos o conciliación bancaria, consulta tu PayPal Business.';
  }catch(e){$('ppop-notice').textContent=e.message||'No se pudo conectar.';$('ppop-notice').classList.add('is-error');}
  finally{loading=null;}})();
  return loading;
 }
 async function test(btn){
  await A.busy(btn,async()=>{try{
   const x=await A.call('adminPaypalConnectionTest',{});
   $('ppop-notice').textContent=(x.connected?'✓ ':'⚠ ')+x.message;
   $('ppop-notice').classList.toggle('is-error',!x.connected);
  }catch(e){$('ppop-notice').textContent=e.message;$('ppop-notice').classList.add('is-error');}});
 }
 async function refund(btn){
  const tipo=btn.dataset.ppKind,referencia=btn.dataset.ppRefund;
  const x=store?.payments?.find(p=>p.referencia===referencia&&p.tipo===tipo);
  if(!x||!x.eligible)return;
  const environment=store.config.env;
  if(!confirm('REEMBOLSO COMPLETO · '+name(tipo)+' ('+referencia+')\nImporte registrado: '+A.money(x.montoRD)+'\n\nLa devolución de PayPal se realizará sobre el importe original en USD. Los abonos bancarios pueden tardar. ¿Continuar?'))return;
  const motivo=prompt('Motivo del reembolso (registro interno, mínimo 8 caracteres):','Solicitud de la clienta');
  if(motivo===null)return;
  if(motivo.trim().length<8){A.toast('Explica el motivo de al menos 8 caracteres.');return;}
  const real=environment==='live'?prompt('Cobro REAL: escribe REEMBOLSAR para confirmar la devolución de dinero:'):null;
  if(environment==='live'&&real!=='REEMBOLSAR'){A.toast('No se confirmó el reembolso real.');return;}
  await A.busy(btn,async()=>{try{
   const r=await A.call('adminPaypalRefund',{tipo,referencia,confirmar:true,motivo:motivo.trim(),confirmacionReal:real||''});
   A.toast(r.message||'Solicitud enviada.');
   await A.load();await refresh();
  }catch(e){A.toast(e.message);}});
 }
 A.PayPalOps={
  render(){if(!store&&!loading)refresh();else if(store)render();},
  init(){
   $('ppop-refresh')?.addEventListener('click',refresh);
   $('ppop-test')?.addEventListener('click',e=>test(e.currentTarget));
   $('ppop-payments')?.addEventListener('click',e=>{
    const b=e.target.closest('[data-pp-refund]');if(b)refund(b);
   });
  }
 };
})(window.MJB);
