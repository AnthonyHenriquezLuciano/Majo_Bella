/* MAJOBELLA · Membresías: control de planes y renovaciones manuales. */
(function(M){
  const A=M.Admin, {$,esc}=A;
  let current=null;
  const allPlans=()=>A.data?.membershipPlans||[];
  const allMembers=()=>A.data?.memberships||[];
  const money=(n)=>'RD$ '+(Number(n)||0).toLocaleString('es-DO');
  const states={solicitada:'Solicitud pendiente',activa:'Activa',vencida:'Vencida',pausada:'Pausada',cancelada:'Cancelada'};
  const payMode=()=>A.data?.subscriptionCapability?.enabled;
  const isAuto=m=>!!m.paypalSubscriptionId;
  function choices(selected=[]){
    const list=A.services();
    $('mb-service-choices').innerHTML=list.length?list.map(s=>`<label class="mb-svc-choice"><input type="checkbox" value="${esc(s.id)}" ${selected.includes(s.id)?'checked':''}><span>${esc(A.serviceName(s.id))}</span></label>`).join(''):'<p>Primero publica servicios reservables en el Catálogo.</p>';
  }
  function openPlan(id){
    current=id?allPlans().find(x=>x.id===id):null;
    const f=$('mb-plan-form');f.reset();
    const p=current||{nombre:'',descripcion:'',beneficios:'',estado:'borrador',precioRD:'',sesionesMes:2,orden:allPlans().length+1,servicios:[]};
    ['nombre','descripcion','beneficios','estado','precioRD','sesionesMes','orden'].forEach(k=>{f.elements[k].value=p[k]??'';});
    choices(Array.isArray(p.servicios)?p.servicios:[]);
    $('mb-editor-title').textContent=current?'Editar · '+current.nombre:'Nuevo plan de membresía';
    $('mb-edit-panel').hidden=false;
    $('mb-edit-panel').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function renderPlans(){
    const plans=allPlans().slice().sort((a,b)=>Number(a.orden||0)-Number(b.orden||0));
    $('mb-plan-list').innerHTML=plans.length?plans.map(p=>`<article class="mb-plan-card">
      <p class="mb-tag">${p.estado==='activo'?'● Publicado':p.estado==='archivado'?'◯ Archivado':'✎ Borrador'}</p>
      <h3>${esc(p.nombre)}</h3><p class="mb-price">${money(p.precioRD)} <small>/mes</small></p>
      <p class="muted">${Number(p.sesionesMes)||1} sesiones al mes</p>
      ${p.paypalPlanId?`<p class="mb-tag">✓ PayPal Automático · US$ ${Number(p.paypalPrecioUSD).toFixed(2)}/mes</p>`:
        '<p class="mb-tag">Renovación manual</p>'}
      <div class="mb-plan-actions"><button class="chip-btn" type="button" data-mb-edit="${esc(p.id)}">Editar plan</button>
      ${p.estado==='activo'?`<button class="chip-btn" type="button" data-mb-sync="${esc(p.id)}" ${payMode()?'':'disabled title="Configura PayPal Subscriptions en Supabase"'}>${p.paypalPlanId?'Actualizar tarifa PayPal':'Activar suscripciones PayPal'}</button>`:''}</div></article>`).join(''):'<p class="muted">Todavía no hay planes. Crea tu primera membresía.</p>';
  }
  function renderMembers(){
    const state=$('mb-state-filter').value, term=$('mb-search').value.trim().toLowerCase();
    const list=allMembers().filter(m=>(!state||m.estadoEfectivo===state)&&
      (!term||[m.clienta,m.correo,m.nombrePlan].some(t=>String(t||'').toLowerCase().includes(term))));
    $('mb-count').textContent=allMembers().length+' registros · '+allMembers().filter(m=>m.estadoEfectivo==='activa').length+' activas';
    $('mb-member-list').innerHTML=list.length?list.slice().reverse().map(m=>{
      const pending=m.estadoEfectivo==='solicitada',active=m.estadoEfectivo==='activa',expired=m.estadoEfectivo==='vencida';
      const remain=Number(m.disponibles)||0,auto=isAuto(m);
      return `<article class="mb-member">
        <div class="mb-member-main"><span class="mb-tag">${esc(states[m.estadoEfectivo]||m.estado)}</span>
          <h3>${esc(m.clienta||m.correo)}</h3>
          <p>${esc(m.correo)} · ${esc(m.nombrePlan||'')}</p>
          <p>${money(m.precioRD)} /mes · ${m.vence?'Vence '+esc(m.vence):'A la espera de pago'}</p>
          <strong>${remain} de ${Number(m.sesionesMes)||0} sesiones disponibles</strong>
          ${auto?`<p class="mb-auto-state">PayPal Business · ${esc(m.paypalEstado||'Esperando autorización')} · US$ ${Number(m.paypalPrecioUSD||0).toFixed(2)}/mes</p>`:''}
        </div>
        <div class="mb-member-actions">
          ${!auto&&(pending||m.estado==='pausada')? `<button class="btn-dark sm" data-mb-action="activar" data-id="${esc(m.id)}">Activar con pago</button>`:''}
          ${!auto&&(active||expired)? `<button class="chip-btn" data-mb-action="renovar" data-id="${esc(m.id)}">Renovar con pago</button>`:''}
          ${active&&remain>0?`<button class="chip-btn" data-mb-action="usar" data-id="${esc(m.id)}">Registrar sesión</button>`:''}
          ${Number(m.sesionesUsadas)>0?`<button class="chip-btn" data-mb-action="deshacerUso" data-id="${esc(m.id)}">Corregir uso</button>`:''}
          ${active&&!auto?`<button class="chip-btn" data-mb-action="pausar" data-id="${esc(m.id)}">Pausar</button>`:''}
          ${m.estado!=='cancelada'&&!auto?`<button class="chip-btn" data-mb-action="cancelar" data-id="${esc(m.id)}">Cancelar</button>`:''}
          ${auto&&!['CANCELLED','EXPIRED'].includes(m.paypalEstado)?`<button class="chip-btn" data-mb-auto-cancel="${esc(m.id)}">Cancelar en PayPal</button>`:''}
        </div></article>`;
    }).join(''):'<p class="muted">No hay clientas para este filtro.</p>';
  }
  function render(){renderPlans();renderMembers();}
  async function save(e){
    e.preventDefault();
    const f=e.currentTarget;
    const plan={id:current?.id||'',nombre:f.elements.nombre.value.trim(),descripcion:f.elements.descripcion.value.trim(),
      beneficios:f.elements.beneficios.value.trim(),estado:f.elements.estado.value,
      precioRD:Number(f.elements.precioRD.value),sesionesMes:Number(f.elements.sesionesMes.value),
      orden:Number(f.elements.orden.value)||0,
      servicios:[...$('mb-service-choices').querySelectorAll('input:checked')].map(x=>x.value)};
    if(!plan.nombre||!plan.precioRD||plan.sesionesMes<1||!plan.servicios.length){A.toast('Completa el nombre, precio, sesiones y servicios incluidos.');return;}
    await A.busy($('mb-save'),async()=>{
      try{const r=await A.call('adminSaveMembershipPlan',{plan});A.upsert('membershipPlans',r.plan);
        $('mb-edit-panel').hidden=true;current=null;render();A.toast('Plan guardado. Los publicados aparecerán en la web.');}
      catch(err){A.toast(err.message);}
    });
  }
  async function membershipAction(btn){
    const action=btn.dataset.mbAction,id=btn.dataset.id;
    const m=allMembers().find(x=>x.id===id);
    if(!m)return;
    let extra={};
    if(['activar','renovar'].includes(action)){
      const method=prompt('Pago de '+money(m.precioRD)+' confirmado. ¿Cómo lo recibiste? Escribe: efectivo, transferencia, paypal o tarjeta.\n(No se realizará ningún cobro aquí.)','transferencia');
      if(method===null)return;
      const metodoPago=method.trim().toLowerCase();
      if(!['efectivo','transferencia','paypal','tarjeta'].includes(metodoPago)){A.toast('Método de pago no válido.');return;}
      if(!confirm('¿Confirmas que YA recibiste el pago de '+money(m.precioRD)+' de '+m.clienta+'? Esta acción activará/renovará sus beneficios.'))return;
      extra={pagoConfirmado:true,metodoPago};
    } else if(!confirm(action==='usar'?'¿Confirmas que esta clienta recibió una sesión del plan?':
      action==='deshacerUso'?'¿Deshacer el último consumo registrado?':
      action==='cancelar'?'¿Cancelar esta membresía? No se eliminará el historial.':'¿Pausar la membresía?'))return;
    await A.busy(btn,async()=>{
      try{const r=await A.call('adminMembershipAction',{id,change:action,...extra});A.upsert('memberships',r.membresia);
        render();A.toast('Membresía actualizada.');}catch(err){A.toast(err.message);}
    });
  }
  async function syncPaypal(btn){
    if(!confirm('PayPal creará un plan de cobro mensual en USD. Las clientas existentes conservan el importe originalmente autorizado. ¿Continuar?'))return;
    await A.busy(btn,async()=>{try{
      const r=await A.call('adminSyncPaypalPlan',{planId:btn.dataset.mbSync});
      const p=allPlans().find(x=>x.id===r.planId);
      if(p){p.paypalPlanId=r.paypalPlanId;p.paypalPrecioUSD=r.usd;p.paypalPlanVersion=Number(r.usd).toFixed(2);}
      render();A.toast('Plan PayPal sincronizado. Se cobrará US$ '+Number(r.usd).toFixed(2)+' mensuales.');
    }catch(err){A.toast(err.message||'No pudimos sincronizar PayPal.');}});
  }
  async function cancelAuto(btn){
    if(!confirm('¿Cancelar en PayPal la renovación automática de esta clienta? El período ya pagado permanece vigente.'))return;
    await A.busy(btn,async()=>{try{
      const r=await A.call('cancelPaypalSubscription',{id:btn.dataset.mbAutoCancel});
      A.upsert('memberships',r.membresia);render();A.toast(r.mensaje);
    }catch(err){A.toast(err.message||'No se pudo cancelar en PayPal.');}});
  }
  A.sections.membresias={
    render,
    init(){
      $('mb-new').addEventListener('click',()=>openPlan(''));
      $('mb-close').addEventListener('click',()=>{$('mb-edit-panel').hidden=true;current=null;});
      $('mb-plan-list').addEventListener('click',e=>{const b=e.target.closest('[data-mb-edit],[data-mb-sync]');if(!b)return;if(b.dataset.mbEdit)openPlan(b.dataset.mbEdit);else syncPaypal(b);});
      $('mb-plan-form').addEventListener('submit',save);
      $('mb-state-filter').addEventListener('change',renderMembers);
      $('mb-search').addEventListener('input',renderMembers);
      $('mb-member-list').addEventListener('click',e=>{const b=e.target.closest('[data-mb-action],[data-mb-auto-cancel]');if(!b)return;if(b.dataset.mbAutoCancel)cancelAuto(b);else membershipAction(b);});
    }
  };
})(window.MJB);
