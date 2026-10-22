/* Prueba sin navegador del centro de operaciones (datos de ejemplo explícitos). */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync('../admin.html','utf8');
const js = readFileSync('../js/admin/centro.js','utf8');
for(const id of ['cc-kpis','cc-task-list','cc-agenda-list','cc-chart','cc-services-chart','cc-concierge-list','cc-period','cc-download','cc-quick-book']) {
  assert.match(html,new RegExp('id="'+id+'"'));
}
assert.equal((html.match(/data-sec="inicio"/g)||[]).length,2,'Debe existir una pestaña Inicio para escritorio y otra para móvil.');
const ids = new Map();
const el = id => {
  if(!ids.has(id))ids.set(id,{id,innerHTML:'',textContent:'',dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});
  return ids.get(id);
};
const periodButtons=['hoy','semana','mes'].map(p=>({dataset:{ccPeriod:p},setAttribute(k,v){this[k]=v;}}));
const document = {
  querySelectorAll(q){return q.includes('cc-period')?periodButtons:[];},
  querySelector(q){return q.includes('cc-footnote')?el('cc-footnote'):null;},
  createElement(){return {click(){},set href(x){},set download(x){}};}
};
const now=new Date();
const t=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const iso=t.slice(0,10);
const dayOffset=(key,n)=>{const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const data={
  items:[{id:'1',date:iso,time:'10:00',start:iso+'T14:00:00Z',status:'confirmada',client:{name:'Ana'},
    clientKey:'ana',services:[{id:'cejas',name:'Cejas'}],servicesText:'Cejas',
    payment:{balanceRD:800,balanceStatus:'pendiente'},consent:{needed:true,signed:false}},
    {id:'2',date:iso,time:'12:00',start:iso+'T16:00:00Z',status:'por-confirmar',client:{name:'Rosa'},
      services:[],payment:{balanceRD:0}}],
  memberships:[{id:'m1',estado:'solicitada'}], gifts:[],bonos:[],expenses:[]
};
const movement=[{date:iso,amount:1500}];
const moneySummary=(from,to)=>({gross:from<=iso&&iso<=to?1500:0,ref:0,due:from<=iso&&iso<=to?800:0});
let chosen='',exportCount=0;
const A={
  DEMO:true,data,loadedAt:Date.now(),sections:{},money:n=>'RD$ '+n.toLocaleString('es-DO'),moneySummary,
  movements:()=>movement,clients:()=>[{key:'ana',name:'Ana Pérez',phone:'8095551234',visits:2,
   next:{date:iso},lastVisit:dayOffset(iso,-25)}],waLink:()=> 'https://wa.me/18095551234',
  today:iso,addDays:dayOffset,shortDate:v=>v,serviceName:id=>id,badge:()=>{},barChart:(e,ds)=>{e.values=ds;},hbars:()=>'<div>Servicios</div>',
  go:s=>{chosen=s;},sum:(a,fn)=>a.reduce((x,y)=>x+fn(y),0),$:el};
const context={window:{MJB:{Admin:A,todayKey:()=>iso,fmtTime12:x=>x,Auth:{user:{name:'Majo'}}}},
  document,Date,Intl,JSON,Number,String,Map,Set,Math,Array,URL,
  Blob:class{},setTimeout:()=>{},console};
vm.runInNewContext(js,context,{filename:'centro.js'});
assert.equal(typeof A.sections.inicio.render,'function');
A.sections.inicio.render();
assert.match(el('cc-kpis').innerHTML,/RD\$ 1[,.]500/);
assert.match(el('cc-task-list').innerHTML,/Transferencias por validar/);
assert.match(el('cc-task-list').innerHTML,/Membresías por activar/);
assert.match(el('cc-concierge-list').innerHTML,/Ana Pérez/);
assert.match(el('cc-agenda-list').innerHTML,/Ana/);
assert.ok(el('cc-chart').values.length>=1);
A.sections.inicio.init();
el('cc-period').listeners.click({target:{closest:()=>({dataset:{ccPeriod:'semana'}})}});
assert.equal(periodButtons[1]['aria-pressed'],'true');
el('sec-inicio').listeners.click({target:{closest:()=>({dataset:{ccTarget:'membresias'}})}});
assert.equal(chosen,'membresias');
console.log('Centro de control: estructura, filtros, KPIs, alertas y navegación correctos.');
