/* MAJOBELLA · Panel del estudio (solo las cuentas en ADMIN_EMAILS) */
import { cx, env_ } from './ctx.ts';
import { allTemplates_ } from './consent-templates.ts';
import { appendRow_, deleteRow_, readOpt_, readTable_, updateTable_ } from './db.ts';
import { catalogItems_, findRow_, resetCaches_, rows_, settings_, updateRow_ } from './data.ts';
import { blocks_, conflicts_, describeClash_, schedule_ } from './schedule.ts';
import { applyBono_, applyGift_, findGift_ } from './pricing.ts';
import { refundPending_ } from './catalog.ts';
import { paypalEnv_, tryRefund_ } from './paypal.ts';
import { needAdmin_, securityStatus_ } from './security.ts';
import { adminSubscriptionData_ } from './memberships.ts';
import { subscriptionCapability_ } from './subscriptions.ts';
import { calendarCancel_, calendarCreate_, calendarMove_ } from './google.ts';
import { confirmPaid_, adminRow_ } from './booking.ts';
import { notifyWaitlist_ } from './waitlist.ts';
import { automationStatus_, runAutomations_ } from './automations.ts';
import { heartbeat_ } from './errors.ts';
import {
  mailBirthday_, mailBono_, mailCancelled_, mailConfirmed_, mailConsentCopy_, mailRescheduled_, mailReminder_, mailRetouch_, mailReview_,
  mailTransferReceived_, mailTransferRejected_, mailWaitlist_, mailWallet_, notifyCancelled_, notifyConfirmed_, notifyRescheduled_, safeMail_,
} from './mail.ts';
import { PRIVATE_BUCKET, PUBLIC_BUCKET, copyFile, filePath, getFile, publicPathFromUrl, publicUrl, putFile, removeLater } from './storage.ts';
import { DEFAULT_CONSENT, FILE_MIMES, FILE_TYPES, LONG_SETTINGS, MAX_FILE_BYTES, SETTING_KEYS, TZ, UTC_OFFSET } from './constants.ts';
import {
  addDaysKey_, b64ToBytes, bytesToB64, clean_, client_, fmtDate, hash_, isDateKey_, monthDay_, normCode_, num_, properName_, randCode_, slug_, strip_,
  todayKey_, toMin_, uuid, whenText_,
} from './util.ts';

/* Todo lo que necesita el dashboard en una sola consulta */
export function adminData_(d, extra?) {
  extra = extra || {};
  const u = needAdmin_(d);
  const s = settings_();
  heartbeat_();
  return {
    ok: true, user: u.email,
    accounts: readOpt_('Cuentas').map(strip_),
    errors: readOpt_('Errores').slice(-150).reverse().map(function (x) { const o = strip_(x); o.row = x._row; return o; }),
    security: securityStatus_(s, extra.folder || null),
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
    ...adminSubscriptionData_(),
    membershipPayments: readOpt_('PagosMembresia').map(strip_),
    paypalRefunds: readOpt_('ReembolsosPaypal').map(strip_),
    subscriptionCapability: subscriptionCapability_(),
    bonos: readOpt_('Bonos').filter(function (b) { return b.estado !== 'pendiente'; }).map(strip_),
    waitlist: readOpt_('Espera').map(strip_),
    emails: readOpt_('Correos').slice(-200).reverse().map(strip_),
    automation: automationStatus_(),
    consentDefault: DEFAULT_CONSENT,
    consentTemplates: allTemplates_(),
    settings: readTable_('Ajustes').map(function (r) { return { key: r.clave, value: r.valor, help: r['qué es'] || '' }; }),
    categories: readTable_('Categorias').map(strip_),
    services: readTable_('Servicios').map(strip_),
    schedule: schedule_(s),
    paypalEnv: paypalEnv_(),
    sheetUrl: dbUrl_(),
  };
}

export async function adminUpdate_(d) {
  needAdmin_(d);
  const found = findRow_(d.id);
  if (!found) return { ok: false, error: 'No encontramos esa cita.' };
  const r = found.row;
  const s = settings_();
  const now = new Date().toISOString();
  let patch: any = {};
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
        : r.paypalCaptura ? await tryRefund_(r.paypalCaptura, r.id + '-refund')
          : paidOut ? 'pendiente: devolver por ' + (r.metodoDeposito === 'transferencia' ? 'transferencia' : 'efectivo o transferencia') : 'sin depósito pagado';
      if (r.saldoCaptura) patch.reembolso += ' · saldo: ' + await tryRefund_(r.saldoCaptura, r.id + '-refund-saldo');
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
export function adminCreate_(d) {
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
  const row: any = {
    id: 'MJB-' + fmtDate(start, TZ, 'yyMMdd') + '-' + uuid().slice(0, 6).toUpperCase(),
    creada: now, estado: 'confirmada',
    fecha: d.date, hora: d.time, inicio: start.toISOString(), fin: end.toISOString(), duracionMin: minutes,
    servicios: items.map(function (x) { return x.name; }).join(' + '),
    serviciosJson: JSON.stringify(items.map(function (x) { return { id: x.id, name: x.name, price: x.price, durationMinutes: x.durationMinutes }; })),
    subtotalRD: subtotal, descuentoRD: subtotal - total, totalRD: total, depositoRD: dep, saldoRD: total - dep,
    depositoPagado: dep > 0 ? now : '', metodoDeposito: depMethod,
    saldoEstado: total - dep > 0 ? 'pendiente' : 'pagado',
    clienta: name, telefono: cv.phone, correo: cv.email, nota: cv.notes,
    tokenHash: hash_(uuid()), firmaToken: uuid().replace(/-/g, '').slice(0, 20),
    origen: clean_(d.origen, 40) || 'estudio', canal: 'dashboard', creadaPor: 'estudio',
  };
  row.eventoId = calendarCreate_(row, s);
  appendRow_('Reservas', row);
  if (d.notify && row.correo) notifyConfirmed_(row, s, true);
  return { ok: true, item: adminRow_(row) };
}

export function adminReschedule_(d) {
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
  const patch: any = { fecha: d.date, hora: d.time, inicio: start.toISOString(), fin: end.toISOString(), reprogramadaDe: r.fecha + ' ' + r.hora, recordatorio: '' };
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  calendarMove_(r, settings_());
  if (d.notify && r.correo) notifyRescheduled_(r, settings_(), before);
  notifyWaitlist_(oldDate);
  return { ok: true, item: adminRow_(r) };
}

/* Bloqueos: una vez, varios días seguidos o cada semana */
export function adminBlock_(d) {
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
  const row: any = {
    id: 'BLQ-' + uuid().slice(0, 8).toUpperCase(), tipo: tipo, dias: dias,
    horaDesde: hd, horaHasta: hh, fechaDesde: fd, fechaHasta: tipo === 'unico' ? fd : fh,
    motivo: clean_(d.reason || d.motivo, 120) || 'Bloqueado', activo: 'si', creada: new Date().toISOString(),
  };
  appendRow_('Bloqueos', row);
  void u;
  return { ok: true, block: strip_(row) };
}

export function adminDeleteBlock_(d) {
  needAdmin_(d);
  const b = readTable_('Bloqueos').filter(function (x) { return x.id === d.id; })[0];
  if (b) { deleteRow_('Bloqueos', b._row); return { ok: true }; }
  const found = findRow_(d.id); // bloqueos antiguos guardados en Reservas
  if (found && found.row.estado === 'bloqueo') { updateRow_(found.index, { estado: 'cancelada', canceladaPor: 'bloqueo eliminado', canceladaEn: new Date().toISOString() }); return { ok: true }; }
  return { ok: false, error: 'No encontramos ese bloqueo.' };
}

/* Ajustes y servicios editables desde el dashboard */
export function adminSaveSettings_(d) {
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
  if (Array.isArray(d.categories)) {
    const rows = readTable_('Categorias');
    const ids = new Set<string>();
    d.categories.forEach(function (cat) {
      const id = clean_(cat.id, 40);
      const nombre = clean_(cat.nombre, 80);
      if (!id || !nombre || !/^[a-z0-9_-]+$/i.test(id) || ids.has(id)) throw new Error('Cada categoría necesita nombre e identificador único.');
      ids.add(id);
      const old = rows.find((x) => x.id === id);
      const raw = String(cat.estado || '').toLowerCase();
      const estado = ['activo', 'desactivado', 'borrador'].includes(raw) ? raw
        : /^(no|false)$/i.test(String(cat.activo)) ? 'desactivado' : (old?.estado || 'activo');
      const patch = { id, nombre, orden: Math.max(0, Math.round(Number(cat.orden) || 0)), estado,
        activo: estado === 'activo' ? 'si' : 'no' };
      if (old) updateTable_('Categorias', old._row, patch); else appendRow_('Categorias', patch);
    });
  }
  if (Array.isArray(d.services)) {
    const rows = readTable_('Servicios');
    const knownCats = new Set(readTable_('Categorias').map((r) => String(r.id)));
    const indexed = new Map<string, any>();
    rows.forEach((r) => indexed.set(String(r.id), r));
    d.services.forEach((r) => indexed.set(String(r.id), r));
    const submitted = new Set<string>();

    d.services.forEach(function (sv) {
      const name = clean_(sv.nombre, 80);
      if (!name) return;
      const id = clean_(sv.id, 40) || slug_(name);
      const tipo = sv.tipo === 'grupo' ? 'grupo' : 'servicio';
      const categoriaId = clean_(sv.categoriaId, 40) || String(indexed.get(id)?.categoriaId || 'otros');
      const padreId = tipo === 'grupo' ? '' : clean_(sv.padreId, 40);
      if (!/^[a-z0-9_-]+$/i.test(id) || submitted.has(id)) throw new Error('Identificador de servicio duplicado o inválido.');
      submitted.add(id);
      if (!knownCats.has(categoriaId)) throw new Error('Selecciona una categoría válida para ' + name);
      if (padreId) {
        const parent = indexed.get(padreId);
        if (!parent || parent.tipo !== 'grupo' || String(parent.categoriaId || 'otros') !== categoriaId || padreId === id)
          throw new Error('El grupo del subservicio debe existir en la misma categoría.');
      }
      const current = rows.find((x) => x.id === id);
      const rawStatus = String(sv.estado || '').toLowerCase();
      const estado = ['activo', 'desactivado', 'borrador'].includes(rawStatus) ? rawStatus
        : /^(no|false)$/i.test(String(sv.activo)) ? 'desactivado' : (current?.estado || 'activo');
      const patch: any = {
        id: id, nombre: name, categoriaId, padreId, tipo, descripcion: clean_(sv.descripcion, 500), estado,
        consentTemplateId: clean_(sv.consentTemplateId,40),
        orden: Math.max(0, Math.round(Number(sv.orden) || 0)),
        duracionMin: Math.max(5, Math.round(Number(sv.duracionMin) || 30)),
        precioRD: Math.max(0, Math.round(Number(sv.precioRD) || 0)),
        precioDesde: /^(si|sí|true)$/i.test(String(sv.precioDesde)) ? 'si' : 'no',
        activo: estado === 'activo' ? 'si' : 'no',
        volverDias: Math.max(0, Math.round(Number(sv.volverDias) || 0)),
        depositoPct: Math.max(0, Math.min(100, Math.round(Number(sv.depositoPct === '' || sv.depositoPct == null ? 50 : sv.depositoPct) || 0))),
        retoqueDias: Math.max(0, Math.round(Number(sv.retoqueDias) || 0)),
        consentimiento: /^(si|sí|true)$/i.test(String(sv.consentimiento)) ? 'si' : 'no',
      };
      const r = rows.filter(function (x) { return x.id === id; })[0];
      if (r) updateTable_('Servicios', r._row, patch); else appendRow_('Servicios', patch);
    });
  }
  resetCaches_();
  return adminData_(d);
}

/* Fichas de clientas */
export function adminSaveClient_(d) {
  needAdmin_(d);
  const clave = clean_(d.clave, 120);
  if (!clave) return { ok: false, error: 'Falta la clienta.' };
  const cv = client_({ name: d.nombre, phone: d.telefono, email: d.correo }, false);
  if (!cv.ok) return { ok: false, error: cv.error };
  const patch: any = {
    clave: clave, nombre: cv.name, telefono: cv.phone, correo: cv.email,
    notas: clean_(d.notas, 3000), cumpleanos: monthDay_(d.cumpleanos), actualizada: new Date().toISOString(),
  };
  const r = readTable_('Clientas').filter(function (x) { return x.clave === clave; })[0];
  if (r) updateTable_('Clientas', r._row, patch); else appendRow_('Clientas', patch);
  return { ok: true, client: patch };
}

export async function adminUpload_(d) {
  needAdmin_(d);
  const clave = clean_(d.clave, 120);
  const tipo = FILE_TYPES.indexOf(d.tipo) >= 0 ? d.tipo : 'otro';
  const mime = String(d.mime || '');
  if (!clave) return { ok: false, error: 'Falta la clienta.' };
  if (FILE_MIMES.indexOf(mime) < 0) return { ok: false, error: 'Formato no permitido. Usa JPG, PNG, WEBP o PDF.' };
  const bytes = b64ToBytes(String(d.data || ''));
  if (!bytes.length) return { ok: false, error: 'El archivo está vacío.' };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: 'El archivo pesa más de 12 MB.' };
  const fecha = isDateKey_(d.fecha) ? d.fecha : todayKey_();
  const nombre = clean_(d.nombre, 120) || (tipo + (mime === 'application/pdf' ? '.pdf' : '.jpg'));
  const path = await putFile(PRIVATE_BUCKET, filePath(clave, tipo + '-' + nombre), bytes, mime);
  const row: any = {
    id: 'ARC-' + uuid().slice(0, 8).toUpperCase(), clave: clave, tipo: tipo, nombre: nombre, mime: mime,
    driveId: path, citaId: clean_(d.citaId, 40), fecha: fecha, nota: clean_(d.nota, 300), creada: new Date().toISOString(),
  };
  appendRow_('Archivos', row);
  return { ok: true, file: strip_(row) };
}

export async function adminFile_(d) {
  needAdmin_(d);
  const f = readTable_('Archivos').filter(function (x) { return x.id === d.id; })[0];
  if (!f) return { ok: false, error: 'No encontramos ese archivo.' };
  const bytes = await getFile(PRIVATE_BUCKET, f.driveId);
  return { ok: true, mime: f.mime, name: f.nombre, data: bytesToB64(bytes) };
}

export function adminDeleteFile_(d) {
  needAdmin_(d);
  const f = readTable_('Archivos').filter(function (x) { return x.id === d.id; })[0];
  if (!f) return { ok: false, error: 'No encontramos ese archivo.' };
  removeLater(PRIVATE_BUCKET, [f.driveId]);
  deleteRow_('Archivos', f._row);
  return { ok: true };
}

/* Promociones y códigos */
export function adminSavePromo_(d) {
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
  const id = p.id || ('PRM-' + uuid().slice(0, 6).toUpperCase());
  if (codigo) {
    const clash = readTable_('Promociones').some(function (x) { return x.id !== id && normCode_(x.codigo) === codigo; }) || !!findGift_(codigo);
    if (clash) return { ok: false, error: 'Ese código ya existe.' };
  }
  const servicios = (Array.isArray(p.servicios) ? p.servicios : String(p.servicios || 'todos').split(',')).map(function (x) { return String(x).trim(); }).filter(Boolean);
  const patch: any = {
    id: id, nombre: nombre, tipo: tipo, codigo: codigo, servicios: servicios.length ? servicios.join(',') : 'todos',
    descuentoTipo: dt, valor: valor, desde: isDateKey_(p.desde) ? p.desde : '', hasta: isDateKey_(p.hasta) ? p.hasta : '',
    usosMax: Math.max(0, Math.round(Number(p.usosMax) || 0)), activo: /^(no|false)$/i.test(String(p.activo)) ? 'no' : 'si',
  };
  const r = readTable_('Promociones').filter(function (x) { return x.id === id; })[0];
  if (r) updateTable_('Promociones', r._row, patch);
  else { patch.usos = 0; patch.creada = new Date().toISOString(); appendRow_('Promociones', patch); }
  return { ok: true, promo: patch };
}

export function adminDeletePromo_(d) {
  needAdmin_(d);
  const r = readTable_('Promociones').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos esa promoción.' };
  deleteRow_('Promociones', r._row);
  return { ok: true };
}

/* Gastos */
export function adminSaveExpense_(d) {
  needAdmin_(d);
  const e = d.expense || {};
  const monto = Math.round(Number(e.montoRD) || 0);
  if (!clean_(e.concepto, 120) || monto <= 0) return { ok: false, error: 'Escribe el concepto y el monto.' };
  const patch: any = {
    id: e.id || ('GST-' + uuid().slice(0, 6).toUpperCase()),
    fecha: isDateKey_(e.fecha) ? e.fecha : todayKey_(), concepto: clean_(e.concepto, 120),
    categoria: clean_(e.categoria, 40) || 'Otros', montoRD: monto, metodo: clean_(e.metodo, 30) || 'efectivo',
  };
  const r = readTable_('Gastos').filter(function (x) { return x.id === patch.id; })[0];
  if (r) updateTable_('Gastos', r._row, patch); else { patch.creada = new Date().toISOString(); appendRow_('Gastos', patch); }
  return { ok: true, expense: patch };
}

export function adminDeleteExpense_(d) {
  needAdmin_(d);
  const r = readTable_('Gastos').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos ese gasto.' };
  deleteRow_('Gastos', r._row);
  return { ok: true };
}

export async function adminPublishGallery_(d) {
  needAdmin_(d);
  if (!d.permiso) return { ok: false, error: 'Confirma que la clienta dio permiso para publicar sus fotos.' };
  const files = readTable_('Archivos');
  const a = files.filter(function (x) { return x.id === d.antesId; })[0];
  const b = files.filter(function (x) { return x.id === d.despuesId; })[0];
  if (!a || !b) return { ok: false, error: 'Elige una foto de antes y una de después.' };
  if (a.mime === 'application/pdf' || b.mime === 'application/pdf') return { ok: false, error: 'La galería solo acepta fotos.' };
  const servicio = clean_(d.servicio, 80);
  const id = 'GAL-' + uuid().slice(0, 6).toUpperCase();
  const antes = await copyFile(PRIVATE_BUCKET, a.driveId, PUBLIC_BUCKET, 'galeria/' + id + '-antes' + ext_(a.mime), a.mime);
  const despues = await copyFile(PRIVATE_BUCKET, b.driveId, PUBLIC_BUCKET, 'galeria/' + id + '-despues' + ext_(b.mime), b.mime);
  const row: any = {
    id: id, servicio: servicio, antesId: antes, despuesId: despues, antesUrl: publicUrl(antes), despuesUrl: publicUrl(despues),
    texto: clean_(d.texto, 200), orden: Number(d.orden) || 0, visible: 'si', creada: new Date().toISOString(),
  };
  appendRow_('Galeria', row);
  return { ok: true, item: strip_(row) };
}

export function adminSaveGallery_(d) {
  needAdmin_(d);
  const r = readTable_('Galeria').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos esa foto de la galería.' };
  const patch: any = {};
  if (d.servicio != null) patch.servicio = clean_(d.servicio, 80);
  if (d.texto != null) patch.texto = clean_(d.texto, 200);
  if (d.orden != null) patch.orden = Number(d.orden) || 0;
  if (d.visible != null) patch.visible = d.visible ? 'si' : 'no';
  updateTable_('Galeria', r._row, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  return { ok: true, item: strip_(r) };
}

export function adminDeleteGallery_(d) {
  needAdmin_(d);
  const r = readTable_('Galeria').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos esa foto de la galería.' };
  removeLater(PUBLIC_BUCKET, [r.antesId, r.despuesId]);
  deleteRow_('Galeria', r._row);
  return { ok: true };
}

/* Reseñas reales copiadas de tu perfil de Google */
export function adminSaveReview_(d) {
  needAdmin_(d);
  const v = d.review || {};
  const autora = clean_(v.autora, 60), texto = clean_(v.texto, 800);
  if (!autora || !texto) return { ok: false, error: 'Escribe el nombre y el texto de la reseña.' };
  const patch: any = {
    id: v.id || ('RES-' + uuid().slice(0, 6).toUpperCase()), autora: autora, texto: texto,
    estrellas: Math.max(1, Math.min(5, Math.round(Number(v.estrellas) || 5))), fecha: isDateKey_(v.fecha) ? v.fecha : todayKey_(),
    visible: v.visible === false || /^no$/i.test(String(v.visible)) ? 'no' : 'si', orden: Number(v.orden) || 0,
  };
  const r = readTable_('Resenas').filter(function (x) { return x.id === patch.id; })[0];
  if (r) updateTable_('Resenas', r._row, patch); else { patch.creada = new Date().toISOString(); appendRow_('Resenas', patch); }
  return { ok: true, review: patch };
}

export function adminDeleteReview_(d) {
  needAdmin_(d);
  const r = readTable_('Resenas').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos esa reseña.' };
  deleteRow_('Resenas', r._row);
  return { ok: true };
}

/* Foto de "Conoce a Majo" */
export async function adminUploadPublic_(d) {
  needAdmin_(d);
  const mime = String(d.mime || '');
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mime) < 0) return { ok: false, error: 'Usa una foto JPG, PNG o WEBP.' };
  const bytes = b64ToBytes(String(d.data || ''));
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) return { ok: false, error: 'La foto está vacía o pesa más de 12 MB.' };
  const path = await putFile(PUBLIC_BUCKET, 'web/majo-' + todayKey_() + '-' + uuid().slice(0, 6) + ext_(mime), bytes, mime);
  const url = publicUrl(path);
  const rows = readTable_('Ajustes');
  const old = rows.filter(function (x) { return x.clave === 'majoFotoUrl'; })[0];
  if (old) {
    const oldPath = publicPathFromUrl(old.valor);
    if (oldPath) removeLater(PUBLIC_BUCKET, [oldPath]);
    updateTable_('Ajustes', old._row, { valor: url });
  } else appendRow_('Ajustes', { clave: 'majoFotoUrl', valor: url, 'qué es': '' });
  return { ok: true, url: url };
}

export function adminSendReminder_(d) {
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

export function sampleRow_(s, email): any {
  const date = addDaysKey_(todayKey_(), 1);
  return {
    id: 'MJB-EJEMPLO', estado: 'confirmada', fecha: date, hora: '10:00', inicio: date + 'T14:00:00.000Z', fin: date + 'T16:30:00.000Z', duracionMin: 150,
    servicios: 'Micropigmentación', serviciosJson: JSON.stringify([{ id: 'micropigmentacion', name: 'Micropigmentación', price: 12000 }]),
    subtotalRD: 12000, descuentoRD: 0, totalRD: 12000, depositoRD: 6000, depositoUSD: '95.24', saldoRD: 6000, metodoDeposito: 'paypal', paypalCaptura: 'X',
    clienta: 'Ana Pérez', telefono: '809 555 0000', correo: email, firmaToken: 'ejemplo', reembolso: 'reembolsado (ejemplo)',
  };
}

export function emailSample_(tipo, s, email): any {
  const r = sampleRow_(s, email);
  const svc: any = { id: 'micropigmentacion', name: 'Micropigmentación', retoqueDays: 45 };
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

export function adminEmailPreview_(d) {
  const u = needAdmin_(d);
  const m = emailSample_(d.tipo, settings_(), u.email);
  if (!m) return { ok: false, error: 'Tipo de correo no válido.' };
  return { ok: true, subject: m.subject, html: m.html };
}

export function adminEmailTest_(d) {
  const u = needAdmin_(d);
  const m = emailSample_(d.tipo, settings_(), u.email);
  if (!m) return { ok: false, error: 'Tipo de correo no válido.' };
  if (!safeMail_(u.email, '[Prueba] ' + m.subject, m.html, { tipo: 'prueba', ref: d.tipo })) return { ok: false, error: 'No se pudo enviar. Revisa el límite diario de Gmail.' };
  return { ok: true, to: u.email };
}

/* El estudio confirma (llegó el dinero) o rechaza la transferencia */
export function adminTransferReview_(d) {
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
    const patch: any = { estado: 'confirmada', depositoPagado: now, revisadaEn: now, retenidaHasta: '' };
    confirmPaid_(found.index, r, patch);
    const m = mailConfirmed_(r, s, false);
    safeMail_(r.correo, m.subject, m.html, { tipo: 'confirmacion', ref: r.id });
    return { ok: true, item: adminRow_(r) };
  }
  if (d.decision === 'rechazar') {
    const motivo = clean_(d.reason, 200) || 'No recibimos la transferencia.';
    const patch: any = { estado: 'cancelada', canceladaEn: now, canceladaPor: 'estudio: transferencia rechazada', revisadaEn: now, retenidaHasta: '',
      notaInterna: clean_((r.notaInterna ? r.notaInterna + ' · ' : '') + 'Transferencia rechazada: ' + motivo, 500), reembolso: 'sin reembolso (transferencia no recibida)' };
    updateRow_(found.index, patch);
    Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
    if (d.notify !== false) { const m = mailTransferRejected_(r, s, motivo); safeMail_(r.correo, m.subject, m.html, { tipo: 'transferencia', ref: r.id }); }
    notifyWaitlist_(r.fecha);
    return { ok: true, item: adminRow_(r) };
  }
  return { ok: false, error: 'Elige confirmar o rechazar.' };
}

/* Cuentas bancarias (dashboard → Ajustes) */
export function adminSaveAccount_(d) {
  needAdmin_(d);
  const a = d.account || {};
  const banco = clean_(a.banco, 60), numero = clean_(a.numero, 40), titular = clean_(a.titular, 80);
  if (!banco || !numero || !titular) return { ok: false, error: 'Escribe el banco, el número de cuenta y el titular.' };
  const rows = readOpt_('Cuentas');
  const patch: any = {
    banco: banco, tipo: clean_(a.tipo, 40) || 'Ahorros', numero: numero, titular: titular, documento: clean_(a.documento, 30), nota: clean_(a.nota, 160),
    activa: /^(no|false)$/i.test(String(a.activa)) ? 'no' : 'si', orden: Math.round(Number(a.orden) || 0),
  };
  const r = a.id ? rows.filter(function (x) { return x.id === a.id; })[0] : null;
  if (r) { updateTable_('Cuentas', r._row, patch); patch.id = r.id; patch.creada = r.creada; }
  else {
    patch.id = 'CTA-' + uuid().slice(0, 6).toUpperCase(); patch.creada = new Date().toISOString();
    if (!a.orden) patch.orden = rows.length + 1;
    appendRow_('Cuentas', patch);
  }
  return { ok: true, account: patch, accounts: readOpt_('Cuentas').map(strip_) };
}

export function adminDeleteAccount_(d) {
  needAdmin_(d);
  const r = readOpt_('Cuentas').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos esa cuenta.' };
  deleteRow_('Cuentas', r._row);
  return { ok: true, accounts: readOpt_('Cuentas').map(strip_) };
}

export function adminResolveErrors_(d) {
  needAdmin_(d);
  const rows = readOpt_('Errores');
  const now = new Date().toISOString();
  rows.forEach(function (r) {
    if (r.resuelto) return;
    if (d.all || String(r._row) === String(d.row)) updateTable_('Errores', r._row, { resuelto: now });
  });
  return { ok: true, errors: readOpt_('Errores').slice(-150).reverse().map(function (x) { const o = strip_(x); o.row = x._row; return o; }) };
}

function ext_(mime) { return mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'application/pdf' ? '.pdf' : '.jpg'; }
/* Enlace al editor de tablas de Supabase (para ver los datos crudos) */
function dbUrl_() {
  const m = env_('SUPABASE_URL').match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  return m ? 'https://supabase.com/dashboard/project/' + m[1] + '/editor' : '';
}
