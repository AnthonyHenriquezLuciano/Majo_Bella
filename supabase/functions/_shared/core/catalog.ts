/* MAJOBELLA · Catálogo público: servicios, horario, contenido de la web, promociones y formas de pago */
import { env_ } from './ctx.ts';
import { readOpt_ } from './db.ts';
import { servicesMap_, services_, settings_ } from './data.ts';
import { schedule_ } from './schedule.ts';
import { promos_ } from './pricing.ts';
import { paypalEnv_ } from './paypal.ts';
import { turnstileOn_ } from './security.ts';
import { num_, on_, todayKey_ } from './util.ts';

export function catalog_(): any {
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
      enabled: /^s[ií]$/i.test(s.tarjetasEnLinea || 'si') && !!env_('PAYPAL_CLIENT_ID'),
      min: num_(s.tarjetaMin, 500), max: num_(s.tarjetaMax, 30000), validDays: num_(s.tarjetaVenceDias, 365),
    },
    // Solo las promociones automáticas (los códigos no se publican)
    promos: promos_(today).filter(function (p) { return p.tipo === 'auto'; }).map(function (p) {
      return { id: p.id, name: p.nombre, services: p.servicios, kind: p.descuentoTipo, value: p.valor, until: p.hasta };
    }),
  };
}

export function siteContent_(s) {
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

export function packageOut_(k) {
  const svc = servicesMap_()[k.servicio];
  const sessions = Number(k.sesiones) || 0, price = Number(k.precioRD) || 0;
  const regular = svc ? svc.price * sessions : 0;
  return {
    id: k.id, name: k.nombre, service: k.servicio, serviceName: svc ? svc.name : k.servicio, sessions: sessions, price: price,
    validDays: Number(k.venceDias) || 0, description: k.descripcion || '', regular: regular, savings: Math.max(0, regular - price),
  };
}

export function accountOut_(a) {
  return { id: a.id, bank: a.banco || '', type: a.tipo || '', number: a.numero || '', holder: a.titular || '', doc: a.documento || '', note: a.nota || '' };
}

export function transferInfo_(s) {
  const accounts = readOpt_('Cuentas').filter(function (a) { return !/^no$/i.test(a.activa) && a.numero; })
    .sort(function (a, b) { return (Number(a.orden) || 0) - (Number(b.orden) || 0); }).map(accountOut_);
  return { enabled: on_(s.transferenciaActiva) && accounts.length > 0, minutes: num_(s.transferenciaMinutos, 60), accounts: accounts };
}

export function changesMax_(s) {
  const t = String(s.cambiosMax == null ? '' : s.cambiosMax).trim();
  const n = Number(t);
  return t !== '' && isFinite(n) ? Math.max(0, Math.floor(n)) : 1;
}

export function refundPending_(r) { return /^(pendiente|devolver a mano)/.test(String(r.reembolso || '')); }
