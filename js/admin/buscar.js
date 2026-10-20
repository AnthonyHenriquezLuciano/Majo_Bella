/* MAJOBELLA · Dashboard: buscador (Ctrl K o el botón "Buscar")
   Encuentra secciones, opciones de Ajustes, acciones ("Nueva cita", "Vender tarjeta"…),
   clientas (por nombre, teléfono o correo) y códigos (promociones, tarjetas y paquetes). */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const SECTIONS = [
    ['agenda', 'Agenda', 'citas reservas calendario dia semana mes pendientes transferencias'],
    ['clientas', 'Clientas', 'fichas por volver retoques cumpleanos origen pagos sin completar'],
    ['dinero', 'Dinero', 'caja cierre ganancia ingresos gastos reporte pdf'],
    ['promos', 'Promociones', 'descuentos codigos tarjetas de regalo paquetes fidelidad premio'],
    ['web', 'Web', 'galeria resenas google anuncio franja conoce a majo'],
    ['correos', 'Correos', 'automaticos recordatorio consentimiento historial vista previa'],
    ['ajustes', 'Ajustes', 'configuracion negocio horario servicios precios deposito transferencias cuentas seguridad avisos'],
  ];
  const NAMES = Object.fromEntries(SECTIONS.map(([k, l]) => [k, l]));

  // Acciones: [texto, sección, id del botón que se pulsa, palabras extra]
  const ACTIONS = [
    ['Nueva cita', 'agenda', 'ag-new', 'agendar reservar crear cita'],
    ['Lista de espera', 'agenda', 'ag-wait', 'espera'],
    ['Bloqueos (vacaciones o pausas)', 'agenda', 'ag-blocks', 'bloquear vacaciones cerrar horas'],
    ['Agregar un gasto', 'dinero', null, 'gasto compra pigmentos alquiler', '#mn-exp-form'],
    ['Descargar reporte PDF del mes', 'dinero', 'mn-pdf', 'reporte pdf contabilidad'],
    ['Nueva promoción o código', 'promos', 'pr-new', 'descuento oferta cupon'],
    ['Vender tarjeta de regalo', 'promos', 'gf-new', 'regalo gift'],
    ['Nuevo paquete de sesiones', 'promos', 'pk-new', 'paquete bono'],
    ['Vender paquete', 'promos', 'bn-new', 'paquete bono'],
    ['Añadir reseña de Google', 'web', 'wb-rev-new', 'resena opinion estrellas'],
    ['Revisar correos automáticos ahora', 'correos', 'ml-run', 'enviar recordatorios'],
    ['Añadir servicio', 'ajustes', 'aj-svc-add', 'servicio precio duracion'],
    ['Añadir cuenta para transferencias', 'ajustes', 'aj-acc-add', 'banco cuenta transferencia'],
    ['Días cerrados (feriados)', 'ajustes', null, 'feriado cerrado libre', '#aj-p-hours'],
    ['Horario del estudio', 'ajustes', null, 'horario abre cierra', '#aj-p-hours'],
    ['Avisos del sistema', 'ajustes', null, 'errores fallos alertas', '#aj-errors-panel'],
    ['Seguridad', 'ajustes', null, 'seguridad acceso turnstile robots', '#aj-security-panel'],
  ];

  function entries() {
    const out = [];
    SECTIONS.forEach(([sec, label, kw]) => out.push({ kind: 'Sección', label, sub: '', hay: `${label} ${kw}`, run: () => A.go(sec) }));
    ACTIONS.forEach(([label, sec, btn, kw, anchor]) => out.push({
      kind: 'Acción', label, sub: NAMES[sec], hay: `${label} ${kw}`,
      run: () => { A.go(sec); setTimeout(() => { if (btn && $(btn)) $(btn).click(); else if (anchor) flash(document.querySelector(anchor)); }, 60); },
    }));
    // Títulos de cada panel (se indexan solos: si se añade un panel aparece aquí)
    document.querySelectorAll('#ad-main [data-section]').forEach((secEl) => {
      const sec = secEl.dataset.section;
      secEl.querySelectorAll('.panel-head h2, .block-h').forEach((h) => {
        const label = h.textContent.trim();
        if (!label) return;
        out.push({ kind: 'Apartado', label: A.cap(label.toLowerCase()), sub: NAMES[sec], hay: label, run: () => { A.go(sec); setTimeout(() => flash(h.closest('.ad-panel, .ad-block') || h), 60); } });
      });
    });
    // Cada opción de Ajustes
    (A.settingsGroups || []).forEach(([group, fields]) => fields.forEach(([key, label]) => out.push({
      kind: 'Ajuste', label, sub: `Ajustes · ${group}`, hay: `${label} ${group} ${key}`,
      run: () => { A.go('ajustes'); setTimeout(() => { const i = document.querySelector(`#aj-general [name="${key}"]`); if (i) { flash(i.closest('.set') || i); i.focus({ preventScroll: true }); } }, 80); },
    })));
    if (!A.data) return out;
    // Clientas
    try {
      A.clientsIndex().forEach((c) => out.push({
        kind: 'Clienta', label: c.name, sub: [c.phone, c.email].filter(Boolean).join(' · '),
        hay: `${c.name} ${c.phone} ${String(c.phone || '').replace(/\D/g, '')} ${c.email}`, client: true,
        run: () => { A.go('clientas'); setTimeout(() => A.openClient(c.key), 60); },
      }));
    } catch (e) { /* sin clientas */ }
    // Códigos
    const code = (codigo, label, sub) => out.push({ kind: 'Código', label: `${codigo} · ${label}`, sub, hay: `${codigo} ${label} ${sub}`, code: true, run: () => goCode(codigo) });
    (A.data.promos || []).filter((p) => p.codigo).forEach((p) => code(p.codigo, p.nombre || 'Promoción', 'Promoción'));
    (A.data.gifts || []).forEach((g) => code(g.codigo, g.para || g.comprador || 'Tarjeta de regalo', 'Tarjeta de regalo'));
    (A.data.bonos || []).forEach((b) => code(b.codigo, b.clienta || b.nombre || 'Paquete', `Paquete ${b.nombre || ''}`.trim()));
    return out;
  }

  function goCode(codigo) {
    A.go('promos');
    setTimeout(() => {
      const el = [...document.querySelectorAll('#sec-promos code')].find((c) => c.textContent.trim() === codigo);
      flash(el ? (el.closest('li, article, .pr-item, .ad-panel') || el) : $('sec-promos'));
    }, 80);
  }
  function flash(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), 2200);
  }

  function score(e, q, words) {
    const h = norm(e.hay), l = norm(e.label);
    if (!words.every((w) => h.includes(w))) return 0;
    let s = 1;
    if (l === q) s += 50;
    if (l.startsWith(q)) s += 20;
    if (new RegExp(`(^|\\s)${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(l)) s += 10;
    if (e.kind === 'Sección') s += 6;
    if (e.kind === 'Acción') s += 4;
    return s;
  }

  let all = [], shown = [], sel = 0;
  function search() {
    const q = norm($('sr-q').value);
    if (!q) {
      shown = all.filter((e) => e.kind === 'Sección' || e.kind === 'Acción').slice(0, 14);
    } else {
      const words = q.split(/\s+/);
      shown = all.map((e) => [e, score(e, q, words)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([e]) => e);
    }
    sel = 0;
    paint();
  }
  function paint() {
    $('sr-list').innerHTML = shown.length ? shown.map((e, i) => `
      <li role="option" id="sr-o${i}" aria-selected="${i === sel}" data-i="${i}" class="${i === sel ? 'is-sel' : ''}">
        <span class="sr-kind">${esc(e.kind)}</span>
        <span class="sr-t"><b>${esc(e.label)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</span>
      </li>`).join('') : '<li class="sr-empty">Nada con ese nombre. Prueba con otra palabra.</li>';
    $('sr-q').setAttribute('aria-activedescendant', shown.length ? `sr-o${sel}` : '');
    const o = $(`sr-o${sel}`);
    if (o) o.scrollIntoView({ block: 'nearest' });
  }
  function pick(i) {
    const e = shown[i];
    if (!e) return;
    A.close('dlg-search');
    e.run();
  }

  A.openSearch = function (text) {
    if (!document.body.classList.contains('is-in')) return;
    all = entries();
    $('sr-q').value = text || '';
    A.open('dlg-search');
    search();
    $('sr-q').focus();
  };

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); A.openSearch(); return; }
    if (e.key === '/' && !A.editing() && !document.querySelector('dialog[open]') && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName)) { e.preventDefault(); A.openSearch(); }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('#ad-search-open, [data-search-open]')) { A.openSearch(); return; }
    const o = e.target.closest('#sr-list [data-i]');
    if (o) pick(Number(o.dataset.i));
  });
  $('sr-q').addEventListener('input', search);
  $('sr-q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
  });
  $('dlg-search').addEventListener('click', (e) => { if (e.target === $('dlg-search')) A.close('dlg-search'); });
})(window.MJB);
