/* MAJOBELLA · Suscripciones PayPal verificadas. El acceso se concede SOLO tras cobro confirmado.
   Guardar datos de tarjeta en MAJOBELLA está prohibido. */
import { appendRow_, readTable_, updateTable_ } from './db.ts';
import { needAdmin_, verifyIdToken_ } from './security.ts';
import { paypal_, paypalConfigured_ } from './paypal.ts';
import { env_ } from './ctx.ts';
import { settings_ } from './data.ts';
import { clean_, esc_, money_, todayKey_, uuid, strip_ } from './util.ts';
import { adminTo_, layout_, mailUrl_, safeMail_ } from './mail.ts';
import { knownEvent_, recordPaypalEvent_, processPaypalOperationalEvent_ } from './paypal-ops.ts';

const rows = () => readTable_('Membresias');
const plans = () => readTable_('PlanesMembresia');
const payments = () => readTable_('PagosMembresia');
const str = (v:any) => String(v||'');
const isAutopay = (m:any) => !!str(m.paypalSubscriptionId);
const validId = (x:any) => /^[A-Za-z0-9-]{8,64}$/.test(str(x));
const features = () => paypalConfigured_() && !!env_('PAYPAL_WEBHOOK_ID') && env_('PAYPAL_SUBSCRIPTIONS_ENABLED') === 'true';
const plusMonth = (day:string) => {
  const [y,m,d]=day.split('-').map(Number), next=new Date(Date.UTC(y,m,1));
  const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();
  return new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth(),Math.min(d,last))).toISOString().slice(0,10);
};
const jsonIds=(x:any):string[]=>{try{const a=typeof x==='string'?JSON.parse(x):x;return Array.isArray(a)?a:[];}catch{return [];}};
const asPublic=(m:any)=>({...strip_(m),servicios:jsonIds(m.servicios),
  estadoEfectivo:m.estado==='activa'&&m.vence<todayKey_()?'vencida':m.estado,
  disponibles:m.estado==='activa'&&m.vence>=todayKey_()?Math.max(0,Number(m.sesionesMes||0)-Number(m.sesionesUsadas||0)):0});
const findMember=(id:string)=>rows().find(x=>x.id===id);
const paypalMember=(sub:string)=>rows().find(x=>x.paypalSubscriptionId===sub);
const settings=()=>settings_();
function ensureAvailable(){if(!features())throw Error('Las suscripciones automáticas aún no están habilitadas para esta cuenta PayPal Business. Puedes solicitar el plan y pagarlo con el estudio.');}
function receipt(m:any,p:any){
 const cfg=settings(),code=str(p.id);
 const html=layout_(cfg,{kicker:'Comprobante de pago',title:'Gracias por elegir MAJOBELLA',
 intro:'Tu pago fue confirmado. Nos alegra acompañarte con un nuevo mes de cuidado personal.',
 details:[['Referencia',esc_(code)],['Plan',esc_(m.nombrePlan)],['Importe','US$ '+Number(p.montoUSD).toFixed(2)],
 ['Equivalente referencial','RD$ '+money_(p.montoRD)],['Período vigente hasta',esc_(m.vence)],
 ['Medio','PayPal · Suscripción mensual']],
 cta:{text:'Consultar mi membresía',url:mailUrl_(cfg,'regalos.html#membresias')},
 note:'Este documento es un comprobante comercial, no una factura con NCF. Los importes en pesos son referenciales según la tasa registrada al contratar.'
 });
 safeMail_(m.correo,'Tu comprobante MAJOBELLA · '+code,html,{tipo:'membresia',ref:code});
}
function failedNotice(m:any){
 const cfg=settings();
 const body=layout_(cfg,{kicker:'Tu membresía',title:'Necesitamos actualizar tu pago',
 intro:'Hola '+esc_(str(m.clienta).split(' ')[0]||'').replace(/ /g,'')+', no pudimos completar el último cobro de tu membresía. Queremos que sigas disfrutando tu momento MAJOBELLA sin interrupciones.',
 body:'<p>Puedes revisar tu método de pago directamente en tu cuenta PayPal. Si necesitas ayuda, nuestro equipo estará encantado de acompañarte.</p>',
 details:[['Plan',esc_(m.nombrePlan)],['Estado','Pago pendiente']],
 cta:{text:'Gestionar en PayPal',url:'https://www.paypal.com/myaccount/autopay/'},
 note:'No intentaremos cobrarte desde esta página y nunca solicitaremos los datos de tu tarjeta por mensaje.'
 });
 safeMail_(m.correo,'Un detalle pendiente en tu membresía · MAJOBELLA',body,{tipo:'membresia',ref:m.id});
 safeMail_(adminTo_(cfg),'Cobro recurrente pendiente · '+str(m.nombrePlan),
 layout_(cfg,{kicker:'Seguimiento de membresía',title:'Cobro no completado',
 intro:'PayPal notificó un problema al cobrar la suscripción. Verifica el estado antes de prestar sesiones del nuevo período.',
 details:[['Clienta',esc_(m.clienta)],['Plan',esc_(m.nombrePlan)],['ID',esc_(m.id)]],
 cta:{text:'Abrir Administración',url:mailUrl_(cfg,'admin.html#membresias')}
 }),{tipo:'aviso',ref:m.id});
}

/* Creación del plan remoto sólo en Administración. Cambios de tarifa generan otro plan remoto;
   las suscripciones existentes conservan su precio aceptado. */
export async function adminSyncPaypalPlan_(d:any){
 needAdmin_(d);ensureAvailable();
 const p=plans().find(x=>x.id===d.planId);
 if(!p||p.estado!=='activo')throw Error('Publica primero el plan en Administración.');
 const rate=Number(settings().tasaUSD)||0;
 if(!(rate>=30&&rate<=200))throw Error('Configura la tasa USD/RD$ de PayPal antes de activar suscripciones.');
 const usd=Math.ceil(Number(p.precioRD)/rate*100)/100;
 const version=Number(usd).toFixed(2);
 if(p.paypalPlanId&&p.paypalPlanVersion===version)return {ok:true,planId:p.id,paypalPlanId:p.paypalPlanId,usd};
 let productId=str(p.paypalProductId);
 if(!productId){
   const product=await paypal_('post','/v1/catalogs/products',{name:clean_(p.nombre,110),type:'SERVICE',category:'PERSONAL_CARE'},p.id+'-prod');
   productId=product.id;
 }
 const created=await paypal_('post','/v1/billing/plans',{
   product_id:productId,name:clean_(p.nombre,110),description:clean_(p.descripcion||'Membresía mensual MAJOBELLA',127),
   status:'ACTIVE',
   billing_cycles:[{frequency:{interval_unit:'MONTH',interval_count:1},tenure_type:'REGULAR',sequence:1,total_cycles:0,
     pricing_scheme:{fixed_price:{value:version,currency_code:'USD'}}}],
   payment_preferences:{auto_bill_outstanding:true,setup_fee_failure_action:'CONTINUE',payment_failure_threshold:3}
 },p.id+'-'+str(uuid()).slice(0,16));
 if(!created.id)throw Error('PayPal no devolvió el identificador del plan.');
 const patch={paypalProductId:productId,paypalPlanId:created.id,paypalPrecioUSD:usd,paypalPlanVersion:version};
 updateTable_('PlanesMembresia',p._row,patch);
 return {ok:true,planId:p.id,paypalPlanId:created.id,usd};
}

export async function startPaypalSubscription_(d:any){
 ensureAvailable();
 const u=verifyIdToken_(d.idToken);
 if(!u?.email)throw Error('Inicia sesión con tu correo verificado para suscribirte.');
 const p=plans().find(x=>x.id===d.planId&&x.estado==='activo');
 if(!p||!p.paypalPlanId)throw Error('Este plan todavía no tiene activado el cobro automático.');
 const existing=rows().find(m=>m.planId===p.id&&m.correo===u.email&&['solicitada','activa','pausada'].includes(m.estado));
 if(existing&&isAutopay(existing)) {
   if(existing.estado==='activa')throw Error('Ya tienes una membresía activa de este plan.');
   const remote=await paypal_('get','/v1/billing/subscriptions/'+encodeURIComponent(existing.paypalSubscriptionId),null);
   const approval=(remote.links||[]).find((l:any)=>l.rel==='approve')?.href;
   if(remote.status==='APPROVAL_PENDING'&&approval&&/^https:\/\//.test(approval))
     return {ok:true,existing:true,membresiaId:existing.id,approvalUrl:approval};
   throw Error('Esta solicitud ya existe en PayPal, pero no se puede continuar. Puedes cancelarla desde Mis membresías y crear una nueva.');
 }
 if(existing&&existing.estado==='activa')throw Error('Ya tienes una membresía activa de este plan.');
 const id=existing?.id||'MBS-'+uuid().slice(0,12).toUpperCase();
 const root=str(settings().webUrl).trim().replace(/\/?$/,'/');
 if(!/^https:\/\//.test(root))throw Error('Configura la dirección pública del estudio antes de aceptar suscripciones.');
 const url=root+'regalos.html';
 const sub=await paypal_('post','/v1/billing/subscriptions',{
   plan_id:p.paypalPlanId,custom_id:id,
   application_context:{brand_name:'MAJOBELLA',locale:'es-ES',
     return_url:url+'?mjb_subscription=approved#membresias',cancel_url:url+'?mjb_subscription=cancel#membresias'}
 },id+'-sub');
 const approval=(sub.links||[]).find((l:any)=>l.rel==='approve')?.href;
 if(!sub.id||!approval||!/^https:\/\//.test(approval))throw Error('PayPal no generó una autorización válida. Inténtalo de nuevo.');
 const patch={planId:p.id,nombrePlan:p.nombre,clienta:clean_(d.nombre||u.name,90),correo:u.email,
   estado:'solicitada',precioRD:p.precioRD,sesionesMes:p.sesionesMes,servicios:JSON.stringify(jsonIds(p.servicios)),
   paypalSubscriptionId:sub.id,paypalEstado:str(sub.status||'APPROVAL_PENDING'),
   paypalPrecioUSD:p.paypalPrecioUSD,paypalPagosFallidos:0,actualizada:new Date().toISOString()};
 if(existing)updateTable_('Membresias',existing._row,patch);
 else appendRow_('Membresias',{id,telefono:'',inicio:'',vence:'',sesionesUsadas:0,metodoPago:'',pagadoEn:'',creada:new Date().toISOString(),...patch});
 return {ok:true,approvalUrl:approval,membresiaId:id};
}
async function settle(m:any,sale:any) {
 const saleId=str(sale.id),sub=str(m.paypalSubscriptionId),amount=Number(sale.amount?.total??sale.amount?.value),
  currency=str(sale.amount?.currency||sale.amount?.currency_code);
 if(!validId(saleId)||!(amount>0)||currency!=='USD')throw Error('El pago notificado no tiene datos válidos.');
 if(payments().some(x=>x.id===saleId))return {ok:true,duplicate:true};
 const expected=Number(m.paypalPrecioUSD);
 if(!Number.isFinite(expected)||Math.abs(expected-amount)>0.01)
   throw Error('El importe notificado por PayPal no coincide con el importe autorizado para la membresía '+m.id+'.');
 if(!['COMPLETED','completed'].includes(str(sale.state||sale.status)))throw Error('El cobro todavía no ha sido completado.');
 const today=todayKey_(),initial=!m.pagadoEn;
 // Aplicar la fecha ORIGINAL del pago, no el día en que llegó el webhook retrasado.
 const rawTime=str(sale.time||sale.create_time||sale.update_time);
 const parsed=Date.parse(rawTime);
 const billingDay=Number.isFinite(parsed)&&parsed<=Date.now()+86400000?
   new Date(parsed).toISOString().slice(0,10):today;
 const base=m.vence>=billingDay?m.vence:billingDay;
 const vence=plusMonth(initial?billingDay:base);
 const patch:any={estado:'activa',paypalEstado:m.paypalEstado==='CANCELLED'?'CANCELLED':'ACTIVE',paypalPagoId:saleId,paypalPagosFallidos:0,
   inicio:initial?today:m.inicio,vence,pagadoEn:new Date().toISOString(),metodoPago:'paypal',actualizada:new Date().toISOString(),
   sesionesUsadas:0};
 updateTable_('Membresias',m._row,patch);
 const pay={id:saleId,membresiaId:m.id,paypalSubscriptionId:sub,correo:m.correo,nombrePlan:m.nombrePlan,
   montoUSD:amount,montoRD:Number(m.precioRD),moneda:'USD',estado:'completado',creado:new Date().toISOString()};
 appendRow_('PagosMembresia',pay);
 receipt({...m,...patch},pay);
 return {ok:true,membresia:asPublic({...m,...patch})};
}
/* Conciliación autorizada: reconstruye períodos desde transacciones reales de PayPal
   cuando el webhook se retrasó. No se permite activación manual sin cobro. */
export async function adminReconcilePaypalSubscription_(d:any){
 needAdmin_(d);
 const m=findMember(str(d.id));
 if(!m||!m.paypalSubscriptionId)throw Error('No encontramos una suscripción PayPal vinculada.');
 const sub=await paypal_('get','/v1/billing/subscriptions/'+encodeURIComponent(m.paypalSubscriptionId),null);
 if(sub.id!==m.paypalSubscriptionId)throw Error('La suscripción no coincide con la referencia guardada.');
 const end=new Date(),begin=new Date(end.getTime()-93*86400000);
 const query='?start_time='+encodeURIComponent(begin.toISOString())+'&end_time='+encodeURIComponent(end.toISOString());
 const history=await paypal_('get','/v1/billing/subscriptions/'+encodeURIComponent(m.paypalSubscriptionId)+'/transactions'+query,null);
 const transactions=(Array.isArray(history.transactions)?history.transactions:[])
  .filter((t:any)=>t.status==='COMPLETED')
  .sort((a:any,b:any)=>str(a.time).localeCompare(str(b.time)));
 let added=0;
 for(const t of transactions){
   const amount=t.amount_with_breakdown?.gross_amount;
   if(!amount||!t.id)continue;
   const latest=findMember(m.id)||m;
   const out=await settle(latest,{id:t.id,billing_agreement_id:m.paypalSubscriptionId,
     amount:{value:amount.value,currency_code:amount.currency_code},status:t.status,time:t.time});
   if(!out.duplicate)added++;
 }
 const current=findMember(m.id)||m;
 const remoteState=str(sub.status||'');
 // Cancelaciones PayPal nunca se deshacen por eventos atrasados.
 if(['CANCELLED','EXPIRED','SUSPENDED'].includes(remoteState)&&current.paypalEstado!==remoteState){
   updateTable_('Membresias',current._row,{paypalEstado:remoteState,actualizada:new Date().toISOString()});
 }
 return {ok:true,added,verified:transactions.length,paypalEstado:remoteState,
  message:added?'Conciliadas '+added+' transacciones completadas.':'No se encontraron cobros nuevos; no se modificaron sesiones.'};
}

export async function confirmPaypalSubscription_(d:any){
 const u=verifyIdToken_(d.idToken);
 if(!u?.email)throw Error('Inicia sesión para consultar tu suscripción.');
 const m=findMember(str(d.id));
 if(!m||m.correo!==u.email||!m.paypalSubscriptionId)throw Error('No encontramos una suscripción de esta cuenta.');
 const remote=await paypal_('get','/v1/billing/subscriptions/'+encodeURIComponent(m.paypalSubscriptionId),null);
 if(remote.id!==m.paypalSubscriptionId)throw Error('PayPal no reconoció esta suscripción.');
 const patch={paypalEstado:str(remote.status||'APPROVAL_PENDING')};
 updateTable_('Membresias',m._row,patch);
 // La aprobación NO implica un cobro: los webhooks de venta activarán las sesiones.
 return {ok:true,paypalEstado:patch.paypalEstado,pagado:m.estado==='activa'&&m.vence>=todayKey_(),
 mensaje:'Tu autorización está en revisión. Activaremos tus sesiones en cuanto PayPal confirme el primer cobro.'};
}
export async function cancelPaypalSubscription_(d:any){
 const u=verifyIdToken_(d.idToken);
 const admin=d.idToken&&u&&env_('ADMIN_EMAILS').split(',').map(x=>x.trim().toLowerCase()).includes(u.email);
 const m=findMember(str(d.id));
 if(!m||!u||(!admin&&m.correo!==u.email))throw Error('No tienes permiso para cancelar esa suscripción.');
 if(!m.paypalSubscriptionId)throw Error('Esta membresía no es una suscripción automática.');
 if(!['CANCELLED','EXPIRED'].includes(m.paypalEstado)){
   await paypal_('post','/v1/billing/subscriptions/'+encodeURIComponent(m.paypalSubscriptionId)+'/cancel',
     {reason:'Cancelación solicitada por titular o estudio MAJOBELLA'},m.id+'-cancel');
 }
 const patch:any={paypalEstado:'CANCELLED',actualizada:new Date().toISOString()};
 if(m.estado==='solicitada')patch.estado='cancelada';
 updateTable_('Membresias',m._row,patch);
 return {ok:true,membresia:asPublic({...m,...patch}),
   mensaje:'Tu renovación automática está cancelada. Si ya tenías un período pagado, podrás usarlo hasta su fecha de vencimiento.'};
}
/* Verificación remota de firma obligatoria ANTES de mutar cualquier estado. */
export async function paypalWebhook_(d:any,headers:Record<string,string>) {
 const webhookId=env_('PAYPAL_WEBHOOK_ID');
 if(!webhookId||!paypalConfigured_())throw Error('El webhook de PayPal aún no está configurado.');
 const event=d.event||{};
 if(!event.id||!event.event_type)throw Error('Evento inválido.');
 const vals=['paypal-transmission-id','paypal-transmission-time','paypal-transmission-sig','paypal-cert-url','paypal-auth-algo'];
 if(vals.some(k=>!headers[k]))throw Error('Faltan las firmas de PayPal.');
 const verify=await paypal_('post','/v1/notifications/verify-webhook-signature',{
   transmission_id:headers['paypal-transmission-id'],transmission_time:headers['paypal-transmission-time'],
   transmission_sig:headers['paypal-transmission-sig'],cert_url:headers['paypal-cert-url'],
   auth_algo:headers['paypal-auth-algo'],webhook_id:webhookId,webhook_event:event
 });
 if(verify.verification_status!=='SUCCESS')throw Error('La firma del evento de PayPal no es válida.');
 if(knownEvent_(str(event.id)))return {ok:true,duplicate:true};
 const resource=event.resource||{},etype=str(event.event_type);
 let subId=str(resource.billing_agreement_id||resource.id);
 if(etype==='PAYMENT.SALE.COMPLETED'||etype==='PAYMENT.SALE.REFUNDED'||etype==='PAYMENT.SALE.REVERSED')
   subId=str(resource.billing_agreement_id);
 const m=paypalMember(subId);
 if(!m){
   const outcome=processPaypalOperationalEvent_(event);
   recordPaypalEvent_(event,outcome.status,outcome.ref,outcome.detail);
   return {ok:true,ignored:outcome.status==='sin_vincular',status:outcome.status};
 }
 if(etype==='PAYMENT.SALE.COMPLETED'){
   const out=await settle(m,resource);
   recordPaypalEvent_(event,'conciliado',m.id,out.duplicate?'Venta repetida (sin cargo duplicado)':'Nuevo período pagado');
   return out;
 }
 if(etype==='BILLING.SUBSCRIPTION.PAYMENT.FAILED'){
   // Evitar correos repetidos para el mismo período de impago.
   if(!['PAYMENT_FAILED','CANCELLED','EXPIRED'].includes(m.paypalEstado)){
     updateTable_('Membresias',m._row,{paypalEstado:'PAYMENT_FAILED',paypalPagosFallidos:Number(m.paypalPagosFallidos||0)+1});
     failedNotice(m);
   }
 }else if(['BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.EXPIRED','BILLING.SUBSCRIPTION.SUSPENDED'].includes(etype)){
   const state=etype.split('.').at(-1);
   const patch:any={paypalEstado:state};
   if(m.estado==='solicitada')patch.estado='cancelada';
   updateTable_('Membresias',m._row,patch);
 }else if(etype==='BILLING.SUBSCRIPTION.ACTIVATED'){
   // No restaurar suscripciones canceladas ni conceder sesiones antes del cobro.
   if(!['ACTIVE','CANCELLED','EXPIRED'].includes(m.paypalEstado))
     updateTable_('Membresias',m._row,{paypalEstado:'APPROVED_PENDING_PAYMENT'});
 }else if(etype==='PAYMENT.SALE.REFUNDED'||etype==='PAYMENT.SALE.REVERSED'){
   const saleRef=str(resource.parent_payment||resource.parent_payment_id||resource.id);
   const p=payments().find(x=>x.id===saleRef);
   // PayPal puede avisar de reembolsos PARCIALES. No revocar sesiones ni
   // declarar reembolsado el pago completo hasta verificar importe y moneda.
   const amount=Number(resource.amount?.total??resource.amount?.value);
   const currency=str(resource.amount?.currency||resource.amount?.currency_code);
   const complete=p && Number.isFinite(amount) && amount>0 &&
     currency==='USD' && Math.abs(amount-Number(p.montoUSD))<0.01;
   if(p&&p.estado==='completado'&&complete){
     updateTable_('PagosMembresia',p._row,{estado:'reembolsado'});
     if(m.paypalPagoId===p.id)updateTable_('Membresias',m._row,{estado:'pausada',paypalEstado:'REFUNDED'});
     const cfg=settings();
     safeMail_(adminTo_(cfg),'Reembolso o reversión de membresía · MAJOBELLA',
       layout_(cfg,{kicker:'Revisión de cobro',title:'Se revirtió un pago de membresía',
       intro:'Se pausó el acceso del último período afectado. Revisa PayPal y contacta a la clienta.',
       details:[['Plan',esc_(m.nombrePlan)],['Referencia',esc_(p.id)]]}),{tipo:'aviso',ref:p.id});
   }else if(!complete){
     const cfg=settings();
     safeMail_(adminTo_(cfg),'Revisión de reembolso parcial · MAJOBELLA',
       layout_(cfg,{kicker:'Conciliación PayPal',title:'Reembolso de membresía pendiente de revisar',
         intro:'No se revocaron sesiones ni se registró un reembolso completo: el evento no confirma la devolución íntegra.',
         details:[['Plan',esc_(m.nombrePlan)],['Venta PayPal',esc_(saleRef)],['Evento',esc_(etype)]],
         cta:{text:'Abrir PayPal',url:'https://www.paypal.com/myaccount/activity/'}}),
       {tipo:'aviso',ref:str(event.id)});
     recordPaypalEvent_(event,'requiere_revision',m.id,'Reembolso parcial o importe no verificable');
     return {ok:true,review:true};
   }
 }
 recordPaypalEvent_(event,'conciliado',m.id,etype);
 return {ok:true};
}
export function myMembershipPayments_(d:any){
 const u=verifyIdToken_(d.idToken);
 if(!u?.email)throw Error('Inicia sesión para consultar tus comprobantes.');
 return {ok:true,payments:payments().filter(p=>p.correo===u.email)
 .map(p=>({id:p.id,membresiaId:p.membresiaId,nombrePlan:p.nombrePlan,montoUSD:Number(p.montoUSD),
   montoRD:Number(p.montoRD),estado:p.estado,creado:p.creado})).sort((a,b)=>b.creado.localeCompare(a.creado))};
}
export function subscriptionCapability_(){
 return {enabled:features(),testMode:env_('MAJOBELLA_TEST_MODE')!=='production',
   gateway:'PayPal Business',cardRequiresEligibility:true};
}
