/* MAJOBELLA · Dashboard: datos de ejemplo (solo admin.html?demo)
   Imitan las respuestas del backend para poder ver y probar el dashboard sin la hoja conectada. */
(function (M) {
  const A = M.Admin;
  if (!A.DEMO) return;
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const weighted = (pairs) => { let r = rnd() * pairs.reduce((t, p) => t + p[1], 0); for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; } return pairs[0][0]; };
  const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const today = M.todayKey();
  const nowIso = () => new Date().toISOString();

  const services = [
    { id: 'faciales', nombre: 'Faciales', duracionMin: '60', precioRD: '2500', precioDesde: 'no', activo: 'si', volverDias: '30' },
    { id: 'cejas', nombre: 'Cejas', duracionMin: '45', precioRD: '900', precioDesde: 'no', activo: 'si', volverDias: '28' },
    { id: 'pestanas', nombre: 'Pestañas', duracionMin: '60', precioRD: '1800', precioDesde: 'no', activo: 'si', volverDias: '21' },
    { id: 'micropigmentacion', nombre: 'Micropigmentación', duracionMin: '150', precioRD: '12000', precioDesde: 'no', activo: 'si', volverDias: '365' },
    { id: 'depilacion', nombre: 'Depilación facial y corporal', duracionMin: '30', precioRD: '500', precioDesde: 'si', activo: 'si', volverDias: '30' },
  ];
  const svc = (id) => { const s = services.find((x) => x.id === id); return { id: s.id, name: s.nombre, price: Number(s.precioRD), durationMinutes: Number(s.duracionMin) }; };
  const settings = [
    ['tasaUSD', '63'], ['porcentajeDeposito', '50'], ['minutosRetencion', '15'], ['horasCancelacion', '24'], ['minAntelacionHoras', '3'],
    ['maxDiasAdelante', '60'], ['intervaloMinutos', '30'], ['horario_domingo', '10:00-13:00'], ['horario_lunes', 'cerrado'],
    ['horario_martes', '10:00-17:00'], ['horario_miercoles', '10:00-17:00'], ['horario_jueves', '10:00-17:00'], ['horario_viernes', '10:00-17:00'],
    ['horario_sabado', '10:00-17:00'], ['diasCerrados', '2026-12-25, 2027-01-01'], ['correoAvisos', ''], ['calendarioId', 'primary'], ['invitarClienta', 'si'],
    ['direccion', 'MAJOBELLA Beauty Studio, Santo Domingo'], ['mapsUrl', 'https://maps.app.goo.gl/d4uX28GuoKuyHuhf8'],
    ['webUrl', 'https://anthonyhenriquezluciano.github.io/Majo_Bella/'], ['comisionPaypalPct', '5.4'], ['comisionPaypalFijoUSD', '0.30'], ['conversionPct', '3.5'],
  ].map(([key, value]) => ({ key, value, help: '' }));

  const people = ['Ana Pérez', 'Laura Martínez', 'Carolina Reyes', 'Paola Jiménez', 'Michelle Santos', 'Yarisa Gómez', 'Nicole Peña', 'Daniela Cruz',
    'Sofía Taveras', 'Wendy Rosario', 'Gabriela Núñez', 'Rosa Almonte', 'Katherine Díaz', 'Pamela Ureña', 'Luisa Fernández', 'Mariela Castillo', 'Johanna Polanco', 'Isabel Mejía']
    .map((name, i) => ({ name, phone: `809 555 ${String(2100 + i * 37)}`, email: i % 5 === 4 ? '' : `${name.split(' ')[0].toLowerCase()}.${name.split(' ')[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@ejemplo.com`,
      origin: weighted([['Instagram', 40], ['Recomendación de una amiga', 25], ['Google', 15], ['TikTok', 10], ['WhatsApp', 10]]) }));
  const keyOf = (p) => A.clientKey(p.email, p.phone, p.name);

  const promos = [
    { id: 'PRM-OCT', nombre: 'Octubre de cejas', tipo: 'auto', codigo: '', servicios: 'cejas', descuentoTipo: 'porcentaje', valor: '15', desde: A.monthRange(today).from, hasta: A.monthRange(today).to, usosMax: '0', usos: '6', activo: 'si', creada: `${A.monthRange(today).from}T12:00:00Z` },
    { id: 'PRM-HOLA', nombre: 'Bienvenida Instagram', tipo: 'codigo', codigo: 'HOLA10', servicios: 'todos', descuentoTipo: 'porcentaje', valor: '10', desde: '', hasta: '', usosMax: '50', usos: '4', activo: 'si', creada: `${A.addDays(today, -40)}T12:00:00Z` },
  ];
  const gifts = [
    { id: 'TRG-1', codigo: 'MJB-ROSA-7K2P', montoRD: '3000', saldoRD: '500', comprador: 'Luis Almonte', para: 'Rosa Almonte', mensaje: '¡Feliz cumpleaños!', metodoPago: 'transferencia', vendida: A.addDays(today, -30), vence: A.addDays(today, 335), estado: 'activa', creada: `${A.addDays(today, -30)}T15:00:00Z` },
    { id: 'TRG-2', codigo: 'MJB-MAMA-Q8TT', montoRD: '5000', saldoRD: '5000', comprador: 'Pamela Ureña', para: 'Mamá', mensaje: '', metodoPago: 'efectivo', vendida: A.addDays(today, -3), vence: A.addDays(today, 362), estado: 'activa', creada: `${A.addDays(today, -3)}T15:00:00Z` },
  ];
  const expenses = [];
  [[-62, 'Alquiler del local', 'Alquiler', 18000, 'transferencia'], [-31, 'Alquiler del local', 'Alquiler', 18000, 'transferencia'], [-1, 'Alquiler del local', 'Alquiler', 18000, 'transferencia'],
    [-45, 'Pigmentos y agujas', 'Insumos', 6200, 'efectivo'], [-12, 'Pestañas y pegamento', 'Insumos', 3400, 'efectivo'], [-8, 'Publicidad en Instagram', 'Publicidad', 2500, 'paypal'],
    [-20, 'Luz e internet', 'Servicios (luz, agua, internet)', 4100, 'transferencia'], [-2, 'Toallas y desechables', 'Insumos', 1800, 'efectivo']]
    .forEach(([d, concepto, categoria, montoRD, metodo]) => expenses.push({ id: uid('GST'), fecha: A.addDays(today, d), concepto, categoria, montoRD: String(montoRD), metodo, creada: nowIso() }));
  const blocks = [{ id: 'BLQ-CURSO', tipo: 'rango', dias: '', horaDesde: '00:00', horaHasta: '23:59', fechaDesde: A.addDays(today, 16), fechaHasta: A.addDays(today, 17), motivo: 'Curso de actualización', activo: 'si', creada: nowIso() }];
  const clients = [{ clave: keyOf(people[0]), nombre: people[0].name, telefono: people[0].phone, correo: people[0].email, notas: 'Piel sensible. Micropigmentación con técnica powder, pigmento Brown 02. Prefiere citas en la mañana.', cumpleanos: '1993-11-02', actualizada: nowIso() }];
  const files = [
    { id: 'ARC-1', clave: keyOf(people[0]), tipo: 'antes', nombre: 'antes.jpg', mime: 'image/jpeg', driveId: 'x', citaId: '', fecha: A.addDays(today, -40), nota: '', creada: nowIso() },
    { id: 'ARC-2', clave: keyOf(people[0]), tipo: 'despues', nombre: 'despues.jpg', mime: 'image/jpeg', driveId: 'x', citaId: '', fecha: A.addDays(today, -40), nota: '', creada: nowIso() },
    { id: 'ARC-3', clave: keyOf(people[0]), tipo: 'consentimiento', nombre: 'consentimiento.pdf', mime: 'application/pdf', driveId: 'x', citaId: '', fecha: A.addDays(today, -40), nota: '', creada: nowIso() },
  ];

  /* Citas */
  const items = [];
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const hhmm = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  function makeAppt(p, key, time, svcs, opts = {}) {
    const minutes = svcs.reduce((t, s) => t + s.durationMinutes, 0);
    const start = M.studioDate(key, time);
    const subtotal = svcs.reduce((t, s) => t + s.price, 0);
    const discount = opts.discount || 0;
    const total = subtotal - discount;
    const manual = opts.manual;
    const dep = manual ? (rnd() < 0.5 ? 0 : Math.round(total / 2)) : Math.round(total / 2);
    const created = new Date(start.getTime() - (2 + Math.floor(rnd() * 9)) * 86400000).toISOString();
    return {
      id: `MJB-${key.slice(2).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, remote: true, status: opts.status || 'confirmada',
      date: key, time, start: start.toISOString(), end: new Date(start.getTime() + minutes * 60000).toISOString(), durationMinutes: minutes, totalPrice: total,
      services: svcs, servicesText: svcs.map((s) => s.name).join(' + '),
      payment: { subtotalRD: subtotal, discountRD: discount, giftRD: 0, depositRD: dep, depositUSD: dep ? (Math.ceil((dep / 63) * 100) / 100).toFixed(2) : '', depositPaid: dep > 0,
        depositMethod: dep ? (manual ? pick(['efectivo', 'transferencia']) : 'paypal') : '', depositPaidAt: dep ? created : '', balanceRD: total - dep, balanceStatus: 'pendiente', balanceMethod: '', refund: '' },
      client: { name: p.name, email: p.email, phone: p.phone, notes: '' }, clientKey: keyOf(p),
      createdAt: created, createdBy: manual ? 'estudio' : 'web', origin: manual ? pick(['WhatsApp', 'Llamada', 'En persona']) : p.origin,
      channel: manual ? 'dashboard' : weighted([['', 50], ['instagram.com', 30], ['google.com', 15], ['tiktok.com', 5]]), code: opts.code || '', promoId: opts.promoId || '', giftCode: '', internalNote: '',
    };
  }
  for (let i = -70; i <= 28; i++) {
    const key = A.addDays(today, i);
    const hrs = M.Schedule.hoursFor(key);
    if (!hrs || (i >= 16 && i <= 17)) continue;
    let t = toMin(hrs.open) + (rnd() < 0.5 ? 0 : 30);
    const n = Math.floor(rnd() * (i < 0 ? 5 : i < 10 ? 4 : 2));
    for (let j = 0; j < n; j++) {
      const p = pick(people);
      const ids = [weighted([['cejas', 30], ['pestanas', 28], ['depilacion', 18], ['faciales', 18], ['micropigmentacion', 6]])];
      if (rnd() < 0.2) ids.push(pick(['cejas', 'depilacion']));
      const svcs = [...new Set(ids)].map(svc);
      const minutes = svcs.reduce((a, s) => a + s.durationMinutes, 0);
      if (t + minutes > toMin(hrs.close)) break;
      let opts = { manual: rnd() < 0.18 };
      if (!opts.manual && rnd() < 0.08) opts = { code: 'HOLA10', promoId: 'PRM-HOLA', discount: Math.round(svcs.reduce((a, s) => a + s.price, 0) * 0.1) };
      const a = makeAppt(p, key, hhmm(t), svcs, opts);
      if (i < 0) {
        a.status = rnd() < 0.92 ? 'completada' : 'no-asistio';
        if (a.status === 'completada' && rnd() < 0.95) { a.payment.balanceStatus = 'pagado'; a.payment.balanceMethod = weighted([['efectivo', 60], ['transferencia', 30], ['paypal', 10]]); a.payment.balancePaidAt = a.end; }
      }
      if (rnd() < 0.06) { a.status = 'cancelada'; a.cancelledBy = 'clienta'; a.cancelledAt = a.createdAt; if (a.payment.depositMethod === 'paypal' && rnd() < 0.6) { a.payment.refund = 'reembolsado'; a.payment.refundDetail = 'reembolsado REF-DEMO (COMPLETED)'; } }
      if (a.payment.balanceRD === 0) a.payment.balanceStatus = 'pagado';
      items.push(a);
      t += minutes + (rnd() < 0.5 ? 30 : 60);
    }
    // Algunos pagos sin completar
    if (i > -25 && i < 12 && rnd() < 0.12) {
      const p = pick(people.slice(10));
      const a = makeAppt(p, key, hrs.open, [svc(pick(['pestanas', 'faciales', 'micropigmentacion']))]);
      a.status = 'expirada'; a.payment.depositPaid = false; a.payment.depositPaidAt = ''; a.createdAt = new Date(M.studioDate(A.addDays(today, Math.min(i, 0) - 1), '20:15')).toISOString();
      items.push(a);
    }
  }
  // Una clienta con su historial completo para la ficha
  items.push(Object.assign(makeAppt(people[0], A.addDays(today, -40), '10:00', [svc('micropigmentacion')]), { status: 'completada' }));
  items[items.length - 1].payment.balanceStatus = 'pagado'; items[items.length - 1].payment.balanceMethod = 'efectivo'; items[items.length - 1].payment.balancePaidAt = items[items.length - 1].end;

  /* Imagen de ejemplo para las fotos */
  function demoImage(label) {
    const c = document.createElement('canvas');
    c.width = 900; c.height = 600;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 900, 600);
    g.addColorStop(0, label === 'Antes' ? '#e9e2dc' : '#f3dfe2'); g.addColorStop(1, '#ffffff');
    x.fillStyle = g; x.fillRect(0, 0, 900, 600);
    x.fillStyle = '#111'; x.font = '42px Georgia, serif'; x.textAlign = 'center';
    x.fillText(`Foto de ejemplo · ${label}`, 450, 310);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  }
  const pdfStub = btoa('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Times-Roman>>>>>>>>endobj 4 0 obj<</Length 58>>stream\nBT /F1 18 Tf 30 70 Td (Consentimiento de ejemplo) Tj ET\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  const uploaded = {};

  const db = () => ({
    ok: true, user: 'demo', items, blocks, clients, files, promos, gifts, expenses, settings, services,
    schedule: { hours: M.config.schedule.hours, blocked: ['2026-12-25', '2027-01-01'], minNotice: 3, maxDays: 60, step: 30 },
    paypalEnv: 'sandbox', sheetUrl: '',
  });
  const wait = () => new Promise((r) => setTimeout(r, 220));
  const find = (id) => items.find((x) => x.id === id);

  A.demo = {
    async handle(action, d) {
      await wait();
      switch (action) {
        case 'adminData': return clone(db());
        case 'adminUpdate': {
          const a = find(d.id); const p = a.payment;
          if (d.op === 'completar') a.status = 'completada';
          if (d.op === 'noAsistio') a.status = 'no-asistio';
          if (d.op === 'reabrir') a.status = 'confirmada';
          if (d.op === 'saldoEfectivo' || d.op === 'saldoTransferencia') { p.balanceStatus = 'pagado'; p.balanceMethod = d.op === 'saldoEfectivo' ? 'efectivo' : 'transferencia'; p.balancePaidAt = nowIso(); }
          if (d.op === 'saldoPendiente') { p.balanceStatus = 'pendiente'; p.balanceMethod = ''; p.balancePaidAt = ''; }
          if (d.op === 'nota') a.internalNote = d.note;
          if (d.op === 'cancelar') { a.status = 'cancelada'; a.cancelledBy = 'estudio'; a.cancelledAt = nowIso(); if (d.refund) { p.refund = p.depositMethod === 'paypal' ? 'reembolsado' : ''; p.refundDetail = p.depositMethod === 'paypal' ? 'reembolsado (demo)' : 'devolver a mano (pago fuera de PayPal)'; } }
          return { ok: true, item: clone(a) };
        }
        case 'adminCreate': {
          const svcs = d.services.map(svc);
          const p = { name: d.client.name, phone: d.client.phone, email: d.client.email, origin: d.origen };
          const a = makeAppt(p, d.date, d.time, svcs, { manual: true });
          const total = d.totalRD !== '' && d.totalRD != null ? Number(d.totalRD) : a.totalPrice;
          const dep = Math.min(total, Number(d.depositRD) || 0);
          Object.assign(a, { totalPrice: total, origin: d.origen || 'estudio', createdAt: nowIso() });
          Object.assign(a.payment, { subtotalRD: a.payment.subtotalRD, discountRD: a.payment.subtotalRD - total, depositRD: dep, depositPaid: dep > 0, depositMethod: dep ? d.depositMethod : '', depositPaidAt: dep ? nowIso() : '', depositUSD: '', balanceRD: total - dep, balanceStatus: total - dep > 0 ? 'pendiente' : 'pagado' });
          a.client.notes = d.client.notes || '';
          items.push(a);
          return { ok: true, item: clone(a) };
        }
        case 'adminReschedule': {
          const a = find(d.id);
          const start = M.studioDate(d.date, d.time);
          a.rescheduledFrom = `${a.date} ${a.time}`;
          Object.assign(a, { date: d.date, time: d.time, start: start.toISOString(), end: new Date(start.getTime() + a.durationMinutes * 60000).toISOString() });
          return { ok: true, item: clone(a) };
        }
        case 'adminBlock': {
          const b = { id: uid('BLQ'), tipo: d.tipo, dias: d.tipo === 'semanal' ? d.dias : '', horaDesde: d.horaDesde, horaHasta: d.horaHasta, fechaDesde: d.fechaDesde, fechaHasta: d.tipo === 'unico' ? d.fechaDesde : d.fechaHasta, motivo: d.motivo || 'Bloqueado', activo: 'si', creada: nowIso() };
          if (d.tipo === 'semanal' && !b.dias) throw new Error('Elige al menos un día de la semana.');
          if (d.tipo === 'rango' && (!b.fechaHasta || b.fechaHasta < b.fechaDesde)) throw new Error('La fecha final debe ser igual o posterior a la inicial.');
          blocks.push(b);
          return { ok: true, block: clone(b) };
        }
        case 'adminDeleteBlock': { const i = blocks.findIndex((b) => b.id === d.id); if (i >= 0) blocks.splice(i, 1); return { ok: true }; }
        case 'adminSaveSettings': {
          Object.entries(d.settings || {}).forEach(([k, v]) => { const s = settings.find((x) => x.key === k); if (s) s.value = v; });
          (d.services || []).forEach((s) => {
            const id = s.id || s.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
            const row = services.find((x) => x.id === id);
            const v = { id, nombre: s.nombre, duracionMin: String(s.duracionMin), precioRD: String(s.precioRD), precioDesde: s.precioDesde, activo: s.activo, volverDias: String(s.volverDias) };
            if (row) Object.assign(row, v); else services.push(v);
          });
          const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
          const keys = ['horario_domingo', 'horario_lunes', 'horario_martes', 'horario_miercoles', 'horario_jueves', 'horario_viernes', 'horario_sabado'];
          const hours = {};
          keys.forEach((k, i) => { const m = String(map[k]).match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/); hours[i] = m ? { open: `${m[1]}:${m[2]}`, close: `${m[3]}:${m[4]}` } : null; });
          const out = clone(db());
          out.schedule = { hours, blocked: String(map.diasCerrados).split(',').map((x) => x.trim()).filter(Boolean), minNotice: 3, maxDays: 60, step: Number(map.intervaloMinutos) || 30 };
          return out;
        }
        case 'adminSaveClient': {
          const v = { clave: d.clave, nombre: d.nombre, telefono: d.telefono, correo: d.correo, notas: d.notas, cumpleanos: d.cumpleanos, actualizada: nowIso() };
          const i = clients.findIndex((c) => c.clave === d.clave);
          if (i >= 0) clients[i] = v; else clients.push(v);
          return { ok: true, client: clone(v) };
        }
        case 'adminUpload': {
          const f = { id: uid('ARC'), clave: d.clave, tipo: d.tipo, nombre: d.nombre, mime: d.mime, driveId: 'demo', citaId: '', fecha: d.fecha, nota: '', creada: nowIso() };
          uploaded[f.id] = d.data; files.push(f);
          return { ok: true, file: clone(f) };
        }
        case 'adminFile': {
          const f = files.find((x) => x.id === d.id);
          const data = uploaded[f.id] || (f.mime === 'application/pdf' ? pdfStub : demoImage(f.tipo === 'antes' ? 'Antes' : 'Después'));
          return { ok: true, mime: f.mime, name: f.nombre, data };
        }
        case 'adminDeleteFile': { const i = files.findIndex((x) => x.id === d.id); if (i >= 0) files.splice(i, 1); return { ok: true }; }
        case 'adminSavePromo': {
          const p = d.promo;
          const v = { ...p, id: p.id || uid('PRM'), codigo: p.tipo === 'codigo' ? String(p.codigo || '').toUpperCase() : '', servicios: Array.isArray(p.servicios) ? p.servicios.join(',') : p.servicios, valor: String(p.valor), usosMax: String(Number(p.usosMax) || 0) };
          if (!v.nombre) throw new Error('Ponle un nombre a la promoción.');
          if (!(Number(v.valor) > 0)) throw new Error('Revisa el valor del descuento.');
          const i = promos.findIndex((x) => x.id === v.id);
          if (i >= 0) promos[i] = Object.assign(promos[i], v); else promos.push(Object.assign(v, { usos: '0', creada: nowIso() }));
          return { ok: true, promo: clone(promos.find((x) => x.id === v.id)) };
        }
        case 'adminDeletePromo': { const i = promos.findIndex((x) => x.id === d.id); if (i >= 0) promos.splice(i, 1); return { ok: true }; }
        case 'adminSaveGift': {
          const g = d.gift;
          if (g.id) { const r = gifts.find((x) => x.id === g.id); r.estado = g.estado === 'anulada' ? 'anulada' : (Number(r.saldoRD) > 0 ? 'activa' : 'agotada'); return { ok: true, gift: clone(r) }; }
          if (!(Number(g.montoRD) > 0)) throw new Error('Escribe el valor de la tarjeta.');
          const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          const r4 = () => Array.from({ length: 4 }, () => a[Math.floor(Math.random() * a.length)]).join('');
          const v = { id: uid('TRG'), codigo: (g.codigo || `MJB-${r4()}-${r4()}`).toUpperCase(), montoRD: String(g.montoRD), saldoRD: String(g.montoRD), comprador: g.comprador, para: g.para, mensaje: g.mensaje, metodoPago: g.metodoPago, vendida: g.vendida || today, vence: g.vence, estado: 'activa', creada: nowIso() };
          gifts.push(v);
          return { ok: true, gift: clone(v) };
        }
        case 'adminSaveExpense': {
          const e = d.expense;
          if (!e.concepto || !(Number(e.montoRD) > 0)) throw new Error('Escribe el concepto y el monto.');
          const v = { id: uid('GST'), fecha: e.fecha, concepto: e.concepto, categoria: e.categoria, montoRD: String(e.montoRD), metodo: e.metodo, creada: nowIso() };
          expenses.push(v);
          return { ok: true, expense: clone(v) };
        }
        case 'adminDeleteExpense': { const i = expenses.findIndex((x) => x.id === d.id); if (i >= 0) expenses.splice(i, 1); return { ok: true }; }
        default: throw new Error('Acción no disponible en el ejemplo.');
      }
    },
  };
})(window.MJB);
