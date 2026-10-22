/* MAJOBELLA · pruebas de suscripciones: nunca entregar sesiones sin cobro verificado. */
import { harness, assert, okf } from './harness.ts';

const headers=(valid=true)=>({
 'paypal-transmission-id':valid?'valid-tid':'invalid-tid',
 'paypal-transmission-time':new Date().toISOString(),
 'paypal-transmission-sig':'firma-de-prueba',
 'paypal-cert-url':'https://api.sandbox.paypal.com/cert.pem',
 'paypal-auth-algo':'SHA256withRSA'
});
export default async function(){
 const g=await harness({env:{PAYPAL_SUBSCRIPTIONS_ENABLED:'true',PAYPAL_WEBHOOK_ID:'WH-MAJOBELLA-TEST'}});
 const {ok,fail}=okf('PayPal recurrente');
 try{
  const admin='admin-token',client='client-token';
  const name='Plan mensual CEO';
  const p=ok(await g.post({action:'adminSaveMembershipPlan',idToken:admin,plan:{
   nombre:name,precioRD:2300,sesionesMes:2,servicios:['cejas'],estado:'activo',orden:1
  }}),'crear plan').plan;
  fail(await g.post({action:'adminSyncPaypalPlan',planId:p.id,idToken:client}),'sin permisos no crea plan remoto');
  const synced=ok(await g.post({action:'adminSyncPaypalPlan',planId:p.id,idToken:admin}),'plan PayPal creado');
  assert.ok(synced.paypalPlanId);
  assert.equal(Object.keys(g.pp.plans).length,1);
  const retry=ok(await g.post({action:'adminSyncPaypalPlan',planId:p.id,idToken:admin}),'sin duplicar plan');
  assert.equal(retry.paypalPlanId,synced.paypalPlanId);
  const catalog=ok(await g.get({action:'catalog'}),'catálogo');
  assert.equal(catalog.subscriptionCapability.enabled,true);
  assert.equal(catalog.membershipPlans[0].renovacion,'automatica_disponible');
  fail(await g.post({action:'startPaypalSubscription',planId:p.id}),'no se permite anónimo');
  const sub=ok(await g.post({action:'startPaypalSubscription',planId:p.id,idToken:client,nombre:'Ana Pérez'}),'solicitud segura');
  assert.match(sub.approvalUrl,/sandbox.paypal.com/);
  const continuation=ok(await g.post({action:'startPaypalSubscription',planId:p.id,idToken:client}),'reanudar autorización sin duplicar');
  assert.equal(continuation.approvalUrl,sub.approvalUrl);
  assert.equal(Object.keys(g.pp.subscriptions).length,1);
  const m=await g.row('Membresias',sub.membresiaId);
  assert.equal(m.estado,'solicitada');
  const sid=m.paypalSubscriptionId;
  assert.ok(sid);
  assert.equal(Number(m.sesionesUsadas),0);
  assert.equal(m.vence,'');
  const before=ok(await g.post({action:'confirmPaypalSubscription',idToken:client,id:m.id}),'retorno de aprobación');
  assert.equal(before.pagado,false);
  const sale={
    id:'SALE-TEST0000001',billing_agreement_id:sid,amount:{total:Number(m.paypalPrecioUSD).toFixed(2),currency:'USD'},state:'COMPLETED'
  };
  const event={id:'WH-EVT1',event_type:'PAYMENT.SALE.COMPLETED',resource:sale};
  fail(await g.postSigned({action:'paypalWebhook',event},headers(false)),'webhook con firma inválida');
  assert.equal((await g.row('Membresias',m.id)).estado,'solicitada');
  const first=ok(await g.postSigned({action:'paypalWebhook',event},headers()),'cobro confirmado');
  assert.equal(first.membresia.estado,'activa');
  assert.equal(first.membresia.disponibles,2);
  const again=ok(await g.postSigned({action:'paypalWebhook',event},headers()),'idempotencia webhook repetido');
  assert.equal(again.duplicate,true);
  assert.equal((await g.rows('PagosMembresia')).length,1);
  const receipts=ok(await g.post({action:'myMembershipPayments',idToken:client}),'historial propio');
  assert.equal(receipts.payments.length,1);
  assert.equal(receipts.payments[0].id,sale.id);
  fail(await g.post({action:'cancelPaypalSubscription',id:m.id}),'cancelación requiere sesión');
  fail(await g.post({action:'adminMembershipAction',idToken:admin,id:m.id,change:'renovar',pagoConfirmado:true,metodoPago:'paypal'}),'no renovar manualmente una automática');
  ok(await g.post({action:'adminMembershipAction',idToken:admin,id:m.id,change:'usar'}),'registrar sesión');
  const second={...sale,id:'SALE-TEST0000002'};
  ok(await g.postSigned({action:'paypalWebhook',event:{id:'WH-EVT2',event_type:'PAYMENT.SALE.COMPLETED',resource:second}},headers()),'renovación automática');
  assert.equal((await g.rows('PagosMembresia')).length,2);
  const balance=ok(await g.post({action:'myMemberships',idToken:client}),'ver sesiones');
  assert.equal(balance.memberships[0].disponibles,2);
  g.pp.transactions[sid]=[
    {id:'SALE-TEST0000003',status:'COMPLETED',time:new Date().toISOString(),
      amount_with_breakdown:{gross_amount:{value:Number(m.paypalPrecioUSD).toFixed(2),currency_code:'USD'}}},
    {id:'SALE-FAILED000001',status:'FAILED',time:new Date().toISOString(),
      amount_with_breakdown:{gross_amount:{value:Number(m.paypalPrecioUSD).toFixed(2),currency_code:'USD'}}}
  ];
  fail(await g.post({action:'adminReconcilePaypalSubscription',id:m.id,idToken:client}),'conciliación sólo administrador');
  const recovered=ok(await g.post({action:'adminReconcilePaypalSubscription',id:m.id,idToken:admin}),'recuperar webhook perdido');
  assert.equal(recovered.added,1);
  assert.equal((await g.rows('PagosMembresia')).length,3);
  assert.equal(ok(await g.post({action:'adminReconcilePaypalSubscription',id:m.id,idToken:admin}),'conciliación repetida').added,0);
  const partial={id:'WH-PARTIAL1',event_type:'PAYMENT.SALE.REFUNDED',resource:{
    id:second.id,billing_agreement_id:sid,amount:{total:'0.01',currency:'USD'},state:'COMPLETED'
  }};
  const review=ok(await g.postSigned({action:'paypalWebhook',event:partial},headers()),'reembolso parcial requiere revisión');
  assert.equal(review.review,true);
  assert.equal((await g.row('Membresias',m.id)).estado,'activa','no revocar beneficios sin reembolso íntegro');
  assert.equal((await g.rows('PagosMembresia')).find((x:any)=>x.id===second.id).estado,'completado');
  assert.equal((await g.rows('EventosPaypal')).find((x:any)=>x.id==='WH-PARTIAL1').estado,'requiere_revision');
  const failure={id:'WH-FAIL1',event_type:'BILLING.SUBSCRIPTION.PAYMENT.FAILED',resource:{id:sid}};
  ok(await g.postSigned({action:'paypalWebhook',event:failure},headers()),'pago fallido registrado');
  const emails=g.mails.filter(x=>String(x.subject).includes('Un detalle pendiente'));
  assert.equal(emails.length,1);
  ok(await g.postSigned({action:'paypalWebhook',event:failure},headers()),'reintento sin correo duplicado');
  assert.equal(g.mails.filter(x=>String(x.subject).includes('Un detalle pendiente')).length,1);
  assert.equal((await g.row('Membresias',m.id)).paypalEstado,'PAYMENT_FAILED');
  const cancel=ok(await g.post({action:'cancelPaypalSubscription',id:m.id,idToken:client}),'cancelar renovación desde cuenta');
  assert.equal(cancel.membresia.paypalEstado,'CANCELLED');
  assert.equal(g.pp.subscriptions[sid].status,'CANCELLED');
  assert.equal((await g.row('Membresias',m.id)).estado,'activa','mantiene período pagado');
 }finally{await g.close();}
}
