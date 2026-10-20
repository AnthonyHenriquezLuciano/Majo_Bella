/* MAJOBELLA · Tarjetas de regalo y paquetes de sesiones (venta en la web con PayPal y en el estudio) */
import { appendRow_, deleteRow_, readOpt_, readTable_, updateTable_ } from './db.ts';
import { servicesMap_, settings_ } from './data.ts';
import { codeTaken_, findBono_, findGift_ } from './pricing.ts';
import { firstCapture_, paypal_ } from './paypal.ts';
import { human_, limited_, needAdmin_, noteFail_, verifyIdToken_ } from './security.ts';
import { paidButFailed_ } from './booking.ts';
import { adminTo_, giftCardHtml_, layout_, mailBono_, mailUrl_, mailWallet_, safeMail_ } from './mail.ts';
import { cacheGet, cachePut } from './db.ts';
import { NOT_HUMAN, TOO_MANY } from './constants.ts';
import { addDaysKey_, clean_, client_, esc_, fmtDate, hash_, isDateKey_, money_, normCode_, num_, properName_, randCode_, strip_, todayKey_, usd_, uuid } from './util.ts';

export async function giftOrder_(d) {
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
  const id = 'TRG-' + uuid().slice(0, 6).toUpperCase();
  const order = await paypal_('post', '/v2/checkout/orders', {
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

export async function giftCapture_(d) {
  const g = readTable_('Tarjetas').filter(function (x) { return x.id === d.id; })[0];
  if (!g || g.paypalOrden !== d.orderId) return { ok: false, error: 'No encontramos esa compra.' };
  if (g.estado !== 'pendiente' && g.paypalCaptura) return { ok: true, gift: giftOut_(g) };
  const cap = firstCapture_(await paypal_('post', '/v2/checkout/orders/' + encodeURIComponent(d.orderId) + '/capture', {}, g.id + '-capture'));
  if (!cap || cap.status !== 'COMPLETED') return { ok: false, error: 'PayPal no completó el pago. No se te cobró.' };
  try { return giftActivate_(g, cap); } catch (err) { return paidButFailed_('una tarjeta de regalo de RD$ ' + money_(g.montoRD) + ' (' + g.id + ')', cap.id, g.id, err); }
}

export function giftActivate_(g, cap) {
  const s = settings_();
  let codigo = '';
  for (let i = 0; i < 6 && (!codigo || findGift_(codigo)); i++) codigo = 'MJB-' + randCode_(4) + '-' + randCode_(4);
  const today = todayKey_();
  const p = today.split('-').map(Number);
  const vence = fmtDate(new Date(Date.UTC(p[0], p[1] - 1, p[2] + num_(s.tarjetaVenceDias, 365))), 'UTC', 'yyyy-MM-dd');
  const patch: any = { codigo: codigo, saldoRD: g.montoRD, vendida: today, vence: vence, estado: 'activa', paypalCaptura: cap.id };
  updateTable_('Tarjetas', g._row, patch);
  Object.keys(patch).forEach(function (k) { g[k] = patch[k]; });
  notifyGift_(g, s);
  return { ok: true, gift: giftOut_(g) };
}

export function giftOut_(g): any {
  return { codigo: g.codigo, montoRD: Number(g.montoRD) || 0, para: g.para, de: g.comprador, mensaje: g.mensaje, vence: g.vence };
}

export function notifyGift_(g, s) {
  const card = giftCardHtml_(g, s);
  const how = 'Se usa escribiendo el código al reservar en la web, en el resumen de la cita.';
  safeMail_(g.correoComprador, 'Tu tarjeta de regalo MAJOBELLA · ' + g.codigo, layout_(s, {
    kicker: 'Tarjeta de regalo', title: '¡Gracias por tu compra!', intro: 'Esta es la tarjeta de regalo. Puedes reenviar este correo o compartir el código.',
    body: card + '<p style="margin:0">' + how + '</p>', cta: { text: 'Ir a la web', url: mailUrl_(s, 'reservar.html') },
  }), { tipo: 'tarjeta', ref: g.id });
  if (g.correoPara) {
    safeMail_(g.correoPara, (g.comprador ? g.comprador + ' te regaló' : 'Te regalaron') + ' una experiencia en MAJOBELLA', layout_(s, {
      kicker: 'Un regalo para ti', title: (g.para ? g.para + ', tienes' : 'Tienes') + ' un regalo', intro: (g.comprador ? esc_(g.comprador) + ' te regaló' : 'Te regalaron') + ' una tarjeta para usar en MAJOBELLA Beauty Studio.',
      body: card + '<p style="margin:0">' + how + '</p>', cta: { text: 'Reservar mi cita', url: mailUrl_(s, 'reservar.html') },
    }), { tipo: 'tarjeta', ref: g.id });
  }
  safeMail_(adminTo_(s), 'Tarjeta de regalo vendida en la web · RD$ ' + money_(g.montoRD), layout_(s, {
    kicker: 'Tarjeta vendida', title: 'RD$ ' + money_(g.montoRD),
    details: [['Código', esc_(g.codigo)], ['De', esc_((g.comprador || '—') + ' · ' + g.correoComprador)], ['Para', esc_(g.para || '—')]],
    cta: { text: 'Abrir dashboard', url: mailUrl_(s, 'admin.html#promos') },
  }), { tipo: 'aviso', ref: g.id });
}

/* Tarjetas de regalo */
export function adminSaveGift_(d) {
  needAdmin_(d);
  const g = d.gift || {};
  if (g.id) {
    const r = readTable_('Tarjetas').filter(function (x) { return x.id === g.id; })[0];
    if (!r) return { ok: false, error: 'No encontramos esa tarjeta.' };
    const patch: any = { comprador: properName_(clean_(g.comprador, 80)), para: properName_(clean_(g.para, 80)), mensaje: clean_(g.mensaje, 300), vence: isDateKey_(g.vence) ? g.vence : '' };
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
  const row: any = {
    id: 'TRG-' + uuid().slice(0, 6).toUpperCase(), codigo: codigo, montoRD: monto, saldoRD: monto,
    comprador: properName_(clean_(g.comprador, 80)), para: properName_(clean_(g.para, 80)), mensaje: clean_(g.mensaje, 300),
    metodoPago: ['efectivo', 'transferencia', 'paypal', 'cortesia'].indexOf(g.metodoPago) >= 0 ? g.metodoPago : 'efectivo',
    vendida: isDateKey_(g.vendida) ? g.vendida : todayKey_(), vence: isDateKey_(g.vence) ? g.vence : '',
    estado: 'activa', creada: new Date().toISOString(),
  };
  appendRow_('Tarjetas', row);
  return { ok: true, gift: strip_(row) };
}

export function newBonoCode_() {
  let code = '';
  for (let i = 0; i < 6 && (!code || codeTaken_(code)); i++) code = 'PAQ-' + randCode_(4) + '-' + randCode_(4);
  return code;
}

export function adminSavePackage_(d) {
  needAdmin_(d);
  const k = d.pkg || {};
  const nombre = clean_(k.nombre, 80);
  if (!nombre) return { ok: false, error: 'Ponle un nombre al paquete.' };
  if (!servicesMap_()[k.servicio]) return { ok: false, error: 'Elige el servicio del paquete.' };
  const sesiones = Math.round(Number(k.sesiones) || 0), precio = Math.round(Number(k.precioRD) || 0);
  if (sesiones < 1 || sesiones > 50) return { ok: false, error: 'Revisa el número de sesiones.' };
  if (precio <= 0) return { ok: false, error: 'Escribe el precio del paquete.' };
  const patch: any = {
    id: k.id || ('PKG-' + uuid().slice(0, 6).toUpperCase()), nombre: nombre, servicio: k.servicio, sesiones: sesiones, precioRD: precio,
    venceDias: Math.max(0, Math.round(Number(k.venceDias) || 0)), descripcion: clean_(k.descripcion, 300),
    enWeb: /^(no|false)$/i.test(String(k.enWeb)) ? 'no' : 'si', activo: /^(no|false)$/i.test(String(k.activo)) ? 'no' : 'si',
  };
  const r = readTable_('Paquetes').filter(function (x) { return x.id === patch.id; })[0];
  if (r) updateTable_('Paquetes', r._row, patch); else { patch.creada = new Date().toISOString(); appendRow_('Paquetes', patch); }
  return { ok: true, pkg: patch };
}

export function adminDeletePackage_(d) {
  needAdmin_(d);
  const r = readTable_('Paquetes').filter(function (x) { return x.id === d.id; })[0];
  if (!r) return { ok: false, error: 'No encontramos ese paquete.' };
  deleteRow_('Paquetes', r._row);
  return { ok: true };
}

export function createBono_(k, c, extra) {
  const today = todayKey_();
  const row: any = {
    id: 'BON-' + uuid().slice(0, 6).toUpperCase(), codigo: extra.codigo || '', paqueteId: k.id, nombre: k.nombre, servicio: k.servicio,
    sesiones: Number(k.sesiones) || 1, usadas: 0, clienta: c.name, telefono: c.phone, correo: c.email,
    montoRD: extra.montoRD != null ? extra.montoRD : Number(k.precioRD) || 0, metodoPago: extra.metodoPago || 'efectivo',
    vendida: extra.estado === 'pendiente' ? '' : today, vence: extra.estado === 'pendiente' ? '' : (Number(k.venceDias) > 0 ? addDaysKey_(today, Number(k.venceDias)) : ''),
    estado: extra.estado || 'activo', paypalOrden: extra.paypalOrden || '', creada: new Date().toISOString(),
  };
  appendRow_('Bonos', row);
  return row;
}

export function adminSellBono_(d) {
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

export function adminSaveBono_(d) {
  needAdmin_(d);
  const b = readTable_('Bonos').filter(function (x) { return x.id === d.id; })[0];
  if (!b) return { ok: false, error: 'No encontramos ese paquete.' };
  const patch: any = {};
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
export async function bonoOrder_(d) {
  const s = settings_();
  if (!human_(d, s)) return { ok: false, error: NOT_HUMAN };
  const k = readOpt_('Paquetes').filter(function (x) { return x.id === d.paqueteId && !/^no$/i.test(x.activo) && /^s[ií]$/i.test(x.enWeb); })[0];
  if (!k) return { ok: false, error: 'Ese paquete ya no está disponible.' };
  const c = client_(d.client, true);
  if (!c.ok) return { ok: false, error: c.error };
  const rate = num_(s.tasaUSD, 63);
  const usd = usd_(Number(k.precioRD) || 0, rate);
  const id = 'BON-' + uuid().slice(0, 6).toUpperCase();
  const order = await paypal_('post', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: id, custom_id: id, invoice_id: id, description: ('Paquete MAJOBELLA · ' + k.nombre).slice(0, 127), amount: { currency_code: 'USD', value: usd.toFixed(2) } }],
    application_context: { brand_name: 'MAJOBELLA', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
  }, id + '-order');
  const row = createBono_(k, c, { estado: 'pendiente', metodoPago: 'paypal', paypalOrden: order.id });
  return { ok: true, id: row.id, orderId: order.id, montoUSD: usd.toFixed(2), usdRate: rate };
}

export async function bonoCapture_(d) {
  const b = readTable_('Bonos').filter(function (x) { return x.id === d.id; })[0];
  if (!b || b.paypalOrden !== d.orderId) return { ok: false, error: 'No encontramos esa compra.' };
  if (b.estado !== 'pendiente' && b.paypalCaptura) return { ok: true, bono: bonoOut_(b) };
  const cap = firstCapture_(await paypal_('post', '/v2/checkout/orders/' + encodeURIComponent(d.orderId) + '/capture', {}, b.id + '-capture'));
  if (!cap || cap.status !== 'COMPLETED') return { ok: false, error: 'PayPal no completó el pago. No se te cobró.' };
  try { return bonoActivate_(b, cap); } catch (err) { return paidButFailed_('el paquete ' + b.nombre + ' (' + b.id + ')', cap.id, b.id, err); }
}

export function bonoActivate_(b, cap) {
  const k = readTable_('Paquetes').filter(function (x) { return x.id === b.paqueteId; })[0] || {};
  const today = todayKey_();
  const patch: any = { codigo: newBonoCode_(), estado: 'activo', vendida: today, vence: Number(k.venceDias) > 0 ? addDaysKey_(today, Number(k.venceDias)) : '', paypalCaptura: cap.id };
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

export function bonoOut_(b): any {
  const svc = servicesMap_()[b.servicio];
  return { codigo: b.codigo, nombre: b.nombre, sesiones: Number(b.sesiones) || 0, servicio: b.servicio, serviceName: svc ? svc.name : b.servicio, vence: b.vence };
}

/* La app consulta el saldo de las tarjetas de regalo y paquetes que la clienta guardó (quien tiene el código puede verlo) */
export function walletLookup_(d) {
  if (limited_(d)) return { ok: false, error: TOO_MANY };
  const codes = (d.codes || []).slice(0, 20).map(normCode_).filter(Boolean);
  const items = walletItems_(codes);
  if (items.some(function (x) { return x.type === 'unknown'; })) noteFail_(d);
  return { ok: true, items: items };
}

export function walletItems_(codes) {
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

export function walletCodesFor_(email) {
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

export function myWallet_(d) {
  const u = verifyIdToken_(d.idToken);
  if (!u) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
  return { ok: true, items: walletItems_(walletCodesFor_(u.email)) };
}

/* Envía sus códigos al correo (así solo la dueña del correo los ve). Siempre responde igual. */
export function walletEmail_(d) {
  const s = settings_();
  const email = clean_(d.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'Escribe un correo válido.' };
  if (!human_(d, s)) return { ok: false, error: NOT_HUMAN };
  const key = 'we_' + hash_(email).slice(0, 32);
  const gkey = 'we_g_' + Math.floor(Date.now() / 3600000);
  const sent: any = { ok: true, message: 'Si tienes tarjetas o paquetes con ese correo, te los enviamos en un momento. Revisa también la carpeta de spam.' };
  if (cacheGet(key)) return sent;
  const total = Number(cacheGet(gkey) || 0);
  if (total >= 60) return sent;
  cachePut(key, '1', 600);
  cachePut(gkey, String(total + 1), 3700);
  const items = walletItems_(walletCodesFor_(email)).filter(function (x) { return x.type !== 'unknown'; });
  if (items.length) { const m = mailWallet_(email, items, s); safeMail_(email, m.subject, m.html, { tipo: 'billetera', ref: email }); }
  return sent;
}
