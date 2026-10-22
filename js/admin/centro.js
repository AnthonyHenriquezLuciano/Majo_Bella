/* MAJOBELLA · Centro de control empresarial (fuente: A.data, no datos ficticios).
   La vista es informativa; las acciones se completan en los módulos con permisos existentes. */
(function (M) {
  const A = M.Admin, {$, esc} = A;
  let period = 'hoy';
  const labels = {hoy:'Hoy',semana:'Últimos 7 días',mes:'Este mes'};
  const today = () => M.todayKey();
  const range = () => {
    const end = today();
    return {from: period === 'hoy' ? end : period === 'semana' ? A.addDays(end,-6) : end.slice(0,8)+'01', to:end};
  };
  const fmtTime = (a) => {
    try { return M.fmtTime12(a.time); } catch(e) { return a.time || ''; }
  };
  const when = (d) => {
    try { return A.shortDate(d); } catch(e) {return d;}
  };
  const money = (n) => A.money(Math.round(Number(n)||0));
  const people = () => (typeof A.clients === 'function' ? A.clients() : []);
  const sample = (list, n=6) => list.slice(0,n);
  function metrics() {
    const r = range();
    const s = A.moneySummary(r.from,r.to);
    const entries = (A.data.items||[]).filter(a=>a.date>=r.from && a.date<=r.to);
    const valid = entries.filter(a=>['confirmada','completada','no-asistio'].includes(a.status));
    const done = valid.filter(a=>a.status==='completada');
    const guests = new Set(done.map(a=>a.clientKey||a.client?.email||a.client?.phone||a.client?.name).filter(Boolean));
    return {r,s,entries,valid,done,guests};
  }
  const tile = (label,value,info,kind) => `<article class="cc-kpi ${kind||''}">
    <span class="cc-kpi-label">${label}</span><strong class="cc-kpi-value">${value}</strong>
    <span class="cc-kpi-info">${info}</span></article>`;
  function renderKpis(x) {
    const entries=x.valid.length,done=x.done.length;
    const show = [
      tile('Cobros netos',money(x.s.gross+x.s.ref),'Citas, regalos y paquetes cobrados','cc-kpi-feature'),
      tile('Citas gestionadas',String(entries),labels[period]+' · confirmadas o atendidas'),
      tile('Citas realizadas',String(done),entries?`${Math.round(100*done/entries)}% de las gestionadas`:'Aún no se registran citas terminadas'),
      tile('Saldos pendientes',money(x.s.due),'De citas confirmadas y completadas'),
      tile('Membresías cobradas', 'US$ '+((A.data.membershipPayments||[]).filter(p=>p.estado==='completado'&&String(p.creado||'').slice(0,10)>=x.r.from&&String(p.creado||'').slice(0,10)<=x.r.to)
        .reduce((t,p)=>t+Number(p.montoUSD||0),0)).toFixed(2),'Cobros recurrentes confirmados · USD')
    ];
    $('cc-kpis').innerHTML=show.join('');
  }
  function priorityItems() {
    const all=A.data.items||[], t=today();
    const todayAppts=all.filter(a=>a.date===t);
    const transfer=all.filter(a=>a.status==='por-confirmar');
    const unsigned=all.filter(a=>a.status==='confirmada' && a.date>=t && a.consent?.needed && !a.consent.signed);
    const unpaid=todayAppts.filter(a=>['confirmada','completada'].includes(a.status)&&
      Number(a.payment?.balanceRD)>0 && a.payment?.balanceStatus!=='pagado');
    const refunds=all.filter(a=>a.refundPending);
    const enroll=(A.data.memberships||[]).filter(m=>m.estado==='solicitada'||m.estadoEfectivo==='solicitada');
    const failed=(A.data.memberships||[]).filter(m=>m.paypalEstado==='PAYMENT_FAILED'&&m.estadoEfectivo!=='cancelada');
    const rows=[
      {name:'Transferencias por validar',num:transfer.length,detail:'Verifica los comprobantes antes de confirmar citas.',go:'agenda',mark:'payment'},
      {name:'Consentimientos pendientes',num:unsigned.length,detail:'Asegura la documentación de próximas citas.',go:'agenda',mark:'consent'},
      {name:'Saldos del día',num:unpaid.length,detail:'Revisa los importes que faltan por recibir.',go:'dinero',mark:'finance'},
      {name:'Membresías por activar',num:enroll.length,detail:'Confirma el pago de cada nueva solicitud.',go:'membresias',mark:'member'},
      {name:'Cobros recurrentes por revisar',num:failed.length,detail:'Ayuda a las clientas a recuperar su método de pago.',go:'membresias',mark:'payment'},
      {name:'Reembolsos por resolver',num:refunds.length,detail:'Revisa los casos que requieren seguimiento.',go:'dinero',mark:'refund'}
    ];
    const pending=rows.filter(r=>r.num>0);
    $('cc-pending-count').textContent=pending.length?`${pending.length} áreas con pendientes`:'Al día';
    A.badge('.ad-tabs [data-sec="inicio"], .ad-bottom [data-sec="inicio"]', pending.length, `${pending.length} áreas con pendientes`);
    $('cc-task-list').innerHTML=pending.length?pending.map(r=>`<button class="cc-task" data-cc-target="${r.go}" type="button">
      <span class="cc-task-mark ${r.mark}">${r.num}</span>
      <span class="cc-task-copy"><strong>${r.name}</strong><small>${r.detail}</small></span>
      <span class="cc-task-arrow" aria-hidden="true">↗</span></button>`).join(''):
      '<div class="cc-clear"><span class="cc-clear-icon">✓</span><strong>Todo en orden</strong><p>No hay incidencias en las colas principales. Tu equipo puede concentrarse en dar una atención excepcional.</p></div>';
  }
  function renderAgenda() {
    const t=today(),until=A.addDays(t,3);
    const upcoming=(A.data.items||[]).filter(a=>a.date>=t&&a.date<=until&&
      ['confirmada','por-confirmar'].includes(a.status))
      .sort((a,b)=>String(a.start||a.date+'T'+a.time).localeCompare(String(b.start||b.date+'T'+b.time)));
    $('cc-agenda-list').innerHTML=upcoming.length?sample(upcoming,7).map(a=>`<div class="cc-appt">
        <div class="cc-appt-when"><strong>${esc(fmtTime(a))}</strong><span>${esc(when(a.date))}</span></div>
        <div class="cc-appt-body"><strong>${esc(a.client?.name||'Clienta')}</strong>
        <small>${esc(a.servicesText||(a.services||[]).map(s=>s.name).join(' + ')||'Reserva')}</small></div>
        <span class="cc-appt-status ${a.status==='por-confirmar'?'is-pending':''}">${a.status==='por-confirmar'?'Por confirmar':'Confirmada'}</span></div>`).join(''):
      '<div class="cc-empty"><strong>Agenda despejada</strong><p>No hay reservas confirmadas o por confirmar durante los próximos días.</p></div>';
  }
  function sumDaily(from,to){
    const movements=A.movements();
    const rows=[];
    for(let d=from;d<=to;d=A.addDays(d,1)){
      const net=movements.filter(m=>m.date===d).reduce((s,m)=>s+(Number(m.amount)||0),0);
      rows.push({date:d,label:when(d),value:Math.round(net)});
    }
    return rows;
  }
  function renderRevenue(x){
    const start=period==='hoy'?A.addDays(today(),-6):x.r.from;
    const rows=sumDaily(start,x.r.to);
    $('cc-revenue-total').innerHTML=`<strong>${money(x.s.gross+x.s.ref)}</strong><span>Cobros netos del periodo seleccionado</span>`;
    // Grafica solo cobros netos reales. Los días de reembolso neto negativo se representan como 0 y se explican en el tooltip.
    const values=rows.map(d=>({label:d.label,value:Math.max(0,d.value),
      highlight:d.date===today(),tip:`${d.date}: ${money(d.value)} netos`}));
    A.barChart($('cc-chart'),values,{height:178,money:true,label:'Cobros netos por día, últimos días del periodo',maxLabels:7,empty:'Todavía no hay cobros para el periodo.'});
    $('cc-chart').dataset.rows=JSON.stringify(rows);
    const negative=rows.filter(d=>d.value<0).length;
    const note=document.querySelector('#sec-inicio .cc-footnote');
    if(note) note.textContent='Depósitos, saldos, tarjetas y paquetes cobrados, netos de reembolsos. Las membresías no se incluyen todavía.'+(negative?` ${negative} días tuvieron reembolsos netos y se grafican en cero; sus importes reales figuran en el CSV.`:'');
  }
  function renderServices(x){
    const counts=new Map();
    x.done.forEach(a=>(a.services||[]).forEach(s=>{
      const n=String(s.name||A.serviceName(s.id)||'Servicio');
      counts.set(n,(counts.get(n)||0)+1);
    }));
    const top=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([label,value])=>({label,value,text:`${value} ${value===1?'cita':'citas'}`}));
    $('cc-services-chart').innerHTML=A.hbars(top,'Todavía no se registran tratamientos realizados en este periodo.');
  }
  function renderConcierge(){
    const clients=people(),t=today(),in30=A.addDays(t,30);
    const next=clients.filter(c=>c.next && c.next.date>=t && c.next.date<=in30)
      .sort((a,b)=>String(a.next.date).localeCompare(String(b.next.date)));
    const back=clients.filter(c=>c.visits>0 && c.lastVisit && c.lastVisit<A.addDays(t,-45) && !c.next)
      .sort((a,b)=>String(a.lastVisit).localeCompare(String(b.lastVisit)));
    const seen=new Set(),all=[];
    for(const c of [...next,...back]) {if(!seen.has(c.key)){seen.add(c.key);all.push(c);}}
    $('cc-concierge-list').innerHTML=all.length?sample(all,4).map(c=>{
      const name=(c.name||'Clienta').split(' ')[0],appt=!!c.next;
      const text=appt?`Hola ${name}, nos alegra verte nuevamente en MAJOBELLA. Tenemos todo preparado para recibirte en tu próxima cita. ¡Te esperamos! 🤎`:
        `Hola ${name}, en MAJOBELLA nos encantó recibirte. Cuando quieras darte un nuevo momento para ti, estaremos felices de atenderte. 🤎`;
      const link=A.waLink(c.phone,text);
      return `<article class="cc-guest">
        <div class="cc-avatar" aria-hidden="true">${esc((c.name||'M').trim().charAt(0).toUpperCase())}</div>
        <div class="cc-guest-main"><p class="cc-guest-tag">${appt?'PRÓXIMA VISITA':'RECONEXIÓN'}</p>
          <strong>${esc(c.name||'Clienta')}</strong>
          <small>${appt?'Cita · '+when(c.next.date):'Última visita · '+when(c.lastVisit)}</small>
          <span>${c.visits===1?'1 visita registrada':c.visits+' visitas registradas'}</span></div>
        ${link?`<a class="cc-contact" href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Preparar saludo para ${esc(c.name)}">Saludar ↗</a>`:
        '<button type="button" class="cc-contact" data-cc-target="clientas">Ver clientas →</button>'}
      </article>`;
    }).join(''):'<div class="cc-empty"><strong>Cada relación comienza con una cita</strong><p>Aquí aparecerán las próximas clientas y quienes llevan tiempo sin visitarte.</p></div>';
  }
  function render(){
    const x=metrics(),name=A.DEMO?'equipo':String(M.Auth?.user?.name||'equipo').trim().split(/\s+/)[0];
    const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'America/Santo_Domingo'}).format(new Date()));
    const greeting=hour<12?'Buenos días':hour<19?'Buenas tardes':'Buenas noches';
    $('cc-greeting').textContent=`${greeting}, ${name}.`;
    $('cc-hero-sub').textContent='Un espacio para tomar buenas decisiones y cuidar cada experiencia.';
    $('cc-date').textContent=new Intl.DateTimeFormat('es-DO',{dateStyle:'full',timeZone:'America/Santo_Domingo'}).format(new Date());
    $('cc-last-sync').textContent=A.loadedAt?`Última sincronización: ${new Intl.DateTimeFormat('es-DO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santo_Domingo'}).format(new Date(A.loadedAt))}`:'Datos cargados de la operación';
    document.querySelectorAll('#cc-period [data-cc-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ccPeriod===period)));
    renderKpis(x);priorityItems();renderAgenda();renderRevenue(x);renderServices(x);renderConcierge();
  }
  function downloadCsv(){
    const x=metrics(),rows=sumDaily(x.r.from,x.r.to);
    const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const data=[['Fecha','Cobros netos (RD$)','Citas gestionadas','Citas realizadas'],
      ...rows.map(d=>[d.date,d.value,x.valid.filter(a=>a.date===d.date).length,x.done.filter(a=>a.date===d.date).length])];
    const csv='\ufeff'+data.map(row=>row.map(quote).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');a.href=url;a.download=`MAJOBELLA_reporte_${x.r.from}_${x.r.to}.csv`;
    a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  A.sections.inicio={
    render,
    init(){
      $('cc-period').addEventListener('click',e=>{const b=e.target.closest('[data-cc-period]');if(!b)return;period=b.dataset.ccPeriod;render();});
      $('cc-quick-book').addEventListener('click',()=>{A.go('agenda');$('ag-new')?.click();});
      $('cc-download').addEventListener('click',downloadCsv);
      $('sec-inicio').addEventListener('click',e=>{const b=e.target.closest('[data-cc-target]');if(b)A.go(b.dataset.ccTarget);});
    },
  };
})(window.MJB);
