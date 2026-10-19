/**
 * MAJOBELLA · Backend de reservas (Google Apps Script + Google Sheets + PayPal)
 *
 * Base de datos: una hoja de cálculo de Google con estas pestañas
 *   - Reservas     cada cita es una fila (estado, horario, clienta, pagos, origen)
 *   - Servicios    precio, duración y cada cuántos días vuelve la clienta
 *   - Ajustes      tasa del dólar, % de depósito, horario, políticas, comisiones
 *   - Bloqueos     horarios bloqueados (una vez, varios días o cada semana)
 *   - Clientas     notas y datos de cada clienta
 *   - Archivos     fotos de antes/después y consentimientos (los archivos van a Google Drive)
 *   - Promociones  descuentos automáticos por servicio y códigos de descuento
 *   - Tarjetas     tarjetas de regalo
 *   - Gastos       gastos del estudio (para la ganancia real del mes)
 *
 * Cómo se reserva:
 *   1. La web pide 'hold': se valida el horario, se aplican promociones, códigos y tarjetas de regalo,
 *      se aparta el horario unos minutos y se crea la orden de PayPal por el depósito (en USD).
 *   2. La clienta paga en PayPal y la web pide 'capture': se cobra, la cita pasa a
 *      "confirmada", se agenda en Google Calendar y se envían los correos.
 *   3. El saldo se paga al terminar: en efectivo o transferencia (se marca en el dashboard) o con PayPal desde "Citas".
 *
 * Instalación: ver backend/google-apps-script/INSTALAR.md
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   PAYPAL_CLIENT_ID   ID de cliente de la app REST de PayPal
 *   PAYPAL_SECRET      Secreto de esa app (nunca va en la web ni en GitHub)
 *   PAYPAL_ENV         sandbox (pruebas) o live (cobros reales)
 *   ADMIN_EMAILS       correos de Google que pueden abrir el dashboard, separados por coma
 *   SHEET_ID           lo crea setup() automáticamente
 *   FILES_FOLDER_ID    carpeta de Drive para las fichas; la crea setup()
 */

const GOOGLE_CLIENT_ID = '333956941163-rlgrb3759jf2uc05olhhpm9e2ggrhm1s.apps.googleusercontent.com';
const TZ = 'America/Santo_Domingo';
const UTC_OFFSET = '-04:00';              // República Dominicana no usa horario de verano

// Columnas de cada pestaña. Las nuevas se añaden al final; setup() completa las que falten.
const HEADERS = [
  'id', 'creada', 'estado', 'fecha', 'hora', 'inicio', 'fin', 'duracionMin',
  'servicios', 'serviciosJson', 'totalRD', 'depositoRD', 'depositoUSD', 'saldoRD',
  'clienta', 'telefono', 'correo', 'nota', 'tokenHash',
  'paypalOrden', 'paypalCaptura', 'depositoPagado',
  'saldoEstado', 'saldoMetodo', 'saldoPagado', 'saldoOrden', 'saldoCaptura', 'saldoUSD',
  'retenidaHasta', 'eventoId', 'canceladaEn', 'canceladaPor', 'reembolso', 'notaInterna',
  'subtotalRD', 'descuentoRD', 'promoId', 'codigo', 'giftCodigo', 'giftRD',
  'metodoDeposito', 'origen', 'canal', 'creadaPor', 'reprogramadaDe',
];
const TABLES = {
  Reservas: HEADERS,
  Servicios: ['id', 'nombre', 'duracionMin', 'precioRD', 'precioDesde', 'activo', 'volverDias'],
  Ajustes: ['clave', 'valor', 'qué es'],
  Bloqueos: ['id', 'tipo', 'dias', 'horaDesde', 'horaHasta', 'fechaDesde', 'fechaHasta', 'motivo', 'activo', 'creada'],
  Clientas: ['clave', 'nombre', 'telefono', 'correo', 'notas', 'cumpleanos', 'actualizada'],
  Archivos: ['id', 'clave', 'tipo', 'nombre', 'mime', 'driveId', 'citaId', 'fecha', 'nota', 'creada'],
  Promociones: ['id', 'nombre', 'tipo', 'codigo', 'servicios', 'descuentoTipo', 'valor', 'desde', 'hasta', 'usosMax', 'usos', 'activo', 'creada'],
  Tarjetas: ['id', 'codigo', 'montoRD', 'saldoRD', 'comprador', 'para', 'mensaje', 'metodoPago', 'vendida', 'vence', 'estado', 'creada'],
  Gastos: ['id', 'fecha', 'concepto', 'categoria', 'montoRD', 'metodo', 'creada'],
};

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
  ['comisionPaypalPct', '5.4', 'Comisión de PayPal por pago recibido (%). Para calcular la ganancia real.'],
  ['comisionPaypalFijoUSD', '0.30', 'Cargo fijo de PayPal por pago (US$).'],
  ['conversionPct', '3.5', 'Pérdida al convertir dólares a pesos al retirar de PayPal (%).'],
];
const SETTING_KEYS = DEFAULT_SETTINGS.map(function (x) { return x[0]; });

// Igual que js/data/services.js. Desde el dashboard o la hoja "Servicios" se cambian precios y duraciones.
const DEFAULT_SERVICES = [
  ['faciales', 'Faciales', 60, 2500, 'no', 'si', 30],
  ['cejas', 'Cejas', 45, 900, 'no', 'si', 28],
  ['pestanas', 'Pestañas', 60, 1800, 'no', 'si', 21],
  ['micropigmentacion', 'Micropigmentación', 150, 12000, 'no', 'si', 365],
  ['depilacion', 'Depilación facial y corporal', 30, 500, 'si', 'si', 30],
];
const DAY_KEYS = ['horario_domingo', 'horario_lunes', 'horario_martes', 'horario_miercoles', 'horario_jueves', 'horario_viernes', 'horario_sabado'];
const FILE_TYPES = ['antes', 'despues', 'consentimiento', 'otro'];
const FILE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_BYTES = 12 * 1024 * 1024;

/* =========================================================================
   Instalación
   ========================================================================= */

/** Ejecuta esta función desde el editor al instalar y después de cada actualización del código:
    crea la hoja, las pestañas y las columnas que falten, sin tocar los datos existentes. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const existing = props.getProperty('SHEET_ID');
  if (existing) { try { ss = SpreadsheetApp.openById(existing); } catch (e) { ss = null; } }
  if (!ss) { try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; } }
  if (!ss) ss = SpreadsheetApp.create('MAJOBELLA · Reservas');
  props.setProperty('SHEET_ID', ss.getId());

  Object.keys(TABLES).forEach(function (name) {
    let t = ss.getSheetByName(name);
    const fresh = !t;
    if (!t) t = ss.insertSheet(name);
    const want = TABLES[name];
    if (t.getLastRow() === 0) {
      t.getRange(1, 1, 1, want.length).setValues([want]).setFontWeight('bold');
      t.setFrozenRows(1);
    } else {
      const have = t.getRange(1, 1, 1, Math.max(1, t.getLastColumn())).getValues()[0].map(String);
      const missing = want.filter(function (h) { return have.indexOf(h) < 0; });
      if (missing.length) t.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
    t.getRange(1, 1, t.getMaxRows(), Math.max(want.length, t.getLastColumn())).setNumberFormat('@'); // todo como texto
    if (name === 'Ajustes') {
      const keys = readTable_('Ajustes').map(function (r) { return r.clave; });
      const add = DEFAULT_SETTINGS.filter(function (x) { return keys.indexOf(x[0]) < 0; });
      if (add.length) t.getRange(t.getLastRow() + 1, 1, add.length, 3).setValues(add);
      if (fresh) t.autoResizeColumns(1, 3);
    }
    if (name === 'Servicios') {
      const rows = readTable_('Servicios');
      if (!rows.length) {
        DEFAULT_SERVICES.forEach(function (x) {
          appendRow_('Servicios', { id: x[0], nombre: x[1], duracionMin: x[2], precioRD: x[3], precioDesde: x[4], activo: x[5], volverDias: x[6] });
        });
      } else {
        rows.forEach(function (r) {
          if (r.volverDias) return;
          const def = DEFAULT_SERVICES.filter(function (x) { return x[0] === r.id; })[0];
          updateTable_('Servicios', r._row, { volverDias: def ? def[6] : 30 });
        });
      }
    }
  });

  // Carpeta privada de Drive para fotos y consentimientos
  let folderId = props.getProperty('FILES_FOLDER_ID');
  let folder = null;
  if (folderId) { try { folder = DriveApp.getFolderById(folderId); } catch (e) { folder = null; } }
  if (!folder) { folder = DriveApp.createFolder('MAJOBELLA · Fichas de clientas'); props.setProperty('FILES_FOLDER_ID', folder.getId()); }

  const blank = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > Object.keys(TABLES).length) ss.deleteSheet(blank);
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
  const L = function (fn) { return function () { return locked_(function () { return fn(data); }); }; };
  const N = function (fn) { return function () { return fn(data); }; };
  const actions = {
    // Clientas
    checkCode: N(checkCode_),
    hold: L(hold_),
    capture: L(capture_),
    release: L(release_),
    cancel: L(cancel_),
    balanceOrder: N(balanceOrder_),
    balanceCapture: L(balanceCapture_),
    myAppointments: N(myAppointments_),
    lookup: N(lookup_),
    // Dashboard
    adminData: N(adminData_),
    adminList: N(adminData_), // compatibilidad
    adminUpdate: L(adminUpdate_),
    adminCreate: L(adminCreate_),
    adminReschedule: L(adminReschedule_),
    adminBlock: L(adminBlock_),
    adminDeleteBlock: L(adminDeleteBlock_),
    adminSaveSettings: L(adminSaveSettings_),
    adminSaveClient: L(adminSaveClient_),
    adminUpload: L(adminUpload_),
    adminFile: N(adminFile_),
    adminDeleteFile: L(adminDeleteFile_),
    adminSavePromo: L(adminSavePromo_),
    adminDeletePromo: L(adminDeletePromo_),
    adminSaveGift: L(adminSaveGift_),
    adminSaveExpense: L(adminSaveExpense_),
    adminDeleteExpense: L(adminDeleteExpense_),
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
  const today = todayKey_();
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
    // Solo las promociones automáticas (los códigos no se publican)
    promos: promos_(today).filter(function (p) { return p.tipo === 'auto'; }).map(function (p) {
      return { id: p.id, name: p.nombre, services: p.servicios, kind: p.descuentoTipo, value: p.valor, until: p.hasta };
    }),
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
  blockIntervals_(blocks_(), from, to).forEach(function (x) { busy.push({ start: x.start, end: x.end }); });
  return { ok: true, busy: busy };
}

function occupies_(r, now) {
  if (BUSY_STATES.indexOf(r.estado) >= 0) return true;
  return r.estado === 'retenida' && new Date(r.retenidaHasta).getTime() > now;
}

/* =========================================================================
   Precios: promociones, códigos y tarjetas de regalo
   ========================================================================= */

/* Promociones activas hoy */
function promos_(today) {
  return readTable_('Promociones').filter(function (p) {
    if (/^no$/i.test(p.activo)) return false;
    if (p.desde && today < p.desde) return false;
    if (p.hasta && today > p.hasta) return false;
    const max = Number(p.usosMax) || 0;
    return !max || (Number(p.usos) || 0) < max;
  }).map(function (p) {
    p.servicios = String(p.servicios || 'todos').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    p.valor = Number(p.valor) || 0;
    return p;
  });
}

function promoAppliesTo_(p, id) { return p.servicios.indexOf('todos') >= 0 || p.servicios.indexOf(id) >= 0; }

function promoDiscount_(p, items) {
  const applicable = items.filter(function (x) { return promoAppliesTo_(p, x.id); });
  const base = applicable.reduce(function (t, x) { return t + x.price; }, 0);
  if (!base) return 0;
  if (p.descuentoTipo === 'monto') return Math.min(base, Math.round(p.valor));
  return Math.round(base * Math.min(100, p.valor) / 100);
}

function findGift_(code) {
  const c = normCode_(code);
  if (!c) return null;
  return readTable_('Tarjetas').filter(function (g) { return normCode_(g.codigo) === c; })[0] || null;
}

function giftUsable_(g, today) {
  if (!g || g.estado === 'anulada') return false;
  if (g.vence && today > g.vence) return false;
  return (Number(g.saldoRD) || 0) > 0;
}

/* Calcula el total de una cita: la mejor promoción (automática o código) y la tarjeta de regalo */
function pricing_(items, code, giftCode) {
  const s = settings_();
  const today = todayKey_();
  const subtotal = items.reduce(function (t, x) { return t + x.price; }, 0);
  const promos = promos_(today);
  // Automáticas: la mejor por servicio
  let auto = 0, autoPromo = null;
  items.forEach(function (it) {
    let best = 0, bp = null;
    promos.filter(function (p) { return p.tipo === 'auto' && promoAppliesTo_(p, it.id); }).forEach(function (p) {
      const dsc = promoDiscount_(p, [it]);
      if (dsc > best) { best = dsc; bp = p; }
    });
    auto += best;
    if (bp && !autoPromo) autoPromo = bp;
  });
  let discount = auto, promo = autoPromo, codeStatus = '', codeLabel = '';
  const c = normCode_(code);
  if (c) {
    const cp = promos.filter(function (p) { return p.tipo === 'codigo' && normCode_(p.codigo) === c; })[0];
    if (!cp) codeStatus = 'invalid';
    else {
      const cd = promoDiscount_(cp, items);
      codeLabel = cp.nombre;
      if (!cd) codeStatus = 'notApplicable';
      else if (cd >= auto) { discount = cd; promo = cp; codeStatus = 'ok'; }
      else codeStatus = 'notBetter';
    }
  }
  discount = Math.min(discount, subtotal);
  const total = subtotal - discount;
  let gift = null, giftApplied = 0, giftStatus = '';
  if (normCode_(giftCode)) {
    gift = findGift_(giftCode);
    if (!giftUsable_(gift, today)) { giftStatus = 'invalid'; gift = null; }
    else { giftApplied = Math.min(Number(gift.saldoRD) || 0, total); giftStatus = 'ok'; }
  }
  const remaining = total - giftApplied;
  const pct = num_(s.porcentajeDeposito, 50) / 100;
  const depositRD = Math.round(remaining * pct);
  return {
    subtotal: subtotal, discount: discount, total: total, promo: promo, codeStatus: codeStatus, codeLabel: codeLabel,
    gift: gift, giftApplied: giftApplied, giftStatus: giftStatus, giftBalance: gift ? Number(gift.saldoRD) || 0 : 0,
    remaining: remaining, depositRD: depositRD, balanceRD: remaining - depositRD,
    depositUSD: usd_(depositRD, num_(s.tasaUSD, 63)), usdRate: num_(s.tasaUSD, 63),
  };
}

function catalogItems_(ids) {
  const catalog = {};
  services_().forEach(function (x) { catalog[x.id] = x; });
  return ids.map(function (id) { return catalog[id]; });
}

/* La web consulta un código o tarjeta antes de pagar */
function checkCode_(d) {
  const ids = (d.services || []).map(function (x) { return typeof x === 'string' ? x : x && x.id; }).filter(Boolean);
  const items = catalogItems_(ids);
  if (!items.length || items.some(function (x) { return !x; })) return { ok: false, error: 'Elige primero tus servicios.' };
  const p = pricing_(items, d.code, d.giftCode);
  return { ok: true, pricing: pricingOut_(p) };
}

function pricingOut_(p) {
  return {
    subtotalRD: p.subtotal, discountRD: p.discount, totalRD: p.total,
    promoName: p.promo ? p.promo.nombre : '', codeStatus: p.codeStatus,
    giftAppliedRD: p.giftApplied, giftStatus: p.giftStatus, giftBalanceRD: p.giftBalance,
    depositRD: p.depositRD, depositUSD: p.depositUSD.toFixed(2), balanceRD: p.balanceRD, usdRate: p.usdRate,
  };
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
  const ids = (d.services || []).map(function (x) { return typeof x === 'string' ? x : x && x.id; }).filter(Boolean);
  const items = catalogItems_(ids);
  if (!items.length || items.some(function (x) { return !x; })) return { ok: false, error: 'Elige un servicio válido.' };
  const minutes = items.reduce(function (t, x) { return t + x.durationMinutes; }, 0);

  // Horario
  if (!isDateKey_(d.date) || !/^\d{2}:\d{2}$/.test(d.time || '')) return { ok: false, error: 'Fecha u hora no válida.' };
  const check = slotProblem_(sch, d.date, d.time, minutes);
  if (check) return { ok: false, error: check };
  const start = new Date(d.date + 'T' + d.time + ':00' + UTC_OFFSET);
  const end = new Date(start.getTime() + minutes * 60000);
  if (conflicts_(start, end, null).length) return { ok: false, error: 'Ese horario acaba de reservarse. Elige otro, por favor.' };

  // Montos con promociones y tarjeta de regalo
  const p = pricing_(items, d.code, d.giftCode);
  if (normCode_(d.code) && p.codeStatus === 'invalid') return { ok: false, error: 'Ese código de descuento no es válido o ya venció.' };
  if (normCode_(d.giftCode) && p.giftStatus === 'invalid') return { ok: false, error: 'Esa tarjeta de regalo no es válida o no tiene saldo.' };

  const holdMin = num_(s.minutosRetencion, 15);
  const id = 'MJB-' + Utilities.formatDate(start, TZ, 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  const token = Utilities.getUuid();
  const row = {
    id: id, creada: new Date().toISOString(), estado: 'retenida',
    fecha: d.date, hora: d.time, inicio: start.toISOString(), fin: end.toISOString(), duracionMin: minutes,
    servicios: items.map(function (x) { return x.name; }).join(' + '),
    serviciosJson: JSON.stringify(items.map(function (x) { return { id: x.id, name: x.name, price: x.price, durationMinutes: x.durationMinutes }; })),
    subtotalRD: p.subtotal, descuentoRD: p.discount, promoId: p.promo ? p.promo.id : '', codigo: p.codeStatus === 'ok' ? normCode_(d.code) : '',
    giftCodigo: p.gift ? p.gift.codigo : '', giftRD: p.giftApplied,
    totalRD: p.total, depositoRD: p.depositRD, depositoUSD: p.depositUSD.toFixed(2), saldoRD: p.balanceRD,
    clienta: name, telefono: phone, correo: email, nota: notes, tokenHash: hash_(token),
    saldoEstado: p.balanceRD > 0 ? 'pendiente' : 'pagado', retenidaHasta: new Date(Date.now() + holdMin * 60000).toISOString(),
    origen: clean_(d.origen, 40), canal: clean_(d.canal, 80), creadaPor: 'web',
  };

  // La tarjeta de regalo cubre todo el depósito: se confirma sin PayPal
  if (p.depositRD <= 0) {
    row.estado = 'confirmada';
    row.metodoDeposito = p.giftApplied ? 'tarjeta de regalo' : '';
    row.depositoPagado = new Date().toISOString();
    row.retenidaHasta = '';
    applyGift_(row, -1);
    usePromo_(row.promoId);
    row.eventoId = calendarCreate_(row, s);
    appendRow_('Reservas', row);
    notifyConfirmed_(row, s);
    return { ok: true, id: id, manageToken: token, confirmed: true, appointment: publicRow_(row), pricing: pricingOut_(p) };
  }

  // Orden de PayPal por el depósito
  const order = paypal_('post', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: id, custom_id: id, invoice_id: id + '-D',
      description: ('Depósito ' + Math.round(num_(s.porcentajeDeposito, 50)) + '% · ' + row.servicios).slice(0, 127),
      amount: { currency_code: 'USD', value: p.depositUSD.toFixed(2) },
    }],
    application_context: { brand_name: 'MAJOBELLA', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
  }, id + '-order');
  row.paypalOrden = order.id;
  row.metodoDeposito = 'paypal';
  appendRow_('Reservas', row);

  return {
    ok: true, id: id, manageToken: token, orderId: order.id,
    totalRD: p.total, depositRD: p.depositRD, depositUSD: p.depositUSD.toFixed(2), balanceRD: p.balanceRD,
    usdRate: p.usdRate, expiresAt: row.retenidaHasta, pricing: pricingOut_(p),
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
  applyGift_(r, -1);
  usePromo_(r.promoId);
  patch.saldoRD = r.saldoRD;
  patch.saldoEstado = r.saldoEstado;
  patch.giftRD = r.giftRD;
  patch.eventoId = calendarCreate_(r, s);
  r.eventoId = patch.eventoId;
  updateRow_(found.index, patch);
  notifyConfirmed_(r, s);
  return { ok: true, appointment: publicRow_(r) };
}

/* Descuenta (sign = -1) o devuelve (sign = +1) el saldo de la tarjeta de regalo de una cita */
function applyGift_(r, sign) {
  if (!r.giftCodigo || !(Number(r.giftRD) > 0)) return;
  const g = findGift_(r.giftCodigo);
  if (!g) return;
  let saldo = Number(g.saldoRD) || 0;
  let amount = Number(r.giftRD);
  if (sign < 0 && saldo < amount) {
    // La tarjeta se usó en otra cita mientras tanto: lo que falte pasa al saldo de la cita
    r.saldoRD = (Number(r.saldoRD) || 0) + (amount - saldo);
    if (Number(r.saldoRD) > 0) r.saldoEstado = 'pendiente';
    amount = saldo; r.giftRD = saldo;
  }
  saldo = saldo + sign * amount;
  updateTable_('Tarjetas', g._row, { saldoRD: Math.max(0, saldo), estado: saldo > 0 ? 'activa' : 'agotada' });
}

function usePromo_(promoId) {
  if (!promoId) return;
  const p = readTable_('Promociones').filter(function (x) { return x.id === promoId; })[0];
  if (p) updateTable_('Promociones', p._row, { usos: (Number(p.usos) || 0) + 1 });
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
  if (r.saldoEstado === 'pagado' || !(Number(r.saldoRD) > 0)) return { ok: false, error: 'El saldo ya está pagado.' };
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
  patch.reembolso = refundable && r.paypalCaptura ? tryRefund_(r.paypalCaptura, r.id + '-refund') : (refundable ? 'sin pago por PayPal' : 'no aplica (menos de ' + num_(s.horasCancelacion, 24) + ' h)');
  if (r.saldoCaptura) patch.reembolso += ' · saldo: ' + tryRefund_(r.saldoCaptura, r.id + '-refund-saldo');
  if (refundable) applyGift_(r, +1);
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  calendarCancel_(r, s);
  notifyCancelled_(r, s, refundable && /^reembolsado/.test(patch.reembolso));
  return { ok: true, refunded: refundable && /^reembolsado/.test(patch.reembolso), appointment: publicRow_(r) };
}

/* =========================================================================
   Dashboard (solo correos en ADMIN_EMAILS)
   ========================================================================= */

function needAdmin_(d) {
  const u = verifyIdToken_(d.idToken);
  if (!u) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  if (!admin_(d.idToken)) throw new Error('Esta cuenta no tiene acceso al dashboard.');
  return u;
}

/* Todo lo que necesita el dashboard en una sola consulta */
function adminData_(d) {
  const u = needAdmin_(d);
  const s = settings_();
  return {
    ok: true, user: u.email,
    items: rows_().map(adminRow_),
    blocks: blocks_(),
    clients: readTable_('Clientas').map(strip_),
    files: readTable_('Archivos').map(strip_),
    promos: readTable_('Promociones').map(strip_),
    gifts: readTable_('Tarjetas').map(strip_),
    expenses: readTable_('Gastos').map(strip_),
    settings: readTable_('Ajustes').map(function (r) { return { key: r.clave, value: r.valor, help: r['qué es'] || '' }; }),
    services: readTable_('Servicios').map(strip_),
    schedule: schedule_(s),
    paypalEnv: paypalEnv_(),
    sheetUrl: sheet_().getUrl(),
  };
}

function adminUpdate_(d) {
  needAdmin_(d);
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
    case 'saldoTransferencia': patch = { saldoEstado: 'pagado', saldoMetodo: 'transferencia', saldoPagado: now }; break;
    case 'saldoPendiente': patch = { saldoEstado: 'pendiente', saldoMetodo: '', saldoPagado: '' }; break;
    case 'nota': patch = { notaInterna: clean_(d.note, 500) }; break;
    case 'cancelar':
      if (r.estado === 'cancelada') return { ok: false, error: 'La cita ya estaba cancelada.' };
      patch = { estado: 'cancelada', canceladaEn: now, canceladaPor: 'estudio' };
      if (r.estado === 'bloqueo') { patch.canceladaPor = 'bloqueo eliminado'; break; }
      patch.reembolso = d.refund && r.paypalCaptura ? tryRefund_(r.paypalCaptura, r.id + '-refund') : (d.refund ? 'devolver a mano (pago fuera de PayPal)' : 'sin reembolso');
      if (r.saldoCaptura) patch.reembolso += ' · saldo: ' + tryRefund_(r.saldoCaptura, r.id + '-refund-saldo');
      if (d.refund) applyGift_(r, +1);
      break;
    default: return { ok: false, error: 'Acción no válida.' };
  }
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  if (d.op === 'cancelar' && r.canceladaPor === 'estudio') {
    calendarCancel_(r, s);
    if (d.notify !== false) notifyCancelled_(r, s, /^reembolsado/.test(patch.reembolso || ''), true);
  }
  return { ok: true, item: adminRow_(r) };
}

/* Cita creada a mano (teléfono, WhatsApp, en persona) */
function adminCreate_(d) {
  needAdmin_(d);
  const s = settings_();
  const c = d.client || {};
  const name = clean_(c.name, 80);
  if (name.length < 2) return { ok: false, error: 'Escribe el nombre de la clienta.' };
  const ids = (d.services || []).filter(Boolean);
  const items = catalogItems_(ids);
  if (!items.length || items.some(function (x) { return !x; })) return { ok: false, error: 'Elige al menos un servicio.' };
  if (!isDateKey_(d.date) || !/^\d{2}:\d{2}$/.test(d.time || '')) return { ok: false, error: 'Elige fecha y hora.' };
  const minutes = Number(d.durationMinutes) > 0 ? Math.round(Number(d.durationMinutes)) : items.reduce(function (t, x) { return t + x.durationMinutes; }, 0);
  const start = new Date(d.date + 'T' + d.time + ':00' + UTC_OFFSET);
  const end = new Date(start.getTime() + minutes * 60000);
  if (!d.force) {
    const clash = conflicts_(start, end, null);
    if (clash.length) return { ok: false, conflict: true, error: 'Ese horario choca con ' + describeClash_(clash[0]) + '. Puedes guardarla igual si lo confirmas.' };
  }
  const subtotal = items.reduce(function (t, x) { return t + x.price; }, 0);
  const total = d.totalRD != null && d.totalRD !== '' ? Math.max(0, Math.round(Number(d.totalRD))) : subtotal;
  const dep = Math.max(0, Math.min(total, Math.round(Number(d.depositRD) || 0)));
  const depMethod = dep > 0 ? (['efectivo', 'transferencia', 'paypal'].indexOf(d.depositMethod) >= 0 ? d.depositMethod : 'efectivo') : '';
  const now = new Date().toISOString();
  const row = {
    id: 'MJB-' + Utilities.formatDate(start, TZ, 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 6).toUpperCase(),
    creada: now, estado: 'confirmada',
    fecha: d.date, hora: d.time, inicio: start.toISOString(), fin: end.toISOString(), duracionMin: minutes,
    servicios: items.map(function (x) { return x.name; }).join(' + '),
    serviciosJson: JSON.stringify(items.map(function (x) { return { id: x.id, name: x.name, price: x.price, durationMinutes: x.durationMinutes }; })),
    subtotalRD: subtotal, descuentoRD: subtotal - total, totalRD: total, depositoRD: dep, saldoRD: total - dep,
    depositoPagado: dep > 0 ? now : '', metodoDeposito: depMethod,
    saldoEstado: total - dep > 0 ? 'pendiente' : 'pagado',
    clienta: name, telefono: clean_(c.phone, 30), correo: clean_(c.email, 120).toLowerCase(), nota: clean_(c.notes, 300),
    tokenHash: hash_(Utilities.getUuid()),
    origen: clean_(d.origen, 40) || 'estudio', canal: 'dashboard', creadaPor: 'estudio',
  };
  row.eventoId = calendarCreate_(row, s);
  appendRow_('Reservas', row);
  if (d.notify && row.correo) notifyConfirmed_(row, s, true);
  return { ok: true, item: adminRow_(row) };
}

function adminReschedule_(d) {
  needAdmin_(d);
  const found = findRow_(d.id);
  if (!found) return { ok: false, error: 'No encontramos esa cita.' };
  const r = found.row;
  if (['confirmada', 'retenida'].indexOf(r.estado) < 0) return { ok: false, error: 'Solo se pueden mover citas confirmadas.' };
  if (!isDateKey_(d.date) || !/^\d{2}:\d{2}$/.test(d.time || '')) return { ok: false, error: 'Elige la nueva fecha y hora.' };
  const minutes = Number(r.duracionMin) || 30;
  const start = new Date(d.date + 'T' + d.time + ':00' + UTC_OFFSET);
  const end = new Date(start.getTime() + minutes * 60000);
  if (!d.force) {
    const clash = conflicts_(start, end, r.id);
    if (clash.length) return { ok: false, conflict: true, error: 'Ese horario choca con ' + describeClash_(clash[0]) + '. Puedes moverla igual si lo confirmas.' };
  }
  const before = whenText_(r);
  const patch = { fecha: d.date, hora: d.time, inicio: start.toISOString(), fin: end.toISOString(), reprogramadaDe: r.fecha + ' ' + r.hora };
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  calendarMove_(r, settings_());
  if (d.notify && r.correo) notifyRescheduled_(r, settings_(), before);
  return { ok: true, item: adminRow_(r) };
}

function describeClash_(x) {
  if (x.block) return 'un bloqueo (' + (x.motivo || 'horario bloqueado') + ')';
  return 'la cita de ' + (x.clienta || 'otra clienta') + ' (' + x.hora + ')';
}

/* Bloqueos: una vez, varios días seguidos o cada semana */
function adminBlock_(d) {
  const u = needAdmin_(d);
  const tipo = ['unico', 'rango', 'semanal'].indexOf(d.tipo) >= 0 ? d.tipo : 'unico';
  const fd = d.fechaDesde || d.date;
  if (!isDateKey_(fd)) return { ok: false, error: 'Elige la fecha.' };
  const fh = isDateKey_(d.fechaHasta) ? d.fechaHasta : '';
  if (tipo === 'rango' && (!fh || fh < fd)) return { ok: false, error: 'La fecha final debe ser igual o posterior a la inicial.' };
  const hd = /^\d{2}:\d{2}$/.test(d.horaDesde || d.from || '') ? (d.horaDesde || d.from) : '00:00';
  const hh = /^\d{2}:\d{2}$/.test(d.horaHasta || d.to || '') ? (d.horaHasta || d.to) : '23:59';
  if (toMin_(hh) <= toMin_(hd)) return { ok: false, error: 'La hora final debe ser después de la inicial.' };
  const dias = tipo === 'semanal' ? String(d.dias || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return /^[0-6]$/.test(x); }).join(',') : '';
  if (tipo === 'semanal' && !dias) return { ok: false, error: 'Elige al menos un día de la semana.' };
  const row = {
    id: 'BLQ-' + Utilities.getUuid().slice(0, 8).toUpperCase(), tipo: tipo, dias: dias,
    horaDesde: hd, horaHasta: hh, fechaDesde: fd, fechaHasta: tipo === 'unico' ? fd : fh,
    motivo: clean_(d.reason || d.motivo, 120) || 'Bloqueado', activo: 'si', creada: new Date().toISOString(),
  };
  appendRow_('Bloqueos', row);
  void u;
  return { ok: true, block: strip_(row) };
}

function adminDeleteBlock_(d) {
  needAdmin_(d);
  const b = readTable_('Bloqueos').filter(function (x) { return x.id === d.id; })[0];
  if (b) { deleteRow_('Bloqueos', b._row); return { ok: true }; }
  const found = findRow_(d.id); // bloqueos antiguos guardados en Reservas
  if (found && found.row.estado === 'bloqueo') { updateRow_(found.index, { estado: 'cancelada', canceladaPor: 'bloqueo eliminado', canceladaEn: new Date().toISOString() }); return { ok: true }; }
  return { ok: false, error: 'No encontramos ese bloqueo.' };
}

/* Ajustes y servicios editables desde el dashboard */
function adminSaveSettings_(d) {
  needAdmin_(d);
  if (d.settings) {
    const rows = readTable_('Ajustes');
    Object.keys(d.settings).forEach(function (k) {
      if (SETTING_KEYS.indexOf(k) < 0) return;
      const v = clean_(d.settings[k], 300);
      const r = rows.filter(function (x) { return x.clave === k; })[0];
      if (r) updateTable_('Ajustes', r._row, { valor: v });
      else appendRow_('Ajustes', { clave: k, valor: v, 'qué es': '' });
    });
  }
  if (Array.isArray(d.services)) {
    const rows = readTable_('Servicios');
    d.services.forEach(function (sv) {
      const name = clean_(sv.nombre, 80);
      if (!name) return;
      const id = clean_(sv.id, 40) || slug_(name);
      const patch = {
        id: id, nombre: name,
        duracionMin: Math.max(5, Math.round(Number(sv.duracionMin) || 30)),
        precioRD: Math.max(0, Math.round(Number(sv.precioRD) || 0)),
        precioDesde: /^(si|sí|true)$/i.test(String(sv.precioDesde)) ? 'si' : 'no',
        activo: /^(no|false)$/i.test(String(sv.activo)) ? 'no' : 'si',
        volverDias: Math.max(0, Math.round(Number(sv.volverDias) || 0)),
      };
      const r = rows.filter(function (x) { return x.id === id; })[0];
      if (r) updateTable_('Servicios', r._row, patch); else appendRow_('Servicios', patch);
    });
  }
  return adminData_(d);
}

/* Fichas de clientas */
function adminSaveClient_(d) {
  needAdmin_(d);
  const clave = clean_(d.clave, 120);
  if (!clave) return { ok: false, error: 'Falta la clienta.' };
  const patch = {
    clave: clave, nombre: clean_(d.nombre, 80), telefono: clean_(d.telefono, 30), correo: clean_(d.correo, 120).toLowerCase(),
    notas: clean_(d.notas, 3000), cumpleanos: isDateKey_(d.cumpleanos) ? d.cumpleanos : '', actualizada: new Date().toISOString(),
  };
  const r = readTable_('Clientas').filter(function (x) { return x.clave === clave; })[0];
  if (r) updateTable_('Clientas', r._row, patch); else appendRow_('Clientas', patch);
  return { ok: true, client: patch };
}

function filesFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('FILES_FOLDER_ID');
  if (!id) throw new Error('Falta ejecutar setup() para crear la carpeta de fichas.');
  return DriveApp.getFolderById(id);
}

function adminUpload_(d) {
  needAdmin_(d);
  const clave = clean_(d.clave, 120);
  const tipo = FILE_TYPES.indexOf(d.tipo) >= 0 ? d.tipo : 'otro';
  const mime = String(d.mime || '');
  if (!clave) return { ok: false, error: 'Falta la clienta.' };
  if (FILE_MIMES.indexOf(mime) < 0) return { ok: false, error: 'Formato no permitido. Usa JPG, PNG, WEBP o PDF.' };
  const bytes = Utilities.base64Decode(String(d.data || ''));
  if (!bytes.length) return { ok: false, error: 'El archivo está vacío.' };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: 'El archivo pesa más de 12 MB.' };
  const fecha = isDateKey_(d.fecha) ? d.fecha : todayKey_();
  const nombre = clean_(d.nombre, 120) || (tipo + (mime === 'application/pdf' ? '.pdf' : '.jpg'));
  const file = filesFolder_().createFile(Utilities.newBlob(bytes, mime, clave.replace(/[^\w@.+-]/g, '_') + ' · ' + tipo + ' · ' + fecha + ' · ' + nombre));
  const row = {
    id: 'ARC-' + Utilities.getUuid().slice(0, 8).toUpperCase(), clave: clave, tipo: tipo, nombre: nombre, mime: mime,
    driveId: file.getId(), citaId: clean_(d.citaId, 40), fecha: fecha, nota: clean_(d.nota, 300), creada: new Date().toISOString(),
  };
  appendRow_('Archivos', row);
  return { ok: true, file: strip_(row) };
}

function adminFile_(d) {
  needAdmin_(d);
  const f = readTable_('Archivos').filter(function (x) { return x.id === d.id; })[0];
  if (!f) return { ok: false, error: 'No encontramos ese archivo.' };
  const blob = DriveApp.getFileById(f.driveId).getBlob();
  return { ok: true, mime: f.mime, name: f.nombre, data: Utilities.base64Encode(blob.getBytes()) };
}

function adminDeleteFile_(d) {
  needAdmin_(d);
  const f = readTable_('Archivos').filter(function (x) { return x.id === d.id; })[0];
  if (!f) return { ok: false, error: 'No encontramos ese archivo.' };
  try { DriveApp.getFileById(f.driveId).setTrashed(true); } catch (e) { /* ya no existía */ }
  deleteRow_('Archivos', f._row);
  return { ok: true };
}

/* Promociones y códigos */
function adminSavePromo_(d) {
  needAdmin_(d);
  const p = d.promo || {};
  const nombre = clean_(p.nombre, 80);
  if (!nombre) return { ok: false, error: 'Ponle un nombre a la promoción.' };
  const tipo = p.tipo === 'codigo' ? 'codigo' : 'auto';
  const codigo = tipo === 'codigo' ? normCode_(p.codigo) : '';
  if (tipo === 'codigo' && codigo.length < 3) return { ok: false, error: 'El código debe tener al menos 3 letras o números.' };
  const valor = Number(p.valor) || 0;
  const dt = p.descuentoTipo === 'monto' ? 'monto' : 'porcentaje';
  if (valor <= 0 || (dt === 'porcentaje' && valor > 100)) return { ok: false, error: 'Revisa el valor del descuento.' };
  const id = p.id || ('PRM-' + Utilities.getUuid().slice(0, 6).toUpperCase());
  if (codigo) {
    const clash = readTable_('Promociones').some(function (x) { return x.id !== id && normCode_(x.codigo) === codigo; }) || !!findGift_(codigo);
    if (clash) return { ok: false, error: 'Ese código ya existe.' };
  }
  const servicios = (Array.isArray(p.servicios) ? p.servicios : String(p.servicios || 'todos').split(',')).map(function (x) { return String(x).trim(); }).filter(Boolean);
  const patch = {
    id: id, nombre: nombre, tipo: tipo, codigo: codigo, servicios: servicios.length ? servicios.join(',') : 'todos',
    descuentoTipo: dt, valor: valor, desde: isDateKey_(p.desde) ? p.desde : '', hasta: isDateKey_(p.hasta) ? p.hasta : '',
    usosMax: Math.max(0, Math.round(Number(p.usosMax) || 0)), activo: /^(no|false)$/i.test(String(p.activo)) ? 'no' : 'si',
  };
  const r = readTable_('Promociones').filter(function (x) { return x.id === id; })[0];
  if (r) updateTable_('Promociones', r._row, patch);
  else { patch.usos = 0; patch.creada = new Date().toISOString(); appendRow_('Promociones', patch); }
  return { ok: true, promo: patch };
}

function adminDeletePromo_(d) {
  needAdmin_(d);
  const r = readTable_('Promociones').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos esa promoción.' };
  deleteRow_('Promociones', r._row);
  return { ok: true };
}

/* Tarjetas de regalo */
function adminSaveGift_(d) {
  needAdmin_(d);
  const g = d.gift || {};
  if (g.id) {
    const r = readTable_('Tarjetas').filter(function (x) { return x.id === g.id; })[0];
    if (!r) return { ok: false, error: 'No encontramos esa tarjeta.' };
    const patch = { comprador: clean_(g.comprador, 80), para: clean_(g.para, 80), mensaje: clean_(g.mensaje, 300), vence: isDateKey_(g.vence) ? g.vence : '' };
    if (g.estado === 'anulada') patch.estado = 'anulada';
    if (g.estado === 'activa' && r.estado === 'anulada') patch.estado = Number(r.saldoRD) > 0 ? 'activa' : 'agotada';
    updateTable_('Tarjetas', r._row, patch);
    Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
    return { ok: true, gift: strip_(r) };
  }
  const monto = Math.round(Number(g.montoRD) || 0);
  if (monto <= 0) return { ok: false, error: 'Escribe el valor de la tarjeta.' };
  let codigo = normCode_(g.codigo);
  if (!codigo) codigo = 'MJB-' + randCode_(4) + '-' + randCode_(4);
  if (findGift_(codigo) || readTable_('Promociones').some(function (x) { return normCode_(x.codigo) === codigo; })) return { ok: false, error: 'Ese código ya existe.' };
  const row = {
    id: 'TRG-' + Utilities.getUuid().slice(0, 6).toUpperCase(), codigo: codigo, montoRD: monto, saldoRD: monto,
    comprador: clean_(g.comprador, 80), para: clean_(g.para, 80), mensaje: clean_(g.mensaje, 300),
    metodoPago: ['efectivo', 'transferencia', 'paypal', 'cortesia'].indexOf(g.metodoPago) >= 0 ? g.metodoPago : 'efectivo',
    vendida: isDateKey_(g.vendida) ? g.vendida : todayKey_(), vence: isDateKey_(g.vence) ? g.vence : '',
    estado: 'activa', creada: new Date().toISOString(),
  };
  appendRow_('Tarjetas', row);
  return { ok: true, gift: strip_(row) };
}

/* Gastos */
function adminSaveExpense_(d) {
  needAdmin_(d);
  const e = d.expense || {};
  const monto = Math.round(Number(e.montoRD) || 0);
  if (!clean_(e.concepto, 120) || monto <= 0) return { ok: false, error: 'Escribe el concepto y el monto.' };
  const patch = {
    id: e.id || ('GST-' + Utilities.getUuid().slice(0, 6).toUpperCase()),
    fecha: isDateKey_(e.fecha) ? e.fecha : todayKey_(), concepto: clean_(e.concepto, 120),
    categoria: clean_(e.categoria, 40) || 'Otros', montoRD: monto, metodo: clean_(e.metodo, 30) || 'efectivo',
  };
  const r = readTable_('Gastos').filter(function (x) { return x.id === patch.id; })[0];
  if (r) updateTable_('Gastos', r._row, patch); else { patch.creada = new Date().toISOString(); appendRow_('Gastos', patch); }
  return { ok: true, expense: patch };
}

function adminDeleteExpense_(d) {
  needAdmin_(d);
  const r = readTable_('Gastos').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos ese gasto.' };
  deleteRow_('Gastos', r._row);
  return { ok: true };
}

/* =========================================================================
   Hoja de cálculo (las columnas se leen por su nombre)
   ========================================================================= */

function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Falta ejecutar setup() en el editor de Apps Script.');
  return SpreadsheetApp.openById(id);
}
function tab_(name) {
  const t = sheet_().getSheetByName(name);
  if (!t) throw new Error('Falta la pestaña "' + name + '". Ejecuta setup() otra vez.');
  return t;
}
function headers_(t) {
  const n = t.getLastColumn();
  return n ? t.getRange(1, 1, 1, n).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
}
function cellOut_(v) {
  if (v instanceof Date) {
    return v.getHours() === 0 && v.getMinutes() === 0 ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : v.toISOString();
  }
  return String(v == null ? '' : v);
}

/* Filas de una pestaña como objetos { columna: valor, _row: número de fila } */
function readTable_(name) {
  const t = tab_(name);
  const last = t.getLastRow();
  const h = headers_(t);
  if (last < 2 || !h.length) return [];
  return t.getRange(2, 1, last - 1, h.length).getValues().map(function (v, i) {
    const o = { _row: i + 2 };
    h.forEach(function (k, j) { if (k) o[k] = cellOut_(v[j]); });
    return o;
  }).filter(function (o) { return o[h[0]]; });
}
function appendRow_(name, obj) {
  const t = tab_(name);
  const h = headers_(t);
  const r = t.getLastRow() + 1;
  t.getRange(r, 1, 1, h.length).setNumberFormat('@').setValues([h.map(function (k) { return cell_(obj[k]); })]);
  return r;
}
function updateTable_(name, row, patch) {
  const t = tab_(name);
  const h = headers_(t);
  Object.keys(patch).forEach(function (k) {
    const col = h.indexOf(k);
    if (col >= 0) t.getRange(row, col + 1).setNumberFormat('@').setValue(cell_(patch[k]));
  });
}
function deleteRow_(name, row) { tab_(name).deleteRow(row); }
function strip_(o) { const c = {}; Object.keys(o).forEach(function (k) { if (k !== '_row' && k !== 'tokenHash') c[k] = o[k]; }); return c; }

function rows_() { return readTable_('Reservas'); }
function findRow_(id) {
  if (!id) return null;
  const r = rows_().filter(function (x) { return String(x.id) === String(id); })[0];
  return r ? { index: r._row, row: r } : null;
}
function updateRow_(index, patch) { updateTable_('Reservas', index, patch); }

function settings_() {
  const out = {};
  DEFAULT_SETTINGS.forEach(function (x) { out[x[0]] = x[1]; });
  readTable_('Ajustes').forEach(function (r) { if (r.clave) out[String(r.clave).trim()] = String(r.valor == null ? '' : r.valor).trim(); });
  return out;
}

function services_() {
  return readTable_('Servicios').filter(function (r) { return !/^no$/i.test(String(r.activo)); }).map(function (r) {
    return {
      id: String(r.id).trim(), name: String(r.nombre).trim(), durationMinutes: Number(r.duracionMin) || 30,
      price: Number(r.precioRD) || 0, priceFrom: /^s[ií]$/i.test(String(r.precioDesde)), returnDays: Number(r.volverDias) || 0,
    };
  });
}

/* =========================================================================
   Horario y bloqueos
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

function blocks_() {
  return readTable_('Bloqueos').filter(function (b) { return !/^no$/i.test(b.activo); }).map(strip_);
}

/* Convierte los bloqueos en intervalos concretos entre dos fechas */
function blockIntervals_(blocks, from, to) {
  const out = [];
  let key = from;
  let guard = 0;
  while (key <= to && guard++ < 400) {
    const p = key.split('-').map(Number);
    const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
    blocks.forEach(function (b) {
      let hit = false;
      if (b.tipo === 'semanal') hit = String(b.dias).split(',').indexOf(String(dow)) >= 0 && key >= b.fechaDesde && (!b.fechaHasta || key <= b.fechaHasta);
      else hit = key >= b.fechaDesde && key <= (b.fechaHasta || b.fechaDesde);
      if (hit) {
        out.push({
          id: b.id, motivo: b.motivo, block: true, fecha: key,
          start: new Date(key + 'T' + (b.horaDesde || '00:00') + ':00' + UTC_OFFSET).toISOString(),
          end: new Date(key + 'T' + (b.horaHasta || '23:59') + ':00' + UTC_OFFSET).toISOString(),
        });
      }
    });
    const n = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1));
    key = Utilities.formatDate(n, 'UTC', 'yyyy-MM-dd');
  }
  return out;
}

function conflicts_(start, end, exceptId) {
  const now = Date.now();
  const clash = rows_().filter(function (r) {
    if (r.id === exceptId || !occupies_(r, now)) return false;
    return new Date(r.inicio) < end && new Date(r.fin) > start;
  });
  const from = Utilities.formatDate(start, TZ, 'yyyy-MM-dd'), to = Utilities.formatDate(end, TZ, 'yyyy-MM-dd');
  blockIntervals_(blocks_(), from, to).forEach(function (b) {
    if (new Date(b.start) < end && new Date(b.end) > start) clash.push(b);
  });
  return clash;
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

function calendar_(s) {
  const calId = String(s.calendarioId || '').trim();
  if (!calId) return null;
  return calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
}

function calendarCreate_(r, s) {
  try {
    const cal = calendar_(s);
    if (!cal) return '';
    const opts = { description: describe_(r, s), location: s.direccion || '' };
    if (r.correo && /^s[ií]$/i.test(s.invitarClienta)) { opts.guests = r.correo; opts.sendInvites = true; }
    const ev = cal.createEvent('MAJOBELLA · ' + r.servicios + ' · ' + r.clienta, new Date(r.inicio), new Date(r.fin), opts);
    return ev.getId();
  } catch (err) { return ''; }
}

function calendarMove_(r, s) {
  try {
    const cal = calendar_(s);
    if (!cal || !r.eventoId) return;
    const ev = cal.getEventById(r.eventoId);
    if (ev) ev.setTime(new Date(r.inicio), new Date(r.fin));
  } catch (err) { /* el calendario es opcional */ }
}

function calendarCancel_(r, s) {
  if (!r.eventoId) return;
  try {
    const cal = calendar_(s);
    const ev = cal && cal.getEventById(r.eventoId);
    if (ev) ev.deleteEvent();
  } catch (err) { /* el calendario es opcional */ }
}

function depositText_(r) {
  const dep = Number(r.depositoRD) || 0;
  if (!dep) return Number(r.giftRD) > 0 ? 'Pagado con tarjeta de regalo' : 'Sin depósito';
  if (r.metodoDeposito === 'paypal' || r.paypalCaptura) return 'RD$ ' + money_(dep) + ' (US$ ' + r.depositoUSD + ' por PayPal)';
  return 'RD$ ' + money_(dep) + (r.metodoDeposito ? ' (' + r.metodoDeposito + ')' : '');
}

function describe_(r, s) {
  return [
    'Reserva: ' + r.id,
    'Servicio: ' + r.servicios,
    'Duración: ' + r.duracionMin + ' min',
    Number(r.descuentoRD) > 0 ? 'Precio: RD$ ' + money_(r.subtotalRD) + ' − descuento RD$ ' + money_(r.descuentoRD) : '',
    'Total: RD$ ' + money_(r.totalRD),
    Number(r.giftRD) > 0 ? 'Tarjeta de regalo: RD$ ' + money_(r.giftRD) + ' (' + r.giftCodigo + ')' : '',
    'Depósito: ' + depositText_(r),
    'Saldo: RD$ ' + money_(r.saldoRD) + ' al terminar',
    '',
    'Clienta: ' + r.clienta, 'Teléfono: ' + (r.telefono || '—'), 'Correo: ' + (r.correo || '—'),
    r.nota ? 'Nota: ' + r.nota : '',
    r.origen ? 'Nos conoció por: ' + r.origen : '',
  ].filter(function (x) { return x !== ''; }).join('\n');
}

function mailFrame_(inner) {
  return '<div style="font-family:Georgia,serif;color:#111;max-width:520px">' +
    '<p style="letter-spacing:.2em;font-size:12px">MAJOBELLA</p>' + inner + '</div>';
}

function notifyConfirmed_(r, s, byStudio) {
  const when = whenText_(r);
  const web = s.webUrl ? '<p><a href="' + s.webUrl + '#citas">Ver mis citas</a></p>' : '';
  const maps = s.mapsUrl ? ' · <a href="' + s.mapsUrl + '">Cómo llegar</a>' : '';
  const dep = Number(r.depositoRD) || 0;
  const payLines = [
    Number(r.descuentoRD) > 0 ? 'Descuento aplicado: RD$ ' + money_(r.descuentoRD) + '.' : '',
    Number(r.giftRD) > 0 ? 'Tarjeta de regalo aplicada: RD$ ' + money_(r.giftRD) + '.' : '',
    dep ? 'Depósito recibido: ' + depositText_(r) + '.' : '',
    Number(r.saldoRD) > 0 ? 'Saldo al terminar: RD$ ' + money_(r.saldoRD) + ', en efectivo, transferencia o PayPal.' : 'Tu cita ya está pagada.',
  ].filter(Boolean).join('<br>');
  safeMail_(r.correo, 'Tu cita en MAJOBELLA está confirmada · ' + when, mailFrame_(
    '<h2 style="font-weight:400">¡Te esperamos, ' + esc_(String(r.clienta).split(' ')[0]) + '!</h2>' +
    '<p><b>' + esc_(r.servicios) + '</b><br>' + when + '</p>' +
    '<p>' + payLines + '</p>' +
    (dep && !byStudio ? '<p>Si cancelas con al menos ' + num_(s.horasCancelacion, 24) + ' horas de aviso te devolvemos el depósito.</p>' : '') +
    '<p>' + esc_(s.direccion || '') + maps + '</p>' + (byStudio ? '' : web) +
    '<p style="color:#666;font-size:13px">Código de reserva: ' + r.id + '</p>'));
  if (!byStudio) {
    safeMail_(adminTo_(s), 'Nueva reserva · ' + r.clienta + ' · ' + when,
      '<pre style="font-family:inherit">' + esc_(describe_(r, s)) + '</pre>');
  }
}

function notifyRescheduled_(r, s, before) {
  const when = whenText_(r);
  const maps = s.mapsUrl ? ' · <a href="' + s.mapsUrl + '">Cómo llegar</a>' : '';
  safeMail_(r.correo, 'Tu cita en MAJOBELLA cambió de horario · ' + when, mailFrame_(
    '<h2 style="font-weight:400">Tu cita tiene nuevo horario</h2>' +
    '<p><b>' + esc_(r.servicios) + '</b><br>Antes: ' + before + '<br><b>Ahora: ' + when + '</b></p>' +
    '<p>Tu depósito sigue aplicado a la cita. Si el nuevo horario no te funciona, escríbenos.</p>' +
    '<p>' + esc_(s.direccion || '') + maps + '</p>' +
    '<p style="color:#666;font-size:13px">Código de reserva: ' + r.id + '</p>'));
}

function notifyCancelled_(r, s, refunded, byStudio) {
  const when = whenText_(r);
  const dep = Number(r.depositoRD) || 0;
  safeMail_(r.correo, 'Tu cita en MAJOBELLA fue cancelada · ' + when, mailFrame_(
    '<p>' + (byStudio ? 'El estudio canceló tu cita' : 'Cancelaste tu cita') + ' de ' + esc_(r.servicios) + ' (' + when + ').</p>' +
    (dep ? '<p>' + (refunded ? 'Te devolvimos el depósito en PayPal. Puede tardar unos días en reflejarse.' : (byStudio ? 'Te contactaremos para coordinar la devolución o una nueva cita.' : 'El depósito no es reembolsable para esta cancelación.')) + '</p>' : '') +
    '<p style="color:#666;font-size:13px">Código de reserva: ' + r.id + '</p>'));
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
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const p = String(r.fecha).split('-').map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  const t = String(r.hora || '00:00').split(':').map(Number);
  const hh = t[0], mm = ('0' + t[1]).slice(-2);
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
      subtotalRD: Number(r.subtotalRD) || Number(r.totalRD) || 0, discountRD: Number(r.descuentoRD) || 0, giftRD: Number(r.giftRD) || 0,
      depositRD: Number(r.depositoRD) || 0, depositUSD: r.depositoUSD, depositPaid: !!(r.paypalCaptura || r.depositoPagado),
      depositMethod: r.metodoDeposito || (r.paypalCaptura ? 'paypal' : ''),
      balanceRD: Number(r.saldoRD) || 0, balanceStatus: r.saldoEstado || 'pendiente', balanceMethod: r.saldoMetodo || '',
      refund: /^reembolsado/.test(r.reembolso || '') ? 'reembolsado' : (r.reembolso ? 'no' : ''),
    },
    client: { name: r.clienta, email: r.correo },
  };
}

function adminRow_(r) {
  const p = publicRow_(r);
  if (r.estado === 'retenida' && new Date(r.retenidaHasta).getTime() < Date.now()) p.status = 'expirada';
  p.client = { name: r.clienta, email: r.correo, phone: r.telefono, notes: r.nota };
  p.clientKey = clientKey_(r.correo, r.telefono, r.clienta);
  p.servicesText = r.servicios;
  p.createdAt = r.creada;
  p.createdBy = r.creadaPor || 'web';
  p.origin = r.origen || '';
  p.channel = r.canal || '';
  p.code = r.codigo || '';
  p.promoId = r.promoId || '';
  p.giftCode = r.giftCodigo || '';
  p.rescheduledFrom = r.reprogramadaDe || '';
  p.payment.depositPaidAt = r.depositoPagado;
  p.payment.balancePaidAt = r.saldoPagado;
  p.payment.refundDetail = r.reembolso;
  p.payment.paypalCapture = r.paypalCaptura;
  p.payment.balanceCapture = r.saldoCaptura;
  p.cancelledBy = r.canceladaPor;
  p.cancelledAt = r.canceladaEn;
  p.internalNote = r.notaInterna;
  p.holdUntil = r.estado === 'retenida' ? r.retenidaHasta : '';
  return p;
}

/* Identificador de una clienta: su correo o, si no tiene, su teléfono */
function clientKey_(email, phone, name) {
  const e = String(email || '').trim().toLowerCase();
  if (e) return 'e:' + e;
  const t = String(phone || '').replace(/\D/g, '').slice(-10);
  if (t) return 't:' + t;
  return 'n:' + String(name || '').trim().toLowerCase();
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

function todayKey_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function normCode_(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9-]/g, ''); }
function randCode_(n) { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
function slug_(t) { return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || ('servicio-' + Date.now()); }
