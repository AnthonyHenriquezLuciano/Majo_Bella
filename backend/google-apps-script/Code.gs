/**
 * MAJOBELLA · Backend de reservas (Google Apps Script + Google Sheets + PayPal)
 *
 * Base de datos: una hoja de cálculo de Google con tres pestañas
 *   - Reservas   cada cita es una fila (estado, horario, clienta, pagos)
 *   - Servicios  precio y duración que se cobran (la web los toma de aquí)
 *   - Ajustes    tasa del dólar, % de depósito, horario, políticas
 *
 * Cómo se reserva:
 *   1. La web pide 'hold': se valida el horario, se aparta durante unos minutos y se crea
 *      la orden de PayPal por el depósito (en USD).
 *   2. La clienta paga en PayPal y la web pide 'capture': se cobra, la cita pasa a
 *      "confirmada", se agenda en Google Calendar y se envían los correos.
 *   3. El saldo se paga al terminar: en efectivo (lo marcas en el dashboard) o con PayPal desde "Citas".
 *
 * Instalación: ver backend/google-apps-script/INSTALAR.md
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   PAYPAL_CLIENT_ID   ID de cliente de la app REST de PayPal
 *   PAYPAL_SECRET      Secreto de esa app (nunca va en la web ni en GitHub)
 *   PAYPAL_ENV         sandbox (pruebas) o live (cobros reales)
 *   ADMIN_EMAILS       correos de Google que pueden abrir el dashboard, separados por coma
 *   SHEET_ID           lo crea setup() automáticamente
 */

const GOOGLE_CLIENT_ID = '333956941163-rlgrb3759jf2uc05olhhpm9e2ggrhm1s.apps.googleusercontent.com';
const TZ = 'America/Santo_Domingo';
const UTC_OFFSET = '-04:00';              // República Dominicana no usa horario de verano

const HEADERS = [
  'id', 'creada', 'estado', 'fecha', 'hora', 'inicio', 'fin', 'duracionMin',
  'servicios', 'serviciosJson', 'totalRD', 'depositoRD', 'depositoUSD', 'saldoRD',
  'clienta', 'telefono', 'correo', 'nota', 'tokenHash',
  'paypalOrden', 'paypalCaptura', 'depositoPagado',
  'saldoEstado', 'saldoMetodo', 'saldoPagado', 'saldoOrden', 'saldoCaptura', 'saldoUSD',
  'retenidaHasta', 'eventoId', 'canceladaEn', 'canceladaPor', 'reembolso', 'notaInterna',
];

// Estados que ocupan la agenda
const BUSY_STATES = ['confirmada', 'completada', 'no-asistio', 'bloqueo'];

const DEFAULT_SETTINGS = [
  ['tasaUSD', '63', 'Pesos dominicanos por 1 US$. PayPal no cobra en RD$: el depósito se convierte con esta tasa.'],
  ['porcentajeDeposito', '50', 'Porcentaje del total que se cobra para apartar la cita.'],
  ['minutosRetencion', '15', 'Minutos que se aparta el horario mientras la clienta paga.'],
  ['horasCancelacion', '24', 'Si cancela con al menos estas horas de aviso, se le devuelve el depósito.'],
  ['minAntelacionHoras', '3', 'Antelación mínima para reservar.'],
  ['maxDiasAdelante', '60', 'Hasta cuántos días en el futuro se puede reservar.'],
  ['intervaloMinutos', '30', 'Cada cuánto empieza una cita posible.'],
  ['horario_domingo', '10:00-13:00', 'Formato 10:00-17:00, o "cerrado".'],
  ['horario_lunes', 'cerrado', ''],
  ['horario_martes', '10:00-17:00', ''],
  ['horario_miercoles', '10:00-17:00', ''],
  ['horario_jueves', '10:00-17:00', ''],
  ['horario_viernes', '10:00-17:00', ''],
  ['horario_sabado', '10:00-17:00', ''],
  ['diasCerrados', '', 'Días cerrados puntuales separados por coma: 2026-12-25, 2027-01-01'],
  ['correoAvisos', '', 'Correo que recibe un aviso por cada reserva (vacío = los de ADMIN_EMAILS).'],
  ['calendarioId', 'primary', 'Calendario donde se agendan las citas ("primary" = el principal). Vacío = no usar calendario.'],
  ['invitarClienta', 'si', 'si/no: la clienta recibe la invitación de Google Calendar.'],
  ['direccion', 'MAJOBELLA Beauty Studio, Santo Domingo', 'Se usa en los correos y en el calendario.'],
  ['mapsUrl', 'https://maps.app.goo.gl/d4uX28GuoKuyHuhf8', ''],
  ['webUrl', 'https://anthonyhenriquezluciano.github.io/Majo_Bella/', 'Dirección de la web (enlaces de los correos).'],
];

// Igual que js/data/services.js. Desde la hoja "Servicios" se cambian precios y duraciones.
const DEFAULT_SERVICES = [
  ['faciales', 'Faciales', 60, 2500, 'no', 'si'],
  ['cejas', 'Cejas', 45, 900, 'no', 'si'],
  ['pestanas', 'Pestañas', 60, 1800, 'no', 'si'],
  ['micropigmentacion', 'Micropigmentación', 150, 12000, 'no', 'si'],
  ['depilacion', 'Depilación facial y corporal', 30, 500, 'si', 'si'],
];
const DAY_KEYS = ['horario_domingo', 'horario_lunes', 'horario_martes', 'horario_miercoles', 'horario_jueves', 'horario_viernes', 'horario_sabado'];

/* =========================================================================
   Instalación
   ========================================================================= */

/** Ejecuta esta función una vez desde el editor: crea la hoja de cálculo y sus pestañas. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const existing = props.getProperty('SHEET_ID');
  if (existing) { try { ss = SpreadsheetApp.openById(existing); } catch (e) { ss = null; } }
  if (!ss) { try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; } }
  if (!ss) ss = SpreadsheetApp.create('MAJOBELLA · Reservas');
  props.setProperty('SHEET_ID', ss.getId());

  let res = ss.getSheetByName('Reservas');
  if (!res) res = ss.insertSheet('Reservas');
  if (res.getLastRow() === 0) {
    res.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    res.setFrozenRows(1);
    res.getRange(1, 1, res.getMaxRows(), HEADERS.length).setNumberFormat('@'); // todo como texto
  }

  let st = ss.getSheetByName('Ajustes');
  if (!st) {
    st = ss.insertSheet('Ajustes');
    st.getRange(1, 1, 1, 3).setValues([['clave', 'valor', 'qué es']]).setFontWeight('bold');
    st.getRange(1, 1, 200, 2).setNumberFormat('@');
    st.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
    st.setFrozenRows(1);
    st.autoResizeColumns(1, 3);
  }

  let sv = ss.getSheetByName('Servicios');
  if (!sv) {
    sv = ss.insertSheet('Servicios');
    sv.getRange(1, 1, 1, 6).setValues([['id', 'nombre', 'duracionMin', 'precioRD', 'precioDesde', 'activo']]).setFontWeight('bold');
    sv.getRange(2, 1, DEFAULT_SERVICES.length, 6).setValues(DEFAULT_SERVICES);
    sv.setFrozenRows(1);
  }
  const blank = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 3) ss.deleteSheet(blank);
  Logger.log('Listo. Hoja de cálculo: ' + ss.getUrl());
  return ss.getUrl();
}

/** Prueba rápida de las llaves de PayPal desde el editor. */
function testPaypal() {
  Logger.log(paypalToken_() ? 'PayPal conectado (' + paypalEnv_() + ').' : 'Sin token');
}

/* =========================================================================
   Entradas HTTP
   ========================================================================= */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'catalog') return json_(catalog_());
    if (p.action === 'busy') return json_(busy_(p.from, p.to));
    if (p.action === 'availability') return json_(busy_(p.date, p.date)); // compatibilidad
    return json_({ ok: false, error: 'Acción no válida.' });
  } catch (err) {
    return json_({ ok: false, error: msg_(err) });
  }
}

function doPost(e) {
  let data;
  try { data = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'Datos no válidos.' }); }
  const actions = {
    hold: function () { return locked_(function () { return hold_(data); }); },
    capture: function () { return locked_(function () { return capture_(data); }); },
    release: function () { return locked_(function () { return release_(data); }); },
    cancel: function () { return locked_(function () { return cancel_(data); }); },
    balanceOrder: function () { return balanceOrder_(data); },
    balanceCapture: function () { return locked_(function () { return balanceCapture_(data); }); },
    myAppointments: function () { return myAppointments_(data); },
    lookup: function () { return lookup_(data); },
    adminList: function () { return adminList_(data); },
    adminUpdate: function () { return locked_(function () { return adminUpdate_(data); }); },
    adminBlock: function () { return locked_(function () { return adminBlock_(data); }); },
  };
  const fn = actions[data.action];
  if (!fn) return json_({ ok: false, error: 'Acción no válida.' });
  try { return json_(fn()); }
  catch (err) { return json_({ ok: false, error: msg_(err) }); }
}

/* =========================================================================
   Lectura pública: catálogo y horarios ocupados
   ========================================================================= */

function catalog_() {
  const s = settings_();
  const sch = schedule_(s);
  return {
    ok: true,
    services: services_().map(function (x) { return { id: x.id, name: x.name, durationMinutes: x.durationMinutes, price: x.price, priceFrom: x.priceFrom }; }),
    payments: {
      usdRate: num_(s.tasaUSD, 63),
      depositPercent: num_(s.porcentajeDeposito, 50),
      holdMinutes: num_(s.minutosRetencion, 15),
      cancelHours: num_(s.horasCancelacion, 24),
      paypalEnv: paypalEnv_(),
    },
    schedule: {
      hours: sch.hours, blockedDates: sch.blocked,
      minNoticeHours: sch.minNotice, maxDaysAhead: sch.maxDays, slotStepMinutes: sch.step,
    },
  };
}

/* Intervalos ocupados entre dos fechas (sin datos de las clientas) */
function busy_(from, to) {
  if (!isDateKey_(from) || !isDateKey_(to)) return { ok: false, error: 'Fecha no válida.' };
  const a = new Date(from + 'T00:00:00' + UTC_OFFSET).getTime();
  const b = new Date(to + 'T23:59:59' + UTC_OFFSET).getTime();
  if (b < a || b - a > 120 * 86400000) return { ok: false, error: 'Rango no válido.' };
  const now = Date.now();
  const busy = rows_().filter(function (r) {
    if (!occupies_(r, now)) return false;
    const s = new Date(r.inicio).getTime(), e = new Date(r.fin).getTime();
    return s <= b && e >= a;
  }).map(function (r) { return { start: r.inicio, end: r.fin }; });
  return { ok: true, busy: busy };
}

function occupies_(r, now) {
  if (BUSY_STATES.indexOf(r.estado) >= 0) return true;
  return r.estado === 'retenida' && new Date(r.retenidaHasta).getTime() > now;
}

/* =========================================================================
   Reserva y pago del depósito
   ========================================================================= */

function hold_(d) {
  const s = settings_();
  const sch = schedule_(s);
  const c = d.client || {};
  const name = clean_(c.name, 80), phone = clean_(c.phone, 30), notes = clean_(c.notes, 300);
  let email = clean_(c.email, 120).toLowerCase();
  if (name.length < 2 || phone.replace(/\D/g, '').length < 10 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: 'Revisa tu nombre, teléfono y correo.' };
  }
  if (d.idToken) { const u = verifyIdToken_(d.idToken); if (u) email = u.email; }

  // Servicios y precios desde la hoja (nunca desde el navegador)
  const catalog = {};
  services_().forEach(function (x) { catalog[x.id] = x; });
  const ids = (d.services || []).map(function (x) { return typeof x === 'string' ? x : x && x.id; }).filter(Boolean);
  const items = ids.map(function (id) { return catalog[id]; });
  if (!items.length || items.some(function (x) { return !x; })) return { ok: false, error: 'Elige un servicio válido.' };
  const minutes = items.reduce(function (t, x) { return t + x.durationMinutes; }, 0);
  const total = items.reduce(function (t, x) { return t + x.price; }, 0);

  // Horario
  if (!isDateKey_(d.date) || !/^\d{2}:\d{2}$/.test(d.time || '')) return { ok: false, error: 'Fecha u hora no válida.' };
  const check = slotProblem_(sch, d.date, d.time, minutes);
  if (check) return { ok: false, error: check };
  const start = new Date(d.date + 'T' + d.time + ':00' + UTC_OFFSET);
  const end = new Date(start.getTime() + minutes * 60000);
  if (conflicts_(start, end, null).length) return { ok: false, error: 'Ese horario acaba de reservarse. Elige otro, por favor.' };

  // Montos
  const pct = num_(s.porcentajeDeposito, 50) / 100;
  const rate = num_(s.tasaUSD, 63);
  const depositRD = Math.round(total * pct);
  const depositUSD = usd_(depositRD, rate);
  const holdMin = num_(s.minutosRetencion, 15);
  const id = 'MJB-' + Utilities.formatDate(start, TZ, 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  const token = Utilities.getUuid();

  const row = {
    id: id, creada: new Date().toISOString(), estado: 'retenida',
    fecha: d.date, hora: d.time, inicio: start.toISOString(), fin: end.toISOString(), duracionMin: minutes,
    servicios: items.map(function (x) { return x.name; }).join(' + '),
    serviciosJson: JSON.stringify(items.map(function (x) { return { id: x.id, name: x.name, price: x.price, durationMinutes: x.durationMinutes }; })),
    totalRD: total, depositoRD: depositRD, depositoUSD: depositUSD.toFixed(2), saldoRD: total - depositRD,
    clienta: name, telefono: phone, correo: email, nota: notes, tokenHash: hash_(token),
    saldoEstado: 'pendiente', retenidaHasta: new Date(Date.now() + holdMin * 60000).toISOString(),
  };

  // Orden de PayPal por el depósito
  const order = paypal_('post', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: id, custom_id: id, invoice_id: id + '-D',
      description: ('Depósito ' + Math.round(pct * 100) + '% · ' + row.servicios).slice(0, 127),
      amount: { currency_code: 'USD', value: depositUSD.toFixed(2) },
    }],
    application_context: { brand_name: 'MAJOBELLA', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
  }, id + '-order');
  row.paypalOrden = order.id;
  insertRow_(row);

  return {
    ok: true, id: id, manageToken: token, orderId: order.id,
    totalRD: total, depositRD: depositRD, depositUSD: depositUSD.toFixed(2), balanceRD: total - depositRD,
    usdRate: rate, expiresAt: row.retenidaHasta,
  };
}

function capture_(d) {
  const found = findRow_(d.id);
  if (!found) return { ok: false, error: 'No encontramos la reserva.' };
  const r = found.row;
  if (r.paypalOrden !== d.orderId) return { ok: false, error: 'El pago no corresponde a esta reserva.' };
  if (r.estado === 'confirmada' && r.paypalCaptura) return { ok: true, appointment: publicRow_(r) };
  if (r.estado !== 'retenida' && r.estado !== 'expirada') return { ok: false, error: 'Esta reserva ya no está disponible.' };

  const result = paypal_('post', '/v2/checkout/orders/' + encodeURIComponent(d.orderId) + '/capture', {}, r.id + '-capture');
  const cap = firstCapture_(result);
  if (!cap || cap.status !== 'COMPLETED') return { ok: false, error: 'PayPal no completó el pago. No se te cobró.' };
  if (cap.amount.currency_code !== 'USD' || Number(cap.amount.value) + 0.001 < Number(r.depositoUSD)) {
    return { ok: false, error: 'El monto pagado no coincide con el depósito. Escríbenos por WhatsApp.' };
  }

  const patch = { paypalCaptura: cap.id, depositoPagado: new Date().toISOString() };
  // Si la retención venció y otra persona tomó el horario, se devuelve el dinero
  const start = new Date(r.inicio), end = new Date(r.fin);
  if (conflicts_(start, end, r.id).length) {
    const refund = tryRefund_(cap.id, r.id + '-conflict');
    patch.estado = 'cancelada'; patch.canceladaEn = new Date().toISOString(); patch.canceladaPor = 'sistema: horario ocupado';
    patch.reembolso = refund;
    updateRow_(found.index, patch);
    return { ok: false, error: 'El horario se ocupó mientras pagabas. Te devolvimos el depósito completo en PayPal.' };
  }

  patch.estado = 'confirmada';
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  const s = settings_();
  patch.eventoId = calendarCreate_(r, s);
  r.eventoId = patch.eventoId;
  updateRow_(found.index, patch);
  notifyConfirmed_(r, s);
  return { ok: true, appointment: publicRow_(r) };
}

/* La clienta cerró PayPal sin pagar: se libera el horario */
function release_(d) {
  const found = findRow_(d.id);
  if (!found || !authorized_(found.row, d)) return { ok: true };
  if (found.row.estado === 'retenida') updateRow_(found.index, { estado: 'expirada' });
  return { ok: true };
}

/* =========================================================================
   Saldo con PayPal (desde "Citas")
   ========================================================================= */

function balanceOrder_(d) {
  const found = findRow_(d.id);
  if (!found || !authorized_(found.row, d)) return { ok: false, error: 'No encontramos esa cita.' };
  const r = found.row;
  if (r.estado !== 'confirmada' && r.estado !== 'completada') return { ok: false, error: 'Esta cita no tiene saldo por pagar.' };
  if (r.saldoEstado === 'pagado') return { ok: false, error: 'El saldo ya está pagado.' };
  if (new Date(r.inicio).getTime() > Date.now() + 15 * 60000) return { ok: false, error: 'El saldo se paga al terminar tu cita.' };
  const rate = num_(settings_().tasaUSD, 63);
  const amount = usd_(Number(r.saldoRD), rate);
  const order = paypal_('post', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: r.id, custom_id: r.id, invoice_id: r.id + '-S-' + Date.now(),
      description: ('Saldo · ' + r.servicios).slice(0, 127),
      amount: { currency_code: 'USD', value: amount.toFixed(2) },
    }],
    application_context: { brand_name: 'MAJOBELLA', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
  });
  updateRow_(found.index, { saldoOrden: order.id, saldoUSD: amount.toFixed(2) });
  return { ok: true, orderId: order.id, balanceUSD: amount.toFixed(2), balanceRD: Number(r.saldoRD) };
}

function balanceCapture_(d) {
  const found = findRow_(d.id);
  if (!found || !authorized_(found.row, d)) return { ok: false, error: 'No encontramos esa cita.' };
  const r = found.row;
  if (r.saldoEstado === 'pagado') return { ok: true, appointment: publicRow_(r) };
  if (r.saldoOrden !== d.orderId) return { ok: false, error: 'El pago no corresponde a esta cita.' };
  const cap = firstCapture_(paypal_('post', '/v2/checkout/orders/' + encodeURIComponent(d.orderId) + '/capture', {}, r.id + '-saldo-' + d.orderId));
  if (!cap || cap.status !== 'COMPLETED') return { ok: false, error: 'PayPal no completó el pago.' };
  const patch = { saldoEstado: 'pagado', saldoMetodo: 'paypal', saldoPagado: new Date().toISOString(), saldoCaptura: cap.id };
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  return { ok: true, appointment: publicRow_(r) };
}

/* =========================================================================
   Consultas y cancelación de la clienta
   ========================================================================= */

function myAppointments_(d) {
  const u = verifyIdToken_(d.idToken);
  if (!u) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
  const items = rows_().filter(function (r) { return r.correo === u.email && r.estado !== 'retenida' && r.estado !== 'expirada' && r.estado !== 'bloqueo'; })
    .map(publicRow_);
  return { ok: true, items: items };
}

/* Citas reservadas como invitada: la web guarda id + clave de gestión */
function lookup_(d) {
  const want = (d.items || []).slice(0, 50);
  const all = rows_();
  const items = [];
  want.forEach(function (w) {
    const r = all.filter(function (x) { return x.id === w.id; })[0];
    if (r && w.token && r.tokenHash === hash_(w.token)) items.push(publicRow_(r));
  });
  return { ok: true, items: items };
}

function cancel_(d) {
  const found = findRow_(d.id);
  if (!found || !authorized_(found.row, d)) return { ok: false, error: 'No encontramos esa cita.' };
  const r = found.row;
  if (r.estado !== 'confirmada') return { ok: false, error: 'Esta cita ya no se puede cancelar.' };
  const s = settings_();
  const hoursLeft = (new Date(r.inicio).getTime() - Date.now()) / 3600000;
  if (hoursLeft <= 0) return { ok: false, error: 'Esa cita ya pasó.' };
  const refundable = hoursLeft >= num_(s.horasCancelacion, 24);
  const patch = { estado: 'cancelada', canceladaEn: new Date().toISOString(), canceladaPor: 'clienta' };
  patch.reembolso = refundable && r.paypalCaptura ? tryRefund_(r.paypalCaptura, r.id + '-refund') : 'no aplica (menos de ' + num_(s.horasCancelacion, 24) + ' h)';
  if (r.saldoCaptura) patch.reembolso += ' · saldo: ' + tryRefund_(r.saldoCaptura, r.id + '-refund-saldo');
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  calendarCancel_(r, s);
  notifyCancelled_(r, s, refundable);
  return { ok: true, refunded: refundable && /^reembolsado/.test(patch.reembolso), appointment: publicRow_(r) };
}

/* =========================================================================
   Dashboard (solo correos en ADMIN_EMAILS)
   ========================================================================= */

function adminList_(d) {
  const u = admin_(d.idToken);
  if (!u) return { ok: false, error: 'Esta cuenta no tiene acceso al dashboard.' };
  const from = isDateKey_(d.from) ? d.from : '0000-00-00';
  const to = isDateKey_(d.to) ? d.to : '9999-12-31';
  const now = Date.now();
  const items = rows_().filter(function (r) {
    if (r.estado === 'expirada') return false;
    if (r.estado === 'retenida' && new Date(r.retenidaHasta).getTime() < now) return false;
    return r.fecha >= from && r.fecha <= to;
  }).map(adminRow_);
  const s = settings_();
  return {
    ok: true, user: u.email, items: items,
    settings: { usdRate: num_(s.tasaUSD, 63), depositPercent: num_(s.porcentajeDeposito, 50), cancelHours: num_(s.horasCancelacion, 24), paypalEnv: paypalEnv_() },
    sheetUrl: sheet_().getUrl(),
  };
}

function adminUpdate_(d) {
  const u = admin_(d.idToken);
  if (!u) return { ok: false, error: 'Esta cuenta no tiene acceso al dashboard.' };
  const found = findRow_(d.id);
  if (!found) return { ok: false, error: 'No encontramos esa cita.' };
  const r = found.row;
  const s = settings_();
  const now = new Date().toISOString();
  let patch = {};
  switch (d.op) {
    case 'completar': patch = { estado: 'completada' }; break;
    case 'noAsistio': patch = { estado: 'no-asistio' }; break;
    case 'reabrir': patch = { estado: 'confirmada' }; break;
    case 'saldoEfectivo': patch = { saldoEstado: 'pagado', saldoMetodo: 'efectivo', saldoPagado: now }; break;
    case 'saldoPendiente': patch = { saldoEstado: 'pendiente', saldoMetodo: '', saldoPagado: '' }; break;
    case 'nota': patch = { notaInterna: clean_(d.note, 500) }; break;
    case 'cancelar':
      if (r.estado === 'cancelada') return { ok: false, error: 'La cita ya estaba cancelada.' };
      patch = { estado: 'cancelada', canceladaEn: now, canceladaPor: 'estudio' };
      if (r.estado === 'bloqueo') { patch.canceladaPor = 'bloqueo eliminado'; break; }
      patch.reembolso = d.refund && r.paypalCaptura ? tryRefund_(r.paypalCaptura, r.id + '-refund') : 'sin reembolso';
      if (r.saldoCaptura) patch.reembolso += ' · saldo: ' + tryRefund_(r.saldoCaptura, r.id + '-refund-saldo');
      break;
    default: return { ok: false, error: 'Acción no válida.' };
  }
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  if (d.op === 'cancelar' && r.canceladaPor === 'estudio') { calendarCancel_(r, s); notifyCancelled_(r, s, /^reembolsado/.test(patch.reembolso || ''), true); }
  return { ok: true, item: adminRow_(r) };
}

/* Bloquear un día o unas horas (vacaciones, cita tomada fuera de la web…) */
function adminBlock_(d) {
  const u = admin_(d.idToken);
  if (!u) return { ok: false, error: 'Esta cuenta no tiene acceso al dashboard.' };
  if (!isDateKey_(d.date)) return { ok: false, error: 'Fecha no válida.' };
  const from = /^\d{2}:\d{2}$/.test(d.from || '') ? d.from : '00:00';
  const to = /^\d{2}:\d{2}$/.test(d.to || '') ? d.to : '23:59';
  const start = new Date(d.date + 'T' + from + ':00' + UTC_OFFSET);
  const end = new Date(d.date + 'T' + to + ':00' + UTC_OFFSET);
  if (end <= start) return { ok: false, error: 'La hora final debe ser después de la inicial.' };
  const row = {
    id: 'BLQ-' + Utilities.getUuid().slice(0, 8).toUpperCase(), creada: new Date().toISOString(), estado: 'bloqueo',
    fecha: d.date, hora: from, inicio: start.toISOString(), fin: end.toISOString(),
    duracionMin: Math.round((end - start) / 60000), servicios: clean_(d.reason, 120) || 'Bloqueado', clienta: u.email,
  };
  insertRow_(row);
  return { ok: true, item: adminRow_(row) };
}

/* =========================================================================
   Hoja de cálculo
   ========================================================================= */

function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Falta ejecutar setup() en el editor de Apps Script.');
  return SpreadsheetApp.openById(id);
}
function tab_(name) {
  const t = sheet_().getSheetByName(name);
  if (!t) throw new Error('Falta la pestaña "' + name + '". Ejecuta setup().');
  return t;
}

function rows_() {
  const t = tab_('Reservas');
  const last = t.getLastRow();
  if (last < 2) return [];
  const values = t.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return values.map(function (v) {
    const o = {};
    HEADERS.forEach(function (h, i) { o[h] = v[i] instanceof Date ? v[i].toISOString() : String(v[i] == null ? '' : v[i]); });
    return o;
  }).filter(function (o) { return o.id; });
}

function findRow_(id) {
  if (!id) return null;
  const t = tab_('Reservas');
  const last = t.getLastRow();
  if (last < 2) return null;
  const ids = t.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      const v = t.getRange(i + 2, 1, 1, HEADERS.length).getValues()[0];
      const o = {};
      HEADERS.forEach(function (h, j) { o[h] = v[j] instanceof Date ? v[j].toISOString() : String(v[j] == null ? '' : v[j]); });
      return { index: i + 2, row: o };
    }
  }
  return null;
}

function insertRow_(o) {
  const t = tab_('Reservas');
  const row = HEADERS.map(function (h) { return cell_(o[h]); });
  const r = t.getLastRow() + 1;
  t.getRange(r, 1, 1, HEADERS.length).setNumberFormat('@').setValues([row]);
}

function updateRow_(index, patch) {
  const t = tab_('Reservas');
  Object.keys(patch).forEach(function (k) {
    const col = HEADERS.indexOf(k);
    if (col >= 0) t.getRange(index, col + 1).setNumberFormat('@').setValue(cell_(patch[k]));
  });
}

function settings_() {
  const t = tab_('Ajustes');
  const out = {};
  DEFAULT_SETTINGS.forEach(function (x) { out[x[0]] = x[1]; });
  const last = t.getLastRow();
  if (last >= 2) t.getRange(2, 1, last - 1, 2).getValues().forEach(function (v) { if (v[0]) out[String(v[0]).trim()] = String(v[1] == null ? '' : v[1]).trim(); });
  return out;
}

function services_() {
  const t = tab_('Servicios');
  const last = t.getLastRow();
  if (last < 2) return [];
  return t.getRange(2, 1, last - 1, 6).getValues().filter(function (v) { return v[0] && !/^no$/i.test(String(v[5])); }).map(function (v) {
    return { id: String(v[0]).trim(), name: String(v[1]).trim(), durationMinutes: Number(v[2]) || 30, price: Number(v[3]) || 0, priceFrom: /^s[ií]$/i.test(String(v[4])) };
  });
}

/* =========================================================================
   Horario
   ========================================================================= */

function schedule_(s) {
  const hours = {};
  DAY_KEYS.forEach(function (k, dow) {
    const m = String(s[k] || '').match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    hours[dow] = m ? { open: pad_(m[1]) + ':' + m[2], close: pad_(m[3]) + ':' + m[4] } : null;
  });
  return {
    hours: hours,
    blocked: String(s.diasCerrados || '').split(',').map(function (x) { return x.trim(); }).filter(isDateKey_),
    minNotice: num_(s.minAntelacionHoras, 3), maxDays: num_(s.maxDiasAdelante, 60), step: num_(s.intervaloMinutos, 30),
  };
}

function slotProblem_(sch, date, time, minutes) {
  if (sch.blocked.indexOf(date) >= 0) return 'Ese día el estudio está cerrado.';
  const p = date.split('-').map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  const h = sch.hours[dow];
  if (!h) return 'Ese día el estudio está cerrado.';
  const t = toMin_(time);
  if (t < toMin_(h.open) || t + minutes > toMin_(h.close)) return 'Esa hora está fuera del horario del estudio.';
  const start = new Date(date + 'T' + time + ':00' + UTC_OFFSET).getTime();
  if (start < Date.now() + sch.minNotice * 3600000) return 'Ese horario ya no se puede reservar. Elige uno más adelante.';
  if (start > Date.now() + (sch.maxDays + 1) * 86400000) return 'Aún no abrimos la agenda para esa fecha.';
  return null;
}

function conflicts_(start, end, exceptId) {
  const now = Date.now();
  return rows_().filter(function (r) {
    if (r.id === exceptId || !occupies_(r, now)) return false;
    return new Date(r.inicio) < end && new Date(r.fin) > start;
  });
}

/* =========================================================================
   PayPal (API REST v2)
   ========================================================================= */

function paypalEnv_() { return (PropertiesService.getScriptProperties().getProperty('PAYPAL_ENV') || 'sandbox').trim().toLowerCase() === 'live' ? 'live' : 'sandbox'; }
function paypalBase_() { return paypalEnv_() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }

function paypalToken_() {
  const cache = CacheService.getScriptCache();
  const key = 'pp_token_' + paypalEnv_();
  const hit = cache.get(key);
  if (hit) return hit;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PAYPAL_CLIENT_ID'), secret = props.getProperty('PAYPAL_SECRET');
  if (!id || !secret) throw new Error('Los pagos con PayPal aún no están configurados.');
  const res = UrlFetchApp.fetch(paypalBase_() + '/v1/oauth2/token', {
    method: 'post', muteHttpExceptions: true,
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + secret) },
    payload: { grant_type: 'client_credentials' },
  });
  if (res.getResponseCode() !== 200) throw new Error('No se pudo conectar con PayPal. Revisa las llaves.');
  const data = JSON.parse(res.getContentText());
  cache.put(key, data.access_token, Math.max(60, Math.min(21600, Number(data.expires_in || 3600) - 120)));
  return data.access_token;
}

function paypal_(method, path, body, requestId) {
  const headers = { Authorization: 'Bearer ' + paypalToken_(), 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (requestId) headers['PayPal-Request-Id'] = requestId;
  const res = UrlFetchApp.fetch(paypalBase_() + path, {
    method: method, headers: headers, muteHttpExceptions: true,
    payload: body == null ? undefined : JSON.stringify(body),
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
  if (code >= 300) {
    const issue = data.details && data.details[0] && data.details[0].issue;
    if (issue === 'INSTRUMENT_DECLINED') throw new Error('PayPal rechazó el método de pago. Prueba con otra tarjeta o cuenta.');
    if (issue === 'ORDER_ALREADY_CAPTURED') return getOrder_(path);
    throw new Error('PayPal: ' + (data.message || issue || ('error ' + code)));
  }
  return data;
}

function getOrder_(capturePath) {
  const orderPath = capturePath.replace(/\/capture$/, '');
  return paypal_('get', orderPath, null);
}

function firstCapture_(order) {
  const pu = order && order.purchase_units && order.purchase_units[0];
  return pu && pu.payments && pu.payments.captures && pu.payments.captures[0];
}

function tryRefund_(captureId, requestId) {
  try {
    const r = paypal_('post', '/v2/payments/captures/' + encodeURIComponent(captureId) + '/refund', {}, requestId);
    return 'reembolsado ' + (r.id || '') + ' (' + (r.status || '') + ')';
  } catch (err) {
    return 'reembolso pendiente: ' + msg_(err);
  }
}

/* =========================================================================
   Google Calendar y correos
   ========================================================================= */

function calendarCreate_(r, s) {
  const calId = String(s.calendarioId || '').trim();
  if (!calId) return '';
  try {
    const cal = calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
    const opts = { description: describe_(r, s), location: s.direccion || '' };
    if (/^s[ií]$/i.test(s.invitarClienta)) { opts.guests = r.correo; opts.sendInvites = true; }
    const ev = cal.createEvent('MAJOBELLA · ' + r.servicios + ' · ' + r.clienta, new Date(r.inicio), new Date(r.fin), opts);
    return ev.getId();
  } catch (err) { return ''; }
}

function calendarCancel_(r, s) {
  if (!r.eventoId) return;
  try {
    const calId = String(s.calendarioId || '').trim();
    const cal = calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
    const ev = cal.getEventById(r.eventoId);
    if (ev) ev.deleteEvent();
  } catch (err) { /* el calendario es opcional */ }
}

function describe_(r, s) {
  return [
    'Reserva: ' + r.id,
    'Servicio: ' + r.servicios,
    'Duración: ' + r.duracionMin + ' min',
    'Total: RD$ ' + money_(r.totalRD),
    'Depósito pagado: RD$ ' + money_(r.depositoRD) + ' (US$ ' + r.depositoUSD + ' por PayPal)',
    'Saldo: RD$ ' + money_(r.saldoRD) + ' al terminar (efectivo o PayPal)',
    '',
    'Clienta: ' + r.clienta, 'Teléfono: ' + r.telefono, 'Correo: ' + r.correo,
    r.nota ? 'Nota: ' + r.nota : '',
  ].join('\n');
}

function notifyConfirmed_(r, s) {
  const when = whenText_(r);
  const web = s.webUrl ? '<p><a href="' + s.webUrl + '#citas">Ver o cancelar mi cita</a></p>' : '';
  const maps = s.mapsUrl ? ' · <a href="' + s.mapsUrl + '">Cómo llegar</a>' : '';
  safeMail_(r.correo, 'Tu cita en MAJOBELLA está confirmada · ' + when,
    '<div style="font-family:Georgia,serif;color:#111;max-width:520px">' +
    '<p style="letter-spacing:.2em;font-size:12px">MAJOBELLA</p>' +
    '<h2 style="font-weight:400">¡Te esperamos, ' + esc_(r.clienta.split(' ')[0]) + '!</h2>' +
    '<p><b>' + esc_(r.servicios) + '</b><br>' + when + '</p>' +
    '<p>Depósito recibido: RD$ ' + money_(r.depositoRD) + ' (US$ ' + r.depositoUSD + ').<br>' +
    'Saldo al terminar: RD$ ' + money_(r.saldoRD) + ', en efectivo o con PayPal.</p>' +
    '<p>Si cancelas con al menos ' + num_(s.horasCancelacion, 24) + ' horas de aviso te devolvemos el depósito.</p>' +
    '<p>' + esc_(s.direccion || '') + maps + '</p>' + web +
    '<p style="color:#666;font-size:13px">Código de reserva: ' + r.id + '</p></div>');
  safeMail_(adminTo_(s), 'Nueva reserva · ' + r.clienta + ' · ' + when,
    '<pre style="font-family:inherit">' + esc_(describe_(r, s)) + '</pre>');
}

function notifyCancelled_(r, s, refunded, byStudio) {
  const when = whenText_(r);
  safeMail_(r.correo, 'Tu cita en MAJOBELLA fue cancelada · ' + when,
    '<div style="font-family:Georgia,serif;color:#111;max-width:520px"><p>' +
    (byStudio ? 'El estudio canceló tu cita' : 'Cancelaste tu cita') + ' de ' + esc_(r.servicios) + ' (' + when + ').</p>' +
    '<p>' + (refunded ? 'Te devolvimos el depósito en PayPal. Puede tardar unos días en reflejarse.' : 'El depósito no es reembolsable para esta cancelación.') + '</p>' +
    '<p style="color:#666;font-size:13px">Código de reserva: ' + r.id + '</p></div>');
  safeMail_(adminTo_(s), 'Cita cancelada · ' + r.clienta + ' · ' + when,
    '<p>' + (byStudio ? 'Cancelada desde el dashboard.' : 'La clienta canceló.') + ' Reembolso: ' + esc_(r.reembolso || 'no') + '</p><pre style="font-family:inherit">' + esc_(describe_(r, s)) + '</pre>');
}

function safeMail_(to, subject, html) {
  if (!to) return;
  try { MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: 'MAJOBELLA' }); } catch (err) { /* el correo no debe romper la reserva */ }
}

function adminTo_(s) {
  return String(s.correoAvisos || PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '').trim();
}

function whenText_(r) {
  const d = new Date(r.inicio);
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const p = r.fecha.split('-').map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  const hh = Number(Utilities.formatDate(d, TZ, 'H')), mm = Utilities.formatDate(d, TZ, 'mm');
  return days[dow] + ' ' + p[2] + ' de ' + months[p[1] - 1] + ', ' + ((hh % 12) || 12) + ':' + mm + (hh < 12 ? ' a. m.' : ' p. m.');
}

/* =========================================================================
   Formatos de salida
   ========================================================================= */

function publicRow_(r) {
  return {
    id: r.id, remote: true, status: r.estado,
    date: r.fecha, time: r.hora, start: r.inicio, end: r.fin,
    durationMinutes: Number(r.duracionMin) || 0,
    totalPrice: Number(r.totalRD) || 0,
    services: safeJson_(r.serviciosJson, []),
    payment: {
      depositRD: Number(r.depositoRD) || 0, depositUSD: r.depositoUSD, depositPaid: !!r.paypalCaptura,
      balanceRD: Number(r.saldoRD) || 0, balanceStatus: r.saldoEstado || 'pendiente', balanceMethod: r.saldoMetodo || '',
      refund: /^reembolsado/.test(r.reembolso || '') ? 'reembolsado' : (r.reembolso ? 'no' : ''),
    },
    client: { name: r.clienta, email: r.correo },
  };
}

function adminRow_(r) {
  const p = publicRow_(r);
  p.client = { name: r.clienta, email: r.correo, phone: r.telefono, notes: r.nota };
  p.servicesText = r.servicios;
  p.createdAt = r.creada;
  p.payment.depositPaidAt = r.depositoPagado;
  p.payment.balancePaidAt = r.saldoPagado;
  p.payment.refundDetail = r.reembolso;
  p.payment.paypalCapture = r.paypalCaptura;
  p.cancelledBy = r.canceladaPor;
  p.internalNote = r.notaInterna;
  p.holdUntil = r.estado === 'retenida' ? r.retenidaHasta : '';
  return p;
}

/* =========================================================================
   Seguridad y utilidades
   ========================================================================= */

function authorized_(r, d) {
  if (d.token && r.tokenHash && hash_(d.token) === r.tokenHash) return true;
  if (d.idToken) { const u = verifyIdToken_(d.idToken); if (u && u.email === r.correo) return true; }
  return false;
}

function admin_(idToken) {
  const u = verifyIdToken_(idToken);
  if (!u) return null;
  const list = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '')
    .split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
  return list.indexOf(u.email) >= 0 ? u : null;
}

// Verifica con Google el token de "Iniciar sesión con Google" y devuelve { email, name } o null
function verifyIdToken_(idToken) {
  if (!idToken || !GOOGLE_CLIENT_ID) return null;
  const cache = CacheService.getScriptCache();
  const key = 'idt_' + hash_(idToken).slice(0, 40);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  const info = JSON.parse(res.getContentText());
  if (info.aud !== GOOGLE_CLIENT_ID) return null;
  if (String(info.email_verified) !== 'true') return null;
  if (Number(info.exp) * 1000 < Date.now()) return null;
  const u = { email: String(info.email).toLowerCase(), name: info.name || '' };
  cache.put(key, JSON.stringify(u), 600);
  return u;
}

function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); }
  finally { lock.releaseLock(); }
}

function hash_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

// Texto seguro para la hoja (evita que algo escrito por la clienta se lea como fórmula)
function cell_(v) { const t = v == null ? '' : String(v); return /^[=+\-@]/.test(t) && !/^-?\d/.test(t) ? "'" + t : t; }
function usd_(rd, rate) { return Math.ceil((Number(rd) / rate) * 100) / 100; }
function num_(v, def) { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : def; }
function money_(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
function pad_(h) { return ('0' + h).slice(-2); }
function toMin_(hhmm) { const p = hhmm.split(':').map(Number); return p[0] * 60 + p[1]; }
function isDateKey_(k) { return /^\d{4}-\d{2}-\d{2}$/.test(String(k || '')); }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function esc_(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function safeJson_(t, def) { try { return JSON.parse(t); } catch (e) { return def; } }
function msg_(err) { return String((err && err.message) || err); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
