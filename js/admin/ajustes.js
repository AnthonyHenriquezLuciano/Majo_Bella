/* MAJOBELLA · Dashboard: Ajustes
   Configuración del negocio. El catálogo vive en el menú Servicios. */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const DAYS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];
  const DAY_KEYS = ['horario_domingo', 'horario_lunes', 'horario_martes', 'horario_miercoles', 'horario_jueves', 'horario_viernes', 'horario_sabado'];
  const GROUPS = [
    ['Reservas y pagos', [
      ['tasaUSDModo', '¿Cómo actualizar el dólar?', '', 'select:manual,automatico'],
      ['tasaUSD', 'Tasa usada para convertir cobros a dólares', 'RD$/USD', 'number'],
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
  const HELP = {
    tasaUSDModo:'Automático consulta una referencia internacional aproximadamente una vez al día. Si falla o varía más de 3 %, conserva la última tasa y genera un aviso.',
    tasaUSD:'La web cobra en USD y muestra el equivalente. Es una tasa indicativa, NO la tasa oficial de venta del BCRD ni el tipo de cambio que aplica PayPal.',
    horasCancelacion:'Una clienta que cancela antes de este límite puede recuperar el depósito según la política del estudio.',
    minutosRetencion:'Evita que dos clientas reserven el mismo horario mientras una está pagando.',
    minAntelacionHoras:'Tiempo de preparación antes de una cita nueva.',
    maxDiasAdelante:'Cuántos días del calendario puedes ofrecer.',
    intervaloMinutos:'Distancia entre los horarios de inicio disponibles; no cambia la duración de un servicio.',
    cambiosMax:'Límite de cambios de fecha que la clienta puede realizar sin asistencia.',
    correoAvisos:'Aquí llegan las confirmaciones y alertas del estudio.',
    calendarioId:'Usa "primary" para el calendario principal. Requiere vincular Google Calendar; vacío lo desactiva.',
    invitarClienta:'Envía a la clienta una invitación de su cita.',
    direccion:'Aparece en las confirmaciones y enlaces de agenda.',
    mapsUrl:'Enlace para que la clienta abra la ubicación.',
    whatsapp:'Incluye el código de país y solo números.',
    webUrl:'Se utiliza en correos y enlaces de confirmación.',
    negocioNombre:'Nombre comercial visible en tus documentos.',
    negocioRnc:'Dato fiscal opcional. No genera comprobantes fiscales NCF por sí solo.',
    negocioCorreo:'Contacto para privacidad, condiciones y datos personales.',
    comisionPaypalPct:'Porcentaje orientativo. El importe real de la comisión se confirma en la cuenta PayPal.',
    comisionPaypalFijoUSD:'Cargo fijo estimado por operación PayPal.',
    conversionPct:'Costo estimado de conversión al retirar USD; puede cambiar en PayPal.'
  };
  const GROUP_HELP = {
    'Reservas y pagos':'Configura cómo se cobra y cuándo se puede reservar o cancelar.',
    'Avisos y calendario':'Notificaciones y eventos que se envían automáticamente.',
    'Datos del estudio':'Información pública que verán tus clientas.',
    'Datos del negocio (términos y privacidad)':'Datos utilizados en las políticas y comprobantes.',
    'Comisiones (para la ganancia real)':'Estimaciones para reportes: no sustituyen el estado real de PayPal.'
  };
  A.settingsGroups = GROUPS;
  let closed = [];

  function field([key, label, unit, type], value) {
    let input;
    if (type.startsWith('select:')) {
      const opts = type.slice(7).split(',');
      input = `<select name="${key}">${opts.map((o) => `<option value="${o}"${String(value) === o ? ' selected' : ''}>${o === 'si' ? 'Sí' : o === 'no' ? 'No' : o === 'automatico' ? 'Automático · recomendado' : o === 'manual' ? 'Manual' : o}</option>`).join('')}</select>`;
    } else {
      input = `<input name="${key}" type="${type === 'number' ? 'number' : type}" ${type === 'number' ? 'step="any" min="0"' : ''} value="${esc(value ?? '')}">`;
    }
    return `<label class="set set-explained"><span class="set-l">${label}</span><span class="set-i">${input}${unit ? `<em>${unit}</em>` : ''}</span><small class="set-help">${esc(HELP[key] || '')}</small></label>`;
  }

  function render() {
    const s = A.settingsMap();
    $('aj-general').innerHTML = `<div class="aj-welcome"><span>CONFIGURACIÓN INTELIGENTE</span><h3>Tu estudio, sin complicaciones.</h3><p>Los ajustes esenciales están primero. Abre solo la categoría que deseas modificar; guarda al terminar.</p></div>`+
      GROUPS.map(([title, fields], index) => `<details class="aj-accordion" ${index === 0 ? 'open' : ''}><summary><span><strong>${esc(title === 'Comisiones (para la ganancia real)' ? 'Comisiones estimadas' : title)}</strong><small>${esc(GROUP_HELP[title])}</small></span><span class="aj-chevron" aria-hidden="true">⌄</span></summary><fieldset class="aj-group">${fields.map((f) => field(f, s[f[0]])).join('')}${index === 0 ? `<div class="aj-fx-status" role="status"><strong>Referencia USD/DOP:</strong> ${s.tasaUSDActualizada ? `última cotización ${esc(String(s.tasaUSDActualizada).replace('T',' ').slice(0,16))} UTC` : 'sin actualizaciones automáticas todavía'} · <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a><br><small>Fuente de mercado informativa, no tasa oficial del Banco Central ni liquidación PayPal. Las órdenes creadas no cambian de precio.</small></div>` : ''}</fieldset></details>`).join('');
    const mode = $('aj-general').querySelector('[name=tasaUSDModo]');
    const rate = $('aj-general').querySelector('[name=tasaUSD]');
    const update = () => { rate.disabled = mode.value === 'automatico'; rate.closest('.set').classList.toggle('is-automatic',rate.disabled); };
    mode.addEventListener('change', update);
    update();

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

  }

  function renderClosed() {
    $('aj-closed').innerHTML = closed.length ? closed.map((d) => `<span class="dchip">${A.shortDate(d)}<button type="button" data-closed-del="${d}" aria-label="Quitar ${d}">×</button></span>`).join('') : '<span class="muted">Ninguno</span>';
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
    await A.busy(btn, async () => {
      try {
        const res = await A.call('adminSaveSettings', { settings });
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

    },
  };
})(window.MJB);
