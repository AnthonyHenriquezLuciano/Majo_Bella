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
 *   - Galeria, Resenas  contenido de la web
 *   - Paquetes     paquetes de sesiones que vende el estudio; Bonos: los vendidos a cada clienta
 *   - Espera       lista de espera por día
 *   - Correos      historial de correos enviados
 *   - Cuentas      cuentas bancarias para el depósito por transferencia
 *   - Errores      fallos del sistema (también se avisan por correo)
 *
 * Tareas automáticas (cada hora, función tareasProgramadas): recordatorios, pedir reseña, retoques,
 * cumpleaños y aviso a la lista de espera. setup() crea el disparador.
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
 *   TURNSTILE_SECRET   (opcional) clave secreta de Cloudflare Turnstile contra robots; nunca va en la web
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
  'recordatorio', 'resenaPedida', 'retoqueAviso', 'firmaToken', 'consentimiento', 'consentimientoArchivo', 'permisoFotos',
  'bonoCodigo', 'bonoRD', 'fidelidad', 'cumpleanos',
  'comprobanteId', 'comprobanteEn', 'cuentaId', 'transferenciaRef', 'revisadaEn', 'cambios',
];
const TABLES = {
  Reservas: HEADERS,
  Ajustes: ['clave', 'valor', 'qué es'],
  Servicios: ['id', 'nombre', 'duracionMin', 'precioRD', 'precioDesde', 'activo', 'volverDias', 'depositoPct', 'retoqueDias', 'consentimiento'],
  Bloqueos: ['id', 'tipo', 'dias', 'horaDesde', 'horaHasta', 'fechaDesde', 'fechaHasta', 'motivo', 'activo', 'creada'],
  Clientas: ['clave', 'nombre', 'telefono', 'correo', 'notas', 'cumpleanos', 'actualizada', 'cumpleEnviado'],
  Archivos: ['id', 'clave', 'tipo', 'nombre', 'mime', 'driveId', 'citaId', 'fecha', 'nota', 'creada'],
  Promociones: ['id', 'nombre', 'tipo', 'codigo', 'servicios', 'descuentoTipo', 'valor', 'desde', 'hasta', 'usosMax', 'usos', 'activo', 'creada'],
  Tarjetas: ['id', 'codigo', 'montoRD', 'saldoRD', 'comprador', 'para', 'mensaje', 'metodoPago', 'vendida', 'vence', 'estado', 'creada', 'correoComprador', 'correoPara', 'paypalOrden', 'paypalCaptura'],
  Gastos: ['id', 'fecha', 'concepto', 'categoria', 'montoRD', 'metodo', 'creada'],
  Galeria: ['id', 'servicio', 'antesId', 'despuesId', 'antesUrl', 'despuesUrl', 'texto', 'orden', 'visible', 'creada'],
  Resenas: ['id', 'autora', 'estrellas', 'texto', 'fecha', 'visible', 'orden', 'creada'],
  Paquetes: ['id', 'nombre', 'servicio', 'sesiones', 'precioRD', 'venceDias', 'descripcion', 'enWeb', 'activo', 'creada'],
  Bonos: ['id', 'codigo', 'paqueteId', 'nombre', 'servicio', 'sesiones', 'usadas', 'clienta', 'telefono', 'correo', 'montoRD', 'metodoPago', 'vendida', 'vence', 'estado', 'paypalOrden', 'paypalCaptura', 'creada'],
  Espera: ['id', 'fecha', 'franja', 'serviciosJson', 'servicios', 'duracionMin', 'clienta', 'telefono', 'correo', 'estado', 'creada', 'avisada'],
  Correos: ['fecha', 'tipo', 'para', 'asunto', 'ref', 'estado'],
  Cuentas: ['id', 'banco', 'tipo', 'numero', 'titular', 'documento', 'nota', 'activa', 'orden', 'creada'],
  Errores: ['fecha', 'tipo', 'mensaje', 'ref', 'detalle', 'avisado', 'resuelto'],
};
const AUTO_TRIGGER = 'tareasProgramadas';

// Estados que ocupan la agenda
const BUSY_STATES = ['confirmada', 'completada', 'no-asistio', 'bloqueo', 'por-confirmar'];

const DEFAULT_SETTINGS = [
  ['tasaUSD', '63', 'Pesos dominicanos por 1 US$. PayPal no cobra en RD$: el depósito se convierte con esta tasa.'],
  ['porcentajeDeposito', '50', 'Depósito para servicios sin porcentaje propio (cada servicio lo define en la pestaña Servicios).'],
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
  ['anuncioActivo', 'si', 'si/no: mostrar la franja de anuncio arriba de la web.'],
  ['anuncioTexto', '', 'Texto de la franja. Vacío = se anuncia sola la promoción automática vigente.'],
  ['anuncioEnlace', '', 'A dónde lleva la franja (vacío = a Reservar).'],
  ['googleRating', '', 'Puntuación de tu perfil de Google, por ejemplo 4.9.'],
  ['googleResenas', '', 'Cuántas reseñas tienes en Google.'],
  ['googleUrl', '', 'Enlace a tu perfil de Google para ver todas las reseñas.'],
  ['googleResenaUrl', '', 'Enlace para dejar una reseña (Perfil de Empresa de Google → Pedir reseñas).'],
  ['majoTitulo', 'Conoce a Majo', 'Título de la sección.'],
  ['majoTexto', '', 'Tu historia, en uno o varios párrafos.'],
  ['majoCerts', '', 'Formación y certificaciones, una por línea.'],
  ['majoFotoUrl', '', 'Se llena solo al subir la foto desde el dashboard.'],
  ['tarjetasEnLinea', 'si', 'si/no: vender tarjetas de regalo en la web.'],
  ['tarjetaMin', '500', 'Valor mínimo de una tarjeta de regalo en la web (RD$).'],
  ['tarjetaMax', '30000', 'Valor máximo de una tarjeta de regalo en la web (RD$).'],
  ['tarjetaVenceDias', '365', 'Días de validez de las tarjetas compradas en la web.'],
  ['whatsapp', '18299784986', 'WhatsApp del estudio con código de país, solo números (para los correos).'],
  ['recordatorioActivo', 'si', 'si/no: correo de recordatorio antes de cada cita.'],
  ['recordatorioHoras', '24', 'Cuántas horas antes de la cita se envía el recordatorio.'],
  ['resenaActiva', 'si', 'si/no: pedir una reseña de Google después de la cita realizada.'],
  ['resenaHoras', '3', 'Horas después de terminar la cita para pedir la reseña.'],
  ['retoqueActivo', 'si', 'si/no: avisar a la clienta cuando le toca el retoque (días por servicio en Servicios).'],
  ['cumpleActivo', 'si', 'si/no: correo de cumpleaños con un código de regalo.'],
  ['cumpleDescuento', '15', 'Descuento del regalo de cumpleaños (%).'],
  ['cumpleDias', '30', 'Días de validez del código de cumpleaños.'],
  ['esperaActiva', 'si', 'si/no: lista de espera en la web y aviso cuando se libera un horario.'],
  ['fidelidadActiva', 'si', 'si/no: premio por visitas.'],
  ['fidelidadVisitas', '5', 'Cada cuántas visitas realizadas se gana el premio (en la siguiente cita).'],
  ['fidelidadTipo', 'porcentaje', 'porcentaje o monto.'],
  ['fidelidadValor', '20', 'Valor del premio (% o RD$).'],
  ['consentimientoTexto', '', 'Texto del consentimiento que firma la clienta (vacío = texto general).'],
  ['transferenciaActiva', 'si', 'si/no: la clienta puede pagar el depósito por transferencia (necesita al menos una cuenta en Cuentas).'],
  ['transferenciaMinutos', '60', 'Minutos que tiene la clienta para subir el comprobante; si no lo sube, el horario se libera.'],
  ['cambiosMax', '1', 'Cuántas veces puede la clienta cambiar la fecha de una cita ella misma (0 = solo por WhatsApp).'],
  ['negocioNombre', 'MAJOBELLA Beauty Studio', 'Nombre legal o comercial (términos y privacidad).'],
  ['negocioRnc', '', 'RNC o cédula del negocio (opcional, términos y privacidad).'],
  ['negocioCorreo', '', 'Correo de contacto para temas legales y de datos personales.'],
  ['turnstileSiteKey', '', 'Clave del sitio de Cloudflare Turnstile (protección contra robots). La secreta va en Propiedades del script.'],
  ['adminInactividadMin', '30', 'Minutos sin usar el dashboard para cerrar la sesión sola.'],
];
const LONG_SETTINGS = ['majoTexto', 'majoCerts', 'consentimientoTexto'];
const SETTING_KEYS = DEFAULT_SETTINGS.map(function (x) { return x[0]; });

// Igual que js/data/services.js. Desde el dashboard o la hoja "Servicios" se cambian precios y duraciones.
// [id, nombre, minutos, precio, desde, activo, vuelve cada, % depósito, retoque a los días, pide consentimiento]
const DEFAULT_SERVICES = [
  ['faciales', 'Faciales', 60, 2500, 'no', 'si', 30, 50, 0, 'si'],
  ['cejas', 'Cejas', 45, 900, 'no', 'si', 28, 50, 0, 'no'],
  ['pestanas', 'Pestañas', 60, 1800, 'no', 'si', 21, 50, 0, 'si'],
  ['micropigmentacion', 'Micropigmentación', 150, 12000, 'no', 'si', 365, 50, 45, 'si'],
  ['depilacion', 'Depilación facial y corporal', 30, 500, 'si', 'si', 30, 50, 0, 'no'],
];
const DAY_KEYS = ['horario_domingo', 'horario_lunes', 'horario_martes', 'horario_miercoles', 'horario_jueves', 'horario_viernes', 'horario_sabado'];
const FILE_TYPES = ['antes', 'despues', 'consentimiento', 'comprobante', 'otro'];
const FILE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_BYTES = 12 * 1024 * 1024;

/* =========================================================================
   Instalación
   ========================================================================= */

/** Ejecuta esta función desde el editor al instalar y después de cada actualización del código:
    crea la hoja, las pestañas y las columnas que falten, sin tocar los datos existentes. */
function setup() {
  resetDb_();
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const existing = props.getProperty('SHEET_ID');
  if (existing) { try { ss = SpreadsheetApp.openById(existing); } catch (e) { ss = null; } }
  if (!ss) { try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; } }
  if (!ss) ss = SpreadsheetApp.create('MAJOBELLA · Reservas');
  props.setProperty('SHEET_ID', ss.getId());

  Object.keys(TABLES).forEach(function (name) {
    resetDb_();
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
    resetDb_();
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
          appendRow_('Servicios', { id: x[0], nombre: x[1], duracionMin: x[2], precioRD: x[3], precioDesde: x[4], activo: x[5], volverDias: x[6], depositoPct: x[7], retoqueDias: x[8], consentimiento: x[9] });
        });
      } else {
        let globalPct = '50';
        try { globalPct = (readTable_('Ajustes').filter(function (x) { return x.clave === 'porcentajeDeposito'; })[0] || {}).valor || '50'; } catch (e) { /* sin Ajustes todavía */ }
        rows.forEach(function (r) {
          const def = DEFAULT_SERVICES.filter(function (x) { return x[0] === r.id; })[0];
          const patch = {};
          if (!r.volverDias) patch.volverDias = def ? def[6] : 30;
          if (r.depositoPct === undefined || r.depositoPct === '') patch.depositoPct = globalPct;
          if (r.retoqueDias === undefined || r.retoqueDias === '') patch.retoqueDias = def ? def[8] : 0;
          if (r.consentimiento === undefined || r.consentimiento === '') patch.consentimiento = def ? def[9] : 'no';
          if (Object.keys(patch).length) updateTable_('Servicios', r._row, patch);
        });
      }
    }
  });

  // Carpeta privada de Drive para fotos y consentimientos
  let folderId = props.getProperty('FILES_FOLDER_ID');
  let folder = null;
  if (folderId) { try { folder = DriveApp.getFolderById(folderId); } catch (e) { folder = null; } }
  if (!folder) { folder = DriveApp.createFolder('MAJOBELLA · Fichas de clientas'); props.setProperty('FILES_FOLDER_ID', folder.getId()); }
  // Carpeta de archivos públicos de la web (galería y foto de "Conoce a Majo")
  let pubId = props.getProperty('PUBLIC_FOLDER_ID');
  let pub = null;
  if (pubId) { try { pub = DriveApp.getFolderById(pubId); } catch (e) { pub = null; } }
  if (!pub) { pub = DriveApp.createFolder('MAJOBELLA · Web pública (galería)'); props.setProperty('PUBLIC_FOLDER_ID', pub.getId()); }

  // Disparador de las tareas automáticas (cada hora)
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === AUTO_TRIGGER || t.getHandlerFunction() === 'alEditarHoja') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(AUTO_TRIGGER).timeBased().everyHours(1).create();
  // Si se edita la hoja a mano, la web lo ve al instante
  try { ScriptApp.newTrigger('alEditarHoja').forSpreadsheet(ss).onEdit().create(); } catch (e) { Logger.log('No se pudo crear el disparador de edición: ' + msg_(e)); }

  // Nombres propios, teléfonos y correos con el mismo formato en todas las pestañas
  resetDb_();
  try { Logger.log('Datos ordenados: ' + JSON.stringify(normalizeData_())); } catch (e) { Logger.log('No se pudieron ordenar los datos: ' + msg_(e)); }
  clearCaches_();

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
  resetDb_();
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'catalog') { heartbeat_(); return json_(cachedCatalog_()); }
    if (p.action === 'busy') return json_(cachedBusy_(p.from, p.to));
    if (p.action === 'availability') return json_(busy_(p.date, p.date)); // compatibilidad
    return json_({ ok: false, error: 'Acción no válida.' });
  } catch (err) {
    logError_('sistema', msg_(err), '', 'doGet');
    return json_({ ok: false, error: msg_(err) });
  }
}

function doPost(e) {
  resetDb_();
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
    giftOrder: L(giftOrder_),
    giftCapture: L(giftCapture_),
    bonoOrder: L(bonoOrder_),
    bonoCapture: L(bonoCapture_),
    loyalty: N(loyalty_),
    walletLookup: N(walletLookup_),
    waitlistJoin: L(waitlistJoin_),
    consentInfo: N(consentInfo_),
    consentSign: L(consentSign_),
    transferProof: L(transferProof_),
    reschedule: L(reschedule_),
    myWallet: N(myWallet_),
    walletEmail: L(walletEmail_),
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
    adminPublishGallery: L(adminPublishGallery_),
    adminSaveGallery: L(adminSaveGallery_),
    adminDeleteGallery: L(adminDeleteGallery_),
    adminSaveReview: L(adminSaveReview_),
    adminDeleteReview: L(adminDeleteReview_),
    adminUploadPublic: L(adminUploadPublic_),
    adminSendReminder: L(adminSendReminder_),
    adminSavePackage: L(adminSavePackage_),
    adminDeletePackage: L(adminDeletePackage_),
    adminSellBono: L(adminSellBono_),
    adminSaveBono: L(adminSaveBono_),
    adminWaitlist: L(adminWaitlist_),
    adminEmailPreview: N(adminEmailPreview_),
    adminEmailTest: N(adminEmailTest_),
    adminRunAutomations: L(adminRunAutomations_),
    adminSaveAccount: L(adminSaveAccount_),
    adminDeleteAccount: L(adminDeleteAccount_),
    adminTransferReview: L(adminTransferReview_),
    adminResolveErrors: L(adminResolveErrors_),
  };
  const fn = actions[data.action];
  if (!fn) return json_({ ok: false, error: 'Acción no válida.' });
  try { return json_(fn()); }
  catch (err) {
    const m = msg_(err);
    if (!/sesión expiró|no tiene acceso/i.test(m)) logError_('sistema', m, data.id || '', 'acción: ' + data.action);
    return json_({ ok: false, error: m });
  }
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
    services: services_().map(function (x) { return { id: x.id, name: x.name, durationMinutes: x.durationMinutes, price: x.price, priceFrom: x.priceFrom, depositPercent: x.depositPercent }; }),
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
    site: siteContent_(s),
    gallery: readOpt_('Galeria').filter(function (g) { return !/^no$/i.test(g.visible); })
      .sort(function (a, b) { return (Number(a.orden) || 0) - (Number(b.orden) || 0) || String(b.creada).localeCompare(String(a.creada)); })
      .map(function (g) { return { id: g.id, service: g.servicio, before: g.antesUrl, after: g.despuesUrl, text: g.texto }; }),
    reviews: readOpt_('Resenas').filter(function (r) { return !/^no$/i.test(r.visible); })
      .sort(function (a, b) { return (Number(a.orden) || 0) - (Number(b.orden) || 0) || String(b.fecha).localeCompare(String(a.fecha)); })
      .map(function (r) { return { id: r.id, author: r.autora, stars: Number(r.estrellas) || 5, text: r.texto, date: r.fecha }; }),
    packages: readOpt_('Paquetes').filter(function (k) { return !/^no$/i.test(k.activo) && /^s[ií]$/i.test(k.enWeb); }).map(packageOut_),
    loyalty: { enabled: on_(s.fidelidadActiva), every: num_(s.fidelidadVisitas, 5), kind: s.fidelidadTipo === 'monto' ? 'monto' : 'porcentaje', value: num_(s.fidelidadValor, 20) },
    waitlist: { enabled: on_(s.esperaActiva) },
    transfer: transferInfo_(s),
    reschedule: { max: changesMax_(s) },
    security: { turnstileSiteKey: turnstileOn_(s) ? String(s.turnstileSiteKey).trim() : '' },
    giftShop: {
      enabled: /^s[ií]$/i.test(s.tarjetasEnLinea || 'si') && !!PropertiesService.getScriptProperties().getProperty('PAYPAL_CLIENT_ID'),
      min: num_(s.tarjetaMin, 500), max: num_(s.tarjetaMax, 30000), validDays: num_(s.tarjetaVenceDias, 365),
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

/* Catálogo desde la caché (10 min o hasta que algo cambie) */
function cachedCatalog_() {
  const c = CacheService.getScriptCache();
  const hit = c.get('catalog');
  if (hit) { const o = safeJson_(hit, null); if (o) { o.cached = true; return o; } }
  const out = catalog_();
  try { const txt = JSON.stringify(out); if (txt.length < 95000) c.put('catalog', txt, 600); } catch (e) { /* muy grande: sin caché */ }
  return out;
}
/* Horarios ocupados desde la caché: hasta que cambie una reserva o venza un apartado */
function cachedBusy_(from, to) {
  const c = CacheService.getScriptCache();
  let ver = c.get('busyver');
  if (!ver) { ver = String(Date.now()); c.put('busyver', ver, 21600); }
  const key = 'busy_' + from + '_' + to + '_' + ver;
  const hit = c.get(key);
  if (hit) { const o = safeJson_(hit, null); if (o && (!o.until || o.until > Date.now())) return o; }
  const out = busy_(from, to);
  if (!out.ok) return out;
  // Un apartado (retenida) deja de ocupar al vencer: la copia dura hasta ese momento como mucho
  const now = Date.now();
  const holds = rows_().filter(function (r) { return r.estado === 'retenida' && new Date(r.retenidaHasta).getTime() > now; })
    .map(function (r) { return new Date(r.retenidaHasta).getTime(); });
  out.until = holds.length ? Math.min.apply(null, holds) : now + 300000;
  const ttl = Math.max(5, Math.min(300, Math.floor((out.until - now) / 1000)));
  try { c.put(key, JSON.stringify(out), ttl); } catch (e) { /* nada */ }
  return out;
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
  if (!g || g.estado === 'anulada' || g.estado === 'pendiente') return false;
  if (g.vence && today > g.vence) return false;
  return (Number(g.saldoRD) || 0) > 0;
}

/* Calcula el total de una cita: la mejor promoción (automática o código) y la tarjeta de regalo */
function pricing_(items, code, giftCode, client) {
  const s = settings_();
  const today = todayKey_();
  const subtotal = items.reduce(function (t, x) { return t + x.price; }, 0);
  const promos = promos_(today);
  // Paquete de sesiones: cubre por completo un servicio de su tipo (los descuentos se calculan sobre el resto)
  let bono = null, bonoStatus = '', covered = null;
  if (normCode_(giftCode) && !findGift_(giftCode)) {
    bono = findBono_(giftCode);
    if (!bono) { bono = null; }
    else if (!bonoUsable_(bono, today)) { bonoStatus = 'invalid'; bono = null; }
    else {
      covered = items.filter(function (x) { return x.id === bono.servicio; })[0] || null;
      if (!covered) { bonoStatus = 'notApplicable'; bono = null; } else bonoStatus = 'ok';
    }
  }
  const all = items;
  items = covered ? items.filter(function (x) { return x !== covered; }) : items;
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
  // Premio de fidelidad: compite con las promociones (se aplica el mayor)
  const loyal = loyaltyFor_(client, s);
  let loyalApplied = false;
  if (loyal && loyal.eligible) {
    const base = items.reduce(function (t, x) { return t + x.price; }, 0);
    const ld = loyal.kind === 'monto' ? Math.min(base, Math.round(loyal.value)) : Math.round(base * Math.min(100, loyal.value) / 100);
    if (ld > discount) { discount = ld; promo = { id: '', nombre: 'Premio de fidelidad' }; loyalApplied = true; codeStatus = codeStatus === 'ok' ? 'notBetter' : codeStatus; }
  }
  const coveredPrice = covered ? covered.price : 0;
  discount = Math.min(discount, subtotal - coveredPrice);
  const total = subtotal - discount;
  let gift = null, giftApplied = 0, giftStatus = '';
  if (bono) { giftApplied = Math.min(coveredPrice, total); giftStatus = 'ok'; }
  else if (bonoStatus) giftStatus = bonoStatus === 'notApplicable' ? 'notApplicable' : 'invalid';
  else if (normCode_(giftCode)) {
    gift = findGift_(giftCode);
    if (!giftUsable_(gift, today)) { giftStatus = 'invalid'; gift = null; }
    else { giftApplied = Math.min(Number(gift.saldoRD) || 0, total); giftStatus = 'ok'; }
  }
  const remaining = total - giftApplied;
  // Cada servicio tiene su % de depósito: se usa el promedio ponderado por precio
  const ratio = depositRatio_(items.length ? items : all, num_(s.porcentajeDeposito, 50));
  const depositRD = Math.round(remaining * ratio);
  return {
    subtotal: subtotal, discount: discount, total: total, promo: promo, codeStatus: codeStatus, codeLabel: codeLabel,
    gift: gift, giftApplied: giftApplied, giftStatus: giftStatus, giftBalance: gift ? Number(gift.saldoRD) || 0 : 0,
    bono: bono, bonoLeft: bono ? (Number(bono.sesiones) || 0) - (Number(bono.usadas) || 0) : 0, loyalApplied: loyalApplied, loyalty: loyal,
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
  if (limited_(d)) return { ok: false, error: TOO_MANY };
  const p = pricing_(items, d.code, d.giftCode, d.client);
  if ((normCode_(d.code) && p.codeStatus === 'invalid') || (normCode_(d.giftCode) && p.giftStatus === 'invalid')) noteFail_(d);
  return { ok: true, pricing: pricingOut_(p) };
}

function pricingOut_(p) {
  return {
    subtotalRD: p.subtotal, discountRD: p.discount, totalRD: p.total,
    promoName: p.promo ? p.promo.nombre : '', codeStatus: p.codeStatus,
    giftAppliedRD: p.giftApplied, giftStatus: p.giftStatus, giftBalanceRD: p.giftBalance,
    giftKind: p.bono ? 'bono' : (p.gift ? 'tarjeta' : ''), bonoName: p.bono ? p.bono.nombre : '', bonoLeft: p.bonoLeft,
    loyaltyApplied: p.loyalApplied,
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
  const cv = client_(c, true);
  if (!cv.ok) return { ok: false, error: cv.error };
  const name = cv.name, phone = cv.phone, notes = cv.notes;
  let email = cv.email;
  if (d.idToken) { const u = verifyIdToken_(d.idToken); if (u) email = u.email; }
  if (!human_(d, s)) return { ok: false, error: NOT_HUMAN };
  if (limited_(d)) return { ok: false, error: TOO_MANY };
  const method = d.method === 'transferencia' ? 'transferencia' : 'paypal';
  const tf = method === 'transferencia' ? transferInfo_(s) : null;
  if (tf && !tf.enabled) return { ok: false, error: 'El pago por transferencia no está disponible ahora. Elige PayPal o escríbenos.' };

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
  const p = pricing_(items, d.code, d.giftCode, { email: email, phone: phone });
  if ((normCode_(d.code) && p.codeStatus === 'invalid') || (normCode_(d.giftCode) && p.giftStatus === 'invalid')) noteFail_(d);
  if (normCode_(d.code) && p.codeStatus === 'invalid') return { ok: false, error: 'Ese código de descuento no es válido o ya venció.' };
  if (normCode_(d.giftCode) && p.giftStatus === 'invalid') return { ok: false, error: 'Esa tarjeta o paquete no es válido o no tiene saldo.' };
  if (normCode_(d.giftCode) && p.giftStatus === 'notApplicable') return { ok: false, error: 'Ese paquete es para otro servicio.' };

  const holdMin = num_(s.minutosRetencion, 15);
  const id = 'MJB-' + Utilities.formatDate(start, TZ, 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  const token = Utilities.getUuid();
  const row = {
    id: id, creada: new Date().toISOString(), estado: 'retenida',
    fecha: d.date, hora: d.time, inicio: start.toISOString(), fin: end.toISOString(), duracionMin: minutes,
    servicios: items.map(function (x) { return x.name; }).join(' + '),
    serviciosJson: JSON.stringify(items.map(function (x) { return { id: x.id, name: x.name, price: x.price, durationMinutes: x.durationMinutes }; })),
    subtotalRD: p.subtotal, descuentoRD: p.discount, promoId: p.promo ? p.promo.id : '', codigo: p.codeStatus === 'ok' ? normCode_(d.code) : '',
    giftCodigo: p.gift ? p.gift.codigo : '', giftRD: p.gift ? p.giftApplied : 0,
    bonoCodigo: p.bono ? p.bono.codigo : '', bonoRD: p.bono ? p.giftApplied : 0, fidelidad: p.loyalApplied ? 'si' : '',
    cumpleanos: monthDay_(c.birthday), firmaToken: Utilities.getUuid().replace(/-/g, '').slice(0, 20),
    totalRD: p.total, depositoRD: p.depositRD, depositoUSD: p.depositUSD.toFixed(2), saldoRD: p.balanceRD,
    clienta: name, telefono: phone, correo: email, nota: notes, tokenHash: hash_(token),
    saldoEstado: p.balanceRD > 0 ? 'pendiente' : 'pagado', retenidaHasta: new Date(Date.now() + holdMin * 60000).toISOString(),
    origen: clean_(d.origen, 40), canal: clean_(d.canal, 80), creadaPor: 'web',
  };

  // La tarjeta de regalo cubre todo el depósito: se confirma sin PayPal
  if (p.depositRD <= 0) {
    row.estado = 'confirmada';
    row.metodoDeposito = p.bono ? 'paquete' : (p.giftApplied ? 'tarjeta de regalo' : '');
    row.depositoPagado = new Date().toISOString();
    row.retenidaHasta = '';
    applyGift_(row, -1);
    applyBono_(row, -1);
    saveBirthday_(row);
    markWaitlistBooked_(row);
    usePromo_(row.promoId);
    row.eventoId = calendarCreate_(row, s);
    appendRow_('Reservas', row);
    notifyConfirmed_(row, s);
    return { ok: true, id: id, manageToken: token, confirmed: true, appointment: publicRow_(row), pricing: pricingOut_(p) };
  }

  // Transferencia: se aparta el horario mientras la clienta sube el comprobante
  if (tf) {
    const until = Math.min(Date.now() + tf.minutes * 60000, start.getTime() - 30 * 60000);
    row.metodoDeposito = 'transferencia';
    row.retenidaHasta = new Date(Math.max(until, Date.now() + 10 * 60000)).toISOString();
    appendRow_('Reservas', row);
    return {
      ok: true, id: id, manageToken: token, transfer: true, accounts: tf.accounts,
      totalRD: p.total, depositRD: p.depositRD, balanceRD: p.balanceRD, expiresAt: row.retenidaHasta, pricing: pricingOut_(p),
    };
  }

  // Orden de PayPal por el depósito
  const order = paypal_('post', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: id, custom_id: id, invoice_id: id + '-D',
      description: ('Depósito · ' + row.servicios).slice(0, 127),
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
  try {
    updateRow_(found.index, { paypalCaptura: cap.id, depositoPagado: patch.depositoPagado }); // primero queda anotado el cobro
    confirmPaid_(found.index, r, patch);
  } catch (err) {
    return paidButFailed_('el depósito de la reserva ' + r.id, cap.id, r.id, err);
  }
  notifyConfirmed_(r, settings_());
  return { ok: true, appointment: publicRow_(r) };
}

/* Deja confirmada una cita ya pagada: descuenta tarjeta/paquete, promoción, cumpleaños, lista de espera y calendario */
function confirmPaid_(index, r, patch) {
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  const s = settings_();
  applyGift_(r, -1);
  applyBono_(r, -1);
  usePromo_(r.promoId);
  saveBirthday_(r);
  markWaitlistBooked_(r);
  patch.saldoRD = r.saldoRD;
  patch.saldoEstado = r.saldoEstado;
  patch.giftRD = r.giftRD;
  patch.eventoId = calendarCreate_(r, s);
  r.eventoId = patch.eventoId;
  updateRow_(index, patch);
}

/* El cobro se hizo pero algo falló después: se avisa de inmediato para revisarlo a mano */
function paidButFailed_(what, captureId, ref, err) {
  logError_('pago', 'Se cobró ' + what + ' (PayPal ' + captureId + '), pero hubo un error al guardarlo: ' + msg_(err) + '. Revisa la venta en PayPal y regístrala a mano.', ref, '', true);
  return { ok: false, error: 'Recibimos tu pago, pero hubo un problema al registrarlo. Ya nos llegó el aviso y te contactaremos. Guarda este código: ' + ref };
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
  try { updateRow_(found.index, patch); } catch (err) { return paidButFailed_('el saldo de la cita ' + r.id, cap.id, r.id, err); }
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  return { ok: true, appointment: publicRow_(r) };
}

/* =========================================================================
   Consultas y cancelación de la clienta
   ========================================================================= */

function myAppointments_(d) {
  const u = verifyIdToken_(d.idToken);
  if (!u) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
  const now = Date.now();
  const items = rows_().filter(function (r) {
    if (r.correo !== u.email || r.estado === 'expirada' || r.estado === 'bloqueo') return false;
    return r.estado !== 'retenida' || (r.metodoDeposito === 'transferencia' && new Date(r.retenidaHasta).getTime() > now);
  }).map(publicRow_);
  return { ok: true, items: items, loyalty: loyaltyFor_({ email: u.email }, settings_()) };
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
  if (r.estado !== 'confirmada' && r.estado !== 'por-confirmar') return { ok: false, error: 'Esta cita ya no se puede cancelar.' };
  const s = settings_();
  const hoursLeft = (new Date(r.inicio).getTime() - Date.now()) / 3600000;
  if (hoursLeft <= 0) return { ok: false, error: 'Esa cita ya pasó.' };
  const refundable = hoursLeft >= num_(s.horasCancelacion, 24);
  const wasConfirmed = r.estado === 'confirmada';
  const paidOutside = !r.paypalCaptura && Number(r.depositoRD) > 0 && (r.estado === 'por-confirmar' || !!r.depositoPagado) && /transferencia|efectivo/.test(r.metodoDeposito || '');
  const patch = { estado: 'cancelada', canceladaEn: new Date().toISOString(), canceladaPor: 'clienta' };
  patch.reembolso = !refundable ? 'no aplica (menos de ' + num_(s.horasCancelacion, 24) + ' h)'
    : r.paypalCaptura ? tryRefund_(r.paypalCaptura, r.id + '-refund')
      : paidOutside ? 'pendiente: devolver por ' + (r.metodoDeposito === 'efectivo' ? 'efectivo' : 'transferencia') : 'sin depósito pagado';
  if (r.saldoCaptura) patch.reembolso += ' · saldo: ' + tryRefund_(r.saldoCaptura, r.id + '-refund-saldo');
  if (refundable && wasConfirmed) { applyGift_(r, +1); applyBono_(r, +1); }
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  calendarCancel_(r, s);
  const refunded = /^reembolsado/.test(patch.reembolso) ? true : (/^pendiente/.test(patch.reembolso) ? 'manual' : false);
  notifyCancelled_(r, s, refunded);
  notifyWaitlist_(r.fecha);
  return { ok: true, refunded: refunded === true, refundManual: refunded === 'manual', appointment: publicRow_(r) };
}

/* =========================================================================
   Dashboard (solo correos en ADMIN_EMAILS)
   ========================================================================= */

function needAdmin_(d) {
  const u = verifyIdToken_(d.idToken);
  if (!u) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  if (!admin_(d.idToken)) throw new Error('Esta cuenta no tiene acceso al dashboard.');
  noteAccess_(u, d);
  return u;
}

/* Todo lo que necesita el dashboard en una sola consulta */
function adminData_(d) {
  const u = needAdmin_(d);
  const s = settings_();
  heartbeat_();
  return {
    ok: true, user: u.email,
    accounts: readOpt_('Cuentas').map(strip_),
    errors: readOpt_('Errores').slice(-150).reverse().map(function (x) { const o = strip_(x); o.row = x._row; return o; }),
    security: securityStatus_(s),
    items: rows_().map(adminRow_),
    blocks: blocks_(),
    clients: readTable_('Clientas').map(strip_),
    files: readTable_('Archivos').map(strip_),
    promos: readTable_('Promociones').map(strip_),
    gifts: readTable_('Tarjetas').filter(function (g) { return g.estado !== 'pendiente'; }).map(strip_),
    expenses: readTable_('Gastos').map(strip_),
    gallery: readOpt_('Galeria').map(strip_),
    reviews: readOpt_('Resenas').map(strip_),
    packages: readOpt_('Paquetes').map(strip_),
    bonos: readOpt_('Bonos').filter(function (b) { return b.estado !== 'pendiente'; }).map(strip_),
    waitlist: readOpt_('Espera').map(strip_),
    emails: readOpt_('Correos').slice(-200).reverse().map(strip_),
    automation: automationStatus_(),
    consentDefault: DEFAULT_CONSENT,
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
    case 'reembolsoHecho':
      if (!refundPending_(r)) return { ok: false, error: 'Esta cita no tiene un reembolso pendiente.' };
      patch = { reembolso: 'reembolsado a mano · ' + todayKey_() + (d.note ? ' · ' + clean_(d.note, 120) : '') };
      break;
    case 'cancelar': {
      if (r.estado === 'cancelada') return { ok: false, error: 'La cita ya estaba cancelada.' };
      const was = r.estado;
      patch = { estado: 'cancelada', canceladaEn: now, canceladaPor: 'estudio' };
      if (r.estado === 'bloqueo') { patch.canceladaPor = 'bloqueo eliminado'; break; }
      const paidOut = !r.paypalCaptura && Number(r.depositoRD) > 0 && (was === 'por-confirmar' || !!r.depositoPagado);
      patch.reembolso = !d.refund ? 'sin reembolso'
        : r.paypalCaptura ? tryRefund_(r.paypalCaptura, r.id + '-refund')
          : paidOut ? 'pendiente: devolver por ' + (r.metodoDeposito === 'transferencia' ? 'transferencia' : 'efectivo o transferencia') : 'sin depósito pagado';
      if (r.saldoCaptura) patch.reembolso += ' · saldo: ' + tryRefund_(r.saldoCaptura, r.id + '-refund-saldo');
      if (d.refund && (was === 'confirmada' || was === 'completada' || was === 'no-asistio')) { applyGift_(r, +1); applyBono_(r, +1); }
      break;
    }
    default: return { ok: false, error: 'Acción no válida.' };
  }
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  if (d.op === 'cancelar' && r.canceladaPor === 'estudio') {
    calendarCancel_(r, s);
    if (d.notify !== false) notifyCancelled_(r, s, /^reembolsado/.test(patch.reembolso || '') ? true : (/^pendiente/.test(patch.reembolso || '') ? 'manual' : false), true);
  }
  if (d.op === 'cancelar') notifyWaitlist_(r.fecha);
  return { ok: true, item: adminRow_(r) };
}

/* Cita creada a mano (teléfono, WhatsApp, en persona) */
function adminCreate_(d) {
  needAdmin_(d);
  const s = settings_();
  const cv = client_(d.client, false);
  if (!cv.ok) return { ok: false, error: cv.error };
  const name = cv.name;
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
    clienta: name, telefono: cv.phone, correo: cv.email, nota: cv.notes,
    tokenHash: hash_(Utilities.getUuid()), firmaToken: Utilities.getUuid().replace(/-/g, '').slice(0, 20),
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
  if (['confirmada', 'retenida', 'por-confirmar'].indexOf(r.estado) < 0) return { ok: false, error: 'Solo se pueden mover citas confirmadas.' };
  if (!isDateKey_(d.date) || !/^\d{2}:\d{2}$/.test(d.time || '')) return { ok: false, error: 'Elige la nueva fecha y hora.' };
  const minutes = Number(r.duracionMin) || 30;
  const start = new Date(d.date + 'T' + d.time + ':00' + UTC_OFFSET);
  const end = new Date(start.getTime() + minutes * 60000);
  if (!d.force) {
    const clash = conflicts_(start, end, r.id);
    if (clash.length) return { ok: false, conflict: true, error: 'Ese horario choca con ' + describeClash_(clash[0]) + '. Puedes moverla igual si lo confirmas.' };
  }
  const before = whenText_(r);
  const oldDate = r.fecha;
  const patch = { fecha: d.date, hora: d.time, inicio: start.toISOString(), fin: end.toISOString(), reprogramadaDe: r.fecha + ' ' + r.hora, recordatorio: '' };
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  calendarMove_(r, settings_());
  if (d.notify && r.correo) notifyRescheduled_(r, settings_(), before);
  notifyWaitlist_(oldDate);
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
      const v = clean_(d.settings[k], LONG_SETTINGS.indexOf(k) >= 0 ? 4000 : 300);
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
        depositoPct: Math.max(0, Math.min(100, Math.round(Number(sv.depositoPct === '' || sv.depositoPct == null ? 50 : sv.depositoPct) || 0))),
        retoqueDias: Math.max(0, Math.round(Number(sv.retoqueDias) || 0)),
        consentimiento: /^(si|sí|true)$/i.test(String(sv.consentimiento)) ? 'si' : 'no',
      };
      const r = rows.filter(function (x) { return x.id === id; })[0];
      if (r) updateTable_('Servicios', r._row, patch); else appendRow_('Servicios', patch);
    });
  }
  SVC_CACHE_ = null; SETTINGS_CACHE_ = null;
  clearCaches_();
  return adminData_(d);
}

/* Fichas de clientas */
function adminSaveClient_(d) {
  needAdmin_(d);
  const clave = clean_(d.clave, 120);
  if (!clave) return { ok: false, error: 'Falta la clienta.' };
  const cv = client_({ name: d.nombre, phone: d.telefono, email: d.correo }, false);
  if (!cv.ok) return { ok: false, error: cv.error };
  const patch = {
    clave: clave, nombre: cv.name, telefono: cv.phone, correo: cv.email,
    notas: clean_(d.notas, 3000), cumpleanos: monthDay_(d.cumpleanos), actualizada: new Date().toISOString(),
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
    const patch = { comprador: properName_(clean_(g.comprador, 80)), para: properName_(clean_(g.para, 80)), mensaje: clean_(g.mensaje, 300), vence: isDateKey_(g.vence) ? g.vence : '' };
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
    comprador: properName_(clean_(g.comprador, 80)), para: properName_(clean_(g.para, 80)), mensaje: clean_(g.mensaje, 300),
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
   Contenido de la web: franja, Conoce a Majo, galería, reseñas
   ========================================================================= */

function siteContent_(s) {
  return {
    announcement: { active: !/^no$/i.test(s.anuncioActivo || 'si'), text: s.anuncioTexto || '', link: s.anuncioEnlace || '' },
    google: { rating: Number(String(s.googleRating || '').replace(',', '.')) || 0, count: Number(s.googleResenas) || 0, url: s.googleUrl || '', reviewUrl: s.googleResenaUrl || '' },
    majo: {
      title: s.majoTitulo || 'Conoce a Majo', text: s.majoTexto || '',
      certs: String(s.majoCerts || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean),
      photo: s.majoFotoUrl || '',
    },
    business: { name: s.negocioNombre || 'MAJOBELLA Beauty Studio', rnc: s.negocioRnc || '', email: s.negocioCorreo || '', address: s.direccion || '', whatsapp: s.whatsapp || '' },
  };
}

function publicFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('PUBLIC_FOLDER_ID');
  if (!id) throw new Error('Falta ejecutar setup() para crear la carpeta pública.');
  return DriveApp.getFolderById(id);
}
function publicUrl_(fileId) { return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1600'; }
/* Copia un archivo privado a la carpeta pública y lo comparte "cualquiera con el enlace puede ver" */
function publicCopy_(driveId, name) {
  const f = DriveApp.getFileById(driveId).makeCopy(name, publicFolder_());
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return f.getId();
}
function trashQuiet_(id) { try { if (id) DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ya no existe */ } }

function adminPublishGallery_(d) {
  needAdmin_(d);
  if (!d.permiso) return { ok: false, error: 'Confirma que la clienta dio permiso para publicar sus fotos.' };
  const files = readTable_('Archivos');
  const a = files.filter(function (x) { return x.id === d.antesId; })[0];
  const b = files.filter(function (x) { return x.id === d.despuesId; })[0];
  if (!a || !b) return { ok: false, error: 'Elige una foto de antes y una de después.' };
  if (a.mime === 'application/pdf' || b.mime === 'application/pdf') return { ok: false, error: 'La galería solo acepta fotos.' };
  const servicio = clean_(d.servicio, 80);
  const id = 'GAL-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  const antes = publicCopy_(a.driveId, id + ' · antes');
  const despues = publicCopy_(b.driveId, id + ' · despues');
  const row = {
    id: id, servicio: servicio, antesId: antes, despuesId: despues, antesUrl: publicUrl_(antes), despuesUrl: publicUrl_(despues),
    texto: clean_(d.texto, 200), orden: Number(d.orden) || 0, visible: 'si', creada: new Date().toISOString(),
  };
  appendRow_('Galeria', row);
  return { ok: true, item: strip_(row) };
}

function adminSaveGallery_(d) {
  needAdmin_(d);
  const r = readTable_('Galeria').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos esa foto de la galería.' };
  const patch = {};
  if (d.servicio != null) patch.servicio = clean_(d.servicio, 80);
  if (d.texto != null) patch.texto = clean_(d.texto, 200);
  if (d.orden != null) patch.orden = Number(d.orden) || 0;
  if (d.visible != null) patch.visible = d.visible ? 'si' : 'no';
  updateTable_('Galeria', r._row, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  return { ok: true, item: strip_(r) };
}

function adminDeleteGallery_(d) {
  needAdmin_(d);
  const r = readTable_('Galeria').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos esa foto de la galería.' };
  trashQuiet_(r.antesId); trashQuiet_(r.despuesId);
  deleteRow_('Galeria', r._row);
  return { ok: true };
}

/* Reseñas reales copiadas de tu perfil de Google */
function adminSaveReview_(d) {
  needAdmin_(d);
  const v = d.review || {};
  const autora = clean_(v.autora, 60), texto = clean_(v.texto, 800);
  if (!autora || !texto) return { ok: false, error: 'Escribe el nombre y el texto de la reseña.' };
  const patch = {
    id: v.id || ('RES-' + Utilities.getUuid().slice(0, 6).toUpperCase()), autora: autora, texto: texto,
    estrellas: Math.max(1, Math.min(5, Math.round(Number(v.estrellas) || 5))), fecha: isDateKey_(v.fecha) ? v.fecha : todayKey_(),
    visible: v.visible === false || /^no$/i.test(String(v.visible)) ? 'no' : 'si', orden: Number(v.orden) || 0,
  };
  const r = readTable_('Resenas').filter(function (x) { return x.id === patch.id; })[0];
  if (r) updateTable_('Resenas', r._row, patch); else { patch.creada = new Date().toISOString(); appendRow_('Resenas', patch); }
  return { ok: true, review: patch };
}

function adminDeleteReview_(d) {
  needAdmin_(d);
  const r = readTable_('Resenas').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos esa reseña.' };
  deleteRow_('Resenas', r._row);
  return { ok: true };
}

/* Foto de "Conoce a Majo" */
function adminUploadPublic_(d) {
  needAdmin_(d);
  const mime = String(d.mime || '');
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mime) < 0) return { ok: false, error: 'Usa una foto JPG, PNG o WEBP.' };
  const bytes = Utilities.base64Decode(String(d.data || ''));
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) return { ok: false, error: 'La foto está vacía o pesa más de 12 MB.' };
  const file = publicFolder_().createFile(Utilities.newBlob(bytes, mime, 'majo · ' + todayKey_()));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = publicUrl_(file.getId());
  const rows = readTable_('Ajustes');
  const old = rows.filter(function (x) { return x.clave === 'majoFotoUrl'; })[0];
  if (old) {
    const m = String(old.valor || '').match(/id=([\w-]+)/);
    if (m) trashQuiet_(m[1]);
    updateTable_('Ajustes', old._row, { valor: url });
  } else appendRow_('Ajustes', { clave: 'majoFotoUrl', valor: url, 'qué es': '' });
  return { ok: true, url: url };
}

/* =========================================================================
   Tarjetas de regalo compradas en la web (PayPal)
   ========================================================================= */

function giftOrder_(d) {
  const s = settings_();
  if (/^no$/i.test(s.tarjetasEnLinea || 'si')) return { ok: false, error: 'La venta de tarjetas en la web está pausada.' };
  if (!human_(d, s)) return { ok: false, error: NOT_HUMAN };
  const monto = Math.round(Number(d.montoRD) || 0);
  const min = num_(s.tarjetaMin, 500), max = num_(s.tarjetaMax, 30000);
  if (monto < min || monto > max) return { ok: false, error: 'El valor debe estar entre RD$ ' + money_(min) + ' y RD$ ' + money_(max) + '.' };
  const correo = clean_(d.correo, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return { ok: false, error: 'Escribe tu correo para enviarte la tarjeta.' };
  const correoPara = clean_(d.correoPara, 120).toLowerCase();
  if (correoPara && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correoPara)) return { ok: false, error: 'Revisa el correo de quien recibe la tarjeta.' };
  const rate = num_(s.tasaUSD, 63);
  const usd = usd_(monto, rate);
  const id = 'TRG-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  const order = paypal_('post', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: id, custom_id: id, invoice_id: id,
      description: 'Tarjeta de regalo MAJOBELLA · RD$ ' + money_(monto),
      amount: { currency_code: 'USD', value: usd.toFixed(2) },
    }],
    application_context: { brand_name: 'MAJOBELLA', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
  }, id + '-order');
  appendRow_('Tarjetas', {
    id: id, codigo: '', montoRD: monto, saldoRD: 0, comprador: properName_(clean_(d.de, 80)), para: properName_(clean_(d.para, 80)), mensaje: clean_(d.mensaje, 160),
    metodoPago: 'paypal', vendida: '', vence: '', estado: 'pendiente', creada: new Date().toISOString(),
    correoComprador: correo, correoPara: correoPara, paypalOrden: order.id,
  });
  return { ok: true, id: id, orderId: order.id, montoRD: monto, montoUSD: usd.toFixed(2), usdRate: rate };
}

function giftCapture_(d) {
  const g = readTable_('Tarjetas').filter(function (x) { return x.id === d.id; })[0];
  if (!g || g.paypalOrden !== d.orderId) return { ok: false, error: 'No encontramos esa compra.' };
  if (g.estado !== 'pendiente' && g.paypalCaptura) return { ok: true, gift: giftOut_(g) };
  const cap = firstCapture_(paypal_('post', '/v2/checkout/orders/' + encodeURIComponent(d.orderId) + '/capture', {}, g.id + '-capture'));
  if (!cap || cap.status !== 'COMPLETED') return { ok: false, error: 'PayPal no completó el pago. No se te cobró.' };
  try { return giftActivate_(g, cap); } catch (err) { return paidButFailed_('una tarjeta de regalo de RD$ ' + money_(g.montoRD) + ' (' + g.id + ')', cap.id, g.id, err); }
}

function giftActivate_(g, cap) {
  const s = settings_();
  let codigo = '';
  for (let i = 0; i < 6 && (!codigo || findGift_(codigo)); i++) codigo = 'MJB-' + randCode_(4) + '-' + randCode_(4);
  const today = todayKey_();
  const p = today.split('-').map(Number);
  const vence = Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2] + num_(s.tarjetaVenceDias, 365))), 'UTC', 'yyyy-MM-dd');
  const patch = { codigo: codigo, saldoRD: g.montoRD, vendida: today, vence: vence, estado: 'activa', paypalCaptura: cap.id };
  updateTable_('Tarjetas', g._row, patch);
  Object.keys(patch).forEach(function (k) { g[k] = patch[k]; });
  notifyGift_(g, s);
  return { ok: true, gift: giftOut_(g) };
}

function giftOut_(g) {
  return { codigo: g.codigo, montoRD: Number(g.montoRD) || 0, para: g.para, de: g.comprador, mensaje: g.mensaje, vence: g.vence };
}

function giftCardHtml_(g, s) {
  const F = "Georgia,'Times New Roman',serif";
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid #111111;margin:4px 0 18px"><tr><td align="center" style="padding:26px 18px;font-family:' + F + ';color:#111111">' +
    '<p style="margin:0 0 6px;font-size:11px;letter-spacing:4px;color:#6b6b6b">TARJETA DE REGALO</p>' +
    '<p style="margin:0;font-size:40px;line-height:1.1">RD$ ' + money_(g.montoRD) + '</p>' +
    (g.para ? '<p style="margin:10px 0 0;font-style:italic;font-size:17px">Para ' + esc_(g.para) + (g.comprador ? ' · de ' + esc_(g.comprador) : '') + '</p>' : '') +
    (g.mensaje ? '<p style="margin:10px 0 0;color:#555555">“' + esc_(g.mensaje) + '”</p>' : '') +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 0"><tr><td style="background:#111111;padding:12px 22px;font-family:\'Courier New\',monospace;font-size:20px;letter-spacing:4px;color:#ffffff">' + esc_(g.codigo) + '</td></tr></table>' +
    (g.vence ? '<p style="margin:10px 0 0;font-size:13px;color:#6b6b6b">Válida hasta el ' + esc_(longDate_(g.vence)) + '</p>' : '') +
    '</td></tr></table>';
}

function notifyGift_(g, s) {
  const card = giftCardHtml_(g, s);
  const how = 'Se usa escribiendo el código al reservar en la web, en el resumen de la cita.';
  safeMail_(g.correoComprador, 'Tu tarjeta de regalo MAJOBELLA · ' + g.codigo, layout_(s, {
    kicker: 'Tarjeta de regalo', title: '¡Gracias por tu compra!', intro: 'Esta es la tarjeta de regalo. Puedes reenviar este correo o compartir el código.',
    body: card + '<p style="margin:0">' + how + '</p>', cta: { text: 'Ir a la web', url: mailUrl_(s, '#reservar') },
  }), { tipo: 'tarjeta', ref: g.id });
  if (g.correoPara) {
    safeMail_(g.correoPara, (g.comprador ? g.comprador + ' te regaló' : 'Te regalaron') + ' una experiencia en MAJOBELLA', layout_(s, {
      kicker: 'Un regalo para ti', title: (g.para ? g.para + ', tienes' : 'Tienes') + ' un regalo', intro: (g.comprador ? esc_(g.comprador) + ' te regaló' : 'Te regalaron') + ' una tarjeta para usar en MAJOBELLA Beauty Studio.',
      body: card + '<p style="margin:0">' + how + '</p>', cta: { text: 'Reservar mi cita', url: mailUrl_(s, '#reservar') },
    }), { tipo: 'tarjeta', ref: g.id });
  }
  safeMail_(adminTo_(s), 'Tarjeta de regalo vendida en la web · RD$ ' + money_(g.montoRD), layout_(s, {
    kicker: 'Tarjeta vendida', title: 'RD$ ' + money_(g.montoRD),
    details: [['Código', esc_(g.codigo)], ['De', esc_((g.comprador || '—') + ' · ' + g.correoComprador)], ['Para', esc_(g.para || '—')]],
    cta: { text: 'Abrir dashboard', url: mailUrl_(s, 'admin.html#promos') },
  }), { tipo: 'aviso', ref: g.id });
}

/* =========================================================================
   Tareas automáticas (disparador cada hora: tareasProgramadas)
   ========================================================================= */

/** La ejecuta el disparador que crea setup(). También se puede ejecutar a mano desde el editor. */
function tareasProgramadas() {
  return locked_(function () { return runAutomations_(); });
}

function runAutomations_() {
  resetDb_();
  const s = settings_();
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, TZ, 'H'));
  const daytime = hour >= 8 && hour < 21;
  const out = { recordatorios: 0, resenas: 0, retoques: 0, cumpleanos: 0, espera: 0 };
  const rows = rows_();
  const step = function (key, fn) { try { out[key] = fn(); } catch (e) { out[key] = 'error: ' + msg_(e); logError_('automatizacion', key + ': ' + msg_(e), '', ''); } };
  if (on_(s.recordatorioActivo) && hour >= 7 && hour < 22) step('recordatorios', function () { return sendReminders_(rows, s, now); });
  if (daytime && on_(s.resenaActiva) && s.googleResenaUrl) step('resenas', function () { return askReviews_(rows, s, now); });
  if (daytime && on_(s.retoqueActivo)) step('retoques', function () { return retouchNotices_(rows, s); });
  if (daytime && on_(s.cumpleActivo)) step('cumpleanos', function () { return birthdays_(rows, s); });
  if (on_(s.esperaActiva)) step('espera', function () { return checkWaitlist_(s, null); });
  if (hour >= 8 && hour < 22) step('transferencias', function () { return nagTransfers_(rows, s, now); });
  PropertiesService.getScriptProperties().setProperty('LAST_AUTO', JSON.stringify({ at: now.toISOString(), out: out }));
  return out;
}

function automationStatus_() {
  const st = { lastRun: null, trigger: false, quota: null };
  try { st.lastRun = safeJson_(PropertiesService.getScriptProperties().getProperty('LAST_AUTO'), null); } catch (e) { /* nada */ }
  try { st.trigger = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === AUTO_TRIGGER; }); } catch (e) { st.trigger = null; }
  try { st.quota = MailApp.getRemainingDailyQuota(); } catch (e) { /* nada */ }
  return st;
}

/* Recordatorio X horas antes (una vez por cita) */
function sendReminders_(rows, s, now) {
  const H = num_(s.recordatorioHoras, 24);
  let n = 0;
  rows.forEach(function (r) {
    if (r.estado !== 'confirmada' || r.recordatorio || !r.correo) return;
    const hoursLeft = (new Date(r.inicio).getTime() - now.getTime()) / 3600000;
    const age = (now.getTime() - new Date(r.creada || r.depositoPagado || 0).getTime()) / 3600000;
    if (hoursLeft > H || hoursLeft < 1 || age < 6) return;
    const m = mailReminder_(r, s);
    if (safeMail_(r.correo, m.subject, m.html, { tipo: 'recordatorio', ref: r.id })) { updateRow_(r._row, { recordatorio: now.toISOString() }); n++; }
  });
  return n;
}

/* Pedir reseña unas horas después de una cita realizada (una vez cada 120 días por clienta) */
function askReviews_(rows, s, now) {
  const H = Math.max(0, Number(String(s.resenaHoras).replace(',', '.')) || 0);
  const lastAsked = {};
  rows.forEach(function (r) { if (r.resenaPedida && /^\d{4}-/.test(r.resenaPedida)) { const k = clientKey_(r.correo, r.telefono, r.clienta); if (!lastAsked[k] || r.resenaPedida > lastAsked[k]) lastAsked[k] = r.resenaPedida; } });
  let n = 0;
  rows.forEach(function (r) {
    if (r.estado !== 'completada' || r.resenaPedida || !r.correo) return;
    const end = new Date(r.fin).getTime();
    if (now.getTime() < end + H * 3600000 || now.getTime() > end + 7 * 86400000) return;
    const k = clientKey_(r.correo, r.telefono, r.clienta);
    if (lastAsked[k] && now.getTime() - new Date(lastAsked[k]).getTime() < 120 * 86400000) { updateRow_(r._row, { resenaPedida: 'no (pedida hace poco)' }); return; }
    const m = mailReview_(r, s);
    if (safeMail_(r.correo, m.subject, m.html, { tipo: 'resena', ref: r.id })) { updateRow_(r._row, { resenaPedida: now.toISOString() }); lastAsked[k] = now.toISOString(); n++; }
  });
  return n;
}

/* Aviso de retoque una semana antes de la fecha ideal (días por servicio en "Servicios") */
function retouchNotices_(rows, s) {
  const svcs = servicesMap_();
  const today = todayKey_();
  let n = 0;
  rows.forEach(function (r) {
    if (r.estado !== 'completada' || r.retoqueAviso || !r.correo) return;
    const ids = safeJson_(r.serviciosJson, []).map(function (x) { return x.id; });
    const svc = ids.map(function (id) { return svcs[id]; }).filter(function (x) { return x && x.retoqueDays > 0; })[0];
    if (!svc) return;
    const ideal = addDaysKey_(r.fecha, svc.retoqueDays);
    if (today < addDaysKey_(ideal, -7)) return;
    const k = clientKey_(r.correo, r.telefono, r.clienta);
    const booked = rows.some(function (x) {
      return x.id !== r.id && x.fecha > r.fecha && ['confirmada', 'completada', 'retenida'].indexOf(x.estado) >= 0 &&
        clientKey_(x.correo, x.telefono, x.clienta) === k && safeJson_(x.serviciosJson, []).some(function (y) { return y.id === svc.id; });
    });
    if (booked) { updateRow_(r._row, { retoqueAviso: 'no (ya reservó)' }); return; }
    if (today > addDaysKey_(ideal, 21)) { updateRow_(r._row, { retoqueAviso: 'no (pasó la fecha)' }); return; }
    const m = mailRetouch_(r, s, svc, ideal);
    if (safeMail_(r.correo, m.subject, m.html, { tipo: 'retoque', ref: r.id })) { updateRow_(r._row, { retoqueAviso: new Date().toISOString() }); n++; }
  });
  return n;
}

/* Cumpleaños: código de un solo uso con el % de Ajustes */
function birthdays_(rows, s) {
  const today = todayKey_();
  const md = today.slice(5);
  const year = today.slice(0, 4);
  let n = 0;
  readOpt_('Clientas').forEach(function (c) {
    if (monthDay_(c.cumpleanos) !== md || String(c.cumpleEnviado) === year) return;
    let email = c.correo;
    if (!email) {
      const last = rows.filter(function (r) { return r.correo && clientKey_(r.correo, r.telefono, r.clienta) === c.clave; }).pop();
      email = last ? last.correo : '';
    }
    if (!email) return;
    const pct = num_(s.cumpleDescuento, 15);
    const until = addDaysKey_(today, num_(s.cumpleDias, 30));
    let code = '';
    for (let i = 0; i < 6 && (!code || codeTaken_(code)); i++) code = 'CUMPLE-' + randCode_(5);
    appendRow_('Promociones', {
      id: 'PRM-' + Utilities.getUuid().slice(0, 6).toUpperCase(), nombre: 'Cumpleaños de ' + (c.nombre || 'clienta'), tipo: 'codigo', codigo: code,
      servicios: 'todos', descuentoTipo: 'porcentaje', valor: pct, desde: today, hasta: until, usosMax: 1, usos: 0, activo: 'si', creada: new Date().toISOString(),
    });
    const m = mailBirthday_(c.nombre, s, code, pct, until);
    safeMail_(email, m.subject, m.html, { tipo: 'cumpleanos', ref: c.clave });
    updateTable_('Clientas', c._row, { cumpleEnviado: year });
    n++;
  });
  return n;
}

function codeTaken_(code) {
  const c = normCode_(code);
  return !!findGift_(c) || !!findBono_(c) || readTable_('Promociones').some(function (x) { return normCode_(x.codigo) === c; });
}

/* Guarda el cumpleaños de la reserva en la ficha de la clienta */
function saveBirthday_(r) {
  const md = monthDay_(r.cumpleanos);
  if (!md) return;
  try {
    const key = clientKey_(r.correo, r.telefono, r.clienta);
    const c = readTable_('Clientas').filter(function (x) { return x.clave === key; })[0];
    if (c) { if (monthDay_(c.cumpleanos) !== md) updateTable_('Clientas', c._row, { cumpleanos: md, actualizada: new Date().toISOString() }); }
    else appendRow_('Clientas', { clave: key, nombre: r.clienta, telefono: r.telefono, correo: r.correo, notas: '', cumpleanos: md, actualizada: new Date().toISOString() });
  } catch (e) { /* no debe romper la reserva */ }
}

/* Acepta "MM-DD", "AAAA-MM-DD" o "DD/MM" y devuelve "MM-DD" */
function monthDay_(v) {
  const t = String(v == null ? '' : v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) return valid_(Number(m[1]), Number(m[2]));
  m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return valid_(Number(m[2]), Number(m[1]));
  return '';
  function valid_(mo, d) { return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2) : ''; }
}

/* =========================================================================
   Lista de espera
   ========================================================================= */

function waitlistJoin_(d) {
  const s = settings_();
  if (!on_(s.esperaActiva)) return { ok: false, error: 'La lista de espera no está disponible.' };
  if (!human_(d, s)) return { ok: false, error: NOT_HUMAN };
  const cv = client_(d.client, true);
  if (!cv.ok) return { ok: false, error: cv.error };
  const name = cv.name, phone = cv.phone, email = cv.email;
  const sch = schedule_(s);
  const today = todayKey_();
  if (!isDateKey_(d.date) || d.date < today || d.date > addDaysKey_(today, sch.maxDays)) return { ok: false, error: 'Elige un día dentro de la agenda.' };
  const ids = (d.services || []).map(function (x) { return typeof x === 'string' ? x : x && x.id; }).filter(Boolean);
  const items = catalogItems_(ids);
  if (!items.length || items.some(function (x) { return !x; })) return { ok: false, error: 'Elige primero tus servicios.' };
  const minutes = items.reduce(function (t, x) { return t + x.durationMinutes; }, 0);
  const franja = ['manana', 'tarde'].indexOf(d.franja) >= 0 ? d.franja : 'cualquiera';
  const free = freeSlots_(d.date, minutes, franja, s);
  const dup = readOpt_('Espera').filter(function (w) { return w.fecha === d.date && w.correo === email && w.estado === 'esperando'; })[0];
  if (dup) return { ok: true, id: dup.id, already: true, available: free };
  const row = {
    id: 'ESP-' + Utilities.getUuid().slice(0, 6).toUpperCase(), fecha: d.date, franja: franja,
    serviciosJson: JSON.stringify(items.map(function (x) { return { id: x.id, name: x.name }; })), servicios: items.map(function (x) { return x.name; }).join(' + '),
    duracionMin: minutes, clienta: name, telefono: phone, correo: email, estado: 'esperando', creada: new Date().toISOString(), avisada: '',
  };
  appendRow_('Espera', row);
  return { ok: true, id: row.id, available: free };
}

/* Horarios libres de un día para una duración (franja: manana | tarde | cualquiera) */
function freeSlots_(date, minutes, franja, s) {
  const sch = schedule_(s || settings_());
  if (sch.blocked.indexOf(date) >= 0) return [];
  const p = date.split('-').map(Number);
  const h = sch.hours[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
  if (!h) return [];
  const busy = (busy_(date, date).busy || []).map(function (b) { return [new Date(b.start).getTime(), new Date(b.end).getTime()]; });
  const out = [];
  const earliest = Date.now() + sch.minNotice * 3600000;
  for (let t = toMin_(h.open); t + minutes <= toMin_(h.close); t += sch.step) {
    const hhmm = pad_(Math.floor(t / 60)) + ':' + pad_(t % 60);
    if (franja === 'manana' && t >= 720) continue;
    if (franja === 'tarde' && t < 720) continue;
    const a = new Date(date + 'T' + hhmm + ':00' + UTC_OFFSET).getTime(), b = a + minutes * 60000;
    if (a < earliest) continue;
    if (busy.some(function (x) { return x[0] < b && x[1] > a; })) continue;
    out.push(hhmm);
  }
  return out;
}

/* Avisa a quien espera un día cuando hay horario libre (date = null revisa todos) */
function checkWaitlist_(s, date) {
  const today = todayKey_();
  let n = 0;
  readOpt_('Espera').forEach(function (w) {
    if (w.estado !== 'esperando') return;
    if (w.fecha < today) { updateTable_('Espera', w._row, { estado: 'vencida' }); return; }
    if (date && w.fecha !== date) return;
    const slots = freeSlots_(w.fecha, Number(w.duracionMin) || 30, w.franja, s);
    if (!slots.length) return;
    const m = mailWaitlist_(w, s, slots);
    if (safeMail_(w.correo, m.subject, m.html, { tipo: 'espera', ref: w.id })) { updateTable_('Espera', w._row, { estado: 'avisada', avisada: new Date().toISOString() }); n++; }
  });
  return n;
}
function notifyWaitlist_(date) {
  try { const s = settings_(); if (on_(s.esperaActiva) && isDateKey_(date)) checkWaitlist_(s, date); } catch (e) { /* no debe romper la cancelación */ }
}
function markWaitlistBooked_(r) {
  try {
    readOpt_('Espera').forEach(function (w) {
      if (w.fecha === r.fecha && w.correo && w.correo === r.correo && (w.estado === 'esperando' || w.estado === 'avisada')) updateTable_('Espera', w._row, { estado: 'reservo' });
    });
  } catch (e) { /* nada */ }
}

function adminWaitlist_(d) {
  needAdmin_(d);
  const w = readOpt_('Espera').filter(function (x) { return x.id === d.id; })[0];
  if (!w) return { ok: false, error: 'No encontramos esa persona en la lista.' };
  if (d.op === 'eliminar') { deleteRow_('Espera', w._row); return { ok: true, removed: true }; }
  const estado = ['esperando', 'avisada', 'reservo', 'cancelada'].indexOf(d.estado) >= 0 ? d.estado : w.estado;
  updateTable_('Espera', w._row, { estado: estado });
  w.estado = estado;
  return { ok: true, item: strip_(w) };
}

/* =========================================================================
   Fidelidad: cada N visitas realizadas, la siguiente cita tiene premio
   ========================================================================= */

function loyaltyFor_(client, s) {
  if (!client || !on_(s.fidelidadActiva)) return null;
  const email = String(client.email || '').trim().toLowerCase();
  const phone = String(client.phone || '').replace(/\D/g, '').slice(-10);
  if (!email && phone.length < 10) return null;
  const mine = rows_().filter(function (r) {
    return (email && String(r.correo).toLowerCase() === email) || (phone.length === 10 && String(r.telefono).replace(/\D/g, '').slice(-10) === phone);
  }).sort(function (a, b) { return String(a.inicio).localeCompare(String(b.inicio)); });
  let since = '';
  mine.forEach(function (r) {
    if (r.fidelidad === 'si' && ['confirmada', 'completada', 'no-asistio'].indexOf(r.estado) >= 0) since = r.inicio;
  });
  const every = num_(s.fidelidadVisitas, 5);
  const visits = mine.filter(function (r) { return r.estado === 'completada' && (!since || r.inicio > since); }).length;
  return { enabled: true, every: every, visits: Math.min(visits, every), eligible: visits >= every, kind: s.fidelidadTipo === 'monto' ? 'monto' : 'porcentaje', value: num_(s.fidelidadValor, 20) };
}

/* La web pregunta si la clienta tiene el premio (solo dice si aplica, no cuántas visitas lleva) */
function loyalty_(d) {
  const l = loyaltyFor_(d.client || {}, settings_());
  if (!l) return { ok: true, enabled: false };
  return { ok: true, enabled: true, eligible: l.eligible, every: l.every, kind: l.kind, value: l.value };
}

/* =========================================================================
   Paquetes de sesiones (bonos)
   ========================================================================= */

function findBono_(code) {
  const c = normCode_(code);
  if (!c) return null;
  return readOpt_('Bonos').filter(function (b) { return normCode_(b.codigo) === c; })[0] || null;
}
function bonoUsable_(b, today) {
  if (!b || b.estado !== 'activo') return false;
  if (b.vence && today > b.vence) return false;
  return (Number(b.usadas) || 0) < (Number(b.sesiones) || 0);
}
/* Usa (sign = -1) o devuelve (sign = +1) una sesión del paquete de una cita */
function applyBono_(r, sign) {
  if (!r.bonoCodigo) return;
  const b = findBono_(r.bonoCodigo);
  if (!b) return;
  const used = Math.max(0, (Number(b.usadas) || 0) - sign);
  const patch = { usadas: used };
  if (b.estado !== 'anulado') patch.estado = used >= (Number(b.sesiones) || 0) ? 'agotado' : 'activo';
  updateTable_('Bonos', b._row, patch);
}

function packageOut_(k) {
  const svc = servicesMap_()[k.servicio];
  const sessions = Number(k.sesiones) || 0, price = Number(k.precioRD) || 0;
  const regular = svc ? svc.price * sessions : 0;
  return {
    id: k.id, name: k.nombre, service: k.servicio, serviceName: svc ? svc.name : k.servicio, sessions: sessions, price: price,
    validDays: Number(k.venceDias) || 0, description: k.descripcion || '', regular: regular, savings: Math.max(0, regular - price),
  };
}

function newBonoCode_() {
  let code = '';
  for (let i = 0; i < 6 && (!code || codeTaken_(code)); i++) code = 'PAQ-' + randCode_(4) + '-' + randCode_(4);
  return code;
}

function adminSavePackage_(d) {
  needAdmin_(d);
  const k = d.pkg || {};
  const nombre = clean_(k.nombre, 80);
  if (!nombre) return { ok: false, error: 'Ponle un nombre al paquete.' };
  if (!servicesMap_()[k.servicio]) return { ok: false, error: 'Elige el servicio del paquete.' };
  const sesiones = Math.round(Number(k.sesiones) || 0), precio = Math.round(Number(k.precioRD) || 0);
  if (sesiones < 1 || sesiones > 50) return { ok: false, error: 'Revisa el número de sesiones.' };
  if (precio <= 0) return { ok: false, error: 'Escribe el precio del paquete.' };
  const patch = {
    id: k.id || ('PKG-' + Utilities.getUuid().slice(0, 6).toUpperCase()), nombre: nombre, servicio: k.servicio, sesiones: sesiones, precioRD: precio,
    venceDias: Math.max(0, Math.round(Number(k.venceDias) || 0)), descripcion: clean_(k.descripcion, 300),
    enWeb: /^(no|false)$/i.test(String(k.enWeb)) ? 'no' : 'si', activo: /^(no|false)$/i.test(String(k.activo)) ? 'no' : 'si',
  };
  const r = readTable_('Paquetes').filter(function (x) { return x.id === patch.id; })[0];
  if (r) updateTable_('Paquetes', r._row, patch); else { patch.creada = new Date().toISOString(); appendRow_('Paquetes', patch); }
  return { ok: true, pkg: patch };
}

function adminDeletePackage_(d) {
  needAdmin_(d);
  const r = readTable_('Paquetes').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos ese paquete.' };
  deleteRow_('Paquetes', r._row);
  return { ok: true };
}

function createBono_(k, c, extra) {
  const today = todayKey_();
  const row = {
    id: 'BON-' + Utilities.getUuid().slice(0, 6).toUpperCase(), codigo: extra.codigo || '', paqueteId: k.id, nombre: k.nombre, servicio: k.servicio,
    sesiones: Number(k.sesiones) || 1, usadas: 0, clienta: c.name, telefono: c.phone, correo: c.email,
    montoRD: extra.montoRD != null ? extra.montoRD : Number(k.precioRD) || 0, metodoPago: extra.metodoPago || 'efectivo',
    vendida: extra.estado === 'pendiente' ? '' : today, vence: extra.estado === 'pendiente' ? '' : (Number(k.venceDias) > 0 ? addDaysKey_(today, Number(k.venceDias)) : ''),
    estado: extra.estado || 'activo', paypalOrden: extra.paypalOrden || '', creada: new Date().toISOString(),
  };
  appendRow_('Bonos', row);
  return row;
}

function adminSellBono_(d) {
  needAdmin_(d);
  const k = readTable_('Paquetes').filter(function (x) { return x.id === d.paqueteId; })[0];
  if (!k) return { ok: false, error: 'Elige un paquete.' };
  const c = client_(d.client, false);
  if (!c.ok) return { ok: false, error: c.error };
  const monto = d.montoRD !== '' && d.montoRD != null ? Math.max(0, Math.round(Number(d.montoRD) || 0)) : Number(k.precioRD) || 0;
  const row = createBono_(k, c, { codigo: newBonoCode_(), montoRD: monto, metodoPago: ['efectivo', 'transferencia', 'paypal', 'cortesia'].indexOf(d.metodoPago) >= 0 ? d.metodoPago : 'efectivo' });
  if (d.notify && row.correo) { const m = mailBono_(row, settings_()); safeMail_(row.correo, m.subject, m.html, { tipo: 'paquete', ref: row.id }); }
  return { ok: true, bono: strip_(row) };
}

function adminSaveBono_(d) {
  needAdmin_(d);
  const b = readTable_('Bonos').filter(function (x) { return x.id === d.id; })[0];
  if (!b) return { ok: false, error: 'No encontramos ese paquete.' };
  const patch = {};
  if (d.usadas != null) patch.usadas = Math.max(0, Math.min(Number(b.sesiones) || 0, Math.round(Number(d.usadas) || 0)));
  if (d.vence != null) patch.vence = isDateKey_(d.vence) ? d.vence : '';
  const used = patch.usadas != null ? patch.usadas : Number(b.usadas) || 0;
  if (d.estado === 'anulado') patch.estado = 'anulado';
  else if (d.estado === 'activo' || b.estado !== 'anulado') patch.estado = used >= (Number(b.sesiones) || 0) ? 'agotado' : 'activo';
  updateTable_('Bonos', b._row, patch);
  Object.keys(patch).forEach(function (k) { b[k] = patch[k]; });
  return { ok: true, bono: strip_(b) };
}

/* Compra de un paquete en la web (PayPal) */
function bonoOrder_(d) {
  const s = settings_();
  if (!human_(d, s)) return { ok: false, error: NOT_HUMAN };
  const k = readOpt_('Paquetes').filter(function (x) { return x.id === d.paqueteId && !/^no$/i.test(x.activo) && /^s[ií]$/i.test(x.enWeb); })[0];
  if (!k) return { ok: false, error: 'Ese paquete ya no está disponible.' };
  const c = client_(d.client, true);
  if (!c.ok) return { ok: false, error: c.error };
  const rate = num_(s.tasaUSD, 63);
  const usd = usd_(Number(k.precioRD) || 0, rate);
  const id = 'BON-' + Utilities.getUuid().slice(0, 6).toUpperCase();
  const order = paypal_('post', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: id, custom_id: id, invoice_id: id, description: ('Paquete MAJOBELLA · ' + k.nombre).slice(0, 127), amount: { currency_code: 'USD', value: usd.toFixed(2) } }],
    application_context: { brand_name: 'MAJOBELLA', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
  }, id + '-order');
  const row = createBono_(k, c, { estado: 'pendiente', metodoPago: 'paypal', paypalOrden: order.id });
  return { ok: true, id: row.id, orderId: order.id, montoUSD: usd.toFixed(2), usdRate: rate };
}

function bonoCapture_(d) {
  const b = readTable_('Bonos').filter(function (x) { return x.id === d.id; })[0];
  if (!b || b.paypalOrden !== d.orderId) return { ok: false, error: 'No encontramos esa compra.' };
  if (b.estado !== 'pendiente' && b.paypalCaptura) return { ok: true, bono: bonoOut_(b) };
  const cap = firstCapture_(paypal_('post', '/v2/checkout/orders/' + encodeURIComponent(d.orderId) + '/capture', {}, b.id + '-capture'));
  if (!cap || cap.status !== 'COMPLETED') return { ok: false, error: 'PayPal no completó el pago. No se te cobró.' };
  try { return bonoActivate_(b, cap); } catch (err) { return paidButFailed_('el paquete ' + b.nombre + ' (' + b.id + ')', cap.id, b.id, err); }
}

function bonoActivate_(b, cap) {
  const k = readTable_('Paquetes').filter(function (x) { return x.id === b.paqueteId; })[0] || {};
  const today = todayKey_();
  const patch = { codigo: newBonoCode_(), estado: 'activo', vendida: today, vence: Number(k.venceDias) > 0 ? addDaysKey_(today, Number(k.venceDias)) : '', paypalCaptura: cap.id };
  updateTable_('Bonos', b._row, patch);
  Object.keys(patch).forEach(function (x) { b[x] = patch[x]; });
  const s = settings_();
  const m = mailBono_(b, s);
  safeMail_(b.correo, m.subject, m.html, { tipo: 'paquete', ref: b.id });
  safeMail_(adminTo_(s), 'Paquete vendido en la web · ' + b.nombre, layout_(s, {
    kicker: 'Paquete vendido', title: b.clienta,
    details: [['Paquete', esc_(b.nombre)], ['Monto', 'RD$ ' + money_(b.montoRD)], ['Código', esc_(b.codigo)], ['Teléfono', esc_(b.telefono)], ['Correo', esc_(b.correo)]],
    cta: { text: 'Abrir dashboard', url: mailUrl_(s, 'admin.html#promos') },
  }), { tipo: 'aviso', ref: b.id });
  return { ok: true, bono: bonoOut_(b) };
}
function bonoOut_(b) {
  const svc = servicesMap_()[b.servicio];
  return { codigo: b.codigo, nombre: b.nombre, sesiones: Number(b.sesiones) || 0, servicio: b.servicio, serviceName: svc ? svc.name : b.servicio, vence: b.vence };
}

/* La app consulta el saldo de las tarjetas de regalo y paquetes que la clienta guardó (quien tiene el código puede verlo) */
function walletLookup_(d) {
  if (limited_(d)) return { ok: false, error: TOO_MANY };
  const codes = (d.codes || []).slice(0, 20).map(normCode_).filter(Boolean);
  const items = walletItems_(codes);
  if (items.some(function (x) { return x.type === 'unknown'; })) noteFail_(d);
  return { ok: true, items: items };
}

function walletItems_(codes) {
  const today = todayKey_();
  const svcs = servicesMap_();
  const items = codes.map(function (c) {
    const g = findGift_(c);
    if (g && g.estado !== 'pendiente') {
      const expired = !!(g.vence && today > g.vence);
      return { code: c, type: 'gift', amountRD: Number(g.montoRD) || 0, balanceRD: Number(g.saldoRD) || 0, to: g.para || '', from: g.comprador || '', message: g.mensaje || '', expires: g.vence || '', status: g.estado === 'anulada' ? 'anulada' : expired ? 'vencida' : (Number(g.saldoRD) > 0 ? 'activa' : 'agotada') };
    }
    const b = findBono_(c);
    if (b && b.estado !== 'pendiente') {
      const expired = !!(b.vence && today > b.vence);
      const svc = svcs[b.servicio];
      return { code: c, type: 'package', name: b.nombre, service: b.servicio, serviceName: svc ? svc.name : b.servicio, sessions: Number(b.sesiones) || 0, used: Number(b.usadas) || 0, expires: b.vence || '', status: b.estado === 'anulado' ? 'anulado' : expired ? 'vencido' : b.estado };
    }
    return { code: c, type: 'unknown', status: 'no encontrado' };
  });
  return items;
}

/* =========================================================================
   Consentimiento digital
   ========================================================================= */

const CONSENT_QUESTIONS = [
  { id: 'embarazo', text: '¿Estás embarazada o en período de lactancia?' },
  { id: 'alergias', text: '¿Tienes alergias (medicamentos, látex, anestesia, pigmentos, cosméticos)?', detail: true },
  { id: 'medicamentos', text: '¿Tomas algún medicamento? (por ejemplo anticoagulantes, aspirina, isotretinoína/Roaccutane, antibióticos)', detail: true },
  { id: 'salud', text: '¿Tienes diabetes, problemas de coagulación, hipertensión o alguna enfermedad autoinmune?', detail: true },
  { id: 'cicatrizacion', text: '¿Tienes tendencia a cicatrices queloides o problemas de cicatrización?' },
  { id: 'piel', text: '¿Tienes alguna condición en la piel de la zona (acné activo, dermatitis, herpes, irritación)?', detail: true },
  { id: 'procedimientos', text: '¿Te hiciste en los últimos 30 días peeling, láser, bótox o rellenos en la zona?', detail: true },
  { id: 'lentes', text: '¿Usas lentes de contacto?' },
];
const DEFAULT_CONSENT = [
  'Declaro que la información que di sobre mi salud es verdadera y completa, y que avisaré al estudio de cualquier cambio antes del servicio.',
  'Me explicaron en qué consiste el servicio, los cuidados antes y después, y los resultados que puedo esperar. Entiendo que el resultado depende de mi tipo de piel, de mi salud y de que siga los cuidados indicados, y que puede necesitar un retoque.',
  'Conozco las posibles reacciones, como enrojecimiento, inflamación o sensibilidad y, con menos frecuencia, reacciones alérgicas, y me comprometo a avisar al estudio si se presentan.',
  'Autorizo a MAJOBELLA Beauty Studio a realizar el servicio y a tomar fotos de antes y después para mi ficha, que se guardan de forma privada.',
  'Pude hacer todas las preguntas que necesité y puedo retirar este consentimiento antes de que empiece el servicio.',
].join('\n\n');

function consentText_(s) { return String(s.consentimientoTexto || '').trim() || DEFAULT_CONSENT; }

function consentState_(r) {
  const svcs = servicesMap_();
  const needed = safeJson_(r.serviciosJson, []).some(function (x) { return svcs[x.id] && svcs[x.id].consent; });
  const url = needed && r.firmaToken ? mailUrl_(settingsCached_(), 'consentimiento.html?c=' + encodeURIComponent(r.id + '.' + r.firmaToken)) : '';
  return { needed: needed, signed: !!r.consentimiento, signedAt: r.consentimiento || '', url: url };
}

function consentRow_(c) {
  const parts = String(c || '').split('.');
  if (parts.length !== 2) return null;
  const found = findRow_(parts[0]);
  if (!found || !found.row.firmaToken || found.row.firmaToken !== parts[1]) return null;
  return found;
}

function consentInfo_(d) {
  const found = consentRow_(d.c);
  if (!found) return { ok: false, error: 'Este enlace no es válido. Pídenos uno nuevo por WhatsApp.' };
  const r = found.row;
  if (['confirmada', 'completada'].indexOf(r.estado) < 0) return { ok: false, error: 'Esta cita no está activa.' };
  const s = settings_();
  return {
    ok: true, id: r.id, name: r.clienta, services: r.servicios, when: whenText_(r), signed: !!r.consentimiento, signedAt: r.consentimiento || '',
    text: consentText_(s), questions: CONSENT_QUESTIONS, studio: s.direccion || '',
  };
}

function consentSign_(d) {
  const found = consentRow_(d.c);
  if (!found) return { ok: false, error: 'Este enlace no es válido. Pídenos uno nuevo por WhatsApp.' };
  const r = found.row;
  if (['confirmada', 'completada'].indexOf(r.estado) < 0) return { ok: false, error: 'Esta cita no está activa.' };
  if (r.consentimiento) return { ok: false, error: 'Ya firmaste el consentimiento de esta cita.' };
  const name = clean_(d.name, 100);
  if (name.length < 3) return { ok: false, error: 'Escribe tu nombre completo.' };
  if (!d.accept) return { ok: false, error: 'Debes aceptar el consentimiento para firmarlo.' };
  const sig = String(d.signature || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 1500 || sig.length > 1500000) return { ok: false, error: 'Dibuja tu firma en el recuadro.' };
  const answers = d.answers || {};
  const missing = CONSENT_QUESTIONS.filter(function (q) { return ['si', 'no'].indexOf((answers[q.id] || {}).value) < 0; });
  if (missing.length) return { ok: false, error: 'Responde todas las preguntas de salud.' };
  const s = settings_();
  const when = new Date();
  const fotos = d.photos === 'si' ? 'si' : 'no';
  const html = consentPdfHtml_(r, s, name, answers, clean_(d.extra, 600), fotos, sig, when);
  let blob;
  try { blob = Utilities.newBlob(html, 'text/html', 'consentimiento.html').getAs('application/pdf'); }
  catch (e) { blob = Utilities.newBlob(html, 'text/html', 'consentimiento.html'); }
  const isPdf = blob.getContentType() === 'application/pdf';
  const fname = 'Consentimiento ' + r.fecha + ' · ' + r.clienta + (isPdf ? '.pdf' : '.html');
  blob.setName(fname);
  const key = clientKey_(r.correo, r.telefono, r.clienta);
  const file = filesFolder_().createFile(blob);
  const arc = {
    id: 'ARC-' + Utilities.getUuid().slice(0, 8).toUpperCase(), clave: key, tipo: 'consentimiento', nombre: fname, mime: isPdf ? 'application/pdf' : 'text/html',
    driveId: file.getId(), citaId: r.id, fecha: r.fecha, nota: 'Firmado en la web', creada: when.toISOString(),
  };
  appendRow_('Archivos', arc);
  updateRow_(found.index, { consentimiento: when.toISOString(), consentimientoArchivo: arc.id, permisoFotos: fotos });
  r.consentimiento = when.toISOString();
  if (r.correo) { const m = mailConsentCopy_(r, s); safeMail_(r.correo, m.subject, m.html, { tipo: 'consentimiento', ref: r.id, attachments: [blob] }); }
  return { ok: true, signedAt: r.consentimiento };
}

function consentPdfHtml_(r, s, name, answers, extra, fotos, sig, when) {
  const F = "Georgia,'Times New Roman',serif";
  const qs = CONSENT_QUESTIONS.map(function (q) {
    const a = answers[q.id] || {};
    return '<tr><td style="padding:7px 8px 7px 0;border-bottom:1px solid #ddd">' + esc_(q.text) + '</td><td style="padding:7px 0;border-bottom:1px solid #ddd;width:34%"><b>' + (a.value === 'si' ? 'Sí' : 'No') + '</b>' +
      (a.value === 'si' && a.detail ? ' · ' + esc_(clean_(a.detail, 300)) : '') + '</td></tr>';
  }).join('');
  const text = consentText_(s).split(/\n\s*\n/).map(function (p) { return '<p style="margin:0 0 10px">' + esc_(p.trim()) + '</p>'; }).join('');
  const stamp = Utilities.formatDate(when, TZ, "d/M/yyyy, h:mm a");
  return '<html><head><meta charset="utf-8"></head><body style="font-family:' + F + ';color:#111;font-size:12px;line-height:1.5;margin:28px">' +
    '<p style="margin:0;font-size:22px;letter-spacing:6px">MAJOBELLA</p><p style="margin:0 0 18px;font-size:10px;letter-spacing:4px;color:#666">BEAUTY STUDIO</p>' +
    '<h1 style="font-weight:normal;font-size:20px;margin:0 0 12px;border-top:1px solid #111;padding-top:12px">Consentimiento informado</h1>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:14px">' +
    '<tr><td style="color:#666;width:30%">Clienta</td><td>' + esc_(name) + '</td></tr>' +
    '<tr><td style="color:#666">Teléfono · correo</td><td>' + esc_(r.telefono || '—') + ' · ' + esc_(r.correo || '—') + '</td></tr>' +
    '<tr><td style="color:#666">Servicio</td><td>' + esc_(r.servicios) + '</td></tr>' +
    '<tr><td style="color:#666">Cita</td><td>' + esc_(whenText_(r)) + ' · ' + esc_(r.id) + '</td></tr></table>' +
    '<h2 style="font-weight:normal;font-size:15px;margin:14px 0 6px">Cuestionario de salud</h2><table style="width:100%;border-collapse:collapse">' + qs + '</table>' +
    (extra ? '<p style="margin:8px 0 0"><span style="color:#666">Otros datos:</span> ' + esc_(extra) + '</p>' : '') +
    '<h2 style="font-weight:normal;font-size:15px;margin:16px 0 6px">Consentimiento</h2>' + text +
    '<p style="margin:6px 0 0"><span style="color:#666">Publicar mis fotos de antes y después en la web y redes, sin mi nombre:</span> <b>' + (fotos === 'si' ? 'Sí autorizo' : 'No autorizo') + '</b></p>' +
    '<div style="margin-top:18px;border-top:1px solid #111;padding-top:10px"><img src="' + sig + '" style="height:90px"><p style="margin:4px 0 0">' + esc_(name) + '</p>' +
    '<p style="margin:2px 0 0;color:#666;font-size:10px">Firmado electrónicamente en la web de MAJOBELLA el ' + esc_(stamp) + ' (hora de Santo Domingo).</p></div>' +
    '</body></html>';
}

/* =========================================================================
   Dashboard: recordatorio manual, vista previa y prueba de correos
   ========================================================================= */

function adminSendReminder_(d) {
  needAdmin_(d);
  const found = findRow_(d.id);
  if (!found) return { ok: false, error: 'No encontramos esa cita.' };
  const r = found.row;
  if (r.estado !== 'confirmada') return { ok: false, error: 'Solo se recuerdan citas confirmadas.' };
  if (!r.correo) return { ok: false, error: 'Esta clienta no tiene correo. Usa el recordatorio por WhatsApp.' };
  const m = mailReminder_(r, settings_());
  if (!safeMail_(r.correo, m.subject, m.html, { tipo: 'recordatorio', ref: r.id })) return { ok: false, error: 'No se pudo enviar el correo. Revisa el límite diario de Gmail.' };
  updateRow_(found.index, { recordatorio: new Date().toISOString() });
  r.recordatorio = new Date().toISOString();
  return { ok: true, item: adminRow_(r) };
}

function sampleRow_(s, email) {
  const date = addDaysKey_(todayKey_(), 1);
  return {
    id: 'MJB-EJEMPLO', estado: 'confirmada', fecha: date, hora: '10:00', inicio: date + 'T14:00:00.000Z', fin: date + 'T16:30:00.000Z', duracionMin: 150,
    servicios: 'Micropigmentación', serviciosJson: JSON.stringify([{ id: 'micropigmentacion', name: 'Micropigmentación', price: 12000 }]),
    subtotalRD: 12000, descuentoRD: 0, totalRD: 12000, depositoRD: 6000, depositoUSD: '95.24', saldoRD: 6000, metodoDeposito: 'paypal', paypalCaptura: 'X',
    clienta: 'Ana Pérez', telefono: '809 555 0000', correo: email, firmaToken: 'ejemplo', reembolso: 'reembolsado (ejemplo)',
  };
}

function emailSample_(tipo, s, email) {
  const r = sampleRow_(s, email);
  const svc = { id: 'micropigmentacion', name: 'Micropigmentación', retoqueDays: 45 };
  switch (tipo) {
    case 'confirmacion': return mailConfirmed_(r, s, false);
    case 'recordatorio': return mailReminder_(r, s);
    case 'resena': return mailReview_(r, s);
    case 'retoque': return mailRetouch_(r, s, svc, addDaysKey_(todayKey_(), 7));
    case 'cumpleanos': return mailBirthday_('Ana Pérez', s, 'CUMPLE-EJEMP', num_(s.cumpleDescuento, 15), addDaysKey_(todayKey_(), num_(s.cumpleDias, 30)));
    case 'espera': return mailWaitlist_({ id: 'ESP-EJEMPLO', fecha: r.fecha, clienta: 'Ana Pérez', servicios: 'Cejas', serviciosJson: '[{"id":"cejas"}]' }, s, ['11:00', '15:30']);
    case 'paquete': return mailBono_({ codigo: 'PAQ-EJEM-PLO1', nombre: '4 sesiones de cejas', servicio: 'cejas', sesiones: 4, clienta: 'Ana Pérez', vence: addDaysKey_(todayKey_(), 180) }, s);
    case 'cancelacion': return mailCancelled_(r, s, true, false);
    case 'consentimiento': return mailConsentCopy_(r, s);
    case 'transferencia': return mailTransferReceived_(Object.assign({}, r, { metodoDeposito: 'transferencia', paypalCaptura: '', estado: 'por-confirmar' }), s);
    case 'transferenciaRechazada': return mailTransferRejected_(r, s, 'El monto recibido no coincide con el depósito.');
    case 'cambio': return mailRescheduled_(r, s, whenText_(Object.assign({}, r, { fecha: addDaysKey_(r.fecha, -2) })));
    case 'billetera': return mailWallet_(email, [{ type: 'gift', code: 'MJB-EJEM-PLO1', amountRD: 2500, balanceRD: 1600, expires: addDaysKey_(todayKey_(), 300), status: 'activa' }, { type: 'package', code: 'PAQ-EJEM-PLO1', name: '4 sesiones de cejas', sessions: 4, used: 1, expires: addDaysKey_(todayKey_(), 150), status: 'activo' }], s);
    default: return null;
  }
}

function adminEmailPreview_(d) {
  const u = needAdmin_(d);
  const m = emailSample_(d.tipo, settings_(), u.email);
  if (!m) return { ok: false, error: 'Tipo de correo no válido.' };
  return { ok: true, subject: m.subject, html: m.html };
}

function adminEmailTest_(d) {
  const u = needAdmin_(d);
  const m = emailSample_(d.tipo, settings_(), u.email);
  if (!m) return { ok: false, error: 'Tipo de correo no válido.' };
  if (!safeMail_(u.email, '[Prueba] ' + m.subject, m.html, { tipo: 'prueba', ref: d.tipo })) return { ok: false, error: 'No se pudo enviar. Revisa el límite diario de Gmail.' };
  return { ok: true, to: u.email };
}

function adminRunAutomations_(d) {
  needAdmin_(d);
  const out = runAutomations_();
  return { ok: true, result: out, automation: automationStatus_(), emails: readOpt_('Correos').slice(-200).reverse().map(strip_) };
}

/* ---- Utilidades ---- */
function on_(v) { return /^s[ií]$/i.test(String(v == null ? '' : v).trim()); }
let SVC_CACHE_ = null;
function servicesMap_() {
  if (!SVC_CACHE_) {
    SVC_CACHE_ = {};
    readTable_('Servicios').forEach(function (r) {
      SVC_CACHE_[String(r.id).trim()] = { id: String(r.id).trim(), name: String(r.nombre).trim(), price: Number(r.precioRD) || 0, retoqueDays: Number(r.retoqueDias) || 0, consent: /^s[ií]$/i.test(String(r.consentimiento)), active: !/^no$/i.test(String(r.activo)) };
    });
  }
  return SVC_CACHE_;
}
let SETTINGS_CACHE_ = null;
function settingsCached_() { if (!SETTINGS_CACHE_) SETTINGS_CACHE_ = settings_(); return SETTINGS_CACHE_; }

/* =========================================================================
   Hoja de cálculo (las columnas se leen por su nombre)
   ========================================================================= */

/* ---- Acceso a la hoja con memoria por petición ----
   Cada petición abre la hoja una sola vez y lee cada pestaña una sola vez; las escrituras actualizan esa memoria,
   así varias funciones pueden consultar la misma pestaña sin volver a leerla. */
let DB_ = null;
function db_() { if (!DB_) DB_ = { ss: null, tabs: {}, heads: {}, data: {} }; return DB_; }
function resetDb_() { DB_ = null; SVC_CACHE_ = null; SETTINGS_CACHE_ = null; }
function sheet_() {
  const d = db_();
  if (d.ss) return d.ss;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Falta ejecutar setup() en el editor de Apps Script.');
  d.ss = SpreadsheetApp.openById(id);
  return d.ss;
}
function tab_(name) {
  const d = db_();
  if (d.tabs[name]) return d.tabs[name];
  const t = sheet_().getSheetByName(name);
  if (!t) throw new Error('Falta la pestaña "' + name + '". Ejecuta setup() otra vez.');
  d.tabs[name] = t;
  return t;
}
function headers_(t) {
  const d = db_(), key = t.getName ? t.getName() : '';
  if (key && d.heads[key]) return d.heads[key];
  const n = t.getLastColumn();
  const h = n ? t.getRange(1, 1, 1, n).getValues()[0].map(function (x) { return String(x).trim(); }) : [];
  if (key) d.heads[key] = h;
  return h;
}
function cellOut_(v) {
  if (v instanceof Date) {
    return v.getHours() === 0 && v.getMinutes() === 0 ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : v.toISOString();
  }
  return String(v == null ? '' : v);
}

/* Filas de una pestaña como objetos { columna: valor, _row: número de fila } (copias: se pueden modificar) */
function readTable_(name) {
  const d = db_();
  if (!d.data[name]) {
    const t = tab_(name);
    const last = t.getLastRow();
    const h = headers_(t);
    d.data[name] = last < 2 || !h.length ? [] : t.getRange(2, 1, last - 1, h.length).getValues().map(function (v, i) {
      const o = { _row: i + 2 };
      h.forEach(function (k, j) { if (k) o[k] = cellOut_(v[j]); });
      return o;
    }).filter(function (o) { return o[h[0]]; });
  }
  return d.data[name].map(function (o) { return Object.assign({}, o); });
}
/* Igual que readTable_, pero devuelve [] si la pestaña aún no existe (antes de volver a ejecutar setup) */
function readOpt_(name) { try { return readTable_(name); } catch (e) { return []; } }
function appendRow_(name, obj) {
  const t = tab_(name);
  const h = headers_(t);
  const r = t.getLastRow() + 1;
  const vals = h.map(function (k) { return cell_(obj[k]); });
  t.getRange(r, 1, 1, h.length).setNumberFormat('@').setValues([vals]);
  const d = db_();
  if (d.data[name] && vals[0] !== '') {
    const o = { _row: r };
    h.forEach(function (k, j) { if (k) o[k] = String(obj[k] == null ? '' : obj[k]); });
    d.data[name].push(o);
  }
  touched_(name);
  return r;
}
/* Cambia varias columnas de una fila con una sola lectura y una sola escritura */
function updateTable_(name, row, patch) {
  const t = tab_(name);
  const h = headers_(t);
  const cols = Object.keys(patch).map(function (k) { return h.indexOf(k); }).filter(function (c) { return c >= 0; });
  if (!cols.length) return;
  const from = Math.min.apply(null, cols), to = Math.max.apply(null, cols);
  const range = t.getRange(row, from + 1, 1, to - from + 1);
  const vals = range.getValues()[0];
  Object.keys(patch).forEach(function (k) { const c = h.indexOf(k); if (c >= 0) vals[c - from] = cell_(patch[k]); });
  range.setNumberFormat('@').setValues([vals]);
  const cached = db_().data[name];
  if (cached) cached.forEach(function (o) { if (o._row === row) Object.keys(patch).forEach(function (k) { if (h.indexOf(k) >= 0) o[k] = String(patch[k] == null ? '' : patch[k]); }); });
  touched_(name);
}
function deleteRow_(name, row) {
  tab_(name).deleteRow(row);
  delete db_().data[name];
  touched_(name);
}

/* ---- Caché compartida (CacheService) para lo que la web pide a menudo ----
   Se invalida sola cuando cambia algo de lo que depende, y también al editar la hoja a mano (disparador alEditarHoja). */
const CATALOG_TABLES = ['Ajustes', 'Servicios', 'Promociones', 'Paquetes', 'Galeria', 'Resenas', 'Cuentas'];
const BUSY_TABLES = ['Reservas', 'Bloqueos', 'Ajustes'];
function touched_(name) {
  try {
    const c = CacheService.getScriptCache();
    if (CATALOG_TABLES.indexOf(name) >= 0) c.remove('catalog');
    if (BUSY_TABLES.indexOf(name) >= 0) c.put('busyver', String(Date.now()), 21600);
  } catch (e) { /* sin caché */ }
}
function clearCaches_() {
  try { const c = CacheService.getScriptCache(); c.remove('catalog'); c.put('busyver', String(Date.now()), 21600); } catch (e) { /* nada */ }
}
/** Disparador: si alguien edita la hoja a mano, la web ve el cambio enseguida. Lo instala setup(). */
function alEditarHoja() { clearCaches_(); }
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
      depositPercent: pctOrNull_(r.depositoPct),
      retoqueDays: Number(r.retoqueDias) || 0, consent: /^s[ií]$/i.test(String(r.consentimiento)),
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
  } catch (err) { logError_('sistema', 'No se pudo agendar la cita ' + r.id + ' en Google Calendar: ' + msg_(err), r.id, ''); return ''; }
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

/* =========================================================================
   Correos con el diseño de MAJOBELLA (blanco y negro, logo, serif)
   ========================================================================= */

function mailUrl_(s, path) {
  const base = String(s.webUrl || '').trim();
  return base ? base.replace(/\/?$/, '/') + (path || '') : '';
}
function waUrl_(s, text) {
  const n = String(s.whatsapp || '').replace(/\D/g, '');
  return n ? 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '') : '';
}

/* Plantilla común. o = { preheader, kicker, title, intro, details: [[etiqueta, html]], body, cta: { text, url }, secondary: { text, url }, note } */
function layout_(s, o) {
  const F = "Georgia,'Times New Roman',serif";
  const logo = mailUrl_(s, 'assets/logo-majobella.png');
  const button = function (b, dark) {
    if (!b || !b.url) return '';
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 8px 0 0;display:inline-table"><tr><td style="' +
      (dark ? 'background:#111111;border:1px solid #111111' : 'background:#ffffff;border:1px solid #111111') + '">' +
      '<a href="' + esc_(b.url) + '" style="display:inline-block;padding:14px 26px;font-family:' + F + ';font-size:12px;letter-spacing:3px;text-transform:uppercase;text-decoration:none;color:' +
      (dark ? '#ffffff' : '#111111') + '">' + esc_(b.text) + '</a></td></tr></table>';
  };
  const details = (o.details || []).filter(function (x) { return x && x[1] !== '' && x[1] != null; }).map(function (x) {
    return '<tr><td style="padding:11px 12px 11px 0;border-top:1px solid #e6e6e6;font-family:' + F + ';font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b6b6b;width:36%;vertical-align:top">' + esc_(x[0]) + '</td>' +
      '<td style="padding:11px 0;border-top:1px solid #e6e6e6;font-family:' + F + ';font-size:15px;line-height:1.5;color:#111111;vertical-align:top">' + x[1] + '</td></tr>';
  }).join('');
  const maps = s.mapsUrl ? '<a href="' + esc_(s.mapsUrl) + '" style="color:#ffffff">Cómo llegar</a>' : '';
  const wa = waUrl_(s, 'Hola, tengo una pregunta sobre MAJOBELLA.');
  const web = mailUrl_(s, '');
  const links = [maps, wa ? '<a href="' + wa + '" style="color:#ffffff">WhatsApp</a>' : '', web ? '<a href="' + esc_(web) + '" style="color:#ffffff">Web</a>' : ''].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc_(o.title || 'MAJOBELLA') + '</title></head>' +
    '<body style="margin:0;padding:0;background:#f4f4f2">' +
    (o.preheader ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f2">' + esc_(o.preheader) + '</div>' : '') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f2"><tr><td align="center" style="padding:28px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e6e6">' +
    '<tr><td align="center" style="padding:34px 32px 24px;border-bottom:1px solid #111111">' +
    (logo ? '<img src="' + esc_(logo) + '" width="170" alt="MAJOBELLA Beauty Studio" style="display:block;width:170px;max-width:60%;height:auto;border:0">'
      : '<p style="margin:0;font-family:' + F + ';font-size:22px;letter-spacing:6px">MAJOBELLA</p>') +
    '</td></tr>' +
    '<tr><td style="padding:34px 36px 10px;font-family:' + F + ';color:#111111">' +
    (o.kicker ? '<p style="margin:0 0 12px;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#6b6b6b">' + esc_(o.kicker) + '</p>' : '') +
    (o.title ? '<h1 style="margin:0 0 16px;font-family:' + F + ';font-weight:normal;font-size:28px;line-height:1.2;color:#000000">' + esc_(o.title) + '</h1>' : '') +
    (o.intro ? '<p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#333333">' + o.intro + '</p>' : '') +
    (details ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #e6e6e6;margin:0 0 22px">' + details + '</table>' : '') +
    (o.body ? '<div style="font-size:15px;line-height:1.65;color:#333333">' + o.body + '</div>' : '') +
    (o.cta || o.secondary ? '<div style="margin:18px 0 8px">' + button(o.cta, true) + button(o.secondary, false) + '</div>' : '') +
    (o.note ? '<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#6b6b6b">' + o.note + '</p>' : '') +
    '</td></tr><tr><td style="height:28px;line-height:28px">&nbsp;</td></tr>' +
    '<tr><td align="center" style="padding:24px 24px 26px;background:#111111;font-family:' + F + '">' +
    '<p style="margin:0 0 10px;font-size:12px;letter-spacing:5px;color:#ffffff">MÁS YO, MÁS BELLA.</p>' +
    '<p style="margin:0;font-size:12px;line-height:1.7;color:#bdbdbd">' + esc_(s.direccion || 'MAJOBELLA Beauty Studio') + (links ? '<br>' + links : '') + '</p>' +
    '</td></tr></table>' +
    '<p style="margin:14px 0 0;font-family:' + F + ';font-size:11px;color:#9a9a9a">' + esc_(o.footnote || 'Correo enviado por MAJOBELLA Beauty Studio.') + '</p>' +
    '</td></tr></table></body></html>';
}

function codeBox_(code) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px"><tr><td style="background:#111111;padding:14px 24px;font-family:\'Courier New\',monospace;font-size:22px;letter-spacing:4px;color:#ffffff">' + esc_(code) + '</td></tr></table>';
}

function firstName_(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

function apptDetails_(r, extra) {
  const dep = Number(r.depositoRD) || 0;
  const rows = [
    ['Servicio', esc_(r.servicios)],
    ['Fecha y hora', esc_(whenText_(r))],
    ['Duración', r.duracionMin ? esc_(r.duracionMin + ' minutos') : ''],
    ['Total', Number(r.descuentoRD) > 0 ? '<s style="color:#9a9a9a">RD$ ' + money_(r.subtotalRD) + '</s> RD$ ' + money_(r.totalRD) : 'RD$ ' + money_(r.totalRD)],
    Number(r.bonoRD) > 0 ? ['Paquete', 'RD$ ' + money_(r.bonoRD) + ' cubiertos con tu paquete'] : null,
    Number(r.giftRD) > 0 ? ['Tarjeta de regalo', 'RD$ ' + money_(r.giftRD)] : null,
    dep ? ['Depósito', esc_(depositText_(r))] : null,
    ['Al terminar', Number(r.saldoRD) > 0 ? 'RD$ ' + money_(r.saldoRD) + ' · efectivo, transferencia o PayPal' : 'Todo pagado'],
    ['Código', esc_(r.id)],
  ];
  return rows.concat(extra || []).filter(Boolean);
}

/* ---- Constructores: devuelven { subject, html } (los usan los envíos y la vista previa del dashboard) ---- */

function mailConfirmed_(r, s, byStudio) {
  const consent = consentState_(r);
  const dep = Number(r.depositoRD) || 0;
  return {
    subject: 'Tu cita en MAJOBELLA está confirmada · ' + whenText_(r),
    html: layout_(s, {
      preheader: 'Te esperamos el ' + whenText_(r) + '.',
      kicker: 'Cita confirmada',
      title: '¡Te esperamos, ' + firstName_(r.clienta) + '!',
      intro: 'Tu cita está confirmada. Guarda este correo: aquí tienes todos los detalles.',
      details: apptDetails_(r),
      body: consent.needed && !consent.signed ? '<p style="margin:0">Antes de tu cita, <b>firma el consentimiento</b> desde tu celular. Toma unos 2 minutos y nos ayuda a cuidarte.</p>' : '',
      cta: consent.needed && !consent.signed ? { text: 'Firmar consentimiento', url: consent.url } : { text: 'Ver mis citas', url: mailUrl_(s, '#citas') },
      secondary: s.mapsUrl ? { text: 'Cómo llegar', url: s.mapsUrl } : null,
      note: (dep && !byStudio ? 'Si cancelas con al menos ' + num_(s.horasCancelacion, 24) + ' horas de aviso te devolvemos el depósito. ' : '') + 'Te recomendamos llegar 10 minutos antes.',
    }),
  };
}

function mailAdminNew_(r, s) {
  return {
    subject: 'Nueva reserva · ' + r.clienta + ' · ' + whenText_(r),
    html: layout_(s, {
      kicker: 'Nueva reserva', title: r.clienta,
      details: apptDetails_(r, [
        ['Teléfono', esc_(r.telefono || '—')], ['Correo', esc_(r.correo || '—')],
        r.nota ? ['Nota', esc_(r.nota)] : null, r.origen ? ['Nos conoció por', esc_(r.origen)] : null,
        r.fidelidad === 'si' ? ['Fidelidad', 'Usó su premio de fidelidad'] : null,
      ]),
      cta: { text: 'Abrir dashboard', url: mailUrl_(s, 'admin.html') },
    }),
  };
}

function mailRescheduled_(r, s, before) {
  return {
    subject: 'Tu cita en MAJOBELLA cambió de horario · ' + whenText_(r),
    html: layout_(s, {
      kicker: 'Nuevo horario', title: 'Tu cita cambió de horario',
      intro: 'Antes: ' + esc_(before) + '<br><b>Ahora: ' + esc_(whenText_(r)) + '</b>',
      details: apptDetails_(r),
      body: '<p style="margin:0">Tu depósito sigue aplicado a la cita. Si el nuevo horario no te funciona, escríbenos.</p>',
      cta: waUrl_(s) ? { text: 'Escribir por WhatsApp', url: waUrl_(s, 'Hola, es sobre mi cita ' + r.id + '.') } : null,
      secondary: s.mapsUrl ? { text: 'Cómo llegar', url: s.mapsUrl } : null,
    }),
  };
}

function mailCancelled_(r, s, refunded, byStudio) {
  const dep = Number(r.depositoRD) || 0;
  return {
    subject: 'Tu cita en MAJOBELLA fue cancelada · ' + whenText_(r),
    html: layout_(s, {
      kicker: 'Cita cancelada', title: byStudio ? 'Cancelamos tu cita' : 'Cancelaste tu cita',
      intro: esc_(r.servicios) + ' · ' + esc_(whenText_(r)),
      body: dep ? '<p style="margin:0">' + (refunded === 'manual' ? 'Te devolveremos el depósito de RD$ ' + money_(dep) + ' por transferencia en los próximos días. Si necesitamos tus datos bancarios te escribiremos.'
        : refunded ? 'Te devolvimos el depósito en PayPal. Puede tardar unos días en reflejarse.' : (byStudio ? 'Te contactaremos para coordinar la devolución o una nueva cita.' : 'El depósito no es reembolsable para esta cancelación.')) + '</p>' : '',
      cta: { text: 'Reservar otra cita', url: mailUrl_(s, '#reservar') },
      note: 'Código de reserva: ' + esc_(r.id),
    }),
  };
}

function mailAdminCancelled_(r, s, byStudio) {
  return {
    subject: 'Cita cancelada · ' + r.clienta + ' · ' + whenText_(r),
    html: layout_(s, {
      kicker: 'Cita cancelada', title: r.clienta,
      intro: (byStudio ? 'Cancelada desde el dashboard.' : 'La clienta canceló.') + ' Reembolso: ' + esc_(r.reembolso || 'no'),
      details: apptDetails_(r, [['Teléfono', esc_(r.telefono || '—')]]),
      cta: { text: 'Abrir dashboard', url: mailUrl_(s, 'admin.html') },
    }),
  };
}

function mailReminder_(r, s) {
  const consent = consentState_(r);
  const today = todayKey_();
  const tomorrow = addDaysKey_(today, 1);
  const title = r.fecha === today ? 'Tu cita es hoy' : (r.fecha === tomorrow ? 'Tu cita es mañana' : 'Tu cita se acerca');
  return {
    subject: title + ' · ' + whenText_(r) + ' · MAJOBELLA',
    html: layout_(s, {
      preheader: esc_(r.servicios) + ', ' + whenText_(r),
      kicker: 'Recordatorio', title: title + ', ' + firstName_(r.clienta),
      intro: 'Te esperamos el <b>' + esc_(whenText_(r)) + '</b>. Llega unos 10 minutos antes para empezar con calma.',
      details: [
        ['Servicio', esc_(r.servicios)],
        ['Dirección', esc_(s.direccion || '') + (s.mapsUrl ? '<br><a href="' + esc_(s.mapsUrl) + '" style="color:#111111">Abrir en Google Maps</a>' : '')],
        ['Al terminar', Number(r.saldoRD) > 0 ? 'RD$ ' + money_(r.saldoRD) + ' · efectivo, transferencia o PayPal' : 'Todo pagado'],
        consent.needed ? ['Consentimiento', consent.signed ? 'Firmado ✓' : 'Pendiente: fírmalo antes de llegar'] : null,
      ].filter(Boolean),
      cta: consent.needed && !consent.signed ? { text: 'Firmar consentimiento', url: consent.url } : { text: 'Ver o cancelar mi cita', url: mailUrl_(s, '#citas') },
      secondary: waUrl_(s) ? { text: 'Escribir por WhatsApp', url: waUrl_(s, 'Hola, es sobre mi cita del ' + whenText_(r) + '.') } : null,
      note: 'Si no puedes venir, avísanos cuanto antes. Con al menos ' + num_(s.horasCancelacion, 24) + ' horas de aviso te devolvemos el depósito.',
    }),
  };
}

function mailReview_(r, s) {
  return {
    subject: '¿Cómo te fue en MAJOBELLA, ' + firstName_(r.clienta) + '?',
    html: layout_(s, {
      preheader: 'Tu opinión nos ayuda muchísimo.',
      kicker: 'Gracias por tu visita', title: '¿Cómo te sentiste, ' + firstName_(r.clienta) + '?',
      intro: 'Nos encantó atenderte. Si te gustó tu ' + esc_(String(r.servicios).toLowerCase()) + ', ¿nos dejarías una reseña en Google? Toma un minuto y ayuda a otras clientas a encontrarnos.',
      cta: { text: 'Dejar mi reseña', url: s.googleResenaUrl || mailUrl_(s, '') },
      secondary: { text: 'Reservar mi próxima cita', url: mailUrl_(s, '#reservar') },
      note: 'Si algo no salió como esperabas, respóndenos a este correo o escríbenos por WhatsApp: queremos saberlo.',
    }),
  };
}

function mailRetouch_(r, s, svc, ideal) {
  return {
    subject: 'Es momento de tu retoque de ' + svc.name.toLowerCase() + ' · MAJOBELLA',
    html: layout_(s, {
      kicker: 'Tu retoque', title: 'Es momento de tu retoque',
      intro: 'Hola, ' + firstName_(r.clienta) + '. Para que tu ' + esc_(svc.name.toLowerCase()) + ' quede perfecta y dure más, el retoque se hace alrededor del <b>' + esc_(longDate_(ideal)) + '</b>.',
      details: [['Servicio', esc_(svc.name)], ['Tu sesión', esc_(longDate_(r.fecha))], ['Fecha ideal del retoque', esc_(longDate_(ideal))]],
      cta: { text: 'Reservar mi retoque', url: mailUrl_(s, '?servicio=' + encodeURIComponent(svc.id) + '#reservar') },
      secondary: waUrl_(s) ? { text: 'Preguntar por WhatsApp', url: waUrl_(s, 'Hola, quiero agendar mi retoque de ' + svc.name.toLowerCase() + '.') } : null,
    }),
  };
}

function mailBirthday_(name, s, code, pct, until) {
  return {
    subject: '¡Feliz cumpleaños, ' + firstName_(name) + '! Un regalo de MAJOBELLA',
    html: layout_(s, {
      preheader: 'Te regalamos un ' + pct + '% para celebrarte.',
      kicker: 'Feliz cumpleaños', title: '¡Feliz cumpleaños, ' + firstName_(name) + '!',
      intro: 'Para celebrarte, te regalamos un <b>' + pct + '% de descuento</b> en tu próxima cita. Escribe este código al reservar:',
      body: codeBox_(code) + '<p style="margin:0">Válido hasta el ' + esc_(longDate_(until)) + ', en cualquier servicio, una vez.</p>',
      cta: { text: 'Reservar con mi regalo', url: mailUrl_(s, '#reservar') },
      note: 'Más yo, más bella. Que este año te veas y te sientas como quieres.',
    }),
  };
}

function mailWaitlist_(w, s, slots) {
  const ids = safeJson_(w.serviciosJson, []).map(function (x) { return x.id; }).join(',');
  return {
    subject: 'Se liberó un horario el ' + longDate_(w.fecha) + ' · MAJOBELLA',
    html: layout_(s, {
      preheader: 'Hay horario disponible para ' + w.servicios + '.',
      kicker: 'Lista de espera', title: 'Se liberó un horario',
      intro: 'Hola, ' + firstName_(w.clienta) + '. El <b>' + esc_(longDate_(w.fecha)) + '</b> hay horario disponible para ' + esc_(w.servicios) + ':',
      body: '<p style="margin:0 0 6px;font-size:18px">' + slots.slice(0, 6).map(time12_).join(' &nbsp;·&nbsp; ') + '</p>',
      cta: { text: 'Reservar ahora', url: mailUrl_(s, '?servicio=' + encodeURIComponent(ids) + '&fecha=' + w.fecha + '#reservar') },
      note: 'Avisamos a todas las personas en la lista de ese día: el horario es de quien reserve primero.',
    }),
  };
}

function mailBono_(b, s) {
  const svc = servicesMap_()[b.servicio];
  return {
    subject: 'Tu paquete ' + b.nombre + ' · MAJOBELLA',
    html: layout_(s, {
      kicker: 'Paquete listo', title: '¡Gracias, ' + firstName_(b.clienta) + '!',
      intro: 'Tu paquete está activo. Escribe este código al reservar cada sesión y se descuenta solo:',
      body: codeBox_(b.codigo),
      details: [['Paquete', esc_(b.nombre)], ['Servicio', esc_(svc ? svc.name : b.servicio)], ['Sesiones', esc_(b.sesiones)], b.vence ? ['Válido hasta', esc_(longDate_(b.vence))] : null].filter(Boolean),
      cta: { text: 'Reservar mi sesión', url: mailUrl_(s, '?servicio=' + encodeURIComponent(b.servicio) + '#reservar') },
    }),
  };
}

function mailConsentCopy_(r, s) {
  return {
    subject: 'Tu consentimiento firmado · MAJOBELLA',
    html: layout_(s, {
      kicker: 'Consentimiento', title: 'Recibimos tu consentimiento',
      intro: 'Gracias, ' + firstName_(r.clienta) + '. Te enviamos una copia en PDF del consentimiento que firmaste para tu cita del ' + esc_(whenText_(r)) + '.',
      cta: { text: 'Ver mis citas', url: mailUrl_(s, '#citas') },
    }),
  };
}

/* ---- Envíos ---- */
function notifyConfirmed_(r, s, byStudio) {
  const m = mailConfirmed_(r, s, byStudio);
  safeMail_(r.correo, m.subject, m.html, { tipo: 'confirmacion', ref: r.id });
  if (!byStudio) { const a = mailAdminNew_(r, s); safeMail_(adminTo_(s), a.subject, a.html, { tipo: 'aviso', ref: r.id }); }
}
function notifyRescheduled_(r, s, before) {
  const m = mailRescheduled_(r, s, before);
  safeMail_(r.correo, m.subject, m.html, { tipo: 'cambio', ref: r.id });
}
function notifyCancelled_(r, s, refunded, byStudio) {
  const m = mailCancelled_(r, s, refunded, byStudio);
  safeMail_(r.correo, m.subject, m.html, { tipo: 'cancelacion', ref: r.id });
  const a = mailAdminCancelled_(r, s, byStudio);
  safeMail_(adminTo_(s), a.subject, a.html, { tipo: 'aviso', ref: r.id });
}

/* Envía y anota en la pestaña Correos. meta = { tipo, ref, attachments } */
function safeMail_(to, subject, html, meta) {
  if (!to) return false;
  meta = meta || {};
  let ok = true;
  try {
    const opts = { to: to, subject: subject, htmlBody: html, name: 'MAJOBELLA', body: plainText_(html) };
    if (meta.attachments) opts.attachments = meta.attachments;
    MailApp.sendEmail(opts);
  } catch (err) { ok = false; logError_('correo', 'No se pudo enviar «' + subject + '» a ' + to + ': ' + msg_(err), meta.ref || '', ''); }
  try { appendRow_('Correos', { fecha: new Date().toISOString(), tipo: meta.tipo || 'otro', para: to, asunto: subject, ref: meta.ref || '', estado: ok ? 'enviado' : 'error' }); } catch (e) { /* sin pestaña Correos todavía */ }
  return ok;
}
function plainText_(html) {
  return String(html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h1|tr|div)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
}

function adminTo_(s) {
  return String(s.correoAvisos || PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '').trim();
}

function whenText_(r) {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const p = String(r.fecha).split('-').map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  return days[dow] + ' ' + p[2] + ' de ' + months[p[1] - 1] + ', ' + time12_(r.hora || '00:00');
}
function time12_(hhmm) {
  const t = String(hhmm).split(':').map(Number);
  return ((t[0] % 12) || 12) + ':' + ('0' + (t[1] || 0)).slice(-2) + (t[0] < 12 ? ' a. m.' : ' p. m.');
}
function longDate_(key) {
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const p = String(key).split('-').map(Number);
  return p[2] + ' de ' + months[p[1] - 1] + ' de ' + p[0];
}
function addDaysKey_(key, n) {
  const p = String(key).split('-').map(Number);
  return Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)), 'UTC', 'yyyy-MM-dd');
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
      refund: /^reembolsado/.test(r.reembolso || '') ? 'reembolsado' : (refundPending_(r) ? 'pendiente' : (r.reembolso ? 'no' : '')),
      transfer: r.metodoDeposito === 'transferencia' ? { deadline: r.estado === 'retenida' ? r.retenidaHasta : '', proof: !!r.comprobanteId, sentAt: r.comprobanteEn || '', account: r.cuentaId || '' } : null,
    },
    changes: { used: Number(r.cambios) || 0, max: changesMax_(settingsCached_()) },
    client: { name: r.clienta, email: r.correo },
    consent: consentState_(r),
    bono: r.bonoCodigo ? { code: r.bonoCodigo, amountRD: Number(r.bonoRD) || 0 } : null,
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
  p.reminderAt = r.recordatorio || '';
  p.reviewAskedAt = r.resenaPedida || '';
  p.retouchNoticeAt = r.retoqueAviso || '';
  p.loyalty = r.fidelidad === 'si';
  p.birthday = r.cumpleanos || '';
  p.photoPermission = r.permisoFotos || '';
  p.proofId = r.comprobanteId || '';
  p.transferRef = r.transferenciaRef || '';
  p.accountId = r.cuentaId || '';
  p.reviewedAt = r.revisadaEn || '';
  p.refundPending = refundPending_(r);
  if (r.estado === 'retenida' && r.metodoDeposito === 'transferencia') p.holdUntil = r.retenidaHasta;
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
   Datos de las clientas: validación y formato único
   ========================================================================= */

const NAME_PARTICLES = ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos', 'di', 'van', 'von'];
/* "maría JOSÉ de la cruz" → "María José de la Cruz" (primera letra en mayúscula y el resto en minúscula) */
function properName_(v) {
  const words = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLocaleLowerCase('es').split(' ').filter(Boolean);
  return words.map(function (w, i) {
    if (i > 0 && NAME_PARTICLES.indexOf(w) >= 0) return w;
    return w.split('-').map(function (part) {
      return part.split("'").map(function (x) { return x ? x.charAt(0).toLocaleUpperCase('es') + x.slice(1) : x; }).join("'");
    }).join('-');
  }).join(' ');
}
/* Teléfono: 10 dígitos (809/829/849 → 809-555-1234), +1 de EE. UU./Canadá, u otro país empezando con + */
function normPhone_(v) {
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return { ok: true, value: '' };
  let d = raw.replace(/\D/g, '');
  if (raw.charAt(0) === '+' && d.charAt(0) !== '1') return d.length >= 8 && d.length <= 15 ? { ok: true, value: '+' + d } : { ok: false };
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  if (d.length !== 10) return { ok: false };
  const f = d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  return { ok: true, value: /^(809|829|849)/.test(d) ? f : '+1 ' + f };
}
const PHONE_ERROR = 'Revisa el teléfono: debe tener 10 dígitos, por ejemplo 809-555-1234. Si es de otro país, empieza con + y el código.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}][\p{L}\p{M}'’.\- ]*$/u;

/* Valida y deja con el mismo formato los datos de una clienta.
   strict (web y app): nombre y apellido, teléfono y correo obligatorios. Sin strict (dashboard): solo el nombre. */
function client_(c, strict) {
  c = c || {};
  const first = clean_(c.firstName, 60), last = clean_(c.lastName, 60);
  const full = clean_(first || last ? first + ' ' + last : c.name, 90).replace(/\s+/g, ' ');
  if (full.length < 2) return { ok: false, error: strict ? 'Escribe tu nombre y tu apellido.' : 'Escribe el nombre de la clienta.' };
  if (!NAME_RE.test(full)) return { ok: false, error: 'El nombre y el apellido solo pueden tener letras.' };
  if (strict) {
    const parts = first || last ? [first, last] : [full.split(' ')[0], full.split(' ').slice(1).join(' ')];
    if (parts[0].replace(/[^\p{L}]/gu, '').length < 2) return { ok: false, error: 'Escribe tu nombre (al menos 2 letras).' };
    if (parts[1].replace(/[^\p{L}]/gu, '').length < 2) return { ok: false, error: 'Escribe también tu apellido.' };
  }
  const ph = normPhone_(c.phone);
  if (!ph.ok || (strict && !ph.value)) return { ok: false, error: ph.ok ? 'Escribe tu teléfono.' : PHONE_ERROR };
  const email = clean_(c.email, 120).toLowerCase();
  if (strict && !email) return { ok: false, error: 'Escribe tu correo.' };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'Revisa el correo: parece incompleto (ejemplo: nombre@gmail.com).' };
  return { ok: true, name: properName_(full), phone: ph.value, email: email, notes: clean_(c.notes, 300) };
}

/* Ordena los datos ya guardados (lo ejecuta setup): nombres propios, teléfonos y correos con un solo formato */
function normalizeData_() {
  const plan = {
    Reservas: { clienta: 'name', telefono: 'phone', correo: 'email' },
    Clientas: { nombre: 'name', telefono: 'phone', correo: 'email' },
    Espera: { clienta: 'name', telefono: 'phone', correo: 'email' },
    Bonos: { clienta: 'name', telefono: 'phone', correo: 'email' },
    Tarjetas: { comprador: 'name', para: 'name', correoComprador: 'email', correoPara: 'email' },
  };
  const out = {};
  Object.keys(plan).forEach(function (name) {
    let t;
    try { t = tab_(name); } catch (e) { return; }
    const last = t.getLastRow();
    if (last < 2) return;
    const h = headers_(t);
    let changed = 0;
    Object.keys(plan[name]).forEach(function (col) {
      const ci = h.indexOf(col);
      if (ci < 0) return;
      const range = t.getRange(2, ci + 1, last - 1, 1);
      const vals = range.getValues();
      let dirty = false;
      vals.forEach(function (row) {
        const v = String(row[0] == null ? '' : row[0]);
        if (!v) return;
        const kind = plan[name][col];
        let n = v;
        if (kind === 'name') n = properName_(v);
        else if (kind === 'email') n = v.trim().toLowerCase();
        else if (kind === 'phone') { const ph = normPhone_(v); if (ph.ok) n = ph.value; }
        if (name === 'Reservas' && col === 'clienta' && /^Bloqueo|^Bloqueado/.test(v)) n = v;
        if (n !== v) { row[0] = n; dirty = true; changed++; }
      });
      if (dirty) range.setNumberFormat('@').setValues(vals);
    });
    if (changed) out[name] = changed;
  });
  resetDb_();
  return out;
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
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max); }
function esc_(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function safeJson_(t, def) { try { return JSON.parse(t); } catch (e) { return def; } }
function msg_(err) { return String((err && err.message) || err); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// % de depósito de un servicio (vacío = usar el general; 0 = sin depósito)
function pctOrNull_(v) { const t = String(v == null ? '' : v).trim(); if (t === '') return null; const n = Number(t.replace(',', '.')); return isFinite(n) ? Math.max(0, Math.min(100, n)) : null; }
function depositRatio_(items, fallbackPct) {
  const base = items.reduce(function (t, x) { return t + x.price; }, 0);
  if (!base) return (items.length ? (items[0].depositPercent == null ? fallbackPct : items[0].depositPercent) : fallbackPct) / 100;
  return items.reduce(function (t, x) { return t + x.price * (x.depositPercent == null ? fallbackPct : x.depositPercent); }, 0) / base / 100;
}
function todayKey_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function normCode_(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9-]/g, ''); }
function randCode_(n) { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
function slug_(t) { return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || ('servicio-' + Date.now()); }

/* =========================================================================
   Depósito por transferencia
   La clienta elige transferencia → se aparta el horario (transferenciaMinutos) → sube el comprobante
   → la cita queda "por-confirmar" (ocupa la agenda y no vence) → el estudio la confirma o la rechaza.
   ========================================================================= */

const TOO_MANY = 'Demasiados intentos con códigos que no existen. Espera unos minutos e inténtalo de nuevo.';
const NOT_HUMAN = 'No pudimos comprobar que no eres un robot. Recarga la página e inténtalo de nuevo.';

function accountOut_(a) {
  return { id: a.id, bank: a.banco || '', type: a.tipo || '', number: a.numero || '', holder: a.titular || '', doc: a.documento || '', note: a.nota || '' };
}
function transferInfo_(s) {
  const accounts = readOpt_('Cuentas').filter(function (a) { return !/^no$/i.test(a.activa) && a.numero; })
    .sort(function (a, b) { return (Number(a.orden) || 0) - (Number(b.orden) || 0); }).map(accountOut_);
  return { enabled: on_(s.transferenciaActiva) && accounts.length > 0, minutes: num_(s.transferenciaMinutos, 60), accounts: accounts };
}
function changesMax_(s) {
  const t = String(s.cambiosMax == null ? '' : s.cambiosMax).trim();
  const n = Number(t);
  return t !== '' && isFinite(n) ? Math.max(0, Math.floor(n)) : 1;
}
function refundPending_(r) { return /^(pendiente|devolver a mano)/.test(String(r.reembolso || '')); }

/* La clienta sube el comprobante (imagen o PDF) */
function transferProof_(d) {
  const found = findRow_(d.id);
  if (!found || !authorized_(found.row, d)) return { ok: false, error: 'No encontramos esa reserva.' };
  const r = found.row;
  if (r.metodoDeposito !== 'transferencia') return { ok: false, error: 'Esta reserva no se paga por transferencia.' };
  if (['retenida', 'expirada', 'por-confirmar'].indexOf(r.estado) < 0) return { ok: false, error: 'Esta reserva ya no está esperando un comprobante.' };
  const start = new Date(r.inicio), end = new Date(r.fin);
  const late = r.estado === 'expirada' || (r.estado === 'retenida' && new Date(r.retenidaHasta).getTime() < Date.now());
  if (late && conflicts_(start, end, r.id).length) return { ok: false, error: 'Se acabó el tiempo para subir el comprobante y el horario ya se ocupó. Escríbenos por WhatsApp y te ayudamos.' };
  if (start.getTime() < Date.now()) return { ok: false, error: 'La hora de esta cita ya pasó.' };
  const mime = String(d.mime || '');
  if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].indexOf(mime) < 0) return { ok: false, error: 'Sube una foto (JPG o PNG) o un PDF del comprobante.' };
  const bytes = Utilities.base64Decode(String(d.data || ''));
  if (!bytes.length) return { ok: false, error: 'El archivo está vacío.' };
  if (bytes.length > 8 * 1024 * 1024) return { ok: false, error: 'El archivo pesa más de 8 MB. Toma una captura de pantalla del comprobante.' };
  const accounts = transferInfo_(settings_()).accounts;
  const cuenta = accounts.filter(function (a) { return a.id === d.accountId; })[0] || (accounts.length === 1 ? accounts[0] : null);
  const key = clientKey_(r.correo, r.telefono, r.clienta);
  const ext = mime === 'application/pdf' ? '.pdf' : (mime === 'image/png' ? '.png' : '.jpg');
  const blob = Utilities.newBlob(bytes, mime, key.replace(/[^\w@.+-]/g, '_') + ' · comprobante · ' + r.id + ext);
  const file = filesFolder_().createFile(blob);
  const arc = {
    id: 'ARC-' + Utilities.getUuid().slice(0, 8).toUpperCase(), clave: key, tipo: 'comprobante', nombre: 'Comprobante ' + r.id + ext, mime: mime,
    driveId: file.getId(), citaId: r.id, fecha: todayKey_(), nota: 'Transferencia del depósito' + (cuenta ? ' · ' + cuenta.bank : '') + (d.ref ? ' · ref. ' + clean_(d.ref, 60) : ''), creada: new Date().toISOString(),
  };
  appendRow_('Archivos', arc);
  const replaced = r.estado === 'por-confirmar';
  const patch = { estado: 'por-confirmar', comprobanteId: arc.id, comprobanteEn: new Date().toISOString(), cuentaId: cuenta ? cuenta.id : '', transferenciaRef: clean_(d.ref, 60), retenidaHasta: '' };
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  const s = settings_();
  if (!replaced) { const m = mailTransferReceived_(r, s); safeMail_(r.correo, m.subject, m.html, { tipo: 'transferencia', ref: r.id }); }
  const a = mailAdminTransfer_(r, s, cuenta, replaced);
  safeMail_(adminTo_(s), a.subject, a.html, { tipo: 'aviso', ref: r.id, attachments: bytes.length < 5 * 1024 * 1024 ? [blob] : null });
  return { ok: true, appointment: publicRow_(r) };
}

/* El estudio confirma (llegó el dinero) o rechaza la transferencia */
function adminTransferReview_(d) {
  needAdmin_(d);
  const found = findRow_(d.id);
  if (!found) return { ok: false, error: 'No encontramos esa cita.' };
  const r = found.row;
  if (r.metodoDeposito !== 'transferencia' || ['por-confirmar', 'retenida', 'expirada'].indexOf(r.estado) < 0) return { ok: false, error: 'Esta cita no está esperando revisión de transferencia.' };
  const s = settings_();
  const now = new Date().toISOString();
  if (d.decision === 'confirmar') {
    if (!d.force) {
      const clash = conflicts_(new Date(r.inicio), new Date(r.fin), r.id);
      if (clash.length) return { ok: false, conflict: true, error: 'Ese horario ahora choca con ' + describeClash_(clash[0]) + '. Puedes confirmarla igual si lo confirmas.' };
    }
    const patch = { estado: 'confirmada', depositoPagado: now, revisadaEn: now, retenidaHasta: '' };
    confirmPaid_(found.index, r, patch);
    const m = mailConfirmed_(r, s, false);
    safeMail_(r.correo, m.subject, m.html, { tipo: 'confirmacion', ref: r.id });
    return { ok: true, item: adminRow_(r) };
  }
  if (d.decision === 'rechazar') {
    const motivo = clean_(d.reason, 200) || 'No recibimos la transferencia.';
    const patch = { estado: 'cancelada', canceladaEn: now, canceladaPor: 'estudio: transferencia rechazada', revisadaEn: now, retenidaHasta: '',
      notaInterna: clean_((r.notaInterna ? r.notaInterna + ' · ' : '') + 'Transferencia rechazada: ' + motivo, 500), reembolso: 'sin reembolso (transferencia no recibida)' };
    updateRow_(found.index, patch);
    Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
    if (d.notify !== false) { const m = mailTransferRejected_(r, s, motivo); safeMail_(r.correo, m.subject, m.html, { tipo: 'transferencia', ref: r.id }); }
    notifyWaitlist_(r.fecha);
    return { ok: true, item: adminRow_(r) };
  }
  return { ok: false, error: 'Elige confirmar o rechazar.' };
}

/* Recuerda al estudio las transferencias sin revisar (como mucho cada 4 horas) */
function nagTransfers_(rows, s, now) {
  const pending = rows.filter(function (r) { return r.estado === 'por-confirmar' && now.getTime() - new Date(r.comprobanteEn || r.creada).getTime() > 2 * 3600000; });
  if (!pending.length) return 0;
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('TRANSFER_NAG') || 0);
  if (now.getTime() - last < 4 * 3600000) return 0;
  props.setProperty('TRANSFER_NAG', String(now.getTime()));
  const html = layout_(s, {
    kicker: 'Transferencias por revisar', title: pending.length === 1 ? 'Tienes 1 transferencia sin revisar' : 'Tienes ' + pending.length + ' transferencias sin revisar',
    intro: 'Estas clientas subieron su comprobante y esperan tu confirmación. Su horario sigue apartado.',
    details: pending.slice(0, 10).map(function (r) { return [r.clienta, esc_(whenText_(r)) + '<br>Depósito RD$ ' + money_(r.depositoRD)]; }),
    cta: { text: 'Revisar en el dashboard', url: mailUrl_(s, 'admin.html#agenda') },
  });
  safeMail_(adminTo_(s), 'Transferencias por revisar (' + pending.length + ') · MAJOBELLA', html, { tipo: 'aviso', ref: 'transferencias' });
  return pending.length;
}

/* Cuentas bancarias (dashboard → Ajustes) */
function adminSaveAccount_(d) {
  needAdmin_(d);
  const a = d.account || {};
  const banco = clean_(a.banco, 60), numero = clean_(a.numero, 40), titular = clean_(a.titular, 80);
  if (!banco || !numero || !titular) return { ok: false, error: 'Escribe el banco, el número de cuenta y el titular.' };
  const rows = readOpt_('Cuentas');
  const patch = {
    banco: banco, tipo: clean_(a.tipo, 40) || 'Ahorros', numero: numero, titular: titular, documento: clean_(a.documento, 30), nota: clean_(a.nota, 160),
    activa: /^(no|false)$/i.test(String(a.activa)) ? 'no' : 'si', orden: Math.round(Number(a.orden) || 0),
  };
  const r = a.id ? rows.filter(function (x) { return x.id === a.id; })[0] : null;
  if (r) { updateTable_('Cuentas', r._row, patch); patch.id = r.id; patch.creada = r.creada; }
  else {
    patch.id = 'CTA-' + Utilities.getUuid().slice(0, 6).toUpperCase(); patch.creada = new Date().toISOString();
    if (!a.orden) patch.orden = rows.length + 1;
    appendRow_('Cuentas', patch);
  }
  return { ok: true, account: patch, accounts: readOpt_('Cuentas').map(strip_) };
}
function adminDeleteAccount_(d) {
  needAdmin_(d);
  const r = readOpt_('Cuentas').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos esa cuenta.' };
  deleteRow_('Cuentas', r._row);
  return { ok: true, accounts: readOpt_('Cuentas').map(strip_) };
}

/* =========================================================================
   Cambiar la fecha (la clienta, desde la web o la app)
   ========================================================================= */

function reschedule_(d) {
  const found = findRow_(d.id);
  if (!found || !authorized_(found.row, d)) return { ok: false, error: 'No encontramos esa cita.' };
  const r = found.row;
  const s = settings_();
  if (r.estado !== 'confirmada' && r.estado !== 'por-confirmar') return { ok: false, error: 'Esta cita ya no se puede cambiar.' };
  const max = changesMax_(s), used = Number(r.cambios) || 0;
  if (!max) return { ok: false, error: 'Para cambiar tu cita escríbenos por WhatsApp.' };
  if (used >= max) return { ok: false, error: max === 1 ? 'Ya cambiaste la fecha de esta cita una vez. Para otro cambio, escríbenos por WhatsApp.' : 'Ya usaste los ' + max + ' cambios de esta cita. Escríbenos por WhatsApp.' };
  const H = num_(s.horasCancelacion, 24);
  if ((new Date(r.inicio).getTime() - Date.now()) / 3600000 < H) return { ok: false, error: 'Faltan menos de ' + H + ' horas para tu cita: para cambiarla escríbenos por WhatsApp.' };
  if (!isDateKey_(d.date) || !/^\d{2}:\d{2}$/.test(d.time || '')) return { ok: false, error: 'Elige el nuevo día y la hora.' };
  if (d.date === r.fecha && d.time === r.hora) return { ok: false, error: 'Elige un horario distinto al actual.' };
  const minutes = Number(r.duracionMin) || 30;
  const problem = slotProblem_(schedule_(s), d.date, d.time, minutes);
  if (problem) return { ok: false, error: problem };
  const start = new Date(d.date + 'T' + d.time + ':00' + UTC_OFFSET);
  const end = new Date(start.getTime() + minutes * 60000);
  if (conflicts_(start, end, r.id).length) return { ok: false, error: 'Ese horario acaba de ocuparse. Elige otro, por favor.' };
  const before = whenText_(r);
  const oldDate = r.fecha;
  const patch = { fecha: d.date, hora: d.time, inicio: start.toISOString(), fin: end.toISOString(), reprogramadaDe: r.fecha + ' ' + r.hora, recordatorio: '', cambios: used + 1 };
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  calendarMove_(r, s);
  notifyRescheduled_(r, s, before);
  const a = mailAdminRescheduled_(r, s, before);
  safeMail_(adminTo_(s), a.subject, a.html, { tipo: 'aviso', ref: r.id });
  notifyWaitlist_(oldDate);
  return { ok: true, appointment: publicRow_(r) };
}

/* =========================================================================
   Billetera unida a la cuenta: tarjetas y paquetes comprados o recibidos con su correo
   ========================================================================= */

function walletCodesFor_(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return [];
  const codes = [];
  readOpt_('Tarjetas').forEach(function (g) {
    if (g.estado === 'pendiente' || !g.codigo) return;
    if ([g.correoComprador, g.correoPara].map(function (x) { return String(x || '').toLowerCase(); }).indexOf(e) >= 0) codes.push(normCode_(g.codigo));
  });
  readOpt_('Bonos').forEach(function (b) {
    if (b.estado !== 'pendiente' && b.codigo && String(b.correo || '').toLowerCase() === e) codes.push(normCode_(b.codigo));
  });
  return codes.filter(function (c, i) { return codes.indexOf(c) === i; });
}

function myWallet_(d) {
  const u = verifyIdToken_(d.idToken);
  if (!u) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
  return { ok: true, items: walletItems_(walletCodesFor_(u.email)) };
}

/* Envía sus códigos al correo (así solo la dueña del correo los ve). Siempre responde igual. */
function walletEmail_(d) {
  const s = settings_();
  const email = clean_(d.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'Escribe un correo válido.' };
  if (!human_(d, s)) return { ok: false, error: NOT_HUMAN };
  const cache = CacheService.getScriptCache();
  const key = 'we_' + hash_(email).slice(0, 32);
  const gkey = 'we_g_' + Math.floor(Date.now() / 3600000);
  const sent = { ok: true, message: 'Si tienes tarjetas o paquetes con ese correo, te los enviamos en un momento. Revisa también la carpeta de spam.' };
  if (cache.get(key)) return sent;
  const total = Number(cache.get(gkey) || 0);
  if (total >= 60) return sent;
  cache.put(key, '1', 600);
  cache.put(gkey, String(total + 1), 3700);
  const items = walletItems_(walletCodesFor_(email)).filter(function (x) { return x.type !== 'unknown'; });
  if (items.length) { const m = mailWallet_(email, items, s); safeMail_(email, m.subject, m.html, { tipo: 'billetera', ref: email }); }
  return sent;
}

function mailWallet_(email, items, s) {
  const rows = items.map(function (x) {
    if (x.type === 'gift') return ['Tarjeta de regalo', '<b style="font-family:\'Courier New\',monospace;letter-spacing:2px">' + esc_(x.code) + '</b><br>Saldo RD$ ' + money_(x.balanceRD) + ' de RD$ ' + money_(x.amountRD) + (x.expires ? ' · vence el ' + esc_(longDate_(x.expires)) : '') + (x.status !== 'activa' ? ' · ' + esc_(x.status) : '')];
    return ['Paquete', '<b style="font-family:\'Courier New\',monospace;letter-spacing:2px">' + esc_(x.code) + '</b><br>' + esc_(x.name) + ' · ' + Math.max(0, x.sessions - x.used) + ' de ' + x.sessions + ' sesiones disponibles' + (x.expires ? ' · vence el ' + esc_(longDate_(x.expires)) : '')];
  });
  return {
    subject: 'Tus tarjetas y paquetes de MAJOBELLA',
    html: layout_(s, {
      kicker: 'Tu billetera', title: 'Tus códigos',
      intro: 'Estos son las tarjetas de regalo y paquetes asociados a ' + esc_(email) + '. Escribe el código al reservar o guárdalo en la app.',
      details: rows,
      cta: { text: 'Abrir la app', url: mailUrl_(s, 'app/#billetera') },
      secondary: { text: 'Reservar', url: mailUrl_(s, '#reservar') },
      note: 'Si no pediste este correo, puedes ignorarlo: nadie más puede ver tus códigos.',
    }),
  };
}

/* ---- Correos de transferencias y cambios ---- */
function mailTransferReceived_(r, s) {
  return {
    subject: 'Recibimos tu comprobante · MAJOBELLA',
    html: layout_(s, {
      preheader: 'Tu horario está apartado mientras confirmamos la transferencia.',
      kicker: 'Comprobante recibido', title: 'Gracias, ' + firstName_(r.clienta),
      intro: 'Recibimos el comprobante de tu transferencia. <b>Tu horario queda apartado</b> y te confirmamos la cita en cuanto veamos el depósito en la cuenta (normalmente el mismo día).',
      details: apptDetails_(r),
      cta: { text: 'Ver mis citas', url: mailUrl_(s, '#citas') },
      secondary: waUrl_(s) ? { text: 'Escribir por WhatsApp', url: waUrl_(s, 'Hola, envié el comprobante de mi cita ' + r.id + '.') } : null,
    }),
  };
}
function mailAdminTransfer_(r, s, cuenta, replaced) {
  return {
    subject: (replaced ? 'Nuevo comprobante' : 'Transferencia por revisar') + ' · ' + r.clienta + ' · RD$ ' + money_(r.depositoRD),
    html: layout_(s, {
      kicker: replaced ? 'Comprobante reemplazado' : 'Transferencia por revisar', title: r.clienta,
      intro: 'Revisa que el depósito haya llegado a tu cuenta y confirma o rechaza la cita desde el dashboard. El comprobante va adjunto.',
      details: apptDetails_(r, [
        ['Depósito esperado', 'RD$ ' + money_(r.depositoRD)],
        cuenta ? ['Cuenta', esc_(cuenta.bank + ' · ' + cuenta.number)] : null,
        r.transferenciaRef ? ['Referencia', esc_(r.transferenciaRef)] : null,
        ['Teléfono', esc_(r.telefono || '—')], ['Correo', esc_(r.correo || '—')],
      ]),
      cta: { text: 'Revisar en el dashboard', url: mailUrl_(s, 'admin.html#agenda') },
    }),
  };
}
function mailTransferRejected_(r, s, motivo) {
  return {
    subject: 'No pudimos confirmar tu transferencia · MAJOBELLA',
    html: layout_(s, {
      kicker: 'Transferencia', title: 'No pudimos confirmar tu cita',
      intro: 'Hola, ' + firstName_(r.clienta) + '. Revisamos tu comprobante para el ' + esc_(whenText_(r)) + ' y no pudimos confirmar el depósito.',
      body: '<p style="margin:0"><b>Motivo:</b> ' + esc_(motivo) + '</p><p style="margin:12px 0 0">Si ya hiciste la transferencia, escríbenos por WhatsApp con el comprobante y lo resolvemos enseguida.</p>',
      cta: waUrl_(s) ? { text: 'Escribir por WhatsApp', url: waUrl_(s, 'Hola, es sobre mi transferencia de la cita ' + r.id + '.') } : { text: 'Reservar de nuevo', url: mailUrl_(s, '#reservar') },
      secondary: { text: 'Reservar de nuevo', url: mailUrl_(s, '#reservar') },
      note: 'Código de reserva: ' + esc_(r.id),
    }),
  };
}
function mailAdminRescheduled_(r, s, before) {
  return {
    subject: 'La clienta cambió su cita · ' + r.clienta + ' · ' + whenText_(r),
    html: layout_(s, {
      kicker: 'Cambio de fecha', title: r.clienta,
      intro: 'Antes: ' + esc_(before) + '<br><b>Ahora: ' + esc_(whenText_(r)) + '</b>',
      details: apptDetails_(r, [['Teléfono', esc_(r.telefono || '—')]]),
      cta: { text: 'Abrir dashboard', url: mailUrl_(s, 'admin.html#agenda') },
    }),
  };
}

/* =========================================================================
   Seguridad: robots (Cloudflare Turnstile), intentos con códigos y accesos al dashboard
   ========================================================================= */

function turnstileOn_(s) {
  return !!(String(s.turnstileSiteKey || '').trim() && PropertiesService.getScriptProperties().getProperty('TURNSTILE_SECRET'));
}
function human_(d, s) {
  if (!turnstileOn_(s)) return true;
  if (!d.captcha) return false;
  try {
    const res = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'post', muteHttpExceptions: true,
      payload: { secret: PropertiesService.getScriptProperties().getProperty('TURNSTILE_SECRET'), response: String(d.captcha) },
    });
    return JSON.parse(res.getContentText()).success === true;
  } catch (e) { logError_('sistema', 'No se pudo verificar Turnstile: ' + msg_(e), '', ''); return true; }
}
// Límite de códigos equivocados: por dispositivo (8 cada 15 min) y en total (150 cada 10 min)
function rlKeys_(d) {
  return { dev: d.device ? 'rl_d_' + hash_(String(d.device)).slice(0, 24) : '', glob: 'rl_g_' + Math.floor(Date.now() / 600000) };
}
function limited_(d) {
  const c = CacheService.getScriptCache(), k = rlKeys_(d);
  if (k.dev && Number(c.get(k.dev) || 0) >= 8) return true;
  return Number(c.get(k.glob) || 0) >= 150;
}
function noteFail_(d) {
  const c = CacheService.getScriptCache(), k = rlKeys_(d);
  if (k.dev) c.put(k.dev, String(Number(c.get(k.dev) || 0) + 1), 900);
  c.put(k.glob, String(Number(c.get(k.glob) || 0) + 1), 700);
}

function noteAccess_(u, d) {
  try {
    const cache = CacheService.getScriptCache();
    const key = 'acc_' + hash_(String(d.idToken)).slice(0, 30);
    if (cache.get(key)) return;
    cache.put(key, '1', 21600);
    const props = PropertiesService.getScriptProperties();
    const list = safeJson_(props.getProperty('ADMIN_ACCESS'), []) || [];
    list.unshift({ email: u.email, at: new Date().toISOString(), device: clean_(d.device_label, 80) });
    props.setProperty('ADMIN_ACCESS', JSON.stringify(list.slice(0, 15)));
  } catch (e) { /* nada */ }
}

function sharingInfo_(get) {
  try {
    const f = get();
    return {
      access: String(f.getSharingAccess()),
      editors: f.getEditors().map(function (x) { return x.getEmail(); }),
      viewers: f.getViewers().map(function (x) { return x.getEmail(); }),
    };
  } catch (e) { return null; }
}

function securityStatus_(s) {
  const props = PropertiesService.getScriptProperties();
  return {
    admins: String(props.getProperty('ADMIN_EMAILS') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean),
    turnstile: { siteKey: !!String(s.turnstileSiteKey || '').trim(), secret: !!props.getProperty('TURNSTILE_SECRET') },
    paypalEnv: paypalEnv_(),
    sheet: sharingInfo_(function () { return DriveApp.getFileById(props.getProperty('SHEET_ID')); }),
    folder: sharingInfo_(function () { return DriveApp.getFolderById(props.getProperty('FILES_FOLDER_ID')); }),
    accesses: safeJson_(props.getProperty('ADMIN_ACCESS'), []) || [],
    inactivityMinutes: num_(s.adminInactividadMin, 30),
  };
}

/* =========================================================================
   Errores: se guardan en la pestaña Errores y se avisan por correo (como mucho uno cada 3 h por tipo)
   ========================================================================= */

const ERROR_TITLES = {
  pago: 'Un cobro necesita revisión',
  correo: 'Un correo no se pudo enviar',
  automatizacion: 'Las tareas automáticas tienen un problema',
  sistema: 'Hubo un error en el sistema',
};

function logError_(tipo, mensaje, ref, detalle, urgent) {
  try {
    const props = PropertiesService.getScriptProperties();
    const now = Date.now();
    const key = 'ERR_' + tipo;
    let avisado = '';
    if (urgent || now - Number(props.getProperty(key) || 0) > 3 * 3600000) {
      const s = settingsCached_();
      const to = adminTo_(s);
      if (to) {
        try {
          const html = layout_(s, {
            kicker: 'Aviso del sistema', title: ERROR_TITLES[tipo] || 'Aviso del sistema',
            intro: esc_(mensaje),
            details: [['Cuándo', esc_(Utilities.formatDate(new Date(now), TZ, 'yyyy-MM-dd HH:mm'))], ref ? ['Referencia', esc_(ref)] : null, detalle ? ['Detalle', esc_(detalle)] : null].filter(Boolean),
            cta: { text: 'Ver en el dashboard', url: mailUrl_(s, 'admin.html#ajustes') },
            note: urgent ? 'Este aviso es importante: revísalo hoy.' : 'Si el problema se repite en las próximas 3 horas, quedará anotado en el dashboard sin enviar más correos.',
          });
          MailApp.sendEmail({ to: to, subject: '⚠ MAJOBELLA · ' + (ERROR_TITLES[tipo] || 'Aviso del sistema'), htmlBody: html, body: plainText_(html), name: 'MAJOBELLA' });
          avisado = new Date(now).toISOString();
          props.setProperty(key, String(now));
        } catch (e) { /* sin cuota de correo */ }
      }
    }
    appendRow_('Errores', { fecha: new Date(now).toISOString(), tipo: tipo, mensaje: clean_(mensaje, 600), ref: clean_(ref, 80), detalle: clean_(detalle, 600), avisado: avisado, resuelto: '' });
  } catch (e) { /* nunca romper la petición por anotar un error */ }
}

/* Si las tareas automáticas llevan más de 3 horas sin ejecutarse, se anota y se avisa */
function heartbeat_() {
  try {
    const last = safeJson_(PropertiesService.getScriptProperties().getProperty('LAST_AUTO'), null);
    if (!last || !last.at) return;
    const hours = (Date.now() - new Date(last.at).getTime()) / 3600000;
    const props = PropertiesService.getScriptProperties();
    if (hours > 3 && Date.now() - Number(props.getProperty('HB_LOGGED') || 0) > 3 * 3600000) {
      props.setProperty('HB_LOGGED', String(Date.now()));
      logError_('automatizacion', 'Las tareas automáticas (recordatorios, reseñas, cumpleaños) no se ejecutan desde hace ' + Math.floor(hours) + ' horas. Abre Apps Script y ejecuta setup() para reinstalar el disparador.', '', '');
    }
  } catch (e) { /* nada */ }
}

function adminResolveErrors_(d) {
  needAdmin_(d);
  const rows = readOpt_('Errores');
  const now = new Date().toISOString();
  rows.forEach(function (r) {
    if (r.resuelto) return;
    if (d.all || String(r._row) === String(d.row)) updateTable_('Errores', r._row, { resuelto: now });
  });
  return { ok: true, errors: readOpt_('Errores').slice(-150).reverse().map(function (x) { const o = strip_(x); o.row = x._row; return o; }) };
}
