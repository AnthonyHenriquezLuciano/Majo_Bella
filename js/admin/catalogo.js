/* MAJOBELLA · Catálogo visual (Categoría → Servicio → Subservicio).
   Los borradores jamás se publican; la API aplica el estado también a padres. */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const STATUS = { activo:['●','Activado'], desactivado:['◯','Desactivado'], borrador:['✎','Borrador'] };
  let draft = null, source = null, dirty = false, level = 'categorias', filter = 'todos';
  let categoryId = '', groupId = '', selected = null, search = '', dragId = null;
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const sid = (prefix) => prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  const status = (x) => STATUS[x?.estado] ? x.estado : /^(no|false)$/i.test(String(x?.activo)) ? 'desactivado' : 'activo';
  const ranks = (a,b) => (Number(a.orden)||0)-(Number(b.orden)||0);
  const cats = () => draft.categories;
  const services = () => draft.services;
  const category = (id) => cats().find((x)=>x.id === id);
  const service = (id) => services().find((x)=>x.id === id);
  const title = (v) => esc(v?.nombre || 'Sin nombre');
  const opts = (options,value) => options.map(([v,label])=>`<option value="${esc(v)}"${String(value)===v?' selected':''}>${esc(label)}</option>`).join('');
  const ensure = () => {
    if (draft && (dirty || source === A.data)) return;
    source = A.data;
    draft = {categories: copy(A.data.categories || []), services: copy(A.data.services || [])};
    // Solo para demostración; la base productiva siempre entrega Categorias.
    if (!draft.categories.length) draft.categories = ['Cejas','Pestañas','Faciales','Micropigmentación','Depilación'].map((nombre,i)=>({id:['cejas','pestanas','faciales','micropigmentacion','depilacion'][i],nombre,orden:i+1,estado:'activo'}));
    draft.services.forEach((s)=>{ if (!s.categoriaId) s.categoriaId = draft.categories.some(c=>c.id===s.id)?s.id:'otros'; });
  };
  const eligible = (s) => {
    if (level==='categorias') return cats();
    if (level==='servicios') return services().filter((x)=>!x.padreId && (!categoryId || x.categoriaId === categoryId));
    return services().filter((x)=>x.padreId && (!categoryId || x.categoriaId===categoryId) && (!groupId || x.padreId===groupId));
  };
  const items = () => eligible().slice().sort(ranks).filter((x)=>(filter==='todos'||status(x)===filter) && (!search || String(x.nombre).toLowerCase().includes(search)));
  const updateDirty = () => {
    dirty = true;
    $('cat-save').disabled = false;
    $('cat-discard').hidden = false;
    $('cat-save-state').textContent = 'Tienes cambios sin guardar. La web aún muestra la versión anterior.';
    $('cat-save-state').classList.add('is-dirty');
  };
  const resetBar = () => {
    dirty = false;
    $('cat-save').disabled = true;
    $('cat-discard').hidden = true;
    $('cat-save-state').textContent = 'Catálogo sincronizado con la web, PWA y apps.';
    $('cat-save-state').classList.remove('is-dirty');
  };
  const nForCat = (id) => services().filter(s=>s.categoriaId===id && s.tipo!=='grupo').length;
  function itemCard(x) {
    const isCat = level === 'categorias';
    const isGroup = x.tipo === 'grupo';
    const st = status(x), stLabel = STATUS[st][1];
    const id=esc(x.id), chosen=selected?.id===x.id && selected.kind===(isCat?'categoria':'servicio');
    const sub = isCat ? `${nForCat(x.id)} opciones · Explorar categoría` :
      isGroup ? `${services().filter(s=>s.padreId===x.id).length} subservicios · Ver opciones` :
      x.padreId ? `${Number(x.duracionMin)||30} min · RD$ ${Number(x.precioRD||0).toLocaleString('es-DO')}` :
      x.descripcion || `${Number(x.duracionMin)||30} min · RD$ ${Number(x.precioRD||0).toLocaleString('es-DO')}`;
    return `<article class="cat-item ${isCat?'category':'service'}${chosen?' is-chosen':''}" draggable="true" data-cat-id="${id}" data-cat-kind="${isCat?'categoria':'servicio'}">
      <button type="button" class="cat-item-main" data-cat-open="${id}" aria-label="${isCat?'Entrar a la categoría':isGroup?'Ver subservicios de':'Editar'} ${title(x)}">
        <span class="cat-mini">${isCat?'CATEGORÍA':isGroup?'SERVICIO CON OPCIONES':x.padreId?'SUBSERVICIO':'SERVICIO'}</span>
        <h3>${title(x)}</h3><p>${esc(sub)}</p>
      </button>
      <div class="cat-item-footer">
        <span class="cat-status" title="${stLabel}">${STATUS[st][0]} ${stLabel}</span>
        <div>
          <button type="button" data-cat-up="${id}" aria-label="Subir ${title(x)}">↑</button>
          <button type="button" data-cat-down="${id}" aria-label="Bajar ${title(x)}">↓</button>
          <button type="button" data-cat-edit="${id}" aria-label="Editar ${title(x)}">Editar</button>
        </div>
      </div></article>`;
  }
  function path() {
    const c=category(categoryId),g=service(groupId);
    $('cat-path').innerHTML = `<button type="button" data-cat-jump="categorias">Categorías</button>`
      + (level!=='categorias' ? `<span>/</span><button type="button" data-cat-jump="servicios">${esc(c?.nombre||'Todos los servicios')}</button>`:'')
      + (level==='subservicios'? `<span>/</span><span>${esc(g?.nombre||'Subservicios')}</span>`:'');
  }
  function list() {
    const scope = eligible();
    document.querySelectorAll('#cat-levels [data-cat-level]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.catLevel===level)));
    document.querySelectorAll('#cat-statuses [data-cat-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.catFilter===filter)));
    Object.keys({...STATUS,todos:1}).forEach(k=>{const node=document.querySelector(`[data-cat-count="${k}"]`);if(node)node.textContent=k==='todos'?scope.length:scope.filter(x=>status(x)===k).length;});
    path();
    const heading = level==='categorias' ? 'Categorías' : level==='servicios' ? 'Servicios'+(categoryId?` · ${category(categoryId)?.nombre||''}`:'') : 'Subservicios'+(groupId?` · ${service(groupId)?.nombre||''}`:'');
    $('cat-list-title').textContent=heading;
    $('cat-list-info').textContent=level==='categorias' ? 'Solo las categorías activadas aparecen en las reservas.' :
      level==='servicios' ? 'Abre un servicio para editar o administrar sus opciones.' : 'Elige una opción para editar su precio, tiempo y publicación.';
    $('cat-create').textContent = '+ Nueva '+ (level==='categorias'?'categoría':level==='servicios'?'servicio':'opción');
    $('cat-list').innerHTML = items().length ? items().map(itemCard).join('') : '<div class="cat-empty-list">No hay elementos con este filtro. Puedes crear uno nuevo.</div>';
  }
  function preview(x,kind) {
    const isCat=kind==='categoria';
    return `<div class="cat-live-preview ${isCat?'':'service'}" aria-label="Vista previa del elemento">
      <small>${isCat?'CATEGORÍA':x.tipo==='grupo'?'SERVICIO':'OPCIÓN RESERVABLE'}</small>
      <strong data-cat-preview-name>${title(x)}</strong>
      <p data-cat-preview-description>${esc(x.descripcion|| (isCat?'Explora nuestros tratamientos.':'Descripción del tratamiento'))}</p>
    </div>`;
  }
  function statusField(x) {
    return `<label>Estado de publicación
      <select name="estado">${opts([['activo','● Activado · visible'],['desactivado','◯ Desactivado · oculto'],['borrador','✎ Borrador · privado']],status(x))}</select>
    </label><p class="cat-editor-help">Solo los elementos activados aparecen en la web y la app. Sus categorías y servicios superiores también deben estar activados.</p>`;
  }
  function inspector() {
    const x = selected?.kind==='categoria' ? category(selected.id) : service(selected?.id);
    if(!x) {
      $('cat-inspector-title').textContent='Selecciona un elemento';
      $('cat-editor').innerHTML='<p class="cat-empty">Selecciona una tarjeta o crea una nueva para editar su contenido. Verás una vista previa de cómo luce para tus clientas.</p>';
      return;
    }
    const isCat=selected.kind==='categoria',group=x.tipo==='grupo',leaf=!isCat&&!group;
    $('cat-inspector-title').textContent= isCat?'Editar categoría':group?'Editar servicio':'Editar '+(x.padreId?'subservicio':'servicio');
    const categories= cats().slice().sort(ranks).map(c=>[c.id,c.nombre]);
    const parents= services().filter(s=>s.tipo==='grupo' && s.categoriaId===x.categoriaId && s.id!==x.id).map(s=>[s.id,s.nombre]);
    $('cat-editor').innerHTML=`${preview(x,selected.kind)}
      <form id="cat-form" class="cat-form" autocomplete="off">
        <label>Nombre <input name="nombre" required maxlength="80" value="${esc(x.nombre||'')}" placeholder="${isCat?'Ej. Cejas':group?'Ej. Estilos de cejas':'Ej. Orgánicas'}"></label>
        <label>Descripción breve <textarea name="descripcion" maxlength="500" rows="3" placeholder="Lo que verá tu clienta">${esc(x.descripcion||'')}</textarea></label>
        ${!isCat?`
          <label>Categoría
            <select name="categoriaId">${opts(categories,x.categoriaId)}</select>
          </label>
          ${leaf ? `<label>Dentro de un servicio
            <select name="padreId">${opts([['','Servicio independiente'],...parents],x.padreId||'')}</select></label>`:''}
          ${leaf ? `<div class="cat-two-col">
            <label>Duración (min)<input type="number" name="duracionMin" min="5" step="5" value="${esc(x.duracionMin??30)}"></label>
            <label>Precio RD$<input type="number" name="precioRD" min="0" step="1" value="${esc(x.precioRD??0)}"></label>
            <label>Depósito (%)<input type="number" name="depositoPct" min="0" max="100" step="1" value="${esc(x.depositoPct??50)}"></label>
            <label>Volver en días<input type="number" name="volverDias" min="0" value="${esc(x.volverDias??30)}"></label>
            <label>Retoque en días<input type="number" name="retoqueDias" min="0" value="${esc(x.retoqueDias??0)}"></label>
          </div>
          <label class="cat-check"><input type="checkbox" name="precioDesde" ${/^(si|sí|true)$/i.test(String(x.precioDesde))?'checked':''}> Mostrar «Desde» en el precio</label>
          <label class="cat-check"><input type="checkbox" name="consentimiento" ${/^(si|sí|true)$/i.test(String(x.consentimiento))?'checked':''}> Requiere consentimiento</label>` : ''}` : ''}
        ${statusField(x)}
      </form>
      <div class="cat-inspector-actions">
        ${isCat ? '<button type="button" data-cat-add="direct">+ Servicio</button><button type="button" data-cat-add="group">+ Servicio con opciones</button>' : group ? '<button type="button" data-cat-add="child">+ Subservicio</button>' : ''}
        <button type="button" data-cat-back>Volver</button>
      </div>`;
  }
  function render() {
    ensure();
    list();inspector();
    $('cat-search').value=search;
    $('cat-save-state').textContent=dirty?'Tienes cambios sin guardar. La web aún muestra la versión anterior.':'Catálogo sincronizado con la web, PWA y apps.';
    $('cat-save-state').classList.toggle('is-dirty',dirty);
    $('cat-save').disabled=!dirty;$('cat-discard').hidden=!dirty;
  }
  function choose(kind,id,open) {
    selected={kind,id};
    const x=kind==='categoria'?category(id):service(id);
    if(open && x) {
      if(kind==='categoria') {categoryId=id;groupId='';level='servicios';}
      else if(x.tipo==='grupo') {categoryId=x.categoriaId;groupId=id;level='subservicios';}
    }
    filter='todos';search='';
    render();
    if(window.innerWidth<1070) $('cat-inspector').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function make(kind) {
    let cat=categoryId || selected?.kind==='categoria'&&selected.id || cats()[0]?.id;
    if(kind==='categoria') {
      const x={id:sid('cat'), nombre:'Nueva categoría',descripcion:'',estado:'borrador',activo:'no',orden:cats().length+1};
      cats().push(x);level='categorias';selected={kind:'categoria',id:x.id};
    } else {
      if(!cat) {A.toast('Crea una categoría antes de añadir servicios.');return;}
      const parent=kind==='child' ? groupId || (selected?.kind==='servicio'&&service(selected.id)?.tipo==='grupo'?selected.id:'') : '';
      if(kind==='child'&&!parent) {A.toast('Selecciona un servicio con opciones para añadir un subservicio.');return;}
      const x={id:sid(kind==='group'?'grupo':kind==='child'?'sub':'svc'),nombre:kind==='group'?'Nuevo servicio con opciones':kind==='child'?'Nueva opción':'Nuevo servicio',
        categoriaId:cat,padreId:parent,tipo:kind==='group'?'grupo':'servicio',descripcion:'',estado:'borrador',activo:'no',
        duracionMin:30,precioRD:0,precioDesde:'no',depositoPct:50,volverDias:30,retoqueDias:0,consentimiento:'no',
        orden:services().filter(v=>v.categoriaId===cat&&v.padreId===parent).length+1};
      services().push(x);level=parent?'subservicios':'servicios';
      categoryId=cat;if(parent)groupId=parent;
      selected={kind:'servicio',id:x.id};
    }
    filter='todos';search='';updateDirty();render();
    $('cat-form [name=nombre]')?.focus();
  }
  function swap(id,direction) {
    const x=level==='categorias'?category(id):service(id);if(!x)return;
    const similar=eligible().slice().sort(ranks);
    const i=similar.findIndex(v=>v.id===id),j=i+direction;
    if(j<0||j>=similar.length)return;
    [similar[i],similar[j]]=[similar[j],similar[i]];
    similar.forEach((v,n)=>v.orden=n+1);
    updateDirty();list();
  }
  function reorder(srcId,destId) {
    if(srcId===destId)return;
    const similar=eligible().slice().sort(ranks);
    const i=similar.findIndex(x=>x.id===srcId),j=similar.findIndex(x=>x.id===destId);
    if(i<0||j<0)return;
    const [v]=similar.splice(i,1);similar.splice(j,0,v);
    similar.forEach((x,n)=>x.orden=n+1);
    updateDirty();list();
  }
  function changeField(el) {
    const x=selected?.kind==='categoria'?category(selected.id):service(selected?.id);
    if(!x || !el.name)return;
    const val=el.type==='checkbox'?(el.checked?'si':'no'):el.value;
    if(el.name==='categoriaId' && x.tipo==='grupo'){
      services().filter(s=>s.padreId===x.id).forEach(s=>s.categoriaId=val);
    }
    if(el.name==='categoriaId' && x.padreId && service(x.padreId)?.categoriaId!==val) x.padreId='';
    if(el.name==='padreId' && val) x.categoriaId=service(val)?.categoriaId||x.categoriaId;
    x[el.name]=val;
    if(el.name==='estado')x.activo=val==='activo'?'si':'no';
    updateDirty();
    if(el.name==='nombre') {
      const p=document.querySelector('[data-cat-preview-name]');if(p)p.textContent=val||'Sin nombre';
    }
    if(el.name==='descripcion'){
      const p=document.querySelector('[data-cat-preview-description]');if(p)p.textContent=val||'Descripción del tratamiento';
    }
  }
  async function save(btn) {
    const all=[...cats(),...services()];
    if(all.some(x=>!String(x.nombre||'').trim())){A.toast('Completa el nombre de cada elemento antes de guardar.');return;}
    if(services().some(s=>!category(s.categoriaId))) {A.toast('Hay servicios sin categoría válida.');return;}
    if(services().some(s=>s.padreId && (!service(s.padreId)||service(s.padreId)?.tipo!=='grupo'||service(s.padreId).categoriaId!==s.categoriaId))) {
      A.toast('Un subservicio debe pertenecer a un servicio de la misma categoría.');return;
    }
    const bad=services().find(s=>s.tipo!=='grupo' && status(s)==='activo' && (Number(s.duracionMin)<5||Number(s.precioRD)<0));
    if(bad){A.toast('Revisa la duración y el precio de '+bad.nombre);return;}
    await A.busy(btn,async()=> {
      try {
        // La API hace la operación en una transacción; no se borran IDs históricos.
        const res=await A.call('adminSaveSettings',{categories:cats(),services:services()});
        A.data=res; source=null;dirty=false;selected=null;
        ensure();resetBar();render();A.toast('Catálogo guardado. Los cambios están disponibles en web, PWA y apps.');
      } catch(e) {A.toast(e.message);}
    });
  }
  function onClick(e) {
    const button=e.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-cat-open')) {
      const id=button.dataset.catOpen;choose(level==='categorias'?'categoria':'servicio',id,true);return;
    }
    if(button.hasAttribute('data-cat-edit')) {choose(level==='categorias'?'categoria':'servicio',button.dataset.catEdit,false);return;}
    if(button.hasAttribute('data-cat-up')) {swap(button.dataset.catUp,-1);return;}
    if(button.hasAttribute('data-cat-down')) {swap(button.dataset.catDown,1);return;}
    if(button.hasAttribute('data-cat-back')) {selected=null;render();return;}
    if(button.hasAttribute('data-cat-add')){
      const k=button.dataset.catAdd;
      if(k==='direct'||k==='group'){if(selected?.kind==='categoria')categoryId=selected.id;make(k);}
      else make(k);
    }
  }
  A.sections.catalogo = {
    render,
    init() {
      $('cat-list').addEventListener('click',onClick);
      $('cat-editor').addEventListener('click',onClick);
      $('cat-create').addEventListener('click',()=>make(level==='categorias'?'categoria':level==='servicios'?'direct':'child'));
      $('cat-levels').addEventListener('click',(e)=>{
        const b=e.target.closest('[data-cat-level]');if(!b)return;level=b.dataset.catLevel;
        if(level==='categorias'){categoryId='';groupId='';}
        if(level==='servicios')groupId='';
        selected=null;filter='todos';search='';render();
      });
      $('cat-statuses').addEventListener('click',(e)=>{const b=e.target.closest('[data-cat-filter]');if(!b)return;filter=b.dataset.catFilter;list();});
      $('cat-path').addEventListener('click',(e)=>{const b=e.target.closest('[data-cat-jump]');if(!b)return;level=b.dataset.catJump;if(level==='categorias'){categoryId='';groupId='';}else groupId='';selected=null;filter='todos';search='';render();});
      $('cat-search').addEventListener('input',e=>{search=e.target.value.trim().toLowerCase();list();});
      $('cat-editor').addEventListener('input',e=>{const el=e.target.closest('#cat-form [name]');if(el && el.tagName!=='SELECT')changeField(el);});
      $('cat-editor').addEventListener('change',e=>{const el=e.target.closest('#cat-form [name]');if(!el)return;changeField(el);render();});
      $('cat-save').addEventListener('click',e=>save(e.currentTarget));
      $('cat-discard').addEventListener('click',()=>{
        if(!confirm('¿Descartar los cambios que aún no guardaste?'))return;
        dirty=false;source=null;selected=null;ensure();render();resetBar();
      });
      $('cat-list').addEventListener('dragstart',e=>{
        const card=e.target.closest('[data-cat-id]');if(!card)return;
        dragId=card.dataset.catId;card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragId);
      });
      $('cat-list').addEventListener('dragover',e=>{
        const card=e.target.closest('[data-cat-id]');if(!card||!dragId)return;
        e.preventDefault();e.dataTransfer.dropEffect='move';card.classList.add('is-drop-target');
      });
      $('cat-list').addEventListener('dragleave',e=>e.target.closest('[data-cat-id]')?.classList.remove('is-drop-target'));
      $('cat-list').addEventListener('drop',e=>{
        const card=e.target.closest('[data-cat-id]');if(!card||!dragId)return;
        e.preventDefault();reorder(dragId,card.dataset.catId);dragId=null;
      });
      $('cat-list').addEventListener('dragend',()=>{dragId=null;$('cat-list').querySelectorAll('.is-dragging,.is-drop-target').forEach(el=>el.classList.remove('is-dragging','is-drop-target'));});
      window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
    },
  };
})(window.MJB);
