/* Membresías: acceso privado, estados, confirmación explícita del pago y control de sesiones. */
import { harness, assert, okf } from './harness.ts';

export default async function(){
 const g=await harness();
 const {ok,fail}=okf('membresias');
 const admin='admin-token', client='client-token';
 try{
   const initial=ok(await g.get({action:'catalog'}),'catálogo');
   assert.equal((initial.membershipPlans||[]).length,0);
   fail(await g.post({action:'adminSaveMembershipPlan',plan:{nombre:'Acceso falso'}}),'solo administrador');
   const p=ok(await g.post({action:'adminSaveMembershipPlan',idToken:admin,plan:{
     nombre:'Cejas mensual',descripcion:'Tratamientos de cejas',beneficios:'Citas anticipadas',
     precioRD:2200,sesionesMes:2,servicios:['cejas'],estado:'borrador',orden:1
   }}),'crear borrador').plan;
   assert.ok(p.id);
   assert.equal((ok(await g.get({action:'catalog'}),'sin borradores').membershipPlans||[]).length,0);
   fail(await g.post({action:'requestMembership',idToken:client,planId:p.id}),'no solicitar borrador');
   ok(await g.post({action:'adminSaveMembershipPlan',idToken:admin,plan:{
     ...p,estado:'activo'
   }}),'publicar plan');
   const catalog=ok(await g.get({action:'catalog'}),'catálogo publicado');
   assert.equal(catalog.membershipPlans.length,1);
   fail(await g.post({action:'requestMembership',planId:p.id}),'sesión requerida');
   const req=ok(await g.post({action:'requestMembership',idToken:client,planId:p.id,nombre:'Ana Pérez'}),'solicitar');
   assert.equal(req.membresia.correo,'ana@example.com');
   assert.equal(req.membresia.estado,'solicitada');
   assert.equal(req.membresia.disponibles,0);
   const dupe=ok(await g.post({action:'requestMembership',idToken:client,planId:p.id}),'sin duplicados');
   assert.equal(dupe.existing,true);
   const id=req.membresia.id;
   fail(await g.post({action:'adminMembershipAction',idToken:client,id,change:'activar',pagoConfirmado:true,metodoPago:'efectivo'}),'solo estudio');
   fail(await g.post({action:'adminMembershipAction',idToken:admin,id,change:'activar',metodoPago:'efectivo'}),'sin pago confirmado');
   const active=ok(await g.post({action:'adminMembershipAction',idToken:admin,id,change:'activar',pagoConfirmado:true,metodoPago:'transferencia'}),'activar con pago');
   assert.equal(active.membresia.estadoEfectivo,'activa');
   assert.equal(active.membresia.disponibles,2);
   const mine=ok(await g.post({action:'myMemberships',idToken:client}),'mis planes');
   assert.equal(mine.memberships.length,1);
   assert.equal(mine.memberships[0].id,id);
   ok(await g.post({action:'adminMembershipAction',idToken:admin,id,change:'usar'}),'usar una sesión');
   assert.equal(ok(await g.post({action:'myMemberships',idToken:client}),'saldo restante').memberships[0].disponibles,1);
   ok(await g.post({action:'adminMembershipAction',idToken:admin,id,change:'usar'}),'usar segunda');
   fail(await g.post({action:'adminMembershipAction',idToken:admin,id,change:'usar'}),'no exceder cupo');
   fail(await g.post({action:'adminMembershipAction',idToken:admin,id,change:'renovar',metodoPago:'efectivo'}),'renovar sin pago');
   const renewed=ok(await g.post({action:'adminMembershipAction',idToken:admin,id,change:'renovar',pagoConfirmado:true,metodoPago:'efectivo'}),'renovar pagada');
   assert.equal(renewed.membresia.disponibles,2);
   ok(await g.post({action:'adminMembershipAction',idToken:admin,id,change:'pausar'}),'pausar');
   assert.equal(ok(await g.post({action:'myMemberships',idToken:client}),'suspendida').memberships[0].disponibles,0);
   ok(await g.post({action:'adminMembershipAction',idToken:admin,id,change:'cancelar'}),'cancelar');
   assert.equal(ok(await g.post({action:'myMemberships',idToken:client}),'cancelada').memberships[0].estado,'cancelada');
 }finally{await g.close();}
}
