/* MAJOBELLA · Plantillas informadas y evaluación obligatoria antes del cobro.
   Solo Administración escribe plantillas; la clienta recibe únicamente plantillas activas asociadas a su servicio. */
import { readTable_, updateTable_, appendRow_ } from './db.ts';
import { needAdmin_ } from './security.ts';
import { clean_, safeJson_, uuid } from './util.ts';
import { adminData_ } from './admin.ts';
import { services_ } from './data.ts';

const BLOCK_MESSAGE = 'Gracias por compartir esta información con nosotros. Por tu bienestar y para brindarte una atención responsable, en este momento no será posible agendar esta sesión debido a la condición indicada en tu respuesta. Te invitamos a escribirnos para orientarte sobre los próximos pasos y, si corresponde, valorar una nueva fecha. Agradecemos mucho tu comprensión.';
export function allTemplates_() {
  return readTable_('PlantillasConsentimiento').map(r => ({
    id:String(r.id), nombre:String(r.nombre||''), descripcion:String(r.descripcion||''), texto:String(r.texto||''),
    estado:String(r.estado||'borrador'), preguntas:safeJson_(r.preguntas,[]), actualizado:String(r.actualizado||''),
  }));
}
export function publicTemplates_() {
  const used = new Set(services_().map(s=>String(s.consentTemplateId||'')).filter(Boolean));
  return allTemplates_().filter(t=>t.estado==='activo' && used.has(t.id))
    .map(t=>({id:t.id,nombre:t.nombre,descripcion:t.descripcion,texto:t.texto,preguntas:t.preguntas}));
}
export function adminSaveConsentTemplate_(d:any) {
  needAdmin_(d);
  const t=d.template||{};
  const id=clean_(t.id,40)||'cons-'+uuid().slice(0,12);
  if(!/^[a-z0-9_-]+$/i.test(id))throw new Error('Identificador de plantilla no válido.');
  const nombre=clean_(t.nombre,120),texto=clean_(t.texto,8000);
  if(!nombre || !texto)throw new Error('Escribe el nombre y el texto completo del consentimiento.');
  const estado=['activo','borrador','archivado'].includes(t.estado)?t.estado:'borrador';
  if(!Array.isArray(t.preguntas)||t.preguntas.length>30)throw new Error('La plantilla permite hasta 30 preguntas.');
  const seen=new Set<string>();
  const preguntas=t.preguntas.map((q:any,i:number)=>{
    const qid=clean_(q.id,40)||'p'+(i+1);
    const text=clean_(q.text,350);
    if(!text||seen.has(qid)||!/^[a-z0-9_-]+$/i.test(qid))throw new Error('Revisa las preguntas repetidas o sin texto.');
    seen.add(qid);
    const stopOn=['si','no'].includes(q.stopOn)?q.stopOn:'';
    return {id:qid,text,required:true,stopOn,
      stopMessage:stopOn?(clean_(q.stopMessage,900)||BLOCK_MESSAGE):''};
  });
  const rows=readTable_('PlantillasConsentimiento');
  const old=rows.find(x=>x.id===id);
  const patch={id,nombre,texto,descripcion:clean_(t.descripcion,800),estado,preguntas:JSON.stringify(preguntas),actualizado:new Date().toISOString()};
  if(old)updateTable_('PlantillasConsentimiento',old._row,patch);else appendRow_('PlantillasConsentimiento',patch);
  return adminData_(d);
}
export function evaluateConsent_(items:any[],d:any) {
  const ids=[...new Set(items.map(s=>String(s.consentTemplateId||'')).filter(Boolean))];
  if(!ids.length)return [];
  const templates=allTemplates_();
  const provided=Array.isArray(d.consents)?d.consents:[];
  return ids.map(id=>{
    const t=templates.find(x=>x.id===id && x.estado==='activo');
    if(!t)throw new Error('El consentimiento requerido no está disponible. Comunícate con el estudio antes de reservar.');
    const form=provided.find(x=>x && x.templateId===id);
    if(!form || form.accepted!==true)throw new Error('Revisa y acepta el consentimiento «'+t.nombre+'» antes de pagar.');
    const full=clean_(form.name,100);
    if(full.length<3)throw new Error('Escribe tu nombre completo en el consentimiento «'+t.nombre+'».');
    const answers=form.answers||{};
    if(!answers || typeof answers!=='object'||Array.isArray(answers))throw new Error('Responde las preguntas del consentimiento.');
    const normalized:any={};
    for(const q of t.preguntas){
      const v=String(answers[q.id]||'').toLowerCase();
      if(!['si','no'].includes(v))throw new Error('Responde todas las preguntas de «'+t.nombre+'».');
      if(q.stopOn===v)throw new Error(q.stopMessage||BLOCK_MESSAGE);
      normalized[q.id]={pregunta:q.text,respuesta:v};
    }
    return {templateId:t.id,templateName:t.nombre,templateText:t.texto,
      questions:normalized,accepted:true,name:full,signedAt:new Date().toISOString(),serviceIds:items.filter(s=>s.consentTemplateId===id).map(s=>s.id)};
  });
}
