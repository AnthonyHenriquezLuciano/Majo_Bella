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
    ]],
    ['Avisos y calendario', [
      ['correoAvisos', 'Correo que recibe las nuevas reservas', '', 'email'],
      ['calendarioId', 'Calendario de Google ("primary" = el principal; vacío = no usar)', '', 'text'],
      ['invitarClienta', 'Enviar invitación de calendario a la clienta', '', 'select:si,no'],
    ]],
    ['Datos del estudio', [
      ['direccion', 'Dirección (correos y calendario)', '', 'text'],
      ['mapsUrl', 'Enlace de Google Maps', '', 'url'],
      ['webUrl', 'Dirección de la web', '', 'url'],
    ]],
    ['Comisiones (para la ganancia real)', [
      ['comisionPaypalPct', 'Comisión de PayPal por cobro', '%', 'number'],
      ['comisionPaypalFijoUSD', 'Cargo fijo de PayPal por cobro', 'US$', 'number'],
      ['conversionPct', 'Pérdida al convertir dólares a pesos', '%', 'number'],
    ]],
  ];
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

    $('aj-services').innerHTML = (A.data.services || []).map((sv) => serviceRow(sv)).join('');
  }

  function renderClosed() {
    $('aj-closed').innerHTML = closed.length ? closed.map((d) => `<span class="dchip">${A.shortDate(d)}<button type="button" data-closed-del="${d}" aria-label="Quitar ${d}">×</button></span>`).join('') : '<span class="muted">Ninguno</span>';
  }

  function serviceRow(sv) {
    return `<tr data-id="${esc(sv.id || '')}">
      <td><input name="nombre" value="${esc(sv.nombre || '')}" aria-label="Nombre" placeholder="Nombre del servicio"></td>
      <td><input name="duracionMin" type="number" min="5" step="5" value="${esc(sv.duracionMin || 30)}" aria-label="Duración en minutos"></td>
      <td><input name="precioRD" type="number" min="0" step="50" value="${esc(sv.precioRD || 0)}" aria-label="Precio"></td>
      <td class="c"><input name="precioDesde" type="checkbox" ${/^s[ií]$/i.test(sv.precioDesde) ? 'checked' : ''} aria-label="Precio desde"></td>
      <td><input name="depositoPct" type="number" min="0" max="100" step="5" value="${esc(sv.depositoPct === undefined || sv.depositoPct === '' ? (A.settingsMap().porcentajeDeposito || 50) : sv.depositoPct)}" aria-label="Depósito para apartar (%)"></td>
      <td><input name="volverDias" type="number" min="0" step="1" value="${esc(sv.volverDias || 0)}" aria-label="Vuelve cada (días)"></td>
      <td class="c"><input name="activo" type="checkbox" ${/^no$/i.test(sv.activo) ? '' : 'checked'} aria-label="Activo"></td>
    </tr>`;
  }

  async function save(btn) {
    const settings = {};
    $('aj-general').querySelectorAll('[name]').forEach((i) => { settings[i.name] = i.value.trim(); });
    $('aj-hours').querySelectorAll('.hrow').forEach((row) => {
      const dow = Number(row.dataset.dow);
      settings[DAY_KEYS[dow]] = row.querySelector('[data-open]').checked ? `${row.querySelector('[data-from]').value}-${row.querySelector('[data-to]').value}` : 'cerrado';
    });
    settings.diasCerrados = closed.join(', ');
    const services = [...$('aj-services').querySelectorAll('tr')].map((tr) => ({
      id: tr.dataset.id, nombre: tr.querySelector('[name=nombre]').value.trim(),
      duracionMin: tr.querySelector('[name=duracionMin]').value, precioRD: tr.querySelector('[name=precioRD]').value,
      precioDesde: tr.querySelector('[name=precioDesde]').checked ? 'si' : 'no', volverDias: tr.querySelector('[name=volverDias]').value,
      depositoPct: tr.querySelector('[name=depositoPct]').value,
      activo: tr.querySelector('[name=activo]').checked ? 'si' : 'no',
    })).filter((x) => x.nombre);
    await A.busy(btn, async () => {
      try {
        const res = await A.call('adminSaveSettings', { settings, services });
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
      $('aj-svc-add').addEventListener('click', () => {
        $('aj-services').insertAdjacentHTML('beforeend', serviceRow({ duracionMin: 60, precioRD: 0, volverDias: 30, depositoPct: 50, activo: 'si' }));
        $('aj-services').lastElementChild.querySelector('input').focus();
      });
    },
  };
})(window.MJB);
