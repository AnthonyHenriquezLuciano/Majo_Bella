/* MAJOBELLA · Precios: promociones, códigos, tarjetas de regalo, paquetes y premio de fidelidad */
import { readTable_, readOpt_, updateTable_ } from './db.ts';
import { catalogItems_, rows_, settings_ } from './data.ts';
import { TOO_MANY } from './constants.ts';
import { depositRatio_, normCode_, num_, on_, todayKey_, usd_ } from './util.ts';
import { limited_, noteFail_ } from './security.ts';

/* Promociones activas hoy */
export function promos_(today) {
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

export function promoAppliesTo_(p, id) { return p.servicios.indexOf('todos') >= 0 || p.servicios.indexOf(id) >= 0; }

export function promoDiscount_(p, items) {
  const applicable = items.filter(function (x) { return promoAppliesTo_(p, x.id); });
  const base = applicable.reduce(function (t, x) { return t + x.price; }, 0);
  if (!base) return 0;
  if (p.descuentoTipo === 'monto') return Math.min(base, Math.round(p.valor));
  return Math.round(base * Math.min(100, p.valor) / 100);
}

export function findGift_(code) {
  const c = normCode_(code);
  if (!c) return null;
  return readTable_('Tarjetas').filter(function (g) { return normCode_(g.codigo) === c; })[0] || null;
}

export function giftUsable_(g, today) {
  if (!g || g.estado === 'anulada' || g.estado === 'pendiente') return false;
  if (g.vence && today > g.vence) return false;
  return (Number(g.saldoRD) || 0) > 0;
}

/* Calcula el total de una cita: la mejor promoción (automática o código) y la tarjeta de regalo */
export function pricing_(items, code, giftCode, client): any {
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

/* La web consulta un código o tarjeta antes de pagar */
export function checkCode_(d) {
  const ids = (d.services || []).map(function (x) { return typeof x === 'string' ? x : x && x.id; }).filter(Boolean);
  const items = catalogItems_(ids);
  if (!items.length || items.some(function (x) { return !x; })) return { ok: false, error: 'Elige primero tus servicios.' };
  if (limited_(d)) return { ok: false, error: TOO_MANY };
  const p = pricing_(items, d.code, d.giftCode, d.client);
  if ((normCode_(d.code) && p.codeStatus === 'invalid') || (normCode_(d.giftCode) && p.giftStatus === 'invalid')) noteFail_(d);
  return { ok: true, pricing: pricingOut_(p) };
}

export function pricingOut_(p): any {
  return {
    subtotalRD: p.subtotal, discountRD: p.discount, totalRD: p.total,
    promoName: p.promo ? p.promo.nombre : '', codeStatus: p.codeStatus,
    giftAppliedRD: p.giftApplied, giftStatus: p.giftStatus, giftBalanceRD: p.giftBalance,
    giftKind: p.bono ? 'bono' : (p.gift ? 'tarjeta' : ''), bonoName: p.bono ? p.bono.nombre : '', bonoLeft: p.bonoLeft,
    loyaltyApplied: p.loyalApplied,
    depositRD: p.depositRD, depositUSD: p.depositUSD.toFixed(2), balanceRD: p.balanceRD, usdRate: p.usdRate,
  };
}

/* Descuenta (sign = -1) o devuelve (sign = +1) el saldo de la tarjeta de regalo de una cita */
export function applyGift_(r, sign) {
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

export function usePromo_(promoId) {
  if (!promoId) return;
  const p = readTable_('Promociones').filter(function (x) { return x.id === promoId; })[0];
  if (p) updateTable_('Promociones', p._row, { usos: (Number(p.usos) || 0) + 1 });
}

export function findBono_(code) {
  const c = normCode_(code);
  if (!c) return null;
  return readOpt_('Bonos').filter(function (b) { return normCode_(b.codigo) === c; })[0] || null;
}

export function bonoUsable_(b, today) {
  if (!b || b.estado !== 'activo') return false;
  if (b.vence && today > b.vence) return false;
  return (Number(b.usadas) || 0) < (Number(b.sesiones) || 0);
}

/* Usa (sign = -1) o devuelve (sign = +1) una sesión del paquete de una cita */
export function applyBono_(r, sign) {
  if (!r.bonoCodigo) return;
  const b = findBono_(r.bonoCodigo);
  if (!b) return;
  const used = Math.max(0, (Number(b.usadas) || 0) - sign);
  const patch: any = { usadas: used };
  if (b.estado !== 'anulado') patch.estado = used >= (Number(b.sesiones) || 0) ? 'agotado' : 'activo';
  updateTable_('Bonos', b._row, patch);
}

export function codeTaken_(code) {
  const c = normCode_(code);
  return !!findGift_(c) || !!findBono_(c) || readTable_('Promociones').some(function (x) { return normCode_(x.codigo) === c; });
}

export function loyaltyFor_(client, s): any {
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
export function loyalty_(d) {
  const l = loyaltyFor_(d.client || {}, settings_());
  if (!l) return { ok: true, enabled: false };
  return { ok: true, enabled: true, eligible: l.eligible, every: l.every, kind: l.kind, value: l.value };
}
