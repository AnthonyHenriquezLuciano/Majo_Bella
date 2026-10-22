/* MAJOBELLA · Consentimientos: editor visual corporativo, preguntas y condiciones de bloqueo. */
(function(M){
  const A=M.Admin, {$,esc}=A;
  const DEFAULT_BLOCK='Gracias por compartir esta información con nosotros. Para cuidar tu bienestar, en este momento no será posible agendar esta sesión debido a la situación indicada. No se realizará ningún cargo. Puedes escribirnos para recibir orientación sobre los próximos pasos. Agradecemos tu comprensión.';
  let selected='',draft=null,dirty=false,search='';
  const id=(p)=>p+'-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const clone=(v)=>JSON.parse(JSON.stringify(v));
  const templates=()=>A.data?.consentTemplates||[];
  const active=()=>templates().filter(t=>t.estado==='activo').length;
  function renderList(){
    const list=templates().filter(t=>t.nombre.toLowerCase().includes(search)).slice().sort((a,b)=>String(b.actualizado||'').localeCompare(String(a.actualizado||'')));
    $('ct-count').textContent=templates().length+' documentos · '+active()+' activos';
    $('ct-list').innerHTML=list.length?list.map(t=>`<button type="button" class="ct-entry${selected===t.id?' is-selected':''}" data-ct-edit="${esc(t.id)}">
      <span class="ct-tag">${t.estado==='activo'?'● Activa':t.estado==='archivado'?'○ Archivada':'✎ Borrador'}</span>
      <strong>${esc(t.nombre)}</strong><small>${(t.preguntas||[]).length} preguntas · ${(A.data.services||[]).filter(s=>s.consentTemplateId===t.id).length} servicios vinculados</small>
    </button>`).join(''):'<p class="ct-help">Aún no hay plantillas. Crea la primera para tu estudio.</p>';
  }
  function question(q,i){
    return `<div class="ct-question" data-qid="${esc(q.id)}">
      <div class="ct-q-head"><strong>PREGUNTA ${i+1}</strong>
        <div><button type="button" data-qmove="-1" title="Subir pregunta">↑</button><button type="button" data-qmove="1" title="Bajar pregunta">↓</button>
        <button type="button" data-qremove title="Eliminar pregunta">Quitar</button></div>
      </div>
      <label>Texto de la pregunta<input name="qtext" maxlength="350" value="${esc(q.text||'')}" placeholder="¿Tienes alguna contraindicación para este tratamiento?"></label>
      <div class="ct-row"><label>Respuesta que impide reservar
        <select name="qstop"><option value="">Ninguna · solo información</option><option value="si"${q.stopOn==='si'?' selected':''}>Sí · bloquear</option><option value="no"${q.stopOn==='no'?' selected':''}>No · bloquear</option></select></label>
        <label>Tipo de respuesta<select disabled><option>Sí / No (obligatoria)</option></select></label></div>
      <label>Mensaje personalizado si la respuesta bloquea
        <textarea name="qmessage" rows="3" maxlength="900" placeholder="Explica de forma respetuosa por qué la sesión requiere una valoración.">${esc(q.stopMessage||'')}</textarea></label>
    </div>`;
  }
  function renderPreview(){
    if(!draft)return;
    $('ct-preview').innerHTML=`<div class="ct-template-preview">
      <div class="ct-preview-brand">MAJOBELLA · BEAUTY STUDIO</div>
      <h3>${esc(draft.nombre||'Consentimiento informado')}</h3>
      <p>${esc(draft.texto||'Escribe el texto del consentimiento.')}</p>
      ${draft.preguntas.map((q,i)=>`<div class="ct-preview-question">${i+1}. ${esc(q.text||'Nueva pregunta')}<small>◯ Sí &nbsp;&nbsp; ◯ No</small></div>`).join('')}
      <p style="font-size:12px;margin-top:16px">□ Declaro haber leído la información anterior y autorizo el tratamiento bajo las condiciones indicadas.</p>
    </div>`;
  }
  function editor(){
    $('ct-editor-title').textContent=draft?.nombre||'Selecciona una plantilla';
    $('ct-dirty').hidden=!dirty;
    $('ct-save').disabled=!dirty;
    if(!draft){$('ct-editor').innerHTML='<div class="ct-empty"><h3>Documentos que cuidan a tus clientas.</h3><p>Selecciona una plantilla o crea una nueva para configurar el cuestionario que se completará antes del pago.</p></div>';return;}
    $('ct-editor').innerHTML=`<div class="ct-form" id="ct-form">
      <div class="ct-row">
        <label>Nombre del documento<input name="nombre" maxlength="120" value="${esc(draft.nombre)}" placeholder="Ej. Consentimiento de micropigmentación"></label>
        <label>Publicación<select name="estado"><option value="borrador"${draft.estado==='borrador'?' selected':''}>✎ Borrador</option><option value="activo"${draft.estado==='activo'?' selected':''}>● Activa</option><option value="archivado"${draft.estado==='archivado'?' selected':''}>○ Archivada</option></select></label>
      </div>
      <label>Descripción interna<input name="descripcion" maxlength="800" value="${esc(draft.descripcion||'')}" placeholder="¿Para qué tratamientos está diseñada?"></label>
      <label>Texto de consentimiento informado<textarea name="texto" rows="9" maxlength="8000" placeholder="Explica el procedimiento, riesgos, beneficios, preparación, cuidados y derecho a retirar el consentimiento…">${esc(draft.texto||'')}</textarea></label>
      <div class="ct-section">
        <h3>Cuestionario de seguridad</h3>
        <p>Marca en cada pregunta la respuesta que no permite reservar. El sistema detendrá el proceso antes del pago y mostrará tu mensaje de forma respetuosa.</p>
        <div id="ct-questions">${draft.preguntas.map(question).join('')}</div>
        <button type="button" class="chip-btn" id="ct-add-question">+ Añadir pregunta</button>
      </div>
      <div class="ct-tip">Cuando guardes la plantilla como <b>Activa</b>, ve a <b>Servicios</b> y selecciona esta plantilla en cada tratamiento. Las respuestas se validan en el servidor antes de crear una reserva o solicitar un depósito. Revisa el contenido clínico y legal con profesionales cualificados antes de publicarlo.</div>
      <div class="ct-section"><h3>Vista previa para la clienta</h3><p>Esta es la estructura que se mostrará antes del pago.</p><div id="ct-preview"></div></div>
    </div>`;
    renderPreview();
  }
  function mark(){dirty=true;$('ct-save').disabled=false;$('ct-dirty').hidden=false;$('ct-msg').textContent='Cambios sin guardar.';}
  function choose(x){if(dirty&&!confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?'))return;
    selected=x.id;draft=clone(x);draft.preguntas=Array.isArray(draft.preguntas)?draft.preguntas:[];dirty=false;
    $('ct-msg').textContent='Edita y guarda esta plantilla.';renderList();editor();}
  function create(){if(dirty&&!confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?'))return;
    draft={id:id('cons'),nombre:'Nuevo consentimiento',descripcion:'',texto:'He recibido información sobre el tratamiento, sus cuidados y posibles reacciones. Declaro que mis respuestas son correctas y que puedo plantear dudas o retirar mi consentimiento antes de iniciar el procedimiento.',estado:'borrador',preguntas:[]};
    selected=draft.id;dirty=true;renderList();editor();mark();$('ct-form [name=nombre]')?.focus();}
  function update(e){
    if(!draft)return;
    const f=e.target.closest('[name]');if(!f)return;
    const node=f.closest('.ct-question');
    if(node){const q=draft.preguntas.find(x=>x.id===node.dataset.qid);if(!q)return;
      if(f.name==='qtext')q.text=f.value;
      if(f.name==='qstop')q.stopOn=f.value;
      if(f.name==='qmessage')q.stopMessage=f.value;
    }else draft[f.name]=f.value;
    mark();
    if(f.name==='nombre')$('ct-editor-title').textContent=f.value||'Nueva plantilla';
    renderPreview();
  }
  async function save(btn){
    if(!draft)return;
    if(!draft.nombre.trim()||!draft.texto.trim())return A.toast('Completa el nombre y el texto del documento.');
    if(draft.preguntas.some(q=>!q.text.trim()))return A.toast('Todas las preguntas necesitan texto.');
    await A.busy(btn,async()=>{try{
      const res=await A.call('adminSaveConsentTemplate',{template:draft});A.data=res;
      dirty=false;const updated=templates().find(x=>x.id===draft.id);if(updated)draft=clone(updated);
      $('ct-msg').textContent='Plantilla guardada. Ya puedes asignarla desde Servicios.';
      renderList();editor();A.toast('Consentimiento guardado correctamente.');
    }catch(e){A.toast(e.message);}});
  }
  A.sections.consentimientos={
    render(){renderList();editor();},
    init(){
      $('ct-add').addEventListener('click',create);
      $('ct-search').addEventListener('input',e=>{search=e.target.value.trim().toLowerCase();renderList();});
      $('ct-list').addEventListener('click',e=>{const b=e.target.closest('[data-ct-edit]');if(b){const t=templates().find(x=>x.id===b.dataset.ctEdit);if(t)choose(t);}});
      $('ct-editor').addEventListener('input',update);
      $('ct-editor').addEventListener('change',update);
      $('ct-editor').addEventListener('click',e=>{
        if(!draft)return;
        if(e.target.closest('#ct-add-question')){
          draft.preguntas.push({id:id('q'),text:'',required:true,stopOn:'',stopMessage:DEFAULT_BLOCK});
          mark();editor();const els=$('ct-questions').querySelectorAll('.ct-question');els[els.length-1]?.querySelector('[name=qtext]')?.focus();return;
        }
        const b=e.target.closest('button'),node=b?.closest('.ct-question');if(!node)return;
        const index=draft.preguntas.findIndex(q=>q.id===node.dataset.qid);if(index<0)return;
        if(b.hasAttribute('data-qremove'))draft.preguntas.splice(index,1);
        else if(b.hasAttribute('data-qmove')){const target=index+Number(b.dataset.qmove);if(target<0||target>=draft.preguntas.length)return;[draft.preguntas[index],draft.preguntas[target]]=[draft.preguntas[target],draft.preguntas[index]];}
        else return;
        mark();editor();
      });
      $('ct-save').addEventListener('click',e=>save(e.currentTarget));
    }
  };
})(window.MJB);
