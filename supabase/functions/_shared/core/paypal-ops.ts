/* MAJOBELLA · Operaciones PayPal: diagnóstico, auditoría de eventos, reembolsos seguros.
   Nunca se recibe, guarda ni devuelve PAN, CVV, tokens privados o claves. */
import { appendRow_, readTable_, updateTable_ } from './db.ts';
import { needAdmin_ } from './security.ts';
import { paypal_, paypalConfigured_, paypalEnv_ } from './paypal.ts';
import { env_ } from './ctx.ts';
import { clean_, esc_, money_, strip_ } from './util.ts';
import { adminTo_, layout_, mailUrl_, safeMail_ } from './mail.ts';
import { settings_ } from './data.ts';

const records=()=>readTable_('EventosPaypal');
const refunds=()=>readTable_('ReembolsosPaypal');
const str=(v:any)=>String(v||'');
const now=()=>new Date().toISOString();
const safeId=(v:any)=>/^[A-Za-z0-9-_]{3,120}$/.test(str(v));
const failed=(e:any)=>{throw Error(e);};
const findCandidate=(kind:string,ref:string):any=>{
 if(kind==='deposito'||kind==='saldo'){
   const r=readTable_('Reservas').find(x=>x.id===ref);
   if(!r)return null;
   return {row:r,table:'Reservas',capture:kind==='deposito'?r.paypalCaptura:r.saldoCaptura,
     montoRD:Number(kind==='deposito'?r.depositoRD:r.saldoRD),estado:r.estado,
     refundText:str(r.reembolso),email:r.correo,name:r.clienta,
     used:false,canRefund:r.estado==='cancelada'&&
       (kind==='saldo'?str(r.reembolso).includes('saldo: reembolsado')===false:!/^reembolsado/.test(str(r.reembolso)))};
 }
 if(kind==='tarjeta'){
   const g=readTable_('Tarjetas').find(x=>x.id===ref);
   if(!g)return null;
   return {row:g,table:'Tarjetas',capture:g.paypalCaptura,montoRD:Number(g.montoRD),
     email:g.correoComprador,name:g.comprador,used:Number(g.saldoRD)<Number(g.montoRD),
     canRefund:g.estado==='activa'&&Number(g.saldoRD)===Number(g.montoRD)};
 }
 if(kind==='paquete'){
   const b=readTable_('Bonos').find(x=>x.id===ref);
   if(!b)return null;
   return {row:b,table:'Bonos',capture:b.paypalCaptura,montoRD:Number(b.montoRD),
     email:b.correo,name:b.clienta,used:Number(b.usadas)>0,
     canRefund:b.estado==='activo'&&Number(b.usadas)===0};
 }
 return null;
};
const format=(p:any)=>({id:p.id,referencia:p.referencia,tipo:p.tipo,paypalPagoId:p.paypalPagoId,paypalReembolsoId:p.paypalReembolsoId,
 montoUSD:Number(p.montoUSD)||0,montoRD:Number(p.montoRD)||0,estado:p.estado,motivo:p.motivo,creado:p.creado});
export function adminPaypalOperations_(d:any){
 needAdmin_(d);
 const eventRows=records(),refundRows=refunds();
 const allKinds=['deposito','saldo','tarjeta','paquete'];
 const candidates:any[]=[];
 for(const a of readTable_('Reservas')){
   if(a.paypalCaptura)candidates.push({tipo:'deposito',referencia:a.id,cliente:a.clienta,montoRD:Number(a.depositoRD),captureId:a.paypalCaptura});
   if(a.saldoCaptura)candidates.push({tipo:'saldo',referencia:a.id,cliente:a.clienta,montoRD:Number(a.saldoRD),captureId:a.saldoCaptura});
 }
 for(const a of readTable_('Tarjetas'))if(a.paypalCaptura)candidates.push({tipo:'tarjeta',referencia:a.id,cliente:a.comprador,montoRD:Number(a.montoRD),captureId:a.paypalCaptura});
 for(const a of readTable_('Bonos'))if(a.paypalCaptura)candidates.push({tipo:'paquete',referencia:a.id,cliente:a.clienta,montoRD:Number(a.montoRD),captureId:a.paypalCaptura});
 return {ok:true,
  config:{env:paypalEnv_(),credentials:paypalConfigured_(),webhook:!!env_('PAYPAL_WEBHOOK_ID'),
    subscriptions:env_('PAYPAL_SUBSCRIPTIONS_ENABLED')==='true'&&paypalConfigured_(),
    production:paypalEnv_()==='live',webhookUrl:str(env_('SUPABASE_URL')).replace(/\/$/,'')+'/functions/v1/api',
    verifiedDelivery:eventRows.length>0,eventCount:eventRows.length},
  events:eventRows.slice(-100).reverse().map(x=>({id:x.id,tipo:x.tipo,recurso:x.recurso,referencia:x.referencia,
    estado:x.estado,detalle:x.detalle,recibido:x.recibido})),
  refunds:refundRows.slice(-100).reverse().map(format),
  payments:candidates.slice(-120).reverse().map(c=>{
   const eligible=findCandidate(c.tipo,c.referencia);
   const already=refundRows.some(x=>x.paypalPagoId===c.captureId&&x.estado!=='fallido');
   return {...c,eligible:!!eligible?.canRefund&&!already,reason:eligible?.used?'Hay consumo registrado':
     already?'Reembolso ya solicitado o procesado':eligible?.canRefund?'Elegible para reembolso íntegro':'Requiere revisión del estado'};
  })
 };
}
export async function adminPaypalConnectionTest_(d:any){
 needAdmin_(d);
 if(!paypalConfigured_())return {ok:true,connected:false,environment:paypalEnv_(),
   message:'Faltan las credenciales privadas de PayPal en Edge Functions → Secrets.'};
 try{
   const res=await paypal_('get','/v1/billing/plans?page_size=1',null);
   return {ok:true,connected:!!res,environment:paypalEnv_(),
     message:'PayPal respondió correctamente a una operación autenticada. Esto NO confirma que tarjetas, suscripciones ni webhooks estén aprobados.'};
 }catch(err){return {ok:true,connected:false,environment:paypalEnv_(),
   message:'PayPal respondió con un error de credenciales o permisos. Revisa que Client ID, Secret y entorno correspondan a la misma REST App.'};}
}
function applyFullRefund(kind:string,ref:string,refundId:string){
 const c=findCandidate(kind,ref);
 if(!c)return;
 if(kind==='deposito'||kind==='saldo'){
   const detail=str(c.row.reembolso);
   const text='reembolsado '+refundId+' (COMPLETED)';
   updateTable_(c.table,c.row._row,{reembolso:kind==='saldo'?
     (detail?detail+' · ':'')+'saldo: '+text:(detail?text+' · '+detail:text)});
 }else if(kind==='tarjeta'){
   updateTable_(c.table,c.row._row,{estado:'reembolsada',saldoRD:0});
 }else if(kind==='paquete'){
   updateTable_(c.table,c.row._row,{estado:'reembolsado'});
 }
}
function notifyRefund(kind:string,ref:string,email:string,refundId:string,montoUSD:number){
 const s=settings_();
 const html=layout_(s,{kicker:'Confirmación de reembolso',title:'Tu reembolso fue procesado',
 intro:'Hemos solicitado y confirmado el reembolso en PayPal. El tiempo en que aparezca en tu tarjeta o cuenta depende de tu entidad financiera.',
 details:[['Referencia de compra',esc_(ref)],['Reembolso PayPal',esc_(refundId)],
 ['Importe', 'US$ '+montoUSD.toFixed(2)],['Estado','Procesado']],
 cta:{text:'Ver PayPal',url:'https://www.paypal.com/myaccount/activity/'},
 note:'Esta notificación es un comprobante comercial del reembolso, no una factura fiscal ni una garantía de abono inmediato en el banco.'
 });
 if(email)safeMail_(email,'Tu reembolso MAJOBELLA · '+ref,html,{tipo:'reembolso',ref});
}
/* Por protección: sólo reembolso TOTAL de capturas que el sistema ya tiene registradas
   y sólo citas CANCELADAS o tarjetas/paquetes SIN USAR. No se aceptan importes arbitrarios. */
export async function adminPaypalRefund_(d:any){
 const admin=needAdmin_(d);
 if(d.confirmar!==true)throw Error('Confirma expresamente la operación antes de solicitar el reembolso.');
 if(paypalEnv_()==='live'&&d.confirmacionReal!=='REEMBOLSAR')
   throw Error('Los reembolsos de dinero real requieren escribir REEMBOLSAR.');
 const kind=str(d.tipo),ref=str(d.referencia);
 if(!['deposito','saldo','tarjeta','paquete'].includes(kind)||!safeId(ref))throw Error('Referencia inválida.');
 const c=findCandidate(kind,ref);
 if(!c||!c.capture||!c.canRefund||c.used)throw Error('No es elegible: solo se pueden reembolsar citas canceladas o productos no usados.');
 const existing=refunds().find(x=>x.paypalPagoId===c.capture&&x.estado!=='fallido');
 if(existing)return {ok:true,duplicate:true,refund:format(existing),message:'Este cobro ya tiene un reembolso registrado.'};
 const capture=await paypal_('get','/v2/payments/captures/'+encodeURIComponent(c.capture),null);
 if(capture.id!==c.capture||capture.status!=='COMPLETED'||
    capture.amount?.currency_code!=='USD'||!(Number(capture.amount.value)>0))
   throw Error('No se pudo verificar una captura reembolsable y completada en PayPal.');
 const refund=await paypal_('post','/v2/payments/captures/'+encodeURIComponent(c.capture)+'/refund',
   {},'mjb-full-refund-'+c.capture);
 if(!refund.id||!['COMPLETED','PENDING'].includes(refund.status))
   throw Error('PayPal no devolvió confirmación definitiva; verifica tu cuenta antes de reintentar.');
 const amount=Number(capture.amount.value);
 const record={id:'RFP-'+c.capture,referencia:ref,tipo:kind,paypalPagoId:c.capture,paypalReembolsoId:refund.id,
   montoUSD:amount,montoRD:c.montoRD,estado:refund.status==='COMPLETED'?'completado':'pendiente',
   motivo:clean_(d.motivo,240),iniciadoPor:admin.email,creado:now(),actualizado:now()};
 appendRow_('ReembolsosPaypal',record);
 if(refund.status==='COMPLETED'){applyFullRefund(kind,ref,refund.id);notifyRefund(kind,ref,c.email,refund.id,amount);}
 return {ok:true,refund:format(record),message:refund.status==='COMPLETED'?
   'Reembolso confirmado por PayPal. El abono al comprador puede tardar según el banco.':
   'PayPal recibió la solicitud, pero aún figura pendiente; no lo marques como completado.'};
}
/* Sólo eventos firmados deben llamar a esta función. El ID PayPal impide duplicaciones. */
export function knownEvent_(id:string){return records().some(x=>x.id===id);}
export function recordPaypalEvent_(event:any,status:string,ref:string,detail=''){
 appendRow_('EventosPaypal',{id:clean_(event.id,120),tipo:clean_(event.event_type,100),
   recurso:clean_(event.resource?.id,120),referencia:clean_(ref,120),
   estado:clean_(status,40),detalle:clean_(detail,350),recibido:now()});
}
/* Eventos de cobros únicos y disputas: no otorgar servicios al recibir webhooks sin orden. */
export function processPaypalOperationalEvent_(event:any):{status:string;ref:string;detail:string}{
 const type=str(event.event_type),resource=event.resource||{};
 if(type.startsWith('CUSTOMER.DISPUTE.')){
   const s=settings_();
   safeMail_(adminTo_(s),'Atención · Disputa PayPal '+clean_(resource.dispute_id||resource.id,60),
     layout_(s,{kicker:'Alerta financiera',title:'Hay una actualización de disputa PayPal',
     intro:'Comprueba la reclamación directamente en el Centro de resoluciones y reúne los comprobantes de la operación.',
     details:[['Tipo de evento',esc_(type)],['Disputa',esc_(resource.dispute_id||resource.id||event.id)]],
     cta:{text:'Centro de resoluciones',url:'https://www.paypal.com/disputes/'} }),
     {tipo:'aviso',ref:str(event.id)});
   return {status:'requiere_revision',ref:str(resource.dispute_id||resource.id),detail:'Disputa: requiere revisión manual en PayPal'};
 }
 if(['PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED'].includes(type)){
   const cap=str(resource.supplementary_data?.related_ids?.capture_id||
     resource.capture_id||resource.parent_payment_id||resource.parent_payment);
   const p=refunds().find(x=>x.paypalPagoId===cap||x.paypalReembolsoId===resource.id);
   if(type==='PAYMENT.CAPTURE.REFUNDED'&&p){
     // No asumir un reembolso total de un evento parcial: sólo completar cuando se
     // devuelve el importe total de la captura original.
     const amt=Number(resource.amount?.value);
     const full=Number.isFinite(amt)&&resource.amount?.currency_code==='USD'&&
       Math.abs(amt-Number(p.montoUSD))<0.01;
     if(full&&str(resource.status)==='COMPLETED'){
       if(p.estado!=='completado'){
         updateTable_('ReembolsosPaypal',p._row,{estado:'completado',actualizado:now()});
         applyFullRefund(p.tipo,p.referencia,str(p.paypalReembolsoId||resource.id));
         const c=findCandidate(p.tipo,p.referencia);
         if(c)notifyRefund(p.tipo,p.referencia,c.email,str(p.paypalReembolsoId||resource.id),Number(p.montoUSD));
       }
       return {status:'conciliado',ref:p.referencia,detail:'Reembolso completo verificado'};
     }
   }
   const s=settings_();
   safeMail_(adminTo_(s),'Revisar '+type+' · '+str(resource.id),
     layout_(s,{kicker:'Conciliación PayPal',title:'Hay un reembolso o reversión para revisar',
     intro:'No se modificaron beneficios ni saldos por falta de verificación de reembolso total.',
     details:[['Evento',esc_(type)],['Recurso',esc_(resource.id||'—')]],
     cta:{text:'Administración',url:mailUrl_(s,'admin.html#dinero')}}),
     {tipo:'aviso',ref:str(event.id)});
   return {status:'requiere_revision',ref:cap,detail:'Verificar importe/relación con captura; posible parcial o reversión'};
 }
 if(['PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.DENIED','PAYMENT.CAPTURE.PENDING'].includes(type))
   return {status:'informativo',ref:str(resource.id),detail:'Estado recibido; órdenes y entregas se verifican por API al capturar'};
 return {status:'sin_vincular',ref:str(resource.id),detail:'No se encontró operación de MAJOBELLA asociada'};
}
