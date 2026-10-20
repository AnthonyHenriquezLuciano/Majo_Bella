/* MAJOBELLA · Reservas de las clientas: apartar, pagar el depósito, consultar, cancelar, cambiar la fecha,
   pagar el saldo y subir el comprobante de una transferencia */
import { cx } from './ctx.ts';
import { appendRow_, readTable_, updateTable_ } from './db.ts';
import { catalogItems_, findRow_, rows_, settings_, settingsCached_, updateRow_ } from './data.ts';
import { conflicts_, schedule_, slotProblem_ } from './schedule.ts';
import { applyBono_, applyGift_, loyaltyFor_, pricing_, pricingOut_, usePromo_ } from './pricing.ts';
import { changesMax_, refundPending_, transferInfo_ } from './catalog.ts';
import { firstCapture_, orderBody, paypal_, tryRefund_ } from './paypal.ts';
import { authorized_, human_, limited_, noteFail_, verifyIdToken_ } from './security.ts';
import { calendarCancel_, calendarCreate_, calendarMove_ } from './google.ts';
import { adminTo_, mailAdminRescheduled_, mailAdminTransfer_, mailTransferReceived_, notifyCancelled_, notifyConfirmed_, notifyRescheduled_, safeMail_ } from './mail.ts';
import { consentState_ } from './consent.ts';
import { markWaitlistBooked_, notifyWaitlist_ } from './waitlist.ts';
import { logError_ } from './errors.ts';
import { PRIVATE_BUCKET, filePath, putFile } from './storage.ts';
import { NOT_HUMAN, TOO_MANY, TZ, UTC_OFFSET } from './constants.ts';
import { b64ToBytes, clean_, clientKey_, client_, fmtDate, hash_, isDateKey_, monthDay_, msg_, normCode_, num_, safeJson_, todayKey_, usd_, uuid, whenText_ } from './util.ts';

export async function hold_(d) {
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
  const id = 'MJB-' + fmtDate(start, TZ, 'yyMMdd') + '-' + uuid().slice(0, 6).toUpperCase();
  const token = uuid();
  const row: any = {
    id: id, creada: new Date().toISOString(), estado: 'retenida',
    fecha: d.date, hora: d.time, inicio: start.toISOString(), fin: end.toISOString(), duracionMin: minutes,
    servicios: items.map(function (x) { return x.name; }).join(' + '),
    serviciosJson: JSON.stringify(items.map(function (x) { return { id: x.id, name: x.name, price: x.price, durationMinutes: x.durationMinutes }; })),
    subtotalRD: p.subtotal, descuentoRD: p.discount, promoId: p.promo ? p.promo.id : '', codigo: p.codeStatus === 'ok' ? normCode_(d.code) : '',
    giftCodigo: p.gift ? p.gift.codigo : '', giftRD: p.gift ? p.giftApplied : 0,
    bonoCodigo: p.bono ? p.bono.codigo : '', bonoRD: p.bono ? p.giftApplied : 0, fidelidad: p.loyalApplied ? 'si' : '',
    cumpleanos: monthDay_(c.birthday), firmaToken: uuid().replace(/-/g, '').slice(0, 20),
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
  const order = await paypal_('post', '/v2/checkout/orders', {
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

export async function capture_(d) {
  const found = findRow_(d.id);
  if (!found) return { ok: false, error: 'No encontramos la reserva.' };
  const r = found.row;
  if (r.paypalOrden !== d.orderId) return { ok: false, error: 'El pago no corresponde a esta reserva.' };
  if (r.estado === 'confirmada' && r.paypalCaptura) return { ok: true, appointment: publicRow_(r) };
  if (r.estado !== 'retenida' && r.estado !== 'expirada') return { ok: false, error: 'Esta reserva ya no está disponible.' };

  const result = await paypal_('post', '/v2/checkout/orders/' + encodeURIComponent(d.orderId) + '/capture', {}, r.id + '-capture');
  const cap = firstCapture_(result);
  if (!cap || cap.status !== 'COMPLETED') return { ok: false, error: 'PayPal no completó el pago. No se te cobró.' };
  if (cap.amount.currency_code !== 'USD' || Number(cap.amount.value) + 0.001 < Number(r.depositoUSD)) {
    return { ok: false, error: 'El monto pagado no coincide con el depósito. Escríbenos por WhatsApp.' };
  }

  const patch: any = { paypalCaptura: cap.id, depositoPagado: new Date().toISOString() };
  // Si la retención venció y otra persona tomó el horario, se devuelve el dinero
  const start = new Date(r.inicio), end = new Date(r.fin);
  if (conflicts_(start, end, r.id).length) {
    const refund = await tryRefund_(cap.id, r.id + '-conflict');
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
export function confirmPaid_(index, r, patch) {
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
export function paidButFailed_(what, captureId, ref, err) {
  logError_('pago', 'Se cobró ' + what + ' (PayPal ' + captureId + '), pero hubo un error al guardarlo: ' + msg_(err) + '. Revisa la venta en PayPal y regístrala a mano.', ref, '', true);
  return { ok: false, error: 'Recibimos tu pago, pero hubo un problema al registrarlo. Ya nos llegó el aviso y te contactaremos. Guarda este código: ' + ref };
}

/* La clienta cerró PayPal sin pagar: se libera el horario */
export function release_(d) {
  const found = findRow_(d.id);
  if (!found || !authorized_(found.row, d)) return { ok: true };
  if (found.row.estado === 'retenida') updateRow_(found.index, { estado: 'expirada' });
  return { ok: true };
}

export async function balanceOrder_(d) {
  const found = findRow_(d.id);
  if (!found || !authorized_(found.row, d)) return { ok: false, error: 'No encontramos esa cita.' };
  const r = found.row;
  if (r.estado !== 'confirmada' && r.estado !== 'completada') return { ok: false, error: 'Esta cita no tiene saldo por pagar.' };
  if (r.saldoEstado === 'pagado' || !(Number(r.saldoRD) > 0)) return { ok: false, error: 'El saldo ya está pagado.' };
  if (new Date(r.inicio).getTime() > Date.now() + 15 * 60000) return { ok: false, error: 'El saldo se paga al terminar tu cita.' };
  const rate = num_(settings_().tasaUSD, 63);
  const amount = usd_(Number(r.saldoRD), rate);
  const order = await paypal_('post', '/v2/checkout/orders', {
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

export async function balanceCapture_(d) {
  const found = findRow_(d.id);
  if (!found || !authorized_(found.row, d)) return { ok: false, error: 'No encontramos esa cita.' };
  const r = found.row;
  if (r.saldoEstado === 'pagado') return { ok: true, appointment: publicRow_(r) };
  if (r.saldoOrden !== d.orderId) return { ok: false, error: 'El pago no corresponde a esta cita.' };
  const cap = firstCapture_(await paypal_('post', '/v2/checkout/orders/' + encodeURIComponent(d.orderId) + '/capture', {}, r.id + '-saldo-' + d.orderId));
  if (!cap || cap.status !== 'COMPLETED') return { ok: false, error: 'PayPal no completó el pago.' };
  const patch: any = { saldoEstado: 'pagado', saldoMetodo: 'paypal', saldoPagado: new Date().toISOString(), saldoCaptura: cap.id };
  try { updateRow_(found.index, patch); } catch (err) { return paidButFailed_('el saldo de la cita ' + r.id, cap.id, r.id, err); }
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  return { ok: true, appointment: publicRow_(r) };
}

export function myAppointments_(d) {
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
export function lookup_(d) {
  const want = (d.items || []).slice(0, 50);
  const all = rows_();
  const items = [];
  want.forEach(function (w) {
    const r = all.filter(function (x) { return x.id === w.id; })[0];
    if (r && w.token && r.tokenHash === hash_(w.token)) items.push(publicRow_(r));
  });
  return { ok: true, items: items };
}

export async function cancel_(d) {
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
  const patch: any = { estado: 'cancelada', canceladaEn: new Date().toISOString(), canceladaPor: 'clienta' };
  patch.reembolso = !refundable ? 'no aplica (menos de ' + num_(s.horasCancelacion, 24) + ' h)'
    : r.paypalCaptura ? await tryRefund_(r.paypalCaptura, r.id + '-refund')
      : paidOutside ? 'pendiente: devolver por ' + (r.metodoDeposito === 'efectivo' ? 'efectivo' : 'transferencia') : 'sin depósito pagado';
  if (r.saldoCaptura) patch.reembolso += ' · saldo: ' + await tryRefund_(r.saldoCaptura, r.id + '-refund-saldo');
  if (refundable && wasConfirmed) { applyGift_(r, +1); applyBono_(r, +1); }
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  calendarCancel_(r, s);
  const refunded = /^reembolsado/.test(patch.reembolso) ? true : (/^pendiente/.test(patch.reembolso) ? 'manual' : false);
  notifyCancelled_(r, s, refunded);
  notifyWaitlist_(r.fecha);
  return { ok: true, refunded: refunded === true, refundManual: refunded === 'manual', appointment: publicRow_(r) };
}

export function reschedule_(d) {
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
  const patch: any = { fecha: d.date, hora: d.time, inicio: start.toISOString(), fin: end.toISOString(), reprogramadaDe: r.fecha + ' ' + r.hora, recordatorio: '', cambios: used + 1 };
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  calendarMove_(r, s);
  notifyRescheduled_(r, s, before);
  const a = mailAdminRescheduled_(r, s, before);
  safeMail_(adminTo_(s), a.subject, a.html, { tipo: 'aviso', ref: r.id });
  notifyWaitlist_(oldDate);
  return { ok: true, appointment: publicRow_(r) };
}

/* La clienta sube el comprobante (imagen o PDF) */
export async function transferProof_(d) {
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
  const bytes = b64ToBytes(String(d.data || ''));
  if (!bytes.length) return { ok: false, error: 'El archivo está vacío.' };
  if (bytes.length > 8 * 1024 * 1024) return { ok: false, error: 'El archivo pesa más de 8 MB. Toma una captura de pantalla del comprobante.' };
  const accounts = transferInfo_(settings_()).accounts;
  const cuenta = accounts.filter(function (a) { return a.id === d.accountId; })[0] || (accounts.length === 1 ? accounts[0] : null);
  const key = clientKey_(r.correo, r.telefono, r.clienta);
  const ext = mime === 'application/pdf' ? '.pdf' : (mime === 'image/png' ? '.png' : '.jpg');
  const path = await putFile(PRIVATE_BUCKET, filePath(key, 'comprobante-' + r.id + ext), bytes, mime);
  const arc: any = {
    id: 'ARC-' + uuid().slice(0, 8).toUpperCase(), clave: key, tipo: 'comprobante', nombre: 'Comprobante ' + r.id + ext, mime: mime,
    driveId: path, citaId: r.id, fecha: todayKey_(), nota: 'Transferencia del depósito' + (cuenta ? ' · ' + cuenta.bank : '') + (d.ref ? ' · ref. ' + clean_(d.ref, 60) : ''), creada: new Date().toISOString(),
  };
  appendRow_('Archivos', arc);
  const replaced = r.estado === 'por-confirmar';
  const patch: any = { estado: 'por-confirmar', comprobanteId: arc.id, comprobanteEn: new Date().toISOString(), cuentaId: cuenta ? cuenta.id : '', transferenciaRef: clean_(d.ref, 60), retenidaHasta: '' };
  updateRow_(found.index, patch);
  Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
  const s = settings_();
  if (!replaced) { const m = mailTransferReceived_(r, s); safeMail_(r.correo, m.subject, m.html, { tipo: 'transferencia', ref: r.id }); }
  const a = mailAdminTransfer_(r, s, cuenta, replaced);
  safeMail_(adminTo_(s), a.subject, a.html, { tipo: 'aviso', ref: r.id, attachments: bytes.length < 5 * 1024 * 1024 ? [{ name: arc.nombre, mime: mime, data: String(d.data).replace(/^data:[^,]*,/, '') }] : null });
  return { ok: true, appointment: publicRow_(r) };
}

/* Guarda el cumpleaños de la reserva en la ficha de la clienta */
export function saveBirthday_(r) {
  const md = monthDay_(r.cumpleanos);
  if (!md) return;
  try {
    const key = clientKey_(r.correo, r.telefono, r.clienta);
    const c = readTable_('Clientas').filter(function (x) { return x.clave === key; })[0];
    if (c) { if (monthDay_(c.cumpleanos) !== md) updateTable_('Clientas', c._row, { cumpleanos: md, actualizada: new Date().toISOString() }); }
    else appendRow_('Clientas', { clave: key, nombre: r.clienta, telefono: r.telefono, correo: r.correo, notas: '', cumpleanos: md, actualizada: new Date().toISOString() });
  } catch (e) { /* no debe romper la reserva */ }
}

export function publicRow_(r): any {
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

export function adminRow_(r): any {
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
