/* MAJOBELLA · Consentimientos previos al depósito (web y PWA).
   Los datos personales no se guardan en el navegador: se adjuntan al intento de reserva. */
(function(M){
  const esc=M.escapeHtml;
  function required(ids){
    const all=Array.isArray(M.consentTemplates)?M.consentTemplates:[];
    const templates=new Map(all.map(t=>[t.id,t]));
    return [...new Set(ids.map(id=>M.serviceById[id]?.consentTemplateId).filter(Boolean))].map(id=>{
      const t=templates.get(id);if(!t)throw new Error('La plantilla de consentimiento de este tratamiento aún no está disponible. Escríbenos para ayudarte.');
      return t;
    });
  }
  const css=`
.mjb-consent{border:0;border-radius:23px;background:#fff;color:#111;width:min(690px,calc(100vw - 24px));max-height:min(92vh,900px);padding:0;box-shadow:0 18px 70px rgba(0,0,0,.22);font:14px/1.5 Georgia,serif}
.mjb-consent::backdrop{background:rgba(0,0,0,.57);backdrop-filter:blur(3px)}
.mjb-consent form{margin:0}.mjb-consent-head{display:flex;align-items:start;justify-content:space-between;border-bottom:1px solid #eee;padding:23px 25px 18px}
.mjb-consent-k{font:600 10px/1.4 system-ui;letter-spacing:.17em;color:#777}.mjb-consent h2{font-size:28px;font-weight:400;margin:8px 0 0;line-height:1.15}
.mjb-consent-close{background:#fff;color:#111;border:1px solid #ddd;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:20px}
.mjb-consent-content{padding:20px 25px;overflow-y:auto;max-height:calc(92vh - 175px)}
.mjb-consent section{margin-bottom:27px}.mjb-consent h3{font-size:22px;font-weight:400;margin:0 0 8px}.mjb-consent p{font-size:14px;line-height:1.6;color:#555;white-space:pre-wrap}
.mjb-consent fieldset{border:0;border-top:1px solid #e8e8e8;margin:0;padding:14px 0}
.mjb-consent legend{font-size:13px;font-weight:600;padding:12px 0 0}.mjb-consent-answer{display:inline-flex;align-items:center;gap:5px;margin:10px 18px 0 0;cursor:pointer}
.mjb-consent-answer input{accent-color:#111;width:17px;height:17px}.mjb-consent-alert{background:#f4f4f4;border-left:3px solid #111;border-radius:8px;padding:15px;margin:12px 0 18px;color:#222}
.mjb-consent-alert strong{font-size:15px}.mjb-consent-alert p{margin:8px 0 0;color:#333}
.mjb-consent-name{display:grid;gap:7px;font:600 12px system-ui;margin:17px 0}
.mjb-consent-name input{padding:12px;border-radius:12px;border:1px solid #bbb;font-size:15px}
.mjb-consent-agree{display:flex;align-items:start;gap:10px;font-size:13px;line-height:1.5}
.mjb-consent-agree input{accent-color:#111;margin-top:3px;width:18px;height:18px;flex:none}
.mjb-consent-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:16px 25px;border-top:1px solid #eee;background:#fff}
.mjb-consent-actions button{cursor:pointer;border-radius:999px;font-size:14px;padding:12px 18px}
.mjb-consent-next{background:#111;border:1px solid #111;color:#fff}.mjb-consent-next:disabled{opacity:.36;cursor:not-allowed}
.mjb-consent-cancel{background:#fff;border:1px solid #ddd}
@media(max-width:550px){.mjb-consent-head,.mjb-consent-content{padding:17px}.mjb-consent-actions{padding:12px 17px}.mjb-consent h2{font-size:24px}}
`;
  function mount(){
    if(!document.getElementById('mjb-consent-style')){const st=document.createElement('style');st.id='mjb-consent-style';st.textContent=css;document.head.appendChild(st);}
  }
  async function prepare(ids,name){
    const templates=required(ids);
    if(!templates.length)return [];
    mount();
    return await new Promise(resolve=>{
      const dlg=document.createElement('dialog');dlg.className='mjb-consent';
      const questionnaires=templates.map(t=>`<section data-ct-template="${esc(t.id)}">
        <h3>${esc(t.nombre)}</h3><p>${esc(t.texto)}</p>
        ${(t.preguntas||[]).map((q,i)=>`<fieldset data-q-id="${esc(q.id)}" data-stop="${esc(q.stopOn||'')}" data-message="${esc(q.stopMessage||'')}">
        <legend>${i+1}. ${esc(q.text)}</legend>
        <label class="mjb-consent-answer"><input type="radio" name="${esc(t.id+'-'+q.id)}" value="si"> Sí</label>
        <label class="mjb-consent-answer"><input type="radio" name="${esc(t.id+'-'+q.id)}" value="no"> No</label></fieldset>`).join('')}
        </section>`).join('');
      dlg.innerHTML=`<form method="dialog"><div class="mjb-consent-head"><div><span class="mjb-consent-k">MAJOBELLA · ANTES DE RESERVAR</span><h2>Tu bienestar es primero</h2></div>
        <button type="button" class="mjb-consent-close" aria-label="Cerrar consentimiento">×</button></div>
        <div class="mjb-consent-content">
        <p>Antes de confirmar y realizar cualquier pago, revisa los consentimientos correspondientes a los servicios seleccionados.</p>
        ${questionnaires}<div id="mjb-consent-alert" class="mjb-consent-alert" role="alert" hidden></div>
        <label class="mjb-consent-name">Nombre completo de quien autoriza<input name="consentFullName" maxlength="100" value="${esc(name||'')}" autocomplete="name"></label>
        <label class="mjb-consent-agree"><input type="checkbox" name="consentAccept">
          <span>He leído y comprendido la información, mis respuestas son correctas y acepto el consentimiento para los tratamientos seleccionados. Entiendo que puedo retirarlo antes del procedimiento.</span></label>
        </div><div class="mjb-consent-actions"><button class="mjb-consent-cancel" type="button">Volver</button><button class="mjb-consent-next" type="button" disabled>Continuar al pago →</button></div></form>`;
      document.body.appendChild(dlg);
      let done=false;
      const close=(value)=>{if(done)return;done=true;dlg.close();dlg.remove();resolve(value);};
      dlg.addEventListener('close',()=>close(null));
      dlg.addEventListener('cancel',e=>{e.preventDefault();close(null)});
      dlg.querySelectorAll('.mjb-consent-close,.mjb-consent-cancel').forEach(b=>b.addEventListener('click',()=>close(null)));
      const answers=()=>templates.map(t=>({templateId:t.id,accepted:true,name:dlg.querySelector('[name=consentFullName]').value.trim(),answers:Object.fromEntries((t.preguntas||[]).map(q=>[q.id,dlg.querySelector(`[name="${CSS.escape(t.id+'-'+q.id)}"]:checked`)?.value||'']))}));
      const check=()=>{
        const alert=dlg.querySelector('#mjb-consent-alert');alert.hidden=true;
        const responses=answers();
        const fullname=responses[0]?.name||'';
        const blocked=templates.flatMap(t=>(t.preguntas||[]).map(q=>({q,value:responses.find(r=>r.templateId===t.id)?.answers[q.id]}))).find(x=>x.q.stopOn&&x.value===x.q.stopOn);
        if(blocked){
          alert.innerHTML='<strong>No podemos confirmar esta sesión por el momento.</strong><p>'+esc(blocked.q.stopMessage||'Gracias por responder con sinceridad. Por tu bienestar, te recomendamos contactar al estudio para revisar tu situación antes de agendar. No se realizará ningún cargo.')+'</p>';
          alert.hidden=false;
        }
        const all=responses.every(r=>Object.values(r.answers).every(x=>x==='si'||x==='no'));
        dlg.querySelector('.mjb-consent-next').disabled=!!blocked||!all||fullname.length<3||!dlg.querySelector('[name=consentAccept]').checked;
      };
      dlg.querySelector('form').addEventListener('change',check);
      dlg.querySelector('form').addEventListener('input',check);
      dlg.querySelector('.mjb-consent-next').addEventListener('click',()=>{check();if(!dlg.querySelector('.mjb-consent-next').disabled)close(answers());});
      dlg.showModal();check();
    });
  }
  M.Consent={prepare,required};
})(window.MJB);
