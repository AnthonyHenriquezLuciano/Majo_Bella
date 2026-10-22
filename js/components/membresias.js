/* MAJOBELLA · Membresías visibles sin cobro automático: la inscripción requiere cuenta verificada. */
(function(M){
  const $=(id)=>document.getElementById(id),esc=M.escapeHtml,API=M.BookingAPI;
  let plans=[],selected='',busy=false;
  const money=(n)=>'RD$ '+Number(n||0).toLocaleString('es-DO');
  const statuses={solicitada:'Solicitud pendiente de pago',activa:'Activa',vencida:'Vencida',pausada:'Pausada',cancelada:'Cancelada'};
  function render(){
    plans=M.membershipPlans||[];
    const section=$('membresias');if(!section)return;
    section.hidden=false;
    $('mb-public-list').innerHTML=plans.length?plans.map(p=>`<article class="mb-pub-card">
      <span class="mb-pub-overline">MEMBRESÍA MENSUAL</span><h3>${esc(p.nombre)}</h3>
      <p class="mb-pub-price">${money(p.precioRD)} <small>/ mes</small></p>
      <p class="mb-pub-desc">${esc(p.descripcion||'')}</p>
      <p class="mb-pub-session">${Number(p.sesionesMes)} ${Number(p.sesionesMes)===1?'sesión':'sesiones'} al mes</p>
      ${p.beneficios?`<p class="mb-pub-benefits">${esc(p.beneficios)}</p>`:''}
      <button class="btn btn-primary" type="button" data-mb-request="${esc(p.id)}">Solicitar membresía</button></article>`).join(''):
      '<div class="mb-public-empty">Pronto encontrarás aquí nuestras membresías. Escríbenos si deseas conocer las opciones disponibles.</div>';
  }
  async function loadMine(){
    if(!M.Auth?.token){$('mb-mine').innerHTML='<p>Inicia sesión para consultar tus membresías.</p>';return;}
    try{const result=await API.post({action:'myMemberships',idToken:M.Auth.token},'No pudimos leer tus membresías.');
      $('mb-mine').innerHTML=result.memberships.length?result.memberships.map(m=>`<article class="mb-pub-member">
        <strong>${esc(m.nombrePlan)}</strong><span>${esc(statuses[m.estadoEfectivo]||m.estado)}</span>
        <small>${m.vence?'Vence '+esc(m.vence):'Pendiente de activación por el estudio'}</small>
        <p>${m.disponibles||0} de ${m.sesionesMes||0} sesiones disponibles</p></article>`).join(''):'<p>Aún no tienes membresías. Puedes solicitar uno de los planes disponibles.</p>';
    }catch(err){$('mb-mine').textContent=err.message||'No se pudo consultar.';}
  }
  async function request(id){
    if(busy)return;
    if(!M.Auth?.token){$('mb-public-msg').textContent='Inicia sesión para enviar tu solicitud con tu correo verificado.';M.openAuth?.();return;}
    const p=plans.find(x=>x.id===id);if(!p)return;
    if(!confirm('Vas a solicitar '+p.nombre+' por '+money(p.precioRD)+' al mes. El estudio te contactará para completar el pago. No se hará ningún cargo ahora ni se renovará automáticamente. ¿Continuar?'))return;
    busy=true;$('mb-public-msg').textContent='Enviando tu solicitud…';
    try{const result=await API.post({action:'requestMembership',planId:id,idToken:M.Auth.token,
      nombre:M.Auth.user?.name||''},'No pudimos registrar la solicitud.');
      $('mb-public-msg').textContent=result.existing?'Ya tienes una solicitud o membresía vigente de este plan.':
        '¡Solicitud recibida! Te contactaremos para confirmar el pago y activar tus beneficios. No se ha realizado ningún cargo.';
      loadMine();
    }catch(err){$('mb-public-msg').textContent=err.message||'Inténtalo nuevamente.';}
    finally{busy=false;}
  }
  M.initMemberships=function(){
    if(!$('membresias'))return;
    render();loadMine();
    $('membresias').addEventListener('click',e=>{const b=e.target.closest('[data-mb-request]');if(b)request(b.dataset.mbRequest);});
    M.Auth.onChange(()=>{loadMine();if(M.Auth.user)$('mb-public-msg').textContent='';});
  };
  M.refreshMemberships=render;
})(window.MJB);
