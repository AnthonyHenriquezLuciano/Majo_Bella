/* MAJOBELLA · Consentimientos por servicio y bloqueo antes del cobro. */
import { harness, assert, okf, nextTuesday } from './harness.ts';
export default async function(){
  const g=await harness(),{ok,fail}=okf('consentimientos-prepago');
  const A='admin-token';
  try{
    const t={id:'ct-cejas',nombre:'Consentimiento de cejas',descripcion:'Aplicación antes de agendar',
      texto:'Declaro que recibí información sobre el procedimiento y puedo retirar mi consentimiento antes de iniciar.',
      estado:'activo',preguntas:[
        {id:'irritacion',text:'¿Tienes irritación activa en la zona?',stopOn:'si',stopMessage:'Por tu bienestar, no podemos realizar el tratamiento mientras la zona presente irritación. No se realizará ningún cargo. Escríbenos para orientarte.'},
        {id:'cuidados',text:'¿Puedes seguir los cuidados posteriores?',stopOn:'no',stopMessage:'Para tu seguridad, es necesario poder seguir los cuidados posteriores.'},
      ]};
    const out=ok(await g.post({action:'adminSaveConsentTemplate',idToken:A,template:t}),'crear plantilla');
    assert.equal(out.consentTemplates.find((x:any)=>x.id===t.id).estado,'activo');
    ok(await g.post({action:'adminSaveSettings',idToken:A,services:[
      {id:'cejas',nombre:'Cejas',tipo:'servicio',categoriaId:'cejas',activo:'si',estado:'activo',
        precioRD:900,duracionMin:45,consentTemplateId:t.id},
    ]}),'vincular a servicio');
    const cat=ok(await g.get({action:'catalog'}),'catálogo');
    assert.equal(cat.services.find((x:any)=>x.id==='cejas').consentTemplateId,t.id);
    assert.equal(cat.consentTemplates.find((x:any)=>x.id===t.id).preguntas.length,2);
    const base={action:'hold',services:['cejas'],date:nextTuesday(),time:'13:00',
      client:{name:'Ana Pérez',phone:'8095551111',email:'ana@example.com'}};
    fail(await g.post(base),'no se reserva sin consentimiento');
    fail(await g.post({...base,consents:[{templateId:t.id,name:'Ana Pérez',accepted:true,answers:{irritacion:'si',cuidados:'si'}}]}),'respuesta riesgosa bloqueada',/irritación/);
    fail(await g.post({...base,consents:[{templateId:t.id,name:'Ana Pérez',accepted:true,answers:{irritacion:'no',cuidados:'no'}}]}),'respuesta negativa bloqueada',/cuidados/);
    const valid=ok(await g.post({...base,consents:[{templateId:t.id,name:'Ana Pérez',accepted:true,answers:{irritacion:'no',cuidados:'si'}}]}),'autorizar pago');
    const row=await g.row('Reservas',valid.id);
    assert.ok(row.consentimientosJson);
    assert.ok(row.consentimiento);
    ok(await g.post({action:'adminSaveConsentTemplate',idToken:A,template:{...t,estado:'archivado'}}),'archivar consentimiento');
    const after=ok(await g.get({action:'catalog'}),'catálogo después de archivar');
    assert.ok(!after.consentTemplates.some((x:any)=>x.id===t.id),'no publicar plantillas archivadas');
    fail(await g.post({...base,time:'14:00',consents:[{templateId:t.id,name:'Ana Pérez',accepted:true,answers:{irritacion:'no',cuidados:'si'}}]}),'archivada no permite cobrar');
  }finally{await g.close();}
}
