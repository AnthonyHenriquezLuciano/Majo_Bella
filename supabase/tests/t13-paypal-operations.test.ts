/* MAJOBELLA · Cobros únicos PayPal, reembolsos validados y auditoría de webhooks. */
import { harness, assert, okf } from './harness.ts';
const headers=(valid=true)=>({
 'paypal-transmission-id':valid?'valid-tid':'falso',
 'paypal-transmission-time':new Date().toISOString(),
 'paypal-transmission-sig':'firma-prueba',
 'paypal-cert-url':'https://api.sandbox.paypal.com/cert',
 'paypal-auth-algo':'SHA256withRSA'
});
export default async function(){
 const g=await harness({env:{PAYPAL_WEBHOOK_ID:'WH-MAJOBELLA-TEST'}});
 const {ok,fail}=okf('PayPal Ops');
 const admin='admin-token',client='client-token';
 try{
  fail(await g.post({action:'adminPaypalOperations',idToken:client}),'no permite acceso cliente');
  fail(await g.post({action:'adminPaypalRefund',idToken:client,tipo:'tarjeta',referencia:'TRG-123456',confirmar:true}),'no permite reembolso ajeno');
  const diag=ok(await g.post({action:'adminPaypalOperations',idToken:admin}),'consulta financiera autenticada');
  assert.equal(diag.config.env,'sandbox');
  assert.equal(diag.config.webhook,true);
  const connection=ok(await g.post({action:'adminPaypalConnectionTest',idToken:admin}),'prueba credenciales no revela secretos');
  assert.equal(connection.connected,true);
  assert.equal(JSON.stringify(connection).includes('secret-key'),false);
  const order=ok(await g.post({action:'giftOrder',montoRD:1500,correo:'ana@example.com',
    de:'Ana Test',para:'Regalo'}),'crear tarjeta');
  const activated=ok(await g.post({action:'giftCapture',id:order.id,orderId:order.orderId}),'cobrar tarjeta').gift;
  assert.ok(activated.codigo);
  const before=ok(await g.post({action:'adminPaypalOperations',idToken:admin}),'cobro conciliable');
  const eligible=before.payments.find((x:any)=>x.referencia===order.id);
  assert.ok(eligible?.eligible,'regalo sin usar debe poder reembolsarse');
  fail(await g.post({action:'adminPaypalRefund',idToken:admin,tipo:'tarjeta',referencia:order.id}),'reembolso requiere confirmación');
  const returned=ok(await g.post({action:'adminPaypalRefund',idToken:admin,tipo:'tarjeta',
    referencia:order.id,motivo:'Clienta canceló el regalo',confirmar:true}),'reembolso total autorizado');
  assert.equal(returned.refund.estado,'completado');
  assert.equal(g.pp.refunds.length,1);
  assert.equal((await g.row('Tarjetas',order.id)).estado,'reembolsada');
  const repeat=ok(await g.post({action:'adminPaypalRefund',idToken:admin,tipo:'tarjeta',
    referencia:order.id,motivo:'Intento duplicado',confirmar:true}),'no devuelve saldo dos veces');
  assert.equal(repeat.duplicate,true);
  assert.equal(g.pp.refunds.length,1);
  const eventsBefore=(await g.rows('EventosPaypal')).length;
  const invalid={id:'WH-AUDIT-1',event_type:'CUSTOMER.DISPUTE.CREATED',resource:{id:'DS-TEST-1'}};
  fail(await g.postSigned({action:'paypalWebhook',event:invalid},headers(false)),'rechaza webhook sin firma');
  assert.equal((await g.rows('EventosPaypal')).length,eventsBefore);
  ok(await g.postSigned({action:'paypalWebhook',event:invalid},headers()),'registra disputa firmada');
  assert.equal((await g.rows('EventosPaypal')).length,eventsBefore+1);
  ok(await g.postSigned({action:'paypalWebhook',event:invalid},headers()),'ignora disputa repetida');
  assert.equal((await g.rows('EventosPaypal')).length,eventsBefore+1);
  const capture=(await g.row('Tarjetas',order.id)).paypalCaptura;
  const refunded={id:'WH-AUDIT-2',event_type:'PAYMENT.CAPTURE.REFUNDED',resource:{
   id:returned.refund.paypalReembolsoId,status:'COMPLETED',amount:{value:String(returned.refund.montoUSD),currency_code:'USD'},
   supplementary_data:{related_ids:{capture_id:capture}}
  }};
  ok(await g.postSigned({action:'paypalWebhook',event:refunded},headers()),'reembolso confirmado por evento firmado');
  assert.equal((await g.rows('ReembolsosPaypal')).length,1);
  assert.equal((await g.rows('EventosPaypal')).length,eventsBefore+2);
  const audit=ok(await g.post({action:'adminPaypalOperations',idToken:admin}),'revisión de historial');
  assert.equal(audit.refunds.length,1);
  assert.ok(audit.events.some((x:any)=>x.tipo==='CUSTOMER.DISPUTE.CREATED'));
 }finally{await g.close();}
}
