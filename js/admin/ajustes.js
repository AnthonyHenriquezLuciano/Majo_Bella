/* MAJOBELLA · Dashboard: Ajustes
   Lo mismo que la pestaña "Ajustes" y "Servicios" de la hoja, editable desde aquí. */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const DAYS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];
  const DAY_KEYS = ['horario_domingo', 'horario_lunes', 'horario_martes', 'horario_miercoles', 'horario_jueves', 'horario_viernes', 'horario_sabado'];
  const GROUPS = [
    ['Reservas y pagos', [
      ['tasaUSD', 'Tasa del dólar (RD$ por US$ 1)', 'RD$', 'number'],
      ['horasCancelacion', 'Reembolso si cancela con al menos', 'horas', 'number'],
      ['minutosRetencion', 'Minutos para pagar antes de liberar el horario', 'min', 'number'],
      ['minAntelacionHoras', 'Antelación mínima para reservar', 'horas', 'number'],
      ['maxDiasAdelante', 'Se puede reservar hasta', 'días', 'number'],
      ['intervaloMinutos', 'Las citas empiezan cada', 'min', 'select:15,20,30,45,60'],
      ['cambiosMax', 'Veces que la clienta puede cambiar la fecha ella misma (0 = solo por WhatsApp)', 'veces', 'number'],
    ]],
    ['Avisos y calendario', [
      ['correoAvisos', 'Correo que recibe las nuevas reservas', '', 'email'],
      ['calendarioId', 'Calendario de Google ("primary" = el principal; vacío = no usar)', '', 'text'],
      ['invitarClienta', 'Enviar invitación de calendario a la clienta', '', 'select:si,no'],
    ]],
    ['Datos del estudio', [
      ['direccion', 'Dirección (correos y calendario)', '', 'text'],
      ['mapsUrl', 'Enlace de Google Maps', '', 'url'],
      ['whatsapp', 'WhatsApp para los correos (con 1, solo números)', '', 'text'],
      ['webUrl', 'Dirección de la web', '', 'url'],
    ]],
    ['Datos del negocio (términos y privacidad)', [
      ['negocioNombre', 'Nombre legal o comercial', '', 'text'],
      ['negocioRnc', 'RNC o cédula (opcional)', '', 'text'],
      ['negocioCorreo', 'Correo para temas legales y datos personales', '', 'email'],
    ]],
    ['Comisiones (para la ganancia real)', [
      ['comisionPaypalPct', 'Comisión de PayPal por cobro', '%', 'number'],
      ['comisionPaypalFijoUSD', 'Cargo fijo de PayPal por cobro', 'US$', 'number'],
      ['conversionPct', 'Pérdida al convertir dólares a pesos', '%', 'number'],
    ]],
  ];
  A.settingsGroups = GROUPS;
  let closed = [];

  function field([key, label, unit, type], value) {
    let input;
    if (type.startsWith('select:')) {
      const opts = type.slice(7).split(',');
      input = `<select name="${key}">${opts.map((o) => `<option value="${o}"${String(value) === o ? ' selected' : ''}>${o === 'si' ? 'Sí' : o === 'no' ? 'No' : o}</option>`).join('')}</select>`;
    } else {
      input = `<input name="${key}" type="${type === 'number' ? 'number' : type}" ${type === 'number' ? 'step="any" min="0"' : ''} value="${esc(value || '')}">`;
    }
    return `<label class="set"><span class="set-l">${label}</span><span class="set-i">${input}${unit ? `<em>${unit}</em>` : ''}</span></label>`;
  }

  function render() {
    const s = A.settingsMap();
    $('aj-general').innerHTML = GROUPS.map(([title, fields]) => `<fieldset class="aj-group"><legend>${title}</legend>${fields.map((f) => field(f, s[f[0]])).join('')}</fieldset>`).join('');

    $('aj-hours').innerHTML = DAYS.map(([dow, name]) => {
      const m = String(s[DAY_KEYS[dow]] || '').match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      const open = !!m;
      const pad = (h) => String(h).padStart(2, '0');
      return `<div class="hrow" data-dow="${dow}">
        <label class="chk"><input type="checkbox" data-open ${open ? 'checked' : ''}><span>${name}</span></label>
        <input type="time" data-from value="${m ? `${pad(m[1])}:${m[2]}` : '10:00'}" ${open ? '' : 'disabled'} aria-label="${name}: abre">
        <span>a</span>
        <input type="time" data-to value="${m ? `${pad(m[3])}:${m[4]}` : '17:00'}" ${open ? '' : 'disabled'} aria-label="${name}: cierra">
        ${open ? '' : '<span class="muted">Cerrado</span>'}
      </div>`;
    }).join('');

    closed = String(s.diasCerrados || '').split(',').map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
    renderClosed();

    renderCatalog();
  }

  function renderClosed() {
    $('aj-closed').innerHTML = closed.length ? closed.map((d) => `<span class="dchip">${A.shortDate(d)}<button type="button" data-closed-del="${d}" aria-label="Quitar ${d}">×</button></span>`).join('') : '<span class="muted">Ninguno</span>';
  }


  const newId = (prefix) => prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const checked = (v) => /^s[ií]$/i.test(String(v)) ? 'checked' : '';
  const enabled = (v) => /^no$/i.test(String(v)) ? '' : 'checked';

  function serviceEditor(sv, catId, parentId = '') {
    const group = sv.tipo === 'grupo';
    const id = esc(sv.id || newId('servicio'));
    const name = esc(sv.nombre || '');
    const desc = esc(sv.descripcion || '');
    const children = (A.data.services || []).filter((s) => s.padreId === sv.id);
    return `<details class="aj-svc-editor" data-id="${id}" data-tipo="${group ? 'grupo' : 'servicio'}" data-padre="${esc(parentId)}" open>
      <summary><span data-svc-title>${name || (group ? 'Nuevo servicio con opciones' : 'Nuevo servicio')}</span>
        <small>${group ? 'Servicio · despliega opciones' : parentId ? 'Subservicio · reservable' : 'Servicio directo · reservable'}</small></summary>
      <div class="aj-svc-body">
        <div class="aj-svc-fields">
          <label class="wide">Nombre<input name="nombre" value="${name}" maxlength="80" placeholder="${group ? 'Estilos de cejas' : 'Nombre del tratamiento'}"></label>
          <label class="wide">Descripción<textarea name="descripcion" rows="2" maxlength="500">${desc}</textarea></label>
          ${group ? '' : `
          <label>Duración (min)<input name="duracionMin" type="number" min="5" step="5" value="${esc(sv.duracionMin ?? 30)}"></label>
          <label>Precio (RD$)<input name="precioRD" type="number" min="0" step="50" value="${esc(sv.precioRD ?? 0)}"></label>
          <label>Depósito (%)<input name="depositoPct" type="number" min="0" max="100" value="${esc(sv.depositoPct ?? 50)}"></label>
          <label>Vuelve en (días)<input name="volverDias" type="number" min="0" value="${esc(sv.volverDias ?? 30)}"></label>
          <label>Retoque (días)<input name="retoqueDias" type="number" min="0" value="${esc(sv.retoqueDias ?? 0)}"></label>
          <label class="switch"><input name="precioDesde" type="checkbox" ${checked(sv.precioDesde)}> Precio «desde»</label>
          <label class="switch wide"><input name="consentimiento" type="checkbox" ${checked(sv.consentimiento)}> Solicitar consentimiento</label>`}
          <label class="switch wide"><input name="activo" type="checkbox" ${enabled(sv.activo)}> Visible y activo</label>
        </div>
        <div class="aj-svc-actions"><button type="button" data-svc-up>Subir</button><button type="button" data-svc-down>Bajar</button></div>
        ${group ? `<div class="aj-svc-children">${children.map((child) => serviceEditor(child, catId, id)).join('')}</div>
          <div class="aj-svc-actions"><button type="button" data-add-child>Añadir subservicio</button></div>` : ''}
      </div>
    </details>`;
  }

  function categoryCard(cat) {
    const id = esc(cat.id || newId('cat'));
    const items = (A.data.services || []).filter((s) => (s.categoriaId || (s.id === id ? id : 'otros')) === id);
    const groups = items.filter((s) => s.tipo === 'grupo');
    const direct = items.filter((s) => s.tipo !== 'grupo' && (!s.padreId || !groups.some((g) => g.id === s.padreId)));
    const count = items.filter((s) => s.tipo !== 'grupo').length;
    return `<article class="aj-cat" data-id="${id}">
      <div class="aj-cat-cover">
        <p>MAJOBELLA · ${count} ${count === 1 ? 'opción' : 'opciones'}</p>
        <h3 data-cat-title>${esc(cat.nombre || 'Nueva categoría')}</h3>
        <button type="button" data-cat-open aria-expanded="false">Administrar categoría</button>
      </div>
      <div class="aj-cat-editor" hidden>
        <div class="aj-cat-fields">
          <label>Nombre de la categoría<input name="nombre" value="${esc(cat.nombre || '')}" maxlength="80" placeholder="Cejas, pestañas, faciales…"></label>
          <label><span><input type="checkbox" name="activo" ${enabled(cat.activo)}> Publicada</span></label>
        </div>
        <div class="aj-cat-actions"><button type="button" data-cat-up>Subir</button><button type="button" data-cat-down>Bajar</button></div>
        <h4>Servicios y subservicios</h4>
        <div class="aj-cat-groups">${groups.map((g) => serviceEditor(g, id)).join('')}</div>
        <div class="aj-cat-direct">${direct.map((sv) => serviceEditor(sv, id)).join('')}</div>
        <div class="aj-cat-actions"><button type="button" data-add-direct>Añadir servicio directo</button>
          <button type="button" data-add-group>Nuevo servicio con subservicios</button></div>
      </div>
    </article>`;
  }

  function renderCatalog() {
    let cats = A.data.categories || [];
    if (!cats.length) { // Compatibilidad con los datos de demostración.
      const labels = { cejas: 'Cejas', pestanas: 'Pestañas', faciales: 'Faciales', micropigmentacion: 'Micropigmentación', depilacion: 'Depilación' };
      cats = Object.keys(labels).map((id, orden) => ({ id, nombre: labels[id], orden, activo: 'si' }));
    }
    $('aj-services').innerHTML = cats.slice().sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0)).map(categoryCard).join('');
  }

  function fieldValue(node, key) { return node.querySelector(`[name="${key}"]`)?.value?.trim() || ''; }
  function fieldCheck(node, key) { return node.querySelector(`[name="${key}"]`)?.checked ? 'si' : 'no'; }
  function catalogDraft() {
    const cats = [...$('aj-services').querySelectorAll('.aj-cat')];
    const categories = cats.map((node, i) => ({
      id: node.dataset.id, nombre: fieldValue(node.querySelector('.aj-cat-fields'), 'nombre'),
      orden: i + 1, activo: fieldCheck(node.querySelector('.aj-cat-fields'), 'activo'),
    }));
    const services = cats.flatMap((cat) => [...cat.querySelectorAll('.aj-svc-editor')].map((node, i) => {
      const fields = node.querySelector('.aj-svc-fields');
      return {
        id: node.dataset.id, categoriaId: cat.dataset.id, padreId: node.dataset.padre || '',
        tipo: node.dataset.tipo, orden: i + 1,
        nombre: fieldValue(fields, 'nombre'), descripcion: fieldValue(fields, 'descripcion'),
        duracionMin: fieldValue(fields, 'duracionMin') || '30',
        precioRD: fieldValue(fields, 'precioRD') || '0',
        precioDesde: fieldCheck(fields, 'precioDesde'),
        depositoPct: fieldValue(fields, 'depositoPct') || '0',
        volverDias: fieldValue(fields, 'volverDias') || '0',
        retoqueDias: fieldValue(fields, 'retoqueDias') || '0',
        consentimiento: fieldCheck(fields, 'consentimiento'),
        activo: fieldCheck(fields, 'activo'),
      };
    }));
    return { categories, services };
  }

  function move(node, way) {
    if (way < 0 && node.previousElementSibling) node.parentElement.insertBefore(node, node.previousElementSibling);
    if (way > 0 && node.nextElementSibling) node.parentElement.insertBefore(node.nextElementSibling, node);
  }

  async function save(btn) {
    const settings = {};
    $('aj-general').querySelectorAll('[name]').forEach((i) => { settings[i.name] = i.value.trim(); });
    document.querySelectorAll('#aj-extra [data-set]').forEach((i) => { settings[i.name] = i.value.trim(); });
    $('aj-hours').querySelectorAll('.hrow').forEach((row) => {
      const dow = Number(row.dataset.dow);
      settings[DAY_KEYS[dow]] = row.querySelector('[data-open]').checked ? `${row.querySelector('[data-from]').value}-${row.querySelector('[data-to]').value}` : 'cerrado';
    });
    settings.diasCerrados = closed.join(', ');
    const { categories, services } = catalogDraft();
    if (categories.some((c) => !c.nombre) || services.some((v) => !v.nombre)) {
      A.toast('Asigna un nombre a cada categoría, servicio y subservicio antes de guardar.');
      return;
    }
    await A.busy(btn, async () => {
      try {
        const res = await A.call('adminSaveSettings', { settings, categories, services });
        A.data = res;
        M.config.schedule.hours = res.schedule.hours;
        M.config.schedule.blockedDates = res.schedule.blocked || [];
        render();
        A.toast('Ajustes guardados. La web ya usa los nuevos valores.');
      } catch (err) { A.toast(err.message); }
    });
  }

  A.sections.ajustes = {
    render,
    init() {
      $('aj-save').addEventListener('click', (e) => save(e.currentTarget));
      $('aj-hours').addEventListener('change', (e) => {
        if (!e.target.matches('[data-open]')) return;
        const row = e.target.closest('.hrow');
        row.querySelectorAll('input[type=time]').forEach((i) => { i.disabled = !e.target.checked; });
        const tag = row.querySelector('.muted');
        if (e.target.checked && tag) tag.remove();
        if (!e.target.checked && !tag) row.insertAdjacentHTML('beforeend', '<span class="muted">Cerrado</span>');
      });
      $('aj-closed-add').addEventListener('click', () => {
        const v = $('aj-closed-date').value;
        if (v && !closed.includes(v)) { closed.push(v); closed.sort(); renderClosed(); }
        $('aj-closed-date').value = '';
      });
      $('aj-closed').addEventListener('click', (e) => {
        const b = e.target.closest('[data-closed-del]');
        if (b) { closed = closed.filter((d) => d !== b.dataset.closedDel); renderClosed(); }
      });
      $('aj-cat-add').addEventListener('click', () => {
        $('aj-services').insertAdjacentHTML('beforeend', categoryCard({ id: newId('cat'), nombre: '', activo: 'si' }));
        const el = $('aj-services').lastElementChild;
        el.querySelector('[data-cat-open]').click();
        el.querySelector('.aj-cat-fields [name=nombre]').focus();
      });
      $('aj-services').addEventListener('input', (e) => {
        const cat = e.target.closest('.aj-cat');
        if (cat && e.target.matches('.aj-cat-fields [name=nombre]'))
          cat.querySelector('[data-cat-title]').textContent = e.target.value || 'Nueva categoría';
        const svc = e.target.closest('.aj-svc-editor');
        if (svc && e.target.matches('.aj-svc-fields [name=nombre]'))
          svc.querySelector('[data-svc-title]').textContent = e.target.value || 'Nuevo servicio';
      });
      $('aj-services').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const cat = btn.closest('.aj-cat'), svc = btn.closest('.aj-svc-editor');
        if (!cat) return;
        if (btn.hasAttribute('data-cat-open')) {
          const panel = cat.querySelector('.aj-cat-editor');
          panel.hidden = !panel.hidden;
          btn.setAttribute('aria-expanded', String(!panel.hidden));
        } else if (btn.hasAttribute('data-cat-up')) move(cat, -1);
        else if (btn.hasAttribute('data-cat-down')) move(cat, 1);
        else if (btn.hasAttribute('data-svc-up') && svc) move(svc, -1);
        else if (btn.hasAttribute('data-svc-down') && svc) move(svc, 1);
        else if (btn.hasAttribute('data-add-direct')) {
          cat.querySelector('.aj-cat-direct').insertAdjacentHTML('beforeend', serviceEditor({ id: newId('svc'), activo: 'si' }, cat.dataset.id));
        } else if (btn.hasAttribute('data-add-group')) {
          cat.querySelector('.aj-cat-groups').insertAdjacentHTML('beforeend', serviceEditor({ id: newId('grupo'), tipo: 'grupo', activo: 'si' }, cat.dataset.id));
        } else if (btn.hasAttribute('data-add-child') && svc) {
          svc.querySelector('.aj-svc-children').insertAdjacentHTML('beforeend', serviceEditor({ id: newId('sub'), activo: 'si' }, cat.dataset.id, svc.dataset.id));
        }
      });
    },
  };
})(window.MJB);
