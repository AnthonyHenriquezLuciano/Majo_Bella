/* MAJOBELLA · Membresías mensuales, sin débitos automáticos.
   Solo el estudio confirma pagos, activa, renueva y descuenta sesiones. */
import { appendRow_, readTable_, updateTable_ } from './db.ts';
import { needAdmin_, verifyIdToken_ } from './security.ts';
import { clean_, uuid, strip_, todayKey_ } from './util.ts';
import { services_, settings_ } from './data.ts';
import { adminTo_, layout_, mailUrl_, safeMail_ } from './mail.ts';
import { esc_, money_ } from './util.ts';

const STATES = ['solicitada','activa','pausada','cancelada','vencida'];
const isActive = (m: any) => m.estado === 'activa' && m.vence >= todayKey_();
const jsonIds = (x: any): string[] => {
  let raw = x;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = []; } }
  return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string').slice(0,30) : [];
};
const rowOut = (m:any) => ({...strip_(m),servicios:jsonIds(m.servicios),
  estadoEfectivo: m.estado === 'activa' && m.vence < todayKey_() ? 'vencida' : m.estado,
  disponibles: isActive(m) ? Math.max(0, Number(m.sesionesMes||0)-Number(m.sesionesUsadas||0)) : 0 });
const planOut = (p:any) => ({ ...strip_(p), servicios:jsonIds(p.servicios) });
const datePlusMonth = (day: string) => {
  const [y,m,d] = day.split('-').map(Number);
  const n = new Date(Date.UTC(y,m,1));
  const last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth()+1,0)).getUTCDate();
  return new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),Math.min(d,last))).toISOString().slice(0,10);
};
const plan = (id:string) => readTable_('PlanesMembresia').find(p=>p.id===id);
const membership = (id:string) => readTable_('Membresias').find(m=>m.id===id);
export function publicPlans_() { return readTable_('PlanesMembresia').filter(p=>p.estado==='activo')
 .sort((a,b)=>(Number(a.orden)||0)-(Number(b.orden)||0))
 .map(p=>({id:p.id,nombre:p.nombre,descripcion:p.descripcion||'',precioRD:Number(p.precioRD)||0,
   sesionesMes:Number(p.sesionesMes)||1,servicios:jsonIds(p.servicios),
   beneficios:p.beneficios||'',renovacion:'manual'})); }
export function adminSubscriptionData_(){
  return {membershipPlans:readTable_('PlanesMembresia').map(planOut),
    memberships:readTable_('Membresias').map(rowOut)};
}
export function adminSaveMembershipPlan_(d:any){
  needAdmin_(d);
  const p=d.plan||{};
  const id=clean_(p.id,60)||'plan-'+uuid().slice(0,12);
  if(!/^[a-z0-9_-]{3,60}$/i.test(id))throw Error('Identificador del plan inválido.');
  const nombre=clean_(p.nombre,90);
  const descripcion=clean_(p.descripcion,450);
  const beneficios=clean_(p.beneficios,900);
  const estado=['activo','borrador','archivado'].includes(p.estado)?p.estado:'borrador';
  const precio=Number(p.precioRD), sesiones=Number(p.sesionesMes);
  if(!nombre||!Number.isFinite(precio)||precio<=0||precio>200000||!Number.isInteger(sesiones)||sesiones<1||sesiones>30)
    throw Error('Revisa nombre, precio mensual y sesiones incluidas (entre 1 y 30).');
  const valid=new Set(services_().map(x=>x.id));
  const servicios=jsonIds(p.servicios);
  if(!servicios.length||servicios.some(id=>!valid.has(id)))
    throw Error('Elige por lo menos un servicio reservable y publicado.');
  const patch={id,nombre,descripcion,beneficios,estado,precioRD:Math.round(precio*100)/100,sesionesMes:sesiones,
    servicios:JSON.stringify([...new Set(servicios)]),orden:Math.max(0,Math.round(Number(p.orden)||0)),
    actualizado:new Date().toISOString()};
  const old=plan(id);
  if(old)updateTable_('PlanesMembresia',old._row,patch);
  else appendRow_('PlanesMembresia',patch);
  return {ok:true,plan:planOut(patch)};
}
export function requestMembership_(d:any){
  const u=verifyIdToken_(d.idToken);
  if(!u?.email)return {ok:false,error:'Para solicitar tu membresía, inicia sesión con un correo verificado.'};
  const p=plan(String(d.planId||''));
  if(!p||p.estado!=='activo')return {ok:false,error:'Este plan ya no está disponible.'};
  const active=readTable_('Membresias').find(m=>m.planId===p.id && m.correo===u.email
    && (m.estado==='solicitada'||m.estado==='pausada'||isActive(m)));
  if(active)return {ok:true,existing:true,membresia:rowOut(active)};
  const now=new Date().toISOString();
  const entry={id:'MBS-'+uuid().slice(0,12).toUpperCase(),planId:p.id,nombrePlan:p.nombre,
    clienta:clean_(d.nombre,90)||clean_(u.name,90),correo:u.email,
    telefono:clean_(d.telefono,30),estado:'solicitada',inicio:'',vence:'',
    sesionesMes:Number(p.sesionesMes),sesionesUsadas:0,precioRD:Number(p.precioRD),
    servicios:JSON.stringify(jsonIds(p.servicios)),metodoPago:'',pagadoEn:'',notas:'',
    creada:now,actualizada:now};
  appendRow_('Membresias',entry);
  const cfg=settings_();
  safeMail_(u.email,'Recibimos tu solicitud de membresía · MAJOBELLA',layout_(cfg,{
    kicker:'Tu membresía',title:'Gracias por elegir MAJOBELLA',
    intro:'Tu solicitud de <b>'+esc_(p.nombre)+'</b> fue recibida. Nuestro equipo se pondrá en contacto contigo para confirmar el pago y activar tus beneficios.',
    details:[['Plan',esc_(p.nombre)],['Importe mensual','RD$ '+money_(p.precioRD)]],
    note:'Aún no se ha realizado ningún cobro. Las renovaciones serán gestionadas por el estudio y nunca se debitarán automáticamente.',
    cta:{text:'Ver mis membresías',url:mailUrl_(cfg,'regalos.html#membresias')}
  }),{tipo:'membresia',ref:entry.id});
  safeMail_(adminTo_(cfg),'Nueva solicitud de membresía · '+p.nombre,layout_(cfg,{
    kicker:'Membresía pendiente',title:esc_(entry.clienta||u.email),
    intro:'Una clienta solicitó una membresía. Verifica el pago antes de activarla.',
    details:[['Plan',esc_(p.nombre)],['Correo',esc_(u.email)],['Importe','RD$ '+money_(p.precioRD)]],
    cta:{text:'Abrir membresías',url:mailUrl_(cfg,'admin.html#membresias')}
  }),{tipo:'aviso',ref:entry.id});
  return {ok:true,membresia:rowOut(entry)};
}
export function myMemberships_(d:any){
  const u=verifyIdToken_(d.idToken);
  if(!u?.email)return {ok:false,error:'Inicia sesión para consultar tus membresías.'};
  return {ok:true,memberships:readTable_('Membresias').filter(m=>m.correo===u.email)
    .sort((a,b)=>String(b.creada||'').localeCompare(String(a.creada||''))).map(rowOut)};
}
export function adminMembershipAction_(d:any){
  needAdmin_(d);
  const m=membership(String(d.id||''));
  if(!m)return {ok:false,error:'No encontramos esa membresía.'};
  const action=String(d.change||'');
  const now=new Date().toISOString(),today=todayKey_();
  const patch:any={actualizada:now};
  if(action==='activar'||action==='renovar'){
    if(action==='activar'&&m.estado!=='solicitada'&&m.estado!=='vencida'&&m.estado!=='pausada')throw Error('Esta membresía no está pendiente de activación.');
    if(action==='renovar'&&m.estado!=='activa'&&m.estado!=='vencida')throw Error('Solo puedes renovar una membresía activa o vencida.');
    if(d.pagoConfirmado!==true)throw Error('Confirma que recibiste el pago antes de activar o renovar.');
    if(!['efectivo','transferencia','paypal','tarjeta'].includes(d.metodoPago))throw Error('Selecciona cómo recibiste el pago.');
    const base=action==='renovar'&&m.estado==='activa'&&m.vence>=today ? m.vence : today;
    patch.estado='activa'; patch.inicio=today; patch.vence=datePlusMonth(base);
    patch.sesionesUsadas=0;patch.pagadoEn=now;patch.metodoPago=d.metodoPago;
  } else if(action==='usar'){
    if(!isActive(m))throw Error('La membresía debe estar activa y vigente.');
    if(Number(m.sesionesUsadas)>=Number(m.sesionesMes))throw Error('Esta membresía ya no tiene sesiones disponibles.');
    patch.sesionesUsadas=Number(m.sesionesUsadas||0)+1;
  } else if(action==='deshacerUso'){
    if(Number(m.sesionesUsadas||0)<1)throw Error('No hay sesiones por corregir.');
    patch.sesionesUsadas=Number(m.sesionesUsadas)-1;
  } else if(action==='pausar'){
    if(m.estado!=='activa')throw Error('Solo puedes pausar una membresía activa.');
    patch.estado='pausada';
  } else if(action==='cancelar'){
    if(m.estado==='cancelada')throw Error('Ya está cancelada.');
    patch.estado='cancelada';
  } else throw Error('Acción no permitida.');
  if(d.notas!==undefined)patch.notas=clean_(d.notas,600);
  updateTable_('Membresias',m._row,patch);
  if(action==='activar'||action==='renovar'){
    const cfg=settings_();
    safeMail_(m.correo,'Tu membresía MAJOBELLA está '+(action==='activar'?'activa':'renovada'),layout_(cfg,{
      kicker:'Membresía '+(action==='activar'?'activa':'renovada'),
      title:'Tu momento MAJOBELLA continúa',
      intro:'Confirmamos el pago de tu membresía. Ya puedes agendar tus tratamientos incluidos, sujetos a disponibilidad y consentimiento.',
      details:[['Plan',esc_(m.nombrePlan)],['Sesiones incluidas',esc_(m.sesionesMes)],
        ['Vigente hasta',esc_(patch.vence)]],
      cta:{text:'Reservar cita',url:mailUrl_(cfg,'reservar.html')},
      note:'Tus sesiones no usadas no se acumulan al renovar. No realizamos cobros automáticos.'
    }),{tipo:'membresia',ref:m.id});
  }
  return {ok:true,membresia:rowOut({...m,...patch})};
}
